import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { STROKES, parseTimeToCs } from "@/lib/performance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POOL_LENGTHS = [25, 50];

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return bad("Unauthorized", 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return bad("Data tidak valid");

    const athlete_id = String(body.athlete_id ?? "");
    const recorded_at = String(body.recorded_at ?? "");
    const stroke = String(body.stroke ?? "");
    const distance = Number(body.distance ?? 0);
    const timeInput = String(body.time ?? "").trim();
    const pool_length = body.pool_length ? Number(body.pool_length) : null;
    const event_id = body.event_id ? String(body.event_id) : null;
    const meet_name = body.meet_name ? String(body.meet_name).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;
    const rank = body.rank ? Number(body.rank) : null;

    // ===== Validasi =====
    if (!athlete_id) return bad("Atlet wajib dipilih");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recorded_at)) return bad("Tanggal hasil tidak valid");
    if (!(STROKES as readonly string[]).includes(stroke)) return bad("Stroke tidak valid");
    if (!Number.isInteger(distance) || distance <= 0 || distance > 5000) return bad("Distance harus bilangan bulat positif (maks 5000m)");
    const time_cs = timeInput === "" ? null : parseTimeToCs(timeInput);
    if (timeInput !== "" && time_cs == null) return bad("Format waktu tidak valid. Contoh: 36.21 atau 1:23.45");
    if (pool_length != null && !POOL_LENGTHS.includes(pool_length)) return bad("Panjang kolam harus 25 atau 50 meter");
    if (rank != null && (!Number.isInteger(rank) || rank < 1 || rank > 99)) return bad("Ranking tidak valid");

    // Atlet harus existing DAN dalam scope penulis (RLS athletes memfilter;
    // hasil kosong = di luar scope -> tolak).
    const { data: athlete, error: athErr } = await supabase
      .from("athletes")
      .select("id")
      .eq("id", athlete_id)
      .maybeSingle();
    if (athErr) return bad("Gagal memvalidasi atlet", 500);
    if (!athlete) return bad("Atlet tidak ditemukan atau di luar scope Anda", 403);

    if (event_id) {
      const { data: ev } = await supabase.from("events").select("id").eq("id", event_id).maybeSingle();
      if (!ev) return bad("Event tidak ditemukan");
    }

    const { data: created, error } = await supabase
      .from("athlete_performance_results")
      .insert({
        athlete_id,
        recorded_at,
        stroke,
        distance,
        time_cs,
        pool_length,
        event_id,
        meet_name: meet_name || null,
        notes: notes || null,
        rank,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) {
      console.error(`PERF_DEBUG ${requestId} insert failed`, { code: error.code, message: error.message });
      return bad(error.code === "42501" ? "Anda tidak berhak mencatat hasil untuk atlet ini" : "Gagal menyimpan hasil", 500);
    }
    return NextResponse.json({ ok: true, id: created?.id }, { headers: { "x-request-id": requestId } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`PERF_DEBUG ${requestId} unexpected`, { message: msg });
    return bad("Terjadi kesalahan tak terduga", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return bad("Unauthorized", 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || !body.id) return bad("Data tidak valid");
    const id = String(body.id);

    // maybeSingle: baris di luar scope RLS tak terlihat -> 404, bukan kebocoran.
    const { data: existing } = await supabase
      .from("athlete_performance_results")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return bad("Hasil tidak ditemukan atau di luar scope Anda", 404);

    const updates: Record<string, unknown> = {};
    if (body.recorded_at !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.recorded_at))) return bad("Tanggal tidak valid");
      updates.recorded_at = String(body.recorded_at);
    }
    if (body.stroke !== undefined) {
      if (!(STROKES as readonly string[]).includes(String(body.stroke))) return bad("Stroke tidak valid");
      updates.stroke = String(body.stroke);
    }
    if (body.distance !== undefined) {
      const d = Number(body.distance);
      if (!Number.isInteger(d) || d <= 0 || d > 5000) return bad("Distance tidak valid");
      updates.distance = d;
    }
    if (body.time !== undefined) {
      const t = String(body.time ?? "").trim();
      const cs = t === "" ? null : parseTimeToCs(t);
      if (t !== "" && cs == null) return bad("Format waktu tidak valid");
      updates.time_cs = cs;
    }
    if (body.pool_length !== undefined) {
      const pl = body.pool_length ? Number(body.pool_length) : null;
      if (pl != null && !POOL_LENGTHS.includes(pl)) return bad("Panjang kolam harus 25 atau 50 meter");
      updates.pool_length = pl;
    }
    if (body.meet_name !== undefined) updates.meet_name = body.meet_name ? String(body.meet_name).trim() : null;
    if (body.notes !== undefined) updates.notes = body.notes ? String(body.notes).trim() : null;
    if (body.rank !== undefined) {
      const rk = body.rank ? Number(body.rank) : null;
      if (rk != null && (!Number.isInteger(rk) || rk < 1 || rk > 99)) return bad("Ranking tidak valid");
      updates.rank = rk;
    }
    if (Object.keys(updates).length === 0) return bad("Tidak ada perubahan");

    const { error } = await supabase
      .from("athlete_performance_results")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      return bad(error.code === "42501" ? "Anda tidak berhak mengubah hasil ini" : "Gagal menyimpan perubahan", 403);
    }
    return NextResponse.json({ ok: true }, { headers: { "x-request-id": requestId } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`PERF_DEBUG ${requestId} patch failed`, { message: msg });
    return bad("Terjadi kesalahan tak terduga", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return bad("Unauthorized", 401);

    const id = String(new URL(req.url).searchParams.get("id") ?? "");
    if (!id) return bad("ID hasil wajib disertakan");

    const { data: existing } = await supabase
      .from("athlete_performance_results")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return bad("Hasil tidak ditemukan atau di luar scope Anda", 404);

    // RLS: hanya staff yang lolos with check untuk DELETE.
    const { error } = await supabase
      .from("athlete_performance_results")
      .delete()
      .eq("id", id);
    if (error) {
      return bad(error.code === "42501" ? "Hanya admin yang dapat menghapus hasil" : "Gagal menghapus hasil", 403);
    }
    return NextResponse.json({ ok: true }, { headers: { "x-request-id": requestId } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`PERF_DEBUG ${requestId} delete failed`, { message: msg });
    return bad("Terjadi kesalahan tak terduga", 500);
  }
}
