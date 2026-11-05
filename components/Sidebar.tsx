"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  LogOut, ChevronDown, Menu as MenuIcon, X,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import { filterNavGroups, isActive, mobileShortcuts, type NavGroup, type NavItem } from "@/components/navigation";
import type { Role } from "@/types";

/** Grup yang memuat route aktif — untuk auto-expand accordion. */
function activeGroupId(groups: NavGroup[], pathname: string): string | null {
  return groups.find((g) => g.items.some((i) => isActive(pathname, i.href)))?.id ?? null;
}

interface RowProps {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
  /** false di drawer mobile → target sentuh lebih tinggi (≥44px). */
  touch?: boolean;
  /** Indentasi submenu di dalam accordion. */
  indented?: boolean;
  /** Primary navigation (Dashboard): geometri sama, bobot lebih tebal. */
  prominent?: boolean;
  tabbable?: boolean;
}

/** Baris menu daun — dipakai submenu accordion DAN fitur standalone (Dashboard,
 *  Performance, dst.) sehingga tinggi/padding/radius/hover/active identik. */
function NavLinkRow({ item, pathname, onNavigate, touch = false, indented = false, prominent = false, tabbable = true }: RowProps) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      tabIndex={tabbable ? undefined : -1}
      className={`flex items-center gap-3 rounded-lg ${indented ? "pl-9" : "px-3"} pr-3 ${touch ? "min-h-11 py-2.5" : "min-h-8 py-1.5"} text-[13px] transition-colors ${
        active
          ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
          : prominent
            ? "font-semibold text-brand-900 hover:bg-brand-50 dark:text-slate-100 dark:hover:bg-slate-100/5"
            : "font-medium text-slate-600 hover:bg-brand-50 hover:text-brand-800 dark:text-slate-300 dark:hover:bg-slate-100/5"
      }`}
    >
      {touch && <item.icon className={`h-4 w-4 shrink-0 ${active ? "" : prominent ? "text-brand-600 dark:text-brand-400" : ""}`} />}
      {item.label}
    </Link>
  );
}

interface GroupProps {
  group: NavGroup;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  touch?: boolean;
  /** Unik per instansi render (sidebar vs drawer) agar ID panel tidak duplikat. */
  variant: "desktop" | "mobile";
  /** false saat drawer tertutup → link keluar dari tab order (pengganti inert di React 18). */
  focusable?: boolean;
  /** Treatment primary navigation (hanya Dashboard). */
  prominent?: boolean;
}

/** Satu renderer untuk sidebar desktop DAN drawer mobile — parity terjamin.
 *  Grup ber-1 item dirender sebagai fitur standalone (bukan accordion palsu). */
