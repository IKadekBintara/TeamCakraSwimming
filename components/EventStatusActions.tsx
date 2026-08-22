"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function EventStatusActions({ eventId, status }: { eventId: string; status: string }) {
  const supabase = createClient(); const router = useRouter(); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  async function update(nextStatus: string) { if (!window.confirm(`Ubah status event menjadi ${nextStatus}?`)) return; setSaving(true); setError(null); const { data: { user } } = await supabase.auth.getUser(); const { error: updateError } = await supabase.from("events").update({ status: nextStatus, updated_at: new Date().toISOString() }).eq("id", eventId); if (updateError) setError(updateError.message); else { await supabase.from("audit_logs").insert({ actor_id: user?.id, action: "update_event_status", entity: "events", entity_id: eventId, new_value: { status: nextStatus } }); router.refresh(); } setSaving(false); }
  return <div className="flex flex-wrap gap-2">{status === "DRAFT" && <button disabled={saving} onClick={() => update("OPEN")} className="btn-primary text-sm">Buka Pendaftaran</button>}{status === "OPEN" && <button disabled={saving} onClick={() => update("CLOSED")} className="btn-secondary text-sm">Tutup Pendaftaran</button>}{status !== "CANCELLED" && <button disabled={saving} onClick={() => update("CANCELLED")} className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">Batalkan Event</button>}{error && <span className="text-xs text-red-700">{error}</span>}</div>;
}
