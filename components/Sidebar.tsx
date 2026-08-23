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

interface NavSection {
  /** Label kategori; undefined = tanpa heading (grup utama). */
  label?: string;
  items: NavItem[];
}

const ALL: Role[] = ["admin", "operator", "coach", "group_leader", "ketua_kelompok", "athlete", "parent"];
const STAFF: Role[] = ["admin", "operator", "coach", "group_leader", "ketua_kelompok"];
const ADMIN: Role[] = ["admin"];
/** Menu khusus atlet (dan orang tua yang menamping akun atletnya). */
const ATLET: Role[] = ["athlete", "parent"];

/** Menu dikelompokkan per kategori agar mudah dipindai; tidak ada menu yang dihilangkan. */
const NAV_SECTIONS: NavSection[] = [
  { items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL }] },
  {
    label: "Akun Saya",
    items: [
      { href: "/profil-saya", label: "Profil Saya", icon: Users, roles: ATLET },
      { href: "/absensi-saya", label: "Absensi Saya", icon: ClipboardCheck, roles: ATLET },
      { href: "/performance-saya", label: "Performance Saya", icon: Timer, roles: ATLET },
      { href: "/pembayaran-saya", label: "Pembayaran Saya", icon: Wallet, roles: ATLET },
    ],
  },
  {
    label: "Operasional",
    items: [
      { href: "/atlet", label: "Atlet", icon: Users, roles: STAFF },
      { href: "/kelompok", label: "Kelompok Latihan", icon: UsersRound, roles: STAFF },
      { href: "/jadwal", label: "Jadwal", icon: CalendarDays, roles: ALL },
      { href: "/absensi", label: "Absensi", icon: ClipboardCheck, roles: STAFF },
    ],
  },
  {
    label: "Event",
    items: [
      { href: "/events", label: "Events", icon: CalendarRange, roles: ALL },
      { href: "/registrations", label: "Pendaftaran", icon: ClipboardList, roles: STAFF },
      { href: "/event-settings", label: "Event Settings", icon: Settings, roles: ADMIN },
    ],
  },
  {
    label: "Performance",
    items: [{ href: "/performance", label: "Performance", icon: Timer, roles: STAFF }],
  },
  {
    label: "Keuangan & Laporan",
    items: [
      { href: "/keuangan", label: "Keuangan", icon: Wallet, roles: ADMIN },
      { href: "/laporan", label: "Laporan Kehadiran", icon: BarChart3, roles: STAFF },
      { href: "/reports", label: "Report Center", icon: FileBarChart, roles: ADMIN },
      { href: "/import-export", label: "Import / Export", icon: FileSpreadsheet, roles: ["admin", "operator"] },
    ],
  },
  {
    label: "Komunikasi",
    items: [
      { href: "/communication", label: "Komunikasi", icon: Radio, roles: ["admin", "operator"] },
      { href: "/notifications", label: "Notifikasi", icon: Bell, roles: ALL },
    ],
  },
  {
    label: "Sistem",
    items: [
      { href: "/users", label: "Users", icon: UserCog, roles: ADMIN },
      { href: "/accounts", label: "Account Management", icon: UserCog, roles: ADMIN },
      { href: "/settings", label: "Settings", icon: Settings, roles: ADMIN },
      { href: "/audit", label: "Audit Logs", icon: ScrollText, roles: ADMIN },
    ],
  },
];

/** 5 item pertama (setelah filter role) untuk bottom nav mobile. */
const FLAT_NAV: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export default function Sidebar({ role, userName }: { role: Role; userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const sections = NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(role)) })).filter((s) => s.items.length > 0);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const linkCls = (href: string) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {sections.map((s, si) => (
            <div key={s.label ?? `sec-${si}`} className={si > 0 ? "mt-4" : ""}>
              {s.label && (
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {s.label}
                </p>
              )}
              <div className="space-y-0.5">
                {s.items.map((i) => (
                  <Link key={i.href} href={i.href} className={linkCls(i.href)}>
                    <i.icon className="h-4 w-4" />
                    {i.label}
                  </Link>
                ))}
              </div>
            </div>
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
        {FLAT_NAV.filter((i) => i.roles.includes(role)).slice(0, 5).map((i) => (
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