function NavGroupBlock({ group, pathname, open, onToggle, onNavigate, touch = false, variant, focusable = true, prominent = false }: GroupProps) {
  const containsActive = group.items.some((i) => isActive(pathname, i.href));
  const rowPad = touch ? "py-2.5" : "py-2";

  // Grup tanpa label atau tunggal → link langsung (bukan parent dummy).
  if (!group.label || group.items.length === 1) {
    return (
      <div className="space-y-0.5">
        <NavLinkRow
          item={group.items[0]}
          pathname={pathname}
          onNavigate={onNavigate}
          touch={touch}
          prominent={prominent && !group.label}
          tabbable={focusable}
        />
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`nav-group-${group.id}-${variant}`}
        tabIndex={focusable ? undefined : -1}
        className={`flex min-h-11 w-full items-center justify-between rounded-lg px-3 ${rowPad} text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
          containsActive && !open ? "bg-brand-50 text-brand-800 dark:bg-slate-100/5" : "text-slate-400 hover:bg-brand-50 hover:text-brand-800 dark:hover:bg-slate-100/5"
        }`}
      >
        <span>{group.label}</span>
        <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 text-current transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
      </button>
      {/* Panel accordion: max-height + opacity (deterministik lintas engine;
          trik grid 1fr/0fr ternyata tidak reliable untuk container auto-height). */}
      <div
        id={`nav-group-${group.id}-${variant}`}
        aria-hidden={!open}
        className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-out motion-reduce:transition-none ${open ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="space-y-0.5 pb-1 pt-0.5">
          {group.items.map((i) => (
            <NavLinkRow
              key={i.href}
              item={i}
              pathname={pathname}
              onNavigate={onNavigate}
              touch={touch}
              indented
              tabbable={open && focusable}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Daftar navigasi lengkap — SATU komposisi untuk sidebar desktop & drawer mobile:
 *  Dashboard (primary) → separator → section groups berurutan. */
function NavList({ sections, pathname, openGroups, toggleGroup, onNavigate, touch = false, variant, focusable = true }: {
  sections: NavGroup[];
  pathname: string;
  openGroups: Set<string>;
  toggleGroup: (id: string) => void;
  onNavigate?: () => void;
  touch?: boolean;
  variant: "desktop" | "mobile";
  focusable?: boolean;
}) {
  if (variant === "desktop") {
    return (
      <div className="space-y-3">
        {sections.map((group) => (
          <section key={group.id}>
            {group.label && <p className="mb-1 px-3 pt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">{group.label}</p>}
            <div className="space-y-0.5">
              {group.items.map((item) => <NavLinkRow key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} tabbable={focusable} />)}
            </div>
          </section>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {sections.map((g, gi) => (
        <Fragment key={g.id}>
          {/* Zoning: separator proporsional tepat setelah primary navigation */}
          {gi === 1 && <div aria-hidden="true" className="border-t border-slate-100 dark:border-slate-800" />}
          <NavGroupBlock
            group={g}
            pathname={pathname}
            open={!g.label || g.items.length === 1 || openGroups.has(g.id)}
            onToggle={() => toggleGroup(g.id)}
            onNavigate={onNavigate}
            touch={touch}
            focusable={focusable}
            variant={variant}
            prominent={g.id === "utama"}
          />
        </Fragment>
      ))}
    </div>
  );
}

export default function Sidebar({ role, userName }: { role: Role; userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const sections = filterNavGroups(role);
  const shortcuts = mobileShortcuts(role, 5);
  const shortcutLabels: Record<string, string> = { "/dashboard": "Utama", "/performance": "Hasil", "/kelompok": "Grup", "/profil-saya": "Profil", "/absensi-saya": "Absen", "/performance-saya": "Hasil", "/pembayaran-saya": "Bayar" };

  const [drawerOpen, setDrawerOpen] = useState(false);
  // Accordion: grup aktif terbuka sejak render pertama — refresh tetap benar.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const a = activeGroupId(sections, pathname);
    return new Set(a ? [a] : []);
  });

  const toggleGroup = useCallback((id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Navigasi ke dalam grup lain → grup tujuan otomatis terbuka.
  useEffect(() => {
    const a = activeGroupId(sections, pathname);
    if (a) setOpenGroups((prev) => (prev.has(a) ? prev : new Set(prev).add(a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Drawer: tutup dengan Esc + kunci scroll body saat terbuka.
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const drawerPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!drawerOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
      if (e.key === "Tab") {
        const items = drawerPanelRef.current?.querySelectorAll<HTMLElement>('a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"])');
        if (!items?.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [drawerOpen]);

  // Swipe-kanan untuk menutup drawer (tanpa library).
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    if (e.changedTouches[0].clientX - touchStartX.current > 64) setDrawerOpen(false);
    touchStartX.current = null;
  };

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* ===================== DESKTOP SIDEBAR ===================== */}
      <aside className="workspace-sidebar">
        <div className="flex h-[88px] shrink-0 items-center gap-3 px-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center">
            <Image src="/brand/team-cakra-mark.png" alt="Logo TEAM CAKRA SWIMMING" width={48} height={48} className="h-full w-full object-contain" priority />
          </div>
          <div className="leading-tight">
            <p className="text-xl font-semibold tracking-tight text-navy-900">Team Cakra</p><p className="mt-1 text-[9px] font-medium tracking-[0.12em] text-slate-500">SWIMMING CLUB</p>
          </div>
        </div>

        {/* Internal scroll: menu panjang tidak mendorong account section keluar layar */}
        <nav aria-label="Navigasi utama" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <NavList sections={sections} pathname={pathname} openGroups={openGroups} toggleGroup={toggleGroup} variant="desktop" />
        </nav>

        {/* Account section — selalu terlihat, tak tertutup scroll */}
        <div className="p-4 pt-2">
          <button onClick={logout} className="btn-secondary w-full text-sm">
            <LogOut className="h-4 w-4" /> Keluar
          </button>
        </div>
      </aside>

      {/* ===================== MOBILE TOP BAR ===================== */}
      {/* Grid 3 zona: logo | (kosong) | aksi — tidak ada overlap di viewport sempit.
          Bell dirender di sini hanya untuk mobile; desktop memakai bell di layout utama. */}
      <div className="workspace-mobile-header">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center">
            <Image src="/brand/team-cakra-mark.png" alt="Logo TEAM CAKRA SWIMMING" width={44} height={44} className="h-full w-full object-contain" />
          </span>
          <div className="min-w-0 leading-tight"><p className="truncate text-base font-semibold text-navy-900">Team Cakra</p><p className="mt-1 text-[8px] tracking-[0.08em] text-slate-500">SWIMMING CLUB</p></div>
        </div>
        <div className="flex shrink-0 items-center gap-1 max-[359px]:justify-self-end">
          <div className="lg:hidden"><NotificationBell /></div>
          <ThemeToggle compact />
          <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Buka menu navigasi" aria-expanded={drawerOpen} aria-controls="sidebar-mobile-drawer-region" className="btn-secondary min-w-11 px-3">
            <MenuIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ===================== MOBILE DRAWER (seluruh menu) ===================== */}
      <div id="sidebar-mobile-drawer-region" className={`fixed inset-0 z-50 lg:hidden ${drawerOpen ? "" : "pointer-events-none invisible"}`} aria-hidden={!drawerOpen}>
        {/* Backdrop: klik untuk menutup */}
        <button
          type="button"
          tabIndex={drawerOpen ? 0 : -1}
          aria-label="Tutup menu navigasi"
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 h-full w-full bg-black/50 transition-opacity duration-200 motion-reduce:transition-none ${drawerOpen ? "opacity-100" : "opacity-0"}`}
        />
        {/* Panel slide-over kanan; lebar nyaman untuk jempol, menyisakan backdrop */}
        <div
          ref={drawerPanelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu navigasi lengkap"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className={`absolute inset-y-0 right-0 flex w-[85%] max-w-xs flex-col bg-white shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none ${drawerOpen ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-brand-900">Menu</p>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Tutup menu"
              className="min-h-11 min-w-11 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav aria-label="Navigasi lengkap" className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
            <NavList
              sections={sections}
              pathname={pathname}
              openGroups={openGroups}
              toggleGroup={toggleGroup}
              onNavigate={() => setDrawerOpen(false)}
              touch
              focusable={drawerOpen}
              variant="mobile"
            />
          </nav>

          <div className="border-t border-slate-100 p-3">
            <p className="mb-1 truncate px-1 text-xs text-slate-500">{userName}</p>
            <p className="mb-2 px-1 text-xs font-medium uppercase text-brand-700">{role}</p>
            <button onClick={logout} className="btn-secondary w-full text-sm">
              <LogOut className="h-4 w-4" /> Keluar
            </button>
          </div>
        </div>
      </div>

      {/* ===================== MOBILE BOTTOM NAV (shortcut + Menu) ===================== */}
      <nav
        aria-label="Navigasi cepat"
        className="workspace-bottom-nav"
      >
        {shortcuts.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={isActive(pathname, i.href) ? "page" : undefined}
            className={`flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[10px] font-medium ${
              isActive(pathname, i.href) ? "text-brand-700" : "text-slate-500"
            }`}
          >
            <i.icon className="h-5 w-5" />
            <span className="max-w-full truncate">{shortcutLabels[i.href] ?? i.label}</span>
          </Link>
        ))}
        {/* Pintu ke SELURUH menu — feature parity mobile */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
          aria-controls="sidebar-mobile-drawer-region"
          className={`flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[10px] font-medium ${
            drawerOpen ? "text-brand-700" : "text-slate-500"
          }`}
        >
          <MenuIcon className="h-5 w-5" />
          Menu
        </button>
      </nav>
    </>
  );
}
