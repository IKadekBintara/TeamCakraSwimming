"use server";

import { getAuth } from "@/lib/supabase/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function issueLetterNumber(eventId: string, athleteId: string, issueDate: string) {
  const { profile } = await getAuth();
  if (profile?.account_status !== "ACTIVE" || (profile.role !== "admin" && profile.role !== "operator")) {
    return { error: "Akses admin atau operator diperlukan." };
  }
  if (!uuid.test(eventId) || !uuid.test(athleteId) || !/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
    return { error: "Data atlet atau tanggal surat tidak valid." };
  }

  const { data, error } = await createServiceClient().rpc("issue_dispensation_letter_number", {
    p_event_id: eventId,
    p_athlete_id: athleteId,
    p_issue_date: issueDate,
  });
  if (error || !data?.letter_number) {
    return { error: error?.code === "22023"
      ? "Atlet belum terdaftar aktif di event ini atau tanggal surat tidak valid."
      : "Nomor surat belum bisa diterbitkan. Coba lagi." };
  }
  return { number: String(data.letter_number), sequence: Number(data.sequence_no) };
}
