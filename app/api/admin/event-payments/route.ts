import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { rateLimit } from "@/lib/rate-limit";
import type { PaymentStatus } from "@/lib/events";

/**
 * Kelola pembayaran event oleh Admin (verifikasi manual).
 * - Hanya admin/operator dengan akun ACTIVE.
 * - UPDATE record existing (anti-duplicate), buat payment baru TIDAK dilakukan di sini.
 * - Setiap mutasi dicatat ke audit_logs (UPDATE_EVENT_PAYMENT_STATUS / CANCEL_EVENT_REGISTRATION).
 */

const PAYMENT_STATUSES: PaymentStatus[] = ["BELUM_BAYAR", "MENUNGGU_VERIFIKASI", "DP", "LUNAS", "DITOLAK"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function adminContext() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "UNAUTHENTICATED" as const };
  const { data: profile } = await supabase.from("profiles").select("role, account_status").eq("id", user.id).maybeSingle();
  if (!profile) return { error: "FORBIDDEN" as const };
  if ((profile.account_status ?? "ACTIVE") !== "ACTIVE") return { error: "ACCOUNT_INACTIVE" as const };
  if (!["admin", "operator"].includes(profile.role)) return { error: "FORBIDDEN" as const };
  return { userId: user.id };
}

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(request: NextRequest) {
  const rl = rateLimit(request, "event-payments-patch", 30);
  if (rl) return rl;

  const ctx = await adminContext();
  if (ctx.error === "UNAUTHENTICATED") return fail("Sesi login diperlukan.", 401);
  if (ctx.error === "ACCOUNT_INACTIVE") return fail("Akun Anda dinonaktifkan.", 403);
  if (ctx.error === "FORBIDDEN") return fail("Hanya admin yang dapat mengelola pembayaran.", 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Permintaan tidak valid.", 400);
  }

  const paymentId = String(body.payment_id ?? "");
  const action = String(body.action ?? "");
  const expectedStatus = body.expected_status ? String(body.expected_status) : null;
  if (!UUID_RE.test(paymentId)) return fail("payment_id tidak valid.", 400);
  if (!["verify", "reject", "set_status", "cancel"].includes(action)) return fail("Aksi tidak dikenal.", 400);

  const service = createServiceClient();

  // Baca state TERKINI sebelum menulis (proteksi concurrency + anti-duplicate).
  const { data: pay, error: payError } = await service.from("event_payments").select("*").eq("id", paymentId).maybeSingle();
  if (payError) return fail("Gagal membaca data pembayaran.", 500);
  if (!pay) return fail("Data pembayaran tidak ditemukan.", 404);
  if (pay.payment_status === "CANCELLED")
    return fail("Pembayaran ini sudah dibatalkan. Gunakan aksi batalkan pada level pendaftaran bila perlu.", 409);
  if (expectedStatus && pay.payment_status !== expectedStatus)
    return fail(`Status sudah berubah menjadi ${pay.payment_status} oleh perubahan lain. Muat ulang halaman lalu coba lagi.`, 409);

  const total = Number(pay.total_amount || 0);
  const nowIso = new Date().toISOString();
  const oldValue = { status: pay.payment_status, amount_paid: Number(pay.amount_paid || 0) };

  const patch: Record<string, unknown> = { updated_at: nowIso };
  let auditAction = "UPDATE_EVENT_PAYMENT_STATUS";
  let extraNewValue: Record<string, unknown> = {};

  if (action === "verify") {
    patch.payment_status = "LUNAS";
    patch.amount_paid = total;
    patch.remaining_amount = 0;
    patch.verified_by = ctx.userId;
    patch.verified_at = nowIso;
  } else if (action === "reject") {
    patch.payment_status = "DITOLAK";
    patch.verified_by = ctx.userId;
    patch.verified_at = nowIso;
  } else if (action === "cancel") {
    patch.payment_status = "CANCELLED";
    // Resolusi registrasi: registration_id langsung, fallback via event_registrations.payment_id
    let regId = (pay.registration_id as string | null) || null;
    if (!regId) {
      const { data: reg } = await service.from("event_registrations").select("id").eq("payment_id", pay.id).limit(1).maybeSingle();
      regId = reg?.id ?? null;
    }
    if (regId) {
      const { error: regError } = await service.from("event_registrations").update({ status: "CANCELLED" }).eq("id", regId);
      if (regError) {
        console.error("[event-payments] gagal membatalkan registrasi:", regError.message);
        return fail("Gagal membatalkan pendaftaran. Tidak ada perubahan disimpan.", 500);
      }
      extraNewValue = { registration_status: "CANCELLED", registration_id: regId };
    }
    auditAction = "CANCEL_EVENT_REGISTRATION";
  } else {
    const newStatus = String(body.payment_status ?? "");
    if (!(PAYMENT_STATUSES as string[]).includes(newStatus))
      return fail("Status pembayaran tidak valid. Gunakan aksi khusus untuk membatalkan pendaftaran.", 400);

    patch.payment_status = newStatus;
    if (newStatus === "LUNAS") {
      patch.amount_paid = total;
      patch.remaining_amount = 0;
      patch.verified_by = ctx.userId;
      patch.verified_at = nowIso;
    } else if (newStatus === "DITOLAK") {
      patch.verified_by = ctx.userId;
      patch.verified_at = nowIso;
    } else {
      // Kembali ke non-final: hapus jejak verifikasi.
      patch.verified_by = null;
      patch.verified_at = null;
    }
    if (body.amount_paid !== undefined && body.amount_paid !== null && newStatus !== "LUNAS") {
      const paid = Number(body.amount_paid);
      if (!Number.isFinite(paid) || paid < 0) return fail("Nominal pembayaran tidak valid.", 400);
      if (paid > total) return fail(`Nominal melebihi tagihan (${total}).`, 400);
      patch.amount_paid = paid;
      patch.remaining_amount = Math.max(total - paid, 0);
    }
    const method = body.payment_method ? String(body.payment_method).trim().slice(0, 80) : "";
    if (method) patch.payment_method = method;
    const notes = body.notes ? String(body.notes).trim().slice(0, 500) : "";
    if (notes) patch.notes = notes;
  }

  const { data: updated, error: updateError } = await service
    .from("event_payments")
    .update(patch)
    .eq("id", pay.id)
    .select("id, payment_status, amount_paid, remaining_amount, total_amount")
    .single();

  if (updateError || !updated) {
    console.error("[event-payments] update gagal:", updateError?.message);
    return fail("Gagal memperbarui pembayaran. Data mungkin sudah berubah, silakan muat ulang halaman dan coba lagi.", 500);
  }

  const { error: auditError } = await service.from("audit_logs").insert({
    actor_id: ctx.userId,
    action: auditAction,
    entity: "event_payments",
    entity_id: pay.id,
    old_value: oldValue,
    new_value: {
      status: updated.payment_status,
      amount_paid: Number(updated.amount_paid),
      event_id: pay.event_id,
      athlete_id: pay.athlete_id,
      registration_id: pay.registration_id,
      ...extraNewValue,
    },
  });
  if (auditError) {
    // Mutasi tetap tersimpan; kegagalan audit dicatat di log server untuk tindak lanjut.
    console.error("[event-payments] audit log gagal:", auditError.message);
  }

  return NextResponse.json({ ok: true, payment: updated });
}
