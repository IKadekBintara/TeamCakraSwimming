/**
 * TEAM CAKRA SWIMMING — Automation engine (payment reminder + event deadline).
 * Idempoten per trigger via notification_dispatch_log (DB-level dedupe):
 * menjalankan sweep dua kali TIDAK akan menghasilkan notifikasi ganda.
 *
 * Sumber data pembayaran adalah event_payments (payment_status), BUKAN
 * event_registrations — registrasi tidak menyimpan status pembayaran.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { hoursUntilDeadline } from "./time";
import { sendInApp } from "./dispatch";

type Svc = ReturnType<typeof createServiceClient>;

export type SweepReport = {
  payReminders: number;
  eventReminders: number;
  skippedDisabled: string[];
};

async function sweepPaymentReminders(svc: Svc, offsets: number[]): Promise<number> {
  let sent = 0;
  const { data: pays } = await svc
    .from("event_payments")
    .select("id, athlete_name, created_at, event_id, athlete_id, events(name, status), athletes(parent_id)")
    .eq("payment_status", "BELUM_BAYAR");
  const now = Date.now();
  for (const pay of pays ?? []) {
    const ev = Array.isArray(pay.events) ? pay.events[0] : pay.events;
    if (!ev || ev.status !== "OPEN") continue;
    const ath = Array.isArray(pay.athletes) ? pay.athletes[0] : pay.athletes;
    if (!ath?.parent_id) continue;
    const { data: par } = await svc.from("parents").select("user_id").eq("id", ath.parent_id).maybeSingle();
    if (!par?.user_id) continue;
    const baseIso = pay.created_at ?? new Date().toISOString();
    const ageH = (now - new Date(baseIso).getTime()) / 3600000;
    for (const h of offsets) {
      if (ageH >= h) {
        const { id: nid, isNew } = await sendInApp(svc, {
          recipientId: par.user_id,
          ntype: "PAYMENT",
          title: "Pengingat pembayaran",
          message: `Pengingat: pembayaran pendaftaran ${pay.athlete_name ?? "atlet"} untuk ${ev.name ?? "event"} belum lunas.`,
          link: "/registrations",
          key: `payrem:${pay.id}:${h}h`,
        });
        if (nid && isNew) sent++;
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
  // kumpulkan sekali, bukan per-event
  const { data: users } = await svc
    .from("profiles")
    .select("id")
    .in("role", ["parent", "athlete", "coach", "group_leader", "ketua_kelompok"]);
  for (const ev of evs ?? []) {
    const hrs = hoursUntilDeadline(ev.registration_deadline as string);
    if (hrs <= 0) continue; // sudah lewat: jangan ganggu
    // Eskalasi bertahap: kirim hanya pada tahap terkecil yang sudah tercapai,
    // sehingga tiap event mengirim satu pengingat per ambang, tanpa celah/spam.
    const stage = Math.min(...offsetsHours.filter((o) => hrs <= o));
    if (!Number.isFinite(stage)) continue;
    for (const u of users ?? []) {
      const { id: nid, isNew } = await sendInApp(svc, {
        recipientId: u.id,
        ntype: "EVENT",
        title: "Pengingat deadline event",
        message: `${ev.name} akan ditutup pada ${ev.registration_deadline} 23:59 WIB.`,
        link: "/events",
        key: `evtrem:${ev.id}:${stage}h:${u.id}`,
      });
      if (nid && isNew) sent++;
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
