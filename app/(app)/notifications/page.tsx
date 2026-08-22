import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { rupiah } from "@/lib/events";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const [{ data: pending }, { data: upcomingEvents }, { data: recentRegs }] = await Promise.all([
    supabase.from("event_payments").select("transaction_id, athlete_name, amount_paid, event:events(name)").eq("payment_status", "MENUNGGU_VERIFIKASI").order("created_at", { ascending: false }).limit(20),
    supabase.from("events").select("id, name, status, registration_deadline").in("status", ["OPEN", "DRAFT"]).gte("registration_deadline", today).lte("registration_deadline", in7Days).order("registration_deadline"),
    supabase.from("event_registrations").select("id, created_at, athletes(full_name), events(name)").order("created_at", { ascending: false }).limit(5),
  ]);

  type Notif = { tone: string; title: string; desc: string; href: string; cta: string; when?: string };
  const items: Notif[] = [];

  for (const p of pending ?? []) {
    items.push({
      tone: "badge-warning",
      title: `Pembayaran menunggu verifikasi — ${p.athlete_name}`,
      desc: `${(p.event as { name?: string } | null)?.name ?? "Event"} • ${rupiah(p.amount_paid)}`,
      href: "/keuangan",
      cta: "Verifikasi",
    });
  }
  for (const e of upcomingEvents ?? []) {
    items.push({
      tone: "badge-info",
      title: `Deadline pendaftaran "${e.name}"`,
      desc: `Event berstatus ${e.status}, tutup pada ${e.registration_deadline}.`,
      href: `/events/${e.id}`,
      cta: "Buka Event",
    });
  }
  for (const r of recentRegs ?? []) {
    items.push({
      tone: "badge-success",
      title: `Pendaftaran baru — ${(r.athletes as { full_name?: string } | null)?.full_name ?? "Atlet"}`,
      desc: `Event: ${(r.events as { name?: string } | null)?.name ?? "—"}`,
      href: "/registrations",
      cta: "Lihat Pendaftaran",
      when: new Date(r.created_at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    });
  }

  const groups: { label: string; tone: string; list: Notif[] }[] = [
    { label: "Perlu Tindakan", tone: "badge-warning", list: items.filter((i) => i.tone === "badge-warning") },
    { label: "Pengingat", tone: "badge-info", list: items.filter((i) => i.tone === "badge-info") },
    { label: "Terbaru", tone: "badge-success", list: items.filter((i) => i.tone === "badge-success") },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-4 pt-14 lg:pt-0">
      <header className="page-header">
        <div>
          <h1 className="page-title">Notifikasi</h1>
          <p className="page-subtitle">Dihitung langsung dari data operasional klub — bukan pesan tersimpan.</p>
      </div>
      </header>

      {items.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Tidak ada notifikasi.</p>
          <p className="empty-state-desc">Semua pembayaran terverifikasi dan tidak ada deadline yang mendekat.</p>
        </div>
      ) : (
        groups.map((g) => g.list.length > 0 && (
          <section key={g.label} className="space-y-2">
            <h2 className="card-title">{g.label} <span className={`badge ${g.tone} ml-1`}>{g.list.length}</span></h2>
            <ul className="space-y-2">
              {g.list.map((n, i) => (
                <li key={`${n.href}-${i}`} className="card-flat flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800"><span className={`badge ${n.tone} mr-2`}>●</span>{n.title}</p>
                    <p className="mt-0.5 truncate pl-6 text-xs text-slate-500">{n.desc}{n.when ? ` • ${n.when}` : ""}</p>
                  </div>
                  <Link href={n.href} className="btn-secondary px-3 py-1.5 text-xs shrink-0">{n.cta}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
