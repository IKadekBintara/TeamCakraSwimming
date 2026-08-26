import { createClient } from "@/lib/supabase/server";
import { getAuth } from "@/lib/supabase/auth-helper";
import { redirect } from "next/navigation";
import NotificationList from "@/components/NotificationList";
import NotificationPrefsForm from "@/components/NotificationPrefsForm";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const supabase = createClient();
  const { user } = await getAuth();
  if (!user) redirect("/login");

  const filter = searchParams.filter === "unread" ? "unread" : "all";

  let q = supabase
    .from("notifications")
    .select("id, title, message, ntype, link_path, is_read, created_at")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter === "unread") q = q.eq("is_read", false);

  const { data: items } = await q;
  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .eq("is_read", false);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="page-title">Notifikasi</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Pusat notifikasi Anda — pembayaran, event, pendaftaran, dan performa.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <a href="/notifications?filter=all" className={filter === "all" ? "btn-primary" : "btn-secondary"}>
          Semua
        </a>
        <a href="/notifications?filter=unread" className={filter === "unread" ? "btn-primary" : "btn-secondary"}>
          Belum dibaca{unreadCount ? ` (${unreadCount})` : ""}
        </a>
      </div>

      <NotificationList initialItems={(items ?? []) as never[]} />

      <NotificationPrefsForm />
    </div>
  );
}
