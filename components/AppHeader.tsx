"use client";

import { usePathname } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";
import { FLAT_NAV, isActive } from "@/components/navigation";
import { ROLE_LABELS, type Role } from "@/types";

export default function AppHeader({ role, userName }: { role: Role; userName: string }) {
  const pathname = usePathname();
  const current = FLAT_NAV.find((item) => isActive(pathname, item.href));
  const initials = userName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return (
    <header className="workspace-header">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Club workspace</p>
        <p className="mt-1 truncate text-sm font-medium text-navy-900">{current?.label ?? "Team Cakra"}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <NotificationBell />
        <ThemeToggle compact />
        <div className="mx-1 h-8 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
        <div className="hidden text-right xl:block">
          <p className="max-w-48 truncate text-xs font-semibold text-navy-900">{userName}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{ROLE_LABELS[role]}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-900/50 dark:text-brand-200" title={userName}>{initials || "TC"}</span>
      </div>
    </header>
  );
}
