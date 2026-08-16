import { createClient } from "@/lib/supabase/server";
import UsersManager from "@/components/UsersManager";
import CoachParentForms from "@/components/CoachParentForms";
import type { Role } from "@/types";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const supabase = createClient();

  const [{ data: profiles }, { data: coaches }, { data: parents }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, phone").order("full_name"),
    supabase.from("coaches").select("id, full_name, user_id, whatsapp").order("full_name"),
    supabase.from("parents").select("id, full_name, user_id, whatsapp").order("full_name"),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 pt-14 lg:pt-0">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-sm text-slate-500">
          Kelola role pengguna, pelatih, dan orang tua
        </p>
      </div>

      <UsersManager
        profiles={(profiles ?? []).map((p) => ({ ...p, role: p.role as Role }))}
      />

      <CoachParentForms
        coaches={coaches ?? []}
        parents={parents ?? []}
        users={(profiles ?? []).map((p) => ({ id: p.id, full_name: p.full_name }))}
      />
    </div>
  );
}
