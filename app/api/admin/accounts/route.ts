import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Role } from "@/types";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MANAGEABLE_ROLES: Role[] = ["admin", "operator", "coach", "parent", "ketua_kelompok", "group_leader", "athlete"];
const CREATABLE_ROLES: Role[] = ["admin", "coach", "parent", "ketua_kelompok", "athlete"];
const STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED", "DELETED"] as const;
type AccountStatus = (typeof STATUSES)[number];

async function adminContext() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "UNAUTHENTICATED" as const };
  const { data: profile } = await supabase.from("profiles").select("id, full_name, role, account_status").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" || profile.account_status === "INACTIVE" || profile.account_status === "SUSPENDED" || profile.account_status === "DELETED") {
    return { error: "FORBIDDEN" as const };
  }
  return { user, profile, service: createServiceClient() };
}

function responseError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function validatePassword(password: unknown) {
  return typeof password === "string" && password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

async function assignLeaderGroup(service: ReturnType<typeof createServiceClient>, role: Role, userId: string, groupId: string | null) {
  if (role === "ketua_kelompok") {
    if (!groupId) throw new Error("Kelompok Cakra wajib dipilih untuk Ketua Kelompok");
    const { data: group } = await service.from("training_groups").select("id, name, leader_id").eq("id", groupId).maybeSingle();
    if (!group) throw new Error("Kelompok Cakra tidak ditemukan");
    if (group.leader_id && group.leader_id !== userId) throw new Error(`${group.name} sudah memiliki Ketua Kelompok`);
    await service.from("training_groups").update({ leader_id: null }).eq("leader_id", userId);
    const { error } = await service.from("training_groups").update({ leader_id: userId }).eq("id", groupId);
    if (error) throw error;
    return;
  }
  if (role === "group_leader") return;
  await service.from("training_groups").update({ leader_id: null }).eq("leader_id", userId);
}

async function syncRoleRecord(service: ReturnType<typeof createServiceClient>, role: Role, userId: string, fullName: string, phone: string | null) {
  if (role !== "coach" && role !== "parent") return;
  const table = role === "coach" ? "coaches" : "parents";
  const { data: existing } = await service.from(table).select("id").eq("user_id", userId).maybeSingle();
  if (existing?.id) await service.from(table).update({ full_name: fullName, whatsapp: phone }).eq("id", existing.id);
  else await service.from(table).insert({ user_id: userId, full_name: fullName, whatsapp: phone });
}

export async function GET(request: NextRequest) {
  const ctx = await adminContext();
  if (ctx.error === "UNAUTHENTICATED") return responseError("Sesi login diperlukan", 401);
  if (ctx.error === "FORBIDDEN") return responseError("Hanya admin yang dapat mengelola akun", 403);
  const service = ctx.service;
  const q = (request.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
  const role = request.nextUrl.searchParams.get("role") || "ALL";
  const status = request.nextUrl.searchParams.get("status") || "ALL";
  const sort = request.nextUrl.searchParams.get("sort") || "newest";

  const [{ data: profiles, error: profileError }, { data: authData, error: authError }, { data: recentActivity }, { data: groups }, { data: linkedAthletes }] = await Promise.all([
    service.from("profiles").select("id, full_name, role, phone, account_status, force_password_reset, created_at, updated_at").order("created_at", { ascending: false }),
    service.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    service.from("audit_logs").select("id, action, entity_id, created_at, profiles(full_name)").in("action", ["CREATE_ACCOUNT", "UPDATE_ACCOUNT", "CHANGE_ROLE", "RESET_PASSWORD", "DISABLE_ACCOUNT", "ENABLE_ACCOUNT", "DELETE_ACCOUNT", "RESTORE_ACCOUNT", "CREATE_ATHLETE_ACCOUNT", "SYNC_ATHLETE_ACCOUNTS"]).order("created_at", { ascending: false }).limit(8),
    service.from("training_groups").select("id, name, leader_id, location, is_active").eq("is_active", true).order("name"),
    service.from("athletes").select("id, full_name, status, user_id").not("user_id", "is", null),
  ]);
  if (profileError || authError) return responseError(profileError?.message || authError?.message || "Gagal membaca akun", 500);

  const authUsers = authData.users || [];
  const accounts = (profiles || []).map((p) => {
    const authUser = authUsers.find((u) => u.id === p.id);
    return {
      id: p.id,
      full_name: p.full_name,
      email: authUser?.email || "",
      phone: p.phone,
      role: p.role,
      account_status: p.account_status || "ACTIVE",
      force_password_reset: Boolean(p.force_password_reset),
      created_at: p.created_at,
      updated_at: p.updated_at || p.created_at,
      last_sign_in_at: authUser?.last_sign_in_at || null,
      email_confirmed_at: authUser?.email_confirmed_at || null,
      group_id: groups?.find((g) => g.leader_id === p.id)?.id || null,
      group_name: groups?.find((g) => g.leader_id === p.id)?.name || null,
      athlete_id: linkedAthletes?.find((a) => a.user_id === p.id)?.id || null,
      athlete_name: linkedAthletes?.find((a) => a.user_id === p.id)?.full_name || null,
      athlete_status: linkedAthletes?.find((a) => a.user_id === p.id)?.status || null,
    };
  }).filter((a) => {
    const matchesQ = !q || [a.full_name, a.email, a.phone].some((v) => (v || "").toLowerCase().includes(q));
    return matchesQ && (role === "ALL" || a.role === role) && (status === "ALL" || a.account_status === status);
  }).sort((a, b) => {
    if (sort === "name_asc") return a.full_name.localeCompare(b.full_name);
    if (sort === "name_desc") return b.full_name.localeCompare(a.full_name);
    if (sort === "oldest") return a.created_at.localeCompare(b.created_at);
    return b.created_at.localeCompare(a.created_at);
  });

  const all = (profiles || []).map((p) => ({ role: p.role, status: p.account_status || "ACTIVE" }));
  const stats = {
    total: all.length,
    active: all.filter((a) => a.status === "ACTIVE").length,
    inactive: all.filter((a) => a.status === "INACTIVE").length,
    suspended: all.filter((a) => a.status === "SUSPENDED").length,
    deleted: all.filter((a) => a.status === "DELETED").length,
    incomplete: accounts.filter((a) => !a.email || !a.full_name || !a.phone).length,
    admin: all.filter((a) => a.role === "admin").length,
    coach: all.filter((a) => a.role === "coach").length,
    parent: all.filter((a) => a.role === "parent").length,
    ketua: all.filter((a) => a.role === "ketua_kelompok").length,
    athlete: all.filter((a) => a.role === "athlete").length,
  };
  return NextResponse.json({ accounts, stats, groups: groups || [], recentActivity: recentActivity || [] });
}

export async function POST(request: NextRequest) {
  const rlCreate = rateLimit(request, "accounts-post", 20);
  if (rlCreate) return rlCreate;
  const ctx = await adminContext();
  if (ctx.error === "UNAUTHENTICATED") return responseError("Sesi login diperlukan", 401);
  if (ctx.error === "FORBIDDEN") return responseError("Hanya admin yang dapat mengelola akun", 403);
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const full_name = typeof body?.full_name === "string" ? body.full_name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : null;
  const role = body?.role as Role;
  const group_id = typeof body?.group_id === "string" && body.group_id ? body.group_id : null;
  const password = body?.password;
  if (!full_name || !email || !email.includes("@")) return responseError("Nama dan email valid wajib diisi");
  if (!CREATABLE_ROLES.includes(role)) return responseError("Role akun tidak diizinkan");
  if (role === "ketua_kelompok" && !group_id) return responseError("Kelompok Cakra wajib dipilih untuk Ketua Kelompok");
  if (group_id) {
    const { data: targetGroup } = await ctx.service.from("training_groups").select("id, name, leader_id").eq("id", group_id).maybeSingle();
    if (!targetGroup) return responseError("Kelompok Cakra tidak ditemukan");
    if (targetGroup.leader_id) return responseError(`${targetGroup.name} sudah memiliki Ketua Kelompok`);
  }
  if (!validatePassword(password)) return responseError("Password minimal 8 karakter dan harus mengandung huruf serta angka");
  const { data: created, error } = await ctx.service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
  if (error || !created.user) return responseError(error?.message || "Gagal membuat akun", 400);
  const id = created.user.id;
  const { error: profileError } = await ctx.service.from("profiles").update({ full_name, phone, role, account_status: "ACTIVE", force_password_reset: Boolean(body?.force_password_reset), updated_at: new Date().toISOString() }).eq("id", id);
  if (profileError) return responseError(profileError.message, 500);
  await syncRoleRecord(ctx.service, role, id, full_name, phone);
  try { await assignLeaderGroup(ctx.service, role, id, group_id); } catch (e) { await ctx.service.auth.admin.deleteUser(id); return responseError(e instanceof Error ? e.message : "Gagal menetapkan kelompok", 400); }
  await ctx.service.from("audit_logs").insert({ actor_id: ctx.user.id, action: "CREATE_ACCOUNT", entity: "profiles", entity_id: id, new_value: { full_name, email, phone, role, group_id, account_status: "ACTIVE" } });
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(request: NextRequest) {
  const rlPatch = rateLimit(request, "accounts-patch", 20);
  if (rlPatch) return rlPatch;
  const ctx = await adminContext();
  if (ctx.error === "UNAUTHENTICATED") return responseError("Sesi login diperlukan", 401);
  if (ctx.error === "FORBIDDEN") return responseError("Hanya admin yang dapat mengelola akun", 403);
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const action = body?.action as string;
  if (!id) return responseError("ID akun wajib diisi");
  if (id === ctx.user.id && ["delete", "disable", "change_role"].includes(action)) return responseError("Admin tidak dapat menonaktifkan, menghapus, atau menurunkan role dirinya sendiri", 400);
  const { data: oldProfile } = await ctx.service.from("profiles").select("id,full_name,role,phone,account_status,force_password_reset").eq("id", id).maybeSingle();
  if (!oldProfile) return responseError("Profil akun tidak ditemukan", 404);
  const { data: authUser } = await ctx.service.auth.admin.getUserById(id);
  if (!authUser.user) return responseError("Akun Auth tidak ditemukan", 404);

  if (action === "set_password") {
    if (!validatePassword(body.password)) return responseError("Password minimal 8 karakter dan harus mengandung huruf serta angka");
    const { error } = await ctx.service.auth.admin.updateUserById(id, { password: body.password });
    if (error) return responseError(error.message, 400);
    await ctx.service.from("profiles").update({ force_password_reset: Boolean(body.force_password_reset), updated_at: new Date().toISOString() }).eq("id", id);
    await ctx.service.auth.admin.signOut(id, "global");
    await ctx.service.from("audit_logs").insert({ actor_id: ctx.user.id, action: "RESET_PASSWORD", entity: "profiles", entity_id: id, new_value: { force_password_reset: Boolean(body.force_password_reset) } });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete" || action === "restore" || action === "disable" || action === "enable") {
    const nextStatus: AccountStatus = action === "restore" || action === "enable" ? "ACTIVE" : action === "delete" ? "DELETED" : "INACTIVE";
    const { error } = await ctx.service.from("profiles").update({ account_status: nextStatus, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return responseError(error.message, 400);
    await ctx.service.auth.admin.updateUserById(id, { ban_duration: nextStatus === "ACTIVE" ? "none" : "876000h" });
    if (nextStatus !== "ACTIVE") await ctx.service.auth.admin.signOut(id, "global");
    await ctx.service.from("audit_logs").insert({ actor_id: ctx.user.id, action: nextStatus === "ACTIVE" ? (action === "restore" ? "RESTORE_ACCOUNT" : "ENABLE_ACCOUNT") : (action === "delete" ? "DELETE_ACCOUNT" : "DISABLE_ACCOUNT"), entity: "profiles", entity_id: id, old_value: { account_status: oldProfile.account_status }, new_value: { account_status: nextStatus } });
    return NextResponse.json({ ok: true });
  }

  if (action === "update") {
    const nextRole = body.role as Role;
    const group_id = typeof body.group_id === "string" && body.group_id ? body.group_id : null;
    if (!MANAGEABLE_ROLES.includes(nextRole)) return responseError("Role akun tidak diizinkan");
    if (nextRole === "ketua_kelompok" && !group_id) return responseError("Kelompok Cakra wajib dipilih untuk Ketua Kelompok");
    if (group_id) {
      const { data: targetGroup } = await ctx.service.from("training_groups").select("id, name, leader_id").eq("id", group_id).maybeSingle();
      if (!targetGroup) return responseError("Kelompok Cakra tidak ditemukan");
      if (targetGroup.leader_id && targetGroup.leader_id !== id) return responseError(`${targetGroup.name} sudah memiliki Ketua Kelompok`);
    }
    const patch: Record<string, unknown> = { full_name: String(body.full_name || "").trim(), phone: body.phone ? String(body.phone).trim() : null, role: nextRole, account_status: STATUSES.includes(body.account_status) ? body.account_status : oldProfile.account_status, force_password_reset: Boolean(body.force_password_reset), updated_at: new Date().toISOString() };
    if (!patch.full_name) return responseError("Nama wajib diisi");
    const { error } = await ctx.service.from("profiles").update(patch).eq("id", id);
    if (error) return responseError(error.message, 400);
    await syncRoleRecord(ctx.service, nextRole, id, String(patch.full_name), patch.phone as string | null);
    try { await assignLeaderGroup(ctx.service, nextRole, id, group_id); } catch (e) { return responseError(e instanceof Error ? e.message : "Gagal menetapkan kelompok", 400); }
    if (body.email && body.email !== authUser.user.email) {
      const { error: authError } = await ctx.service.auth.admin.updateUserById(id, { email: String(body.email).trim().toLowerCase(), email_confirm: true });
      if (authError) return responseError(authError.message, 400);
    }
    if (nextRole !== oldProfile.role) await ctx.service.auth.admin.signOut(id, "global");
    await ctx.service.from("audit_logs").insert({ actor_id: ctx.user.id, action: nextRole !== oldProfile.role ? "CHANGE_ROLE" : "UPDATE_ACCOUNT", entity: "profiles", entity_id: id, old_value: oldProfile, new_value: patch });
    return NextResponse.json({ ok: true });
  }
  return responseError("Aksi akun tidak dikenali");
}
