import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * SINKRONKAN AKUN ATLET — idempoten, tanpa plaintext password.
 *
 * Untuk setiap atlet:
 *  - sudah punya akun (athletes.user_id terisi & profil ada) -> SKIP
 *  - belum punya akun            -> buat user auth + profile role athlete + tautkan user_id (CAS)
 *  - akun disabled               -> SKIP (dilaporkan sebagai "sudah punya akun")
 *  - email bentrok               -> dilaporkan per atlet, tidak silent fail
 *  - relasi duplikat             -> dicegah oleh UNIQUE partial index di DB level
 */

function responseError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function adminContext() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "UNAUTHENTICATED" as const };
  const { data: profile } = await supabase.from("profiles").select("role, account_status").eq("id", user.id).maybeSingle();
  if (profile?.account_status !== "ACTIVE") return { error: "FORBIDDEN" as const };
  return { user, role: profile.role };
}

const ADMIN_ONLY = ["admin"];
/** Staff yang boleh menandai keluar/reaktivasi — selaras dengan policy UPDATE atlet existing. */
const STAFF = ["admin", "operator", "coach", "group_leader", "ketua_kelompok"];

/** Email akun atlet: pola deterministik dari nama (kolom email belum ada di skema). */
function athleteEmail(fullName: string) {
  const slug = fullName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
  return `${slug || "atlet"}@atlet.teamcakra.local`;
}

/** GET ?athlete_id=... -> status akun atlet tersebut (untuk panel di halaman detail atlet). */
export async function GET(request: NextRequest) {
  const ctx = await adminContext();
  if (ctx.error === "UNAUTHENTICATED") return responseError("Sesi login diperlukan", 401);
  if (ctx.error === "FORBIDDEN") return responseError("Hanya admin", 403);
  const athleteId = request.nextUrl.searchParams.get("athlete_id") || "";

  // Tanpa athlete_id: ringkasan seluruh atlet (untuk kartu "Akun Atlet" di Account Management).
  if (!athleteId) {
    const service0 = createServiceClient();
    const { data: allAthletes } = await service0.from("athletes").select("id, full_name, status, user_id").order("full_name");
    return NextResponse.json({
      ok: true,
      athletes: (allAthletes ?? []).map((a) => ({ id: a.id, full_name: a.full_name, status: a.status, has_account: Boolean(a.user_id) })),
    });
  }
  if (!athleteId) return responseError("athlete_id wajib diisi");

  const service = createServiceClient();
  const { data: athlete } = await service.from("athletes").select("id, full_name, status, user_id").eq("id", athleteId).maybeSingle();
  if (!athlete) return responseError("Atlet tidak ditemukan", 404);

  if (!athlete.user_id) {
    return NextResponse.json({ ok: true, has_account: false, athlete_status: athlete.status, suggested_email: athleteEmail(athlete.full_name) });
  }
  const [{ data: profile }, { data: authData }] = await Promise.all([
    service.from("profiles").select("role, account_status, created_at").eq("id", athlete.user_id).maybeSingle(),
    service.auth.admin.getUserById(athlete.user_id),
  ]);
  return NextResponse.json({
    ok: true,
    has_account: true,
    account_id: athlete.user_id,
    athlete_status: athlete.status,
    email: authData.user?.email || null,
    role: profile?.role || null,
    account_status: profile?.account_status || null,
    created_at: profile?.created_at || null,
    last_sign_in_at: authData.user?.last_sign_in_at || null,
  });
}

