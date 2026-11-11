"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { EventStatus } from "@/lib/events";

export default function EventStatusActions({ eventId, status }: { eventId: string; status: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(nextStatus: EventStatus) {
    if (!window.confirm(`Ubah status event menjadi ${nextStatus}?`)) return;
    setSaving(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesi login diperlukan.");
      const { data, error: updateError } = await supabase.from("events")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", eventId).eq("status", status).select("id").maybeSingle();
      if (updateError || !data) throw new Error(updateError?.message ?? "Status event sudah berubah atau akses ditolak.");
      await supabase.from("audit_logs").insert({
        actor_id: user.id, action: "update_event_status", entity: "events", entity_id: eventId,
        new_value: { status: nextStatus },
      });
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Status event gagal diperbarui.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 [&>button]:flex-1 [&>button]:sm:flex-none">
      {status === "DRAFT" && <button disabled={saving} onClick={() => update("OPEN")} className="btn-primary text-sm">Buka Pendaftaran</button>}
      {status === "OPEN" && <button disabled={saving} onClick={() => update("CLOSED")} className="btn-secondary text-sm">Tutup Pendaftaran</button>}
      {status !== "ARCHIVED" && <button disabled={saving} onClick={() => update("ARCHIVED")} className="btn-secondary text-sm">Arsipkan Event</button>}
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
