import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeWhatsapp } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Team Cakra API — endpoint untuk integrasi Hermes/WhatsApp.
 *
 * Arsitektur: WhatsApp → Hermes → Team Cakra API → Supabase
 * Hermes TIDAK punya akses database langsung.
 *
 * Auth: header `Authorization: Bearer <HERMES_API_TOKEN>`
 *
 * Actions (POST body: { action, ...payload }):
 *  - ping
 *  - list_athletes
 *  - get_athlete { name }
 *  - list_groups
 *  - today_sessions
 *  - today_attendance
 *  - attendance_stats
 *  - propose_add_athlete {...}   → ringkasan untuk KONFIRMASI (tidak menulis DB)
 *  - confirm_add_athlete {...}   → menulis setelah konfirmasi (confirmed: true)
 *  - propose_update_athlete { name, updates }
 *  - confirm_update_athlete { athlete_id, updates, confirmed: true }
 */

function authorized(req: NextRequest): boolean {
  const token = process.env.HERMES_API_TOKEN;
  if (!token) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${token}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const supabase = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  try {
    switch (action) {
      case "list_events": {
        const { data, error } = await supabase.from("events").select("id,name,event_date,location,status,fee_per_entry,admin_fee").order("event_date", { ascending: false }).limit(100);
        if (error) throw error;
        return NextResponse.json({ events: data });
      }

      case "get_event_payment": {
        const transactionId = String(body.transaction_id ?? "").trim();
        if (!transactionId) return NextResponse.json({ error: "transaction_id required" }, { status: 400 });
        const { data, error } = await supabase.from("event_payments").select("transaction_id,athlete_name,cakra,total_amount,amount_paid,remaining_amount,payment_status,payment_method,events(name,event_date)").eq("transaction_id", transactionId).maybeSingle();
        if (error) throw error;
        return NextResponse.json({ payment: data, can_verify: false, note: "Hermes tidak boleh memverifikasi pembayaran. Admin harus melakukan verifikasi melalui website." });
      }
      case "ping":
        return NextResponse.json({ ok: true, service: "absensi-team-cakra-swimming" });

      case "list_athletes": {
        const { data, error } = await supabase
          .from("athletes")
          .select("id, full_name, program, status")
          .eq("status", "ACTIVE")
          .order("full_name")
          .limit(200);
        if (error) throw error;
        return NextResponse.json({ athletes: data });
      }

      case "get_athlete": {
        const name = String(body.name ?? "").trim();
        if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
        const { data, error } = await supabase
          .from("athletes")
          .select("id, full_name, nickname, program, school, grade, parent_name, whatsapp, status")
          .ilike("full_name", `%${name}%`)
          .limit(5);
        if (error) throw error;
        return NextResponse.json({ matches: data });
      }

      case "list_groups": {
        const { data, error } = await supabase
          .from("training_groups")
          .select("id, name, location, is_active")
          .order("name");
        if (error) throw error;
        return NextResponse.json({ groups: data });
      }

      case "today_sessions": {
        const dow = new Date().getDay();
        const { data, error } = await supabase
          .from("training_schedules")
          .select("start_time, end_time, location, training_groups(name)")
          .eq("day_of_week", dow)
          .eq("is_active", true);
        if (error) throw error;
        return NextResponse.json({ date: today, sessions: data });
      }

      case "today_attendance": {
        const { data: sessions, error: se } = await supabase
          .from("training_sessions")
          .select("id, training_groups(name)")
          .eq("session_date", today);
        if (se) throw se;
        const ids = (sessions ?? []).map((s) => s.id);
        const { data: att, error: ae } = ids.length
          ? await supabase.from("attendance").select("session_id, status, athletes(full_name)").in("session_id", ids)
          : { data: [] as never[], error: null };
        if (ae) throw ae;
        return NextResponse.json({ date: today, sessions, attendance: att });
      }

      case "attendance_stats": {
        const { data: athletes, error } = await supabase
          .from("athletes")
          .select("id, status, join_date, left_at");
        if (error) throw error;
        const all = athletes ?? [];
        const monthStart = today.slice(0, 8) + "01";
        return NextResponse.json({
          total: all.length,
          active: all.filter((a) => a.status === "ACTIVE").length,
          new_this_month: all.filter((a) => a.join_date && a.join_date >= monthStart).length,
          left_this_month: all.filter((a) => a.left_at && a.left_at >= monthStart).length,
          left_total: all.filter((a) => a.status === "LEFT_CLUB").length,
        });
      }

      case "propose_add_athlete": {
        const proposal = {
          full_name: String(body.full_name ?? "").trim(),
          grade: body.grade ?? null,
          school: body.school ?? null,
          program: body.program ?? null,
          whatsapp: body.whatsapp ? normalizeWhatsapp(String(body.whatsapp)) : null,
          parent_name: body.parent_name ?? null,
        };
        if (!proposal.full_name) {
          return NextResponse.json({ error: "full_name required" }, { status: 400 });
        }
        return NextResponse.json({
          needs_confirmation: true,
          summary: `Data yang akan ditambahkan:\n\n${proposal.full_name}${proposal.grade ? `\nKelas ${proposal.grade}` : ""}${proposal.program ? `\nProgram ${proposal.program}` : ""}${proposal.whatsapp ? `\nWA ${proposal.whatsapp}` : ""}\n\nTambahkan?`,
          proposal,
        });
      }

      case "confirm_add_athlete": {
        const fullName = String(body.full_name ?? "").trim();
        if (!fullName) return NextResponse.json({ error: "full_name required" }, { status: 400 });
        if (body.confirmed !== true) {
          return NextResponse.json({ error: "Confirmation required (confirmed: true)" }, { status: 400 });
        }
        const payload = {
          full_name: fullName,
          grade: body.grade ? String(body.grade) : null,
          school: body.school ? String(body.school) : null,
          program: body.program ? String(body.program) : null,
          whatsapp: body.whatsapp ? normalizeWhatsapp(String(body.whatsapp)) : null,
          parent_name: body.parent_name ? String(body.parent_name) : null,
          status: "ACTIVE" as const,
          notes: "Ditambahkan via Hermes API",
        };
        const { data, error } = await supabase.from("athletes").insert(payload).select("id, full_name").single();
        if (error) throw error;
        await supabase.from("audit_logs").insert({
          actor_id: null,
          action: "hermes_add_athlete",
          entity: "athletes",
          entity_id: data.id,
          new_value: payload,
        });
        return NextResponse.json({ ok: true, athlete: data });
      }

      case "propose_update_athlete": {
        const name = String(body.name ?? "").trim();
        const updates = (body.updates ?? {}) as Record<string, unknown>;
        if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
        const { data, error } = await supabase
          .from("athletes")
          .select("id, full_name")
          .ilike("full_name", `%${name}%`)
          .limit(1);
        if (error) throw error;
        if (!data || data.length === 0) {
          return NextResponse.json({ error: `Atlet "${name}" tidak ditemukan` }, { status: 404 });
        }
        return NextResponse.json({
          needs_confirmation: true,
          athlete: data[0],
          summary: `Ubah data "${data[0].full_name}":\n${JSON.stringify(updates, null, 2)}\n\nSimpan perubahan?`,
          updates,
        });
      }

      case "confirm_update_athlete": {
        if (body.confirmed !== true) {
          return NextResponse.json({ error: "Confirmation required (confirmed: true)" }, { status: 400 });
        }
        const athleteId = String(body.athlete_id ?? "");
        const updates = (body.updates ?? {}) as Record<string, unknown>;
        const allowed = ["full_name", "nickname", "school", "grade", "program", "whatsapp", "parent_name", "address", "notes"];
        const payload: Record<string, unknown> = {};
        for (const k of allowed) if (k in updates) payload[k] = updates[k];
        if (payload.whatsapp) payload.whatsapp = normalizeWhatsapp(String(payload.whatsapp));
        if (Object.keys(payload).length === 0) {
          return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
        }
        const { data: before } = await supabase.from("athletes").select("*").eq("id", athleteId).single();
        const { error } = await supabase.from("athletes").update(payload).eq("id", athleteId);
        if (error) throw error;
        // Rename → sinkronkan snapshot athlete_name di arsip pembayaran (identity tetap athlete_id).
        if (payload.full_name) {
          const { error: snapErr } = await supabase
            .from("event_payments")
            .update({ athlete_name: String(payload.full_name).trim().toUpperCase() })
            .eq("athlete_id", athleteId);
          if (snapErr) throw new Error(`Snapshot pembayaran gagal disinkronkan: ${snapErr.message}`);
        }
        await supabase.from("audit_logs").insert({
          actor_id: null,
          action: "hermes_update_athlete",
          entity: "athletes",
          entity_id: athleteId,
          old_value: before,
          new_value: payload,
        });
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