/** PATCH: tandai atlet keluar / reaktivasi — sekaligus cabut/pulihkan akses akun. */
export async function PATCH(request: NextRequest) {
  const rl = rateLimit(request, "athlete-accounts-patch", 20);
  if (rl) return rl;
  const ctx = await adminContext();
  if (ctx.error === "UNAUTHENTICATED") return responseError("Sesi login diperlukan", 401);
  if (ctx.error === "FORBIDDEN" || !STAFF.includes(ctx.role)) return responseError("Hanya staff yang dapat menandai keluar/reaktivasi atlet", 403);

  const body = await request.json().catch(() => null);
  const athleteId = typeof body?.athlete_id === "string" ? body.athlete_id : "";
  const action = body?.action as string;
  if (!athleteId || !["mark_left", "reactivate"].includes(action)) return responseError("Parameter tidak valid");

  const service = createServiceClient();
  const { data: athlete } = await service.from("athletes").select("id, full_name, status, user_id, left_at").eq("id", athleteId).maybeSingle();
  if (!athlete) return responseError("Atlet tidak ditemukan", 404);

  const today = new Date().toISOString().slice(0, 10);

  if (action === "mark_left") {
    if (athlete.status !== "ACTIVE") return responseError("Atlet sudah berstatus non-aktif");
    const leftAt = typeof body?.left_at === "string" && body.left_at ? body.left_at : today;
    const reason = typeof body?.left_reason === "string" && body.left_reason ? body.left_reason : null;

    const { error: upErr } = await service.from("athletes").update({
      status: "LEFT_CLUB",
      left_at: leftAt,
      left_reason: reason,
    }).eq("id", athleteId);
    if (upErr) return responseError(upErr.message, 500);

    // Tutup keanggotaan grup aktif
    await service.from("training_group_members").update({ left_at: leftAt }).eq("athlete_id", athleteId).is("left_at", null);

    // Cabut akses akun bila ada
    let accountDisabled = false;
    if (athlete.user_id) {
      const { error: profErr } = await service.from("profiles").update({ account_status: "INACTIVE", updated_at: new Date().toISOString() }).eq("id", athlete.user_id);
      if (!profErr) {
        await service.auth.admin.updateUserById(athlete.user_id, { ban_duration: "876000h" });
        await service.auth.admin.signOut(athlete.user_id, "global"); // invalidasi semua sesi aktif
        accountDisabled = true;
      }
    }

    await service.from("audit_logs").insert({
      actor_id: ctx.user.id,
      action: "ATHLETE_MARKED_INACTIVE",
      entity: "athletes",
      entity_id: athleteId,
      old_value: { status: athlete.status },
      new_value: { status: "LEFT_CLUB", left_at: leftAt, left_reason: reason, account_disabled: accountDisabled },
    });
    return NextResponse.json({ ok: true, account_disabled: accountDisabled });
  }

  // action === "reactivate"
  if (athlete.status === "ACTIVE") return responseError("Atlet memang sudah aktif");
  const { error: upErr } = await service.from("athletes").update({
    status: "ACTIVE",
    reactivated_at: today,
  }).eq("id", athleteId);
  if (upErr) return responseError(upErr.message, 500);

  let accountEnabled = false;
  if (athlete.user_id) {
    const { error: profErr } = await service.from("profiles").update({ account_status: "ACTIVE", updated_at: new Date().toISOString() }).eq("id", athlete.user_id);
    if (!profErr) {
      await service.auth.admin.updateUserById(athlete.user_id, { ban_duration: "none" });
      accountEnabled = true;
    }
  }

  await service.from("audit_logs").insert({
    actor_id: ctx.user.id,
    action: "ATHLETE_REACTIVATED",
    entity: "athletes",
    entity_id: athleteId,
    old_value: { status: athlete.status },
    new_value: { status: "ACTIVE", reactivated_at: today, account_enabled: accountEnabled },
  });
  return NextResponse.json({ ok: true, account_enabled: accountEnabled });
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, "athlete-accounts-post", 10);
  if (rl) return rl;
  const ctx = await adminContext();
  if (ctx.error === "UNAUTHENTICATED") return responseError("Sesi login diperlukan", 401);
  if (ctx.error === "FORBIDDEN" || !ADMIN_ONLY.includes(ctx.role)) return responseError("Hanya admin yang dapat menyinkronkan akun atlet", 403);

  const body = await request.json().catch(() => null);
  // Body opsional: { athlete_id } untuk membuat akun satu atlet saja.
  const onlyId = typeof body?.athlete_id === "string" && body.athlete_id ? body.athlete_id : null;

  const service = createServiceClient();
  let query = service.from("athletes").select("id, full_name, status, user_id");
  if (onlyId) query = query.eq("id", onlyId);
  const { data: athletes, error } = await query;
  if (error) return responseError(error.message, 500);
  const rows = athletes ?? [];
  if (onlyId && rows.length === 0) return responseError("Atlet tidak ditemukan", 404);

  let createdCount = 0;
  let skippedExisting = 0;
  let cannotCreate = 0;
  const errors: { athlete_id: string; name: string; reason: string }[] = [];
  const createdList: { athlete_id: string; name: string; email: string }[] = [];

  for (const a of rows) {
    try {
      // Idempoten: yang sudah tertaut dilewati apa pun status akunnya.
      if (a.user_id) { skippedExisting++; continue; }

      const email = athleteEmail(a.full_name);
      const { data: created, error: createErr } = await service.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: a.full_name },
        // TANPA password: aktivasi via reset-password flow admin ("Buat password sementara").
      });
      if (createErr || !created?.user) {
        cannotCreate++;
        errors.push({ athlete_id: a.id, name: a.full_name, reason: createErr?.message || "gagal membuat user auth" });
        continue;
      }
      const uid = created.user.id;

      const { error: profileErr } = await service.from("profiles").upsert({
        id: uid,
        full_name: a.full_name,
        role: "athlete",
        account_status: "ACTIVE",
        updated_at: new Date().toISOString(),
      });
      if (profileErr) throw new Error(`profil: ${profileErr.message}`);

      // Tautkan secara CAS: hanya bila masih kosong (aman dari race/double-run).
      const { data: linked, error: linkErr } = await service
        .from("athletes")
        .update({ user_id: uid })
        .eq("id", a.id)
        .is("user_id", null)
        .select("id");
      if (linkErr) throw new Error(`tautan: ${linkErr.message}`);
      if (!linked || linked.length === 0) {
        // Atlet sudah ditautkan proses lain — buang user auth yang baru dibuat.
        await service.auth.admin.deleteUser(uid);
        skippedExisting++;
        continue;
      }

      createdCount++;
      createdList.push({ athlete_id: a.id, name: a.full_name, email });
    } catch (e) {
      cannotCreate++;
      errors.push({ athlete_id: a.id, name: a.full_name, reason: e instanceof Error ? e.message : "kesalahan tidak diketahui" });
    }
  }

  await service.from("audit_logs").insert({
    actor_id: ctx.user!.id,
    action: "SYNC_ATHLETE_ACCOUNTS",
    entity: "athletes",
    entity_id: ctx.user!.id,
    new_value: { total: rows.length, created: createdCount, skipped_existing: skippedExisting, cannot_create: cannotCreate },
  });

  return NextResponse.json({
    ok: true,
    summary: {
      total: rows.length,
      alreadyHaveAccount: skippedExisting,
      created: createdCount,
      cannotCreate,
    },
    details: { createdList, errors },
  });
}
