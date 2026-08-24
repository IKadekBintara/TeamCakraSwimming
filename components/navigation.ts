/**
 * SHARED NAVIGATION CONFIGURATION — satu sumber untuk:
 *   1. Sidebar desktop (accordion per grup)
 *   2. Drawer mobile (struktur identik)
 *   3. Bottom navigation mobile (shortcut pertama sesuai role)
 *
 * ATURAN: menambah menu baru di sini otomatis muncul di SEMUA platform
 * sesuai roles — jangan pernah memelihara daftar menu terpisah.
 * Parent grup TIDAK punya halaman sendiri (bukan link dummy);
 * grup berisi 1 item setelah filter role dirender sebagai link biasa.
 */
import {
  LayoutDashboard, Users, UsersRound, CalendarDays, ClipboardCheck,
  BarChart3, FileSpreadsheet, UserCog, Settings, ScrollText, CalendarRange, Wallet,
  ClipboardList, FileBarChart, Bell, Timer, Radio,
} from "lucide-react";
import type { Role } from "@/types";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}

export interface NavGroup {
  /** Stabil untuk key + aria-controls accordion. */
  id: string;
  /** Label kategori; undefined = item mandiri (dirender langsung, tanpa accordion). */
  label?: string;
  items: NavItem[];
}

const ALL: Role[] = ["admin", "operator", "coach", "group_leader", "ketua_kelompok", "athlete", "parent"];
const STAFF: Role[] = ["admin", "operator", "coach", "group_leader", "ketua_kelompok"];
const ADMIN: Role[] = ["admin"];
/** Menu khusus atlet (dan orang tua yang menamping akun atletnya). */
const ATLET: Role[] = ["athlete", "parent"];

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "utama",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL }],
  },
  {
    id: "akun-saya",
    label: "Akun Saya",
    items: [
      { href: "/profil-saya", label: "Profil Saya", icon: Users, roles: ATLET },
      { href: "/absensi-saya", label: "Absensi Saya", icon: ClipboardCheck, roles: ATLET },
      { href: "/performance-saya", label: "Performance Saya", icon: Timer, roles: ATLET },
      { href: "/pembayaran-saya", label: "Pembayaran Saya", icon: Wallet, roles: ATLET },
    ],
  },
  {
    id: "operasional",
    label: "Operasional",
    items: [
      { href: "/atlet", label: "Atlet", icon: Users, roles: STAFF },
      { href: "/kelompok", label: "Kelompok Latihan", icon: UsersRound, roles: STAFF },
      { href: "/jadwal", label: "Jadwal", icon: CalendarDays, roles: ALL },
      { href: "/absensi", label: "Absensi", icon: ClipboardCheck, roles: STAFF },
    ],
  },
  {
    id: "event",
    label: "Event",
    items: [
      { href: "/events", label: "Events", icon: CalendarRange, roles: ALL },
      { href: "/registrations", label: "Pendaftaran", icon: ClipboardList, roles: STAFF },
      { href: "/event-settings", label: "Event Settings", icon: Settings, roles: ADMIN },
    ],
  },
  {
    id: "performance",
    label: "Performance",
    items: [{ href: "/performance", label: "Performance", icon: Timer, roles: STAFF }],
  },
  {
    id: "keuangan-laporan",
    label: "Keuangan & Laporan",
    items: [
      { href: "/keuangan", label: "Keuangan", icon: Wallet, roles: ADMIN },
      { href: "/laporan", label: "Laporan Kehadiran", icon: BarChart3, roles: STAFF },
      { href: "/reports", label: "Report Center", icon: FileBarChart, roles: ADMIN },
      { href: "/import-export", label: "Import / Export", icon: FileSpreadsheet, roles: ["admin", "operator"] },
    ],
  },
  {
    id: "komunikasi",
    label: "Komunikasi",
    items: [
      { href: "/communication", label: "Komunikasi", icon: Radio, roles: ["admin", "operator"] },
      { href: "/notifications", label: "Notifikasi", icon: Bell, roles: ALL },
    ],
  },
  {
    id: "sistem",
    label: "Sistem",
    items: [
      { href: "/users", label: "Users", icon: UserCog, roles: ADMIN },
      { href: "/accounts", label: "Account Management", icon: UserCog, roles: ADMIN },
      { href: "/excel-sync", label: "Sinkronisasi Excel", icon: FileSpreadsheet, roles: ADMIN },
      { href: "/settings", label: "Settings", icon: Settings, roles: ADMIN },
      { href: "/audit", label: "Audit Logs", icon: ScrollText, roles: ADMIN },
    ],
  },
];

/** Semua item dalam satu flat list (urutan deklarasi). */
export const FLAT_NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Route aktif bila persis sama atau merupakan prefiks path (mendukung nested route seperti /atlet/[id]). */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/** Filter grup sesuai role; grup kosong dibuang. Grup ≤1 item tetap dikembalikan
 *  (pemrender memutuskan link langsung vs accordion). */
export function filterNavGroups(role: Role): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter((g) => g.items.length > 0);
}

/** Shortcut bottom-nav mobile: N item pertama yang terlihat oleh role ini. */
export function mobileShortcuts(role: Role, count: number): NavItem[] {
  return FLAT_NAV.filter((i) => i.roles.includes(role)).slice(0, count);
}
