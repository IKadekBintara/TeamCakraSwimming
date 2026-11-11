import Link from "next/link";
import { notFound } from "next/navigation";
import DispensasiEditor from "@/components/DispensasiEditor";
import { getAuth } from "@/lib/supabase/auth-helper";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export default async function SuratDispensasiPage({ params }: { params: { id: string } }) {
  const { profile } = await getAuth();
  if (profile?.account_status !== "ACTIVE" || (profile.role !== "admin" && profile.role !== "operator")) notFound();

  const supabase = createClient();
  const numbers = createServiceClient().from("dispensation_letter_numbers");
  const [eventResult, registrationResult, existingNumbers, latestNumber] = await Promise.all([
    supabase.from("events").select("id,name,event_date,location").eq("id", params.id).maybeSingle(),
    supabase.from("event_registrations")
      .select("athletes(id,full_name,school)")
      .eq("event_id", params.id)
      .eq("status", "REGISTERED"),
    numbers.select("athlete_id,letter_number").eq("event_id", params.id),
    numbers.select("sequence_no").order("sequence_no", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (eventResult.error) throw eventResult.error;
  if (!eventResult.data) notFound();
  if (registrationResult.error) throw registrationResult.error;
  if (existingNumbers.error) throw existingNumbers.error;
  if (latestNumber.error) throw latestNumber.error;

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
        ? <DispensasiEditor
            event={eventResult.data}
            athletes={athletes}
            nextNumber={Math.max(2, latestNumber.data?.sequence_no ?? 0) + 1}
            issuedNumbers={Object.fromEntries((existingNumbers.data ?? []).map((row) => [row.athlete_id, row.letter_number]))}
          />
        : <p className="card">Daftarkan atlet di event ini untuk membuat surat dispensasi.</p>}
    </div>
  );
}
