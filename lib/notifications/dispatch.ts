/**
 * TEAM CAKRA SWIMMING — In-app dispatch (server-side, direct table writes).
 * Idempoten: notification_dispatch_log.dispatch_key UNIQUE adalah arbiter tunggal.
 * Urutan aman: cek log -> insert notification -> claim log;
 * bila kalah race, hapus notifikasi kembar agar tidak ada orphan.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type AnySvc = SupabaseClient<any, "public", any>;

export async function sendInApp(
  svc: AnySvc,
  opts: { recipientId: string; ntype: string; title: string; message: string; link?: string | null; key?: string | null }
): Promise<{ id: string | null; isNew: boolean }> {
  if (!opts.recipientId) return { id: null, isNew: false };
  const key = opts.key ?? `manual:${crypto.randomUUID()}`;

  // Sudah pernah dikirim?
  const existing = await svc
    .from("notification_dispatch_log")
    .select("notification_id")
    .eq("dispatch_key", key)
    .maybeSingle();
  if (existing.error) return { id: null, isNew: false };
  if (existing.data?.notification_id) return { id: existing.data.notification_id as string, isNew: false };

  // Belum: buat notifikasi lalu klaim key.
  const ins = await svc
    .from("notifications")
    .insert({
      recipient_id: opts.recipientId,
      title: opts.title,
      message: opts.message,
      ntype: opts.ntype,
      link_path: opts.link ?? null,
    })
    .select("id")
    .single();
  if (ins.error || !ins.data) return { id: null, isNew: false };

  const claim = await svc
    .from("notification_dispatch_log")
    .insert({ dispatch_key: key, notification_id: ins.data.id });
  if (claim.error) {
    // Kalah race: key sudah diklaim proses lain -> buang kembarannya.
    await svc.from("notifications").delete().eq("id", ins.data.id);
    return { id: null, isNew: false };
  }
  return { id: ins.data.id as string, isNew: true };
}
