"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "team-cakra-theme";

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark") || localStorage.getItem(STORAGE_KEY) === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    setDark(isDark);
    setReady(true);
  }, []);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    setDark(next);
  }

  return <button type="button" onClick={toggle} aria-label={dark ? "Aktifkan Light Mode" : "Aktifkan Night Mode"} title={dark ? "Light Mode" : "Night Mode"} className={`btn-secondary ${compact ? "px-2 py-1.5 text-xs" : "text-sm"}`}>
    <span aria-hidden="true">{ready && dark ? "☀️" : "🌙"}</span>
    <span className="hidden sm:inline">{ready && dark ? "Light Mode" : "Night Mode"}</span>
  </button>;
}
