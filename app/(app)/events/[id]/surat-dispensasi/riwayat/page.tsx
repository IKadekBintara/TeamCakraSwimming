import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageLetters, letterHistoryColumns, letterUuid } from "@/lib/dispensasi-history";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
const pageSize = 25;
const dateFormat = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta",
});

export default async function RiwayatSuratPage({
  params: routeParams, searchParams: routeSearchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ halaman?: string }>;
}) {
  const params = await routeParams;
  const searchParams = await routeSearchParams;
  if (!(await canManageLetters()) || !letterUuid.test(params.id)) notFound();
  const rawPage = Number(searchParams.halaman);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 10000 ? rawPage : 1;
  const offset = (page - 1) * pageSize;
  const service = createServiceClient();
  const { data, error } = await service.from("dispensation_letter_history")
    .select(letterHistoryColumns)
    .eq("event_id", params.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + pageSize);
  if (error) throw error;
  const rows = data ?? [];
  const editor = `/events/${params.id}/surat-dispensasi`;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href={editor} className="text-sm text-brand-700 hover:underline">← Kembali ke editor surat</Link>
      <h1 className="text-2xl font-bold">Riwayat Surat Dispensasi</h1>
      <div className="card">
        {rows.length === 0
          ? <p className="text-sm">Belum ada surat tersimpan di halaman ini.</p>
          : <ul className="divide-y">
            {rows.slice(0, pageSize).map((row) => {
              const pdf = `/api/dispensation-letters/${row.id}`;
              return (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold">{row.athlete_name}</p>
                    <p className="text-sm text-slate-500">{row.school} · {row.letter_number}</p>
                    <p className="text-sm text-slate-500">Dibuat {dateFormat.format(new Date(row.created_at))} WIB</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a className="btn-secondary" href={pdf} target="_blank" rel="noreferrer">Pratinjau PDF</a>
                    <a className="btn-primary" href={`${pdf}?download=1`} download>Unduh PDF</a>
                  </div>
                </li>
              );
            })}
          </ul>}
      </div>
      {(page > 1 || rows.length > pageSize) && <nav className="flex items-center gap-3" aria-label="Halaman riwayat">
        {page > 1 && <Link className="btn-secondary" href={`${editor}/riwayat?halaman=${page - 1}`}>Sebelumnya</Link>}
        <span className="text-sm">Halaman {page}</span>
        {rows.length > pageSize && <Link className="btn-secondary" href={`${editor}/riwayat?halaman=${page + 1}`}>Berikutnya</Link>}
      </nav>}
    </div>
  );
}
