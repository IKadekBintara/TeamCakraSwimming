"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient, getSupabaseEnv } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const { configured } = getSupabaseEnv();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!configured) {
      setError("Supabase belum dikonfigurasi. Isi .env.local lalu restart server (lihat kotak kuning di atas).");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      if (msg.includes("Invalid login credentials")) {
        setError("Email atau password salah.");
      } else if (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed")) {
        setError("Tidak bisa menghubungi Supabase. Cek NEXT_PUBLIC_SUPABASE_URL di .env.local dan koneksi internet.");
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-slate-50 p-4">
      <div className="absolute right-4 top-4"><ThemeToggle compact /></div>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-28 w-28 items-center justify-center overflow-hidden sm:h-32 sm:w-32">
            <Image src="/brand/team-cakra-logo.png" alt="Logo TEAM CAKRA SWIMMING" width={128} height={128} className="h-full w-full object-contain" priority />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-brand-900">
            TEAM CAKRA SWIMMING
          </h1>
          <p className="mt-1 text-xs text-slate-500">SISTEM MANAJEMEN ATLET, ABSENSI, EVENT, DAN PEMBAYARAN</p>
        </div>

        {!configured && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="mb-1 font-semibold">⚠ Database belum terhubung</p>
            <p className="mb-2 text-amber-800">
              Login belum bisa dipakai. Lengkapi dulu:
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-amber-800">
              <li>Buat project di <span className="font-medium">supabase.com</span></li>
              <li>Copy <code className="rounded bg-amber-100 px-1">.env.local.example</code> → <code className="rounded bg-amber-100 px-1">.env.local</code></li>
              <li>Isi URL + anon key + service role key</li>
              <li>Restart server (Ctrl+C lalu <code className="rounded bg-amber-100 px-1">npm run dev</code>)</li>
            </ol>
          </div>
        )}

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Memproses..." : mode === "login" ? "Masuk" : "Daftar"}
          </button>

          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="w-full text-center text-sm text-brand-700 hover:underline"
          >
            {mode === "login"
              ? "Belum punya akun? Daftar"
              : "Sudah punya akun? Masuk"}
          </button>
        </form>

      </div>
    </main>
  );
}
