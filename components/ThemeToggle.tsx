"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "team-cakra-theme";
const THEME_EVENT = "team-cakra-theme-change";

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const sync = () => setDark(document.documentElement.classList.contains("dark"));
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      document.documentElement.classList.toggle("dark", event.newValue === "dark");
      sync();
    };
    sync();
    window.addEventListener(THEME_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(THEME_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem(STORAGE_KEY, next ? "dark" : "light"); } catch { /* The theme also works without browser storage. */ }
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return <button type="button" onClick={toggle} aria-label={dark ? "Aktifkan tema terang" : "Aktifkan tema gelap"} title={dark ? "Tema terang" : "Tema gelap"} className={`btn-secondary theme-toggle ${compact ? "px-3" : "px-4"}`}>
    {dark ? <Sun aria-hidden="true" className="h-4 w-4" /> : <Moon aria-hidden="true" className="h-4 w-4" />}
    <span className={compact ? "hidden xl:inline" : "hidden sm:inline"}>{dark ? "Tema terang" : "Tema gelap"}</span>
  </button>;
}
