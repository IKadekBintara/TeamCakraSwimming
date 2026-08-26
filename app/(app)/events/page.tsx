import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAuth } from "@/lib/supabase/auth-helper";
import EventForm from "@/components/EventForm";
import { rupiah } from "@/lib/events";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  OPEN: "badge-success badge",
  DRAFT: "badge-warning badge",
  CLOSED: "badge-info badge",
  ARCHIVED: "badge-neutral badge",
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { deleted } = await searchParams;
  const supabase = createClient();
  const [{ data: events }, { data: profile }, { data: regs }] = await Promise.all([
    supabase.from("events").select("id, name, event_date, location, description, contact_person, contact_whatsapp, payment_instructions, fee_per_entry, admin_fee, status, registration_deadline").order("event_date", { ascending: false }),
    supabase.from("profiles").select("role").eq("id", ((await getAuth()).user?.id ?? "")).maybeSingle(),
    supabase.from("event_registrations").select("id, event_id"),
  ]);
  const canManage = profile?.role === "admin";
  const regCounts = new Map<string, number>();
  for (const r of regs ?? []) regCounts.set(r.event_id, (regCounts.get(r.event_id) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-6xl space-y-5 pt-14 lg:pt-0">
      {deleted && (
        <div className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow" role="status">
          Event berhasil dihapus permanen.
        </div>
      )}
      <header className="page-header">
        <div>
          <h1 className="page-title">Events</h1>
          <p className="page-subtitle">Kompetisi &amp; pendaftaran TEAM CAKRA SWIMMING</p>
        </div>
      </header>

      {canManage && <EventForm />}

      {(events ?? []).length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Belum ada event.</p>
          <p className="empty-state-desc">
            {canManage
              ? "Buat event pertama melalui form di atas atau buka Event Settings."
              : "Admin belum membuat event. Silakan cek kembali nanti."}
          </p>
          {canManage && <Link href="/event-settings" className="btn-primary mt-2 text-sm">Buka Event Settings</Link>}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(events ?? []).map((event) => (
            <article key={event.id} className={`card-flat flex flex-col justify-between gap-3 ${event.status === "OPEN" ? "!border-l-4 !border-l-brand-500" : ""}`}>
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-navy-900">{event.name}</h2>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {event.event_date} · {event.location || "Lokasi belum diatur"}
                    </p>
                    {event.registration_deadline && (
                      <p className="mt-0.5 text-xs text-slate-400">Pendaftaran tutup {event.registration_deadline}</p>
                    )}
                  </div>
                  <span className={STATUS_BADGE[event.status] ?? "badge-neutral badge"}>{event.status}</span>
                </div>

                {/* Ringkasan finansial singkat dari kolom konfigurasi */}
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                    <dt className="stat-label">Pendaftar</dt>
                    <dd className="text-sm font-bold text-navy-900">{regCounts.get(event.id) ?? 0}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                    <dt className="stat-label">Biaya / nomor</dt>
                    <dd className="text-sm font-bold">{rupiah(event.fee_per_entry)}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                    <dt className="stat-label">Admin</dt>
                    <dd className="text-sm font-bold">{rupiah(event.admin_fee)}</dd>
                  </div>
                </dl>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <Link href={`/events/${event.id}`} className="btn-primary px-3 py-1.5 text-xs">Detail &amp; Pendaftaran</Link>
                {canManage && (
                  <>
                    <Link href={`/event-settings`} className="btn-secondary px-3 py-1.5 text-xs">Kelola</Link>
                    <Link href={`/registrations?event=${event.id}`} className="btn-secondary px-3 py-1.5 text-xs">Lihat Pendaftaran</Link>
                    <a href={`/api/export?kind=event_registrations&from=2000-01-01&to=2999-12-31`} className="btn-secondary px-3 py-1.5 text-xs">Export</a>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
