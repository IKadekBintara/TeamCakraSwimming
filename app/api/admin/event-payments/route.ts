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

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * Hapus registration dari event beserta seluruh child record yang bergantung padanya.
 * Urutan wajib karena FK RESTRICT: entries -> payments -> registration.
 * Tabel athletes TIDAK disentuh — atlet tetap utuh dan dapat didaftarkan kembali.
 */
async function removeFromEvent(service: ServiceClient, actorId: string, registrationId: string) {
  const { data: reg, error: regError } = await service
    .from("event_registrations")
    .select("id, event_id, athlete_id, ku, status, athletes(full_name)")
    .eq("id", registrationId)
    .maybeSingle();
  if (regError) return fail("Gagal membaca data pendaftaran.", 500);
  if (!reg) return fail("Pendaftaran tidak ditemukan (mungkin sudah dihilangkan).", 404);

  const athleteName = (reg.athletes as { full_name?: string } | null)?.full_name ?? "—";

  const [{ data: entries }, { data: pays }] = await Promise.all([
    service.from("event_registration_entries").select("id, race_id").eq("registration_id", registrationId),
    service.from("event_payments").select("id, payment_status, total_amount").eq("registration_id", registrationId),
  ]);

  // Pelindung data uang: pembayaran LUNAS/DP tidak boleh terhapus diam-diam.
  if ((pays ?? []).some((p) => p.payment_status === "LUNAS" || p.payment_status === "DP"))
    return fail("Pendaftaran ini memiliki pembayaran tercatat (LUNAS/DP). Batalkan pendaftaran dan tindak lanjut pembayarannya terlebih dahulu.", 409);

  const { error: delEntriesError } = await service.from("event_registration_entries").delete().eq("registration_id", registrationId);
  if (delEntriesError) return fail("Gagal menghapus nomor lomba pendaftaran. Tidak ada data yang dihapus.", 500);

  const { error: delPaysError } = await service.from("event_payments").delete().eq("registration_id", registrationId);
  if (delPaysError) return fail("Gagal menghapus tagihan pendaftaran. Nomor lomba sudah terhapus, periksa sisa data di database.", 500);

  const { error: delRegError } = await service.from("event_registrations").delete().eq("id", registrationId);
  if (delRegError) return fail("Gagal menghapus pendaftaran.", 500);

  const { error: auditError } = await service.from("audit_logs").insert({
    actor_id: actorId,
    action: "REMOVE_FROM_EVENT",
    entity: "event_registrations",
    entity_id: registrationId,
    old_value: {
      registration: { id: reg.id, event_id: reg.event_id, athlete_id: reg.athlete_id, ku: reg.ku, status: reg.status },
      athlete_name: athleteName,
      entries: entries ?? [],
      payments: pays ?? [],
    },
    new_value: { athlete_id: reg.athlete_id, event_id: reg.event_id, athlete_deleted: false },
  });
  if (auditError) console.error("[event-payments] audit log gagal:", auditError.message);

  return NextResponse.json({ ok: true, removed: { registration_id: registrationId, athlete_id: reg.athlete_id } });
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
  const registrationId = String(body.registration_id ?? "");
  const action = String(body.action ?? "");
  const expectedStatus = body.expected_status ? String(body.expected_status) : null;

  const service = createServiceClient();

  // "Hilangkan dari Event": hapus permanen registration + child records (entries, payments)
  // dari event ini. Data atlet utama (tabel athletes) TIDAK disentuh.
  if (action === "remove_from_event") {
    if (!UUID_RE.test(registrationId)) return fail("registration_id tidak valid.", 400);
    return removeFromEvent(service, ctx.userId, registrationId);
  }

  if (!UUID_RE.test(paymentId)) return fail("payment_id tidak valid.", 400);
  if (!["verify", "reject", "set_status", "cancel"].includes(action)) return fail("Aksi tidak dikenal.", 400);

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
    // Resolusi registrasi: registration_id langsung; fallback cari registrasi AKTIF atlet+event.
    let regId = (pay.registration_id as string | null) || null;
    if (!regId) {
      // Kolom event_registrations.payment_id TIDAK ADA di schema — cari registrasi AKTIF atlet+event.
      const { data: reg } = await service.from("event_registrations").select("id")
        .eq("athlete_id", pay.athlete_id).eq("event_id", pay.event_id).eq("status", "REGISTERED")
        .limit(1).maybeSingle();
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
