/**
 * TEAM CAKRA SWIMMING — Automation engine (payment reminder + event deadline).
 * Idempoten per trigger via notification_dispatch_log (DB-level dedupe):
 * menjalankan sweep dua kali TIDAK akan menghasilkan notifikasi ganda.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { hoursUntilDeadline } from "./time";

type Svc = ReturnType<typeof createServiceClient>;

export type SweepReport = {
  payReminders: number;
  eventReminders: number;
  skippedDisabled: string[];
};

async function sweepPaymentReminders(svc: Svc, offsets: number[]): Promise<number> {
  let sent = 0;
  const { data: regs } = await svc
    .from("event_registrations")
    .select("id, event_id, athlete_id, created_at, events(name, status), athletes(parent_id)")
    .eq("payment_status", "BELUM_BAYAR");
  const now = Date.now();
  for (const reg of regs ?? []) {
    const ev = Array.isArray(reg.events) ? reg.events[0] : reg.events;
    if (!ev || ev.status !== "OPEN") continue;
    const ath = Array.isArray(reg.athletes) ? reg.athletes[0] : reg.athletes;
    if (!ath?.parent_id) continue;
    const { data: par } = await svc.from("parents").select("user_id").eq("id", ath.parent_id).maybeSingle();
    if (!par?.user_id) continue;
    const ageH = (now - new Date(reg.created_at).getTime()) / 3600000;
    for (const h of offsets) {
      if (ageH >= h) {
        const { data: nid } = await svc.rpc("notify", {
          p_recipient: par.user_id,
          p_ntype: "PAYMENT",
          p_title: "Pengingat pembayaran",
          p_message: `Pengingat: pembayaran pendaftaran ${ev.name ?? "event"} belum lunas.`,
          p_link: "/registrations",
          p_key: `payrem:${reg.id}:${h}h`,
        });
        if (nid) sent++;
      }
    }
  }
  return sent;
}

async function sweepEventDeadlines(svc: Svc, offsetsHours: number[]): Promise<number> {
  let sent = 0;
  const { data: evs } = await svc
    .from("events")
    .select("id, name, registration_deadline")
    .eq("status", "OPEN")
    .not("registration_deadline", "is", null);
  for (const ev of evs ?? []) {
    const hrs = hoursUntilDeadline(ev.registration_deadline as string);
    if (hrs <= 0) continue; // sudah lewat: jangan ganggu
    for (const off of offsetsHours) {
      if (hrs <= off) {
        const { data: users } = await svc
          .from("profiles")
          .select("id")
          .in("role", ["parent", "athlete", "coach", "group_leader", "ketua_kelompok"]);
        for (const u of users ?? []) {
          const { data: nid } = await svc.rpc("notify", {
            p_recipient: u.id,
            p_ntype: "EVENT",
            p_title: "Pengingat deadline event",
            p_message: `${ev.name} akan ditutup pada ${ev.registration_deadline} 23:59 WIB.`,
            p_link: "/events",
            p_key: `evtrem:${ev.id}:${off}h:${u.id}`,
          });
          if (nid) sent++;
        }
      }
    }
  }
  return sent;
}

/** Jalankan seluruh sweep otomatisasi. Aman dipanggil berulang. */
export async function runAutomationSweeps(): Promise<SweepReport> {
  const svc = createServiceClient();
  const report: SweepReport = { payReminders: 0, eventReminders: 0, skippedDisabled: [] };

  const { data: settings } = await svc.from("automation_settings").select("*");
  const byId = new Map((settings ?? []).map((s) => [s.id as string, s]));

  const pay = byId.get("payment_reminder");
  if (pay?.enabled) {
    report.payReminders = await sweepPaymentReminders(svc, pay.offsets_hours ?? [24, 48]);
  } else {
    report.skippedDisabled.push("payment_reminder");
  }

  const evt = byId.get("event_deadline_reminder");
  if (evt?.enabled) {
    report.eventReminders = await sweepEventDeadlines(svc, evt.offsets_hours ?? [168, 72, 24]);
  } else {
    report.skippedDisabled.push("event_deadline_reminder");
  }

  return report;
}
