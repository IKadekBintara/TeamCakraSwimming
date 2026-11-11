import { getAuth } from "@/lib/supabase/auth-helper";

export const letterHistoryColumns = "id,athlete_name,school,letter_number,issue_date,created_at";
export const letterUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function canManageLetters() {
  const { profile } = await getAuth();
  return profile?.account_status === "ACTIVE" && (profile.role === "admin" || profile.role === "operator");
}
