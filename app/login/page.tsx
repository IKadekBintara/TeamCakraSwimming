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
        setError("Tidak bisa menghubungi server. Periksa koneksi internet Anda lalu coba lagi.");
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col bg-gradient-to-b from-brand-50 via-white to-navy-50">
      {/* Aquatic depth lines — subtle pool-lane motif */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-96 w-[120%] -translate-x-1/2 rounded-[100%] bg-brand-100/50 blur-3xl" />
      </div>

      <div className="relative z-10 flex items-center justify-between p-4 sm:p-6">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-800">Team Cakra Swimming</span>
        <ThemeToggle compact />
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-36 w-36 items-center justify-center sm:h-40 sm:w-40">
              <Image
                src="/brand/team-cakra-logo.png"
                alt="Logo TEAM CAKRA SWIMMING"
                width={160}
                height={160}
                className="h-full w-full object-contain drop-shadow-xl"
                priority
              />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-navy-900">
              TEAM CAKRA SWIMMING
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Sistem Manajemen Atlet, Absensi, Event &amp; Pembayaran
            </p>
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

          <form onSubmit={handleSubmit} className="card space-y-4 py-6 shadow-lg">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-navy-900">
                {mode === "login" ? "Masuk ke akun Anda" : "Buat akun baru"}
              </h2>
              <p className="text-xs text-slate-500">
                {mode === "login"
                  ? "Gunakan email dan password yang terdaftar."
                  : "Pendaftaran akun baru akan menunggu persetujuan admin."}
              </p>
            </div>

            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Masukkan email Anda"
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
                placeholder="Masukkan password Anda"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? (
                <>
                  <span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Memproses…
                </>
              ) : mode === "login" ? (
                "Masuk"
              ) : (
                "Daftar"
              )}
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

          <p className="mt-6 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} Team Cakra Swimming
          </p>
        </div>
      </div>
    </main>
  );
}
