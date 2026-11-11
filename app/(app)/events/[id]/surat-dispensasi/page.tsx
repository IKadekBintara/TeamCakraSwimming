import Link from "next/link";
import { notFound } from "next/navigation";
import DispensasiEditor from "@/components/DispensasiEditor";
import { getAuth } from "@/lib/supabase/auth-helper";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SuratDispensasiPage({ params }: { params: { id: string } }) {
  const { profile } = await getAuth();
  if (profile?.role !== "admin" && profile?.role !== "operator") notFound();

  const supabase = createClient();
  const [eventResult, registrationResult] = await Promise.all([
    supabase.from("events").select("id,name,event_date,location").eq("id", params.id).maybeSingle(),
    supabase.from("event_registrations")
      .select("athletes(id,full_name,school)")
      .eq("event_id", params.id)
      .eq("status", "REGISTERED"),
  ]);
  if (eventResult.error) throw eventResult.error;
  if (!eventResult.data) notFound();
  if (registrationResult.error) throw registrationResult.error;

  const athletes = (registrationResult.data ?? [])
    .flatMap(({ athletes }) => athletes ?? [])
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "id"));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href={`/events/${params.id}`} className="text-sm text-brand-700 hover:underline">
        ← Kembali ke event
      </Link>
      <h1 className="text-2xl font-bold">Surat Dispensasi</h1>
      {athletes.length > 0
        ? <DispensasiEditor event={eventResult.data} athletes={athletes} />
        : <p className="card">Daftarkan atlet di event ini untuk membuat surat dispensasi.</p>}
    </div>
  );
}
