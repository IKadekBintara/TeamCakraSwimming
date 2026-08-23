"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard, Users, UsersRound, CalendarDays, ClipboardCheck,
  BarChart3, FileSpreadsheet, UserCog, Settings, ScrollText, LogOut, CalendarRange, Wallet,
  ClipboardList, FileBarChart, Bell, Timer, Radio,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import type { Role } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}

const ALL: Role[] = ["admin", "operator", "coach", "group_leader", "ketua_kelompok", "athlete", "parent"];

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL },
  { href: "/atlet", label: "Atlet", icon: Users, roles: ALL },
  { href: "/kelompok", label: "Kelompok Latihan", icon: UsersRound, roles: ["admin", "operator", "coach", "group_leader", "ketua_kelompok"] },
  { href: "/jadwal", label: "Jadwal", icon: CalendarDays, roles: ALL },
  { href: "/events", label: "Events", icon: CalendarRange, roles: ALL },
  { href: "/registrations", label: "Pendaftaran", icon: ClipboardList, roles: ["admin", "operator", "coach", "group_leader", "ketua_kelompok"] },
  { href: "/performance", label: "Performance", icon: Timer, roles: ["admin", "operator", "coach", "group_leader", "ketua_kelompok"] },
  { href: "/communication", label: "Komunikasi", icon: Radio, roles: ["admin", "operator"] },
  { href: "/event-settings", label: "Event Settings", icon: Settings, roles: ["admin"] },
  { href: "/absensi", label: "Absensi", icon: ClipboardCheck, roles: ["admin", "operator", "coach", "group_leader", "ketua_kelompok"] },
  { href: "/laporan", label: "Laporan", icon: BarChart3, roles: ["admin", "operator", "coach", "group_leader", "ketua_kelompok"] },
  { href: "/keuangan", label: "Keuangan", icon: Wallet, roles: ["admin"] },
  { href: "/reports", label: "Report Center", icon: FileBarChart, roles: ["admin"] },
  { href: "/notifications", label: "Notifikasi", icon: Bell, roles: ALL },
  { href: "/import-export", label: "Import / Export", icon: FileSpreadsheet, roles: ["admin", "operator"] },
  { href: "/users", label: "Users", icon: UserCog, roles: ["admin"] },
  { href: "/accounts", label: "Account Management", icon: UserCog, roles: ["admin"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
  { href: "/audit", label: "Audit Logs", icon: ScrollText, roles: ["admin"] },
];

export default function Sidebar({ role, userName }: { role: Role; userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const items = NAV.filter((i) => i.roles.includes(role));

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const linkCls = (href: string) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
      pathname === href || pathname.startsWith(href + "/")
        ? "bg-brand-600 text-white shadow"
        : "text-slate-600 hover:bg-brand-50 hover:text-brand-800"
    }`;

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl">
            <Image src="/brand/team-cakra-logo.png" alt="Logo TEAM CAKRA SWIMMING" width={40} height={40} className="h-full w-full object-contain" priority />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-brand-900">TEAM CAKRA SWIMMING</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((i) => (
            <Link key={i.href} href={i.href} className={linkCls(i.href)}>
              <i.icon className="h-4 w-4" />
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <p className="mb-1 truncate px-2 text-xs text-slate-500">{userName}</p>
          <p className="mb-2 px-2 text-xs font-medium uppercase text-brand-700">{role}</p>
          <div className="mb-2 px-2"><ThemeToggle compact /></div>
          <button onClick={logout} className="btn-secondary w-full text-sm">
            <LogOut className="h-4 w-4" /> Keluar
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center overflow-hidden">
            <Image src="/brand/team-cakra-logo.png" alt="Logo TEAM CAKRA SWIMMING" width={32} height={32} className="h-full w-full object-contain" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold text-brand-900">TEAM CAKRA SWIMMING</p>
          </div>
        </div>
        <div className="flex items-center gap-2"><ThemeToggle compact /><button onClick={logout} className="text-sm font-medium text-brand-700">
          Keluar
        </button></div>
      </div>

      {/* Mobile bottom nav — 5 item pertama sesuai role */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-slate-200 bg-white py-2 lg:hidden">
        {items.slice(0, 5).map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium ${
              pathname === i.href || pathname.startsWith(i.href + "/")
                ? "text-brand-700"
                : "text-slate-500"
            }`}
          >
            <i.icon className="h-5 w-5" />
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
