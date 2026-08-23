"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AccountInfo = {
  has_account: boolean;
  athlete_status?: string;
  suggested_email?: string;
  account_id?: string | null;
  email?: string | null;
  role?: string | null;
  account_status?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
};

/** Panel ACCOUNT pada detail atlet: status, email, aksi buat/reset/disable/enable. */
export default function AthleteAccountPanel({ athleteId }: { athleteId: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/athlete-accounts?athlete_id=${encodeURIComponent(athleteId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat status akun");
      setInfo(data);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Buat akun via endpoint atlet; aksi akun lain memakai /api/admin/accounts yang sudah ada. */
  async function call(path: string, method: "GET" | "POST" | "PATCH", body: Record<string, unknown>, okText = "✓ Berhasil") {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Operasi gagal");
      setMessage(okText);
      await load();
      router.refresh();
    } catch (e) {
      setMessage(`✗ ${e instanceof Error ? e.message : "Operasi gagal"}`);
    } finally {
      setBusy(false);
    }
  }

  function resetPassword() {
    const pw = window.prompt("Password sementara baru (min. 8 karakter, huruf+angka):");
    if (!pw) return;
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
      window.alert("Password minimal 8 karakter dan harus mengandung huruf serta angka.");
      return;
    }
    void call("/api/admin/accounts", "PATCH", { id: info?.account_id, action: "set_password", password: pw, force_password_reset: true }, "✓ Password direset");
  }

  const badge = info?.has_account
    ? info.account_status === "ACTIVE"
      ? <span className="badge bg-emerald-100 text-emerald-700">✓ Aktif</span>
      : <span className="badge bg-red-100 text-red-700">⛔ Dinonaktifkan</span>
    : <span className="badge bg-amber-100 text-amber-700">⚠ Belum memiliki akun</span>;

  return (
    <section aria-label="Akun Atlet" className="card space-y-3">
      <h2 className="text-base font-semibold text-navy-900">Akun</h2>
      {loading && !info ? (
        <p className="text-sm text-slate-500">Memuat status akun…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {badge}
            {info?.athlete_status === "LEFT_CLUB" && <span className="badge bg-slate-100 text-slate-600">Atlet keluar</span>}
          </div>
          {info?.has_account ? (
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div><dt className="inline text-slate-500">Email: </dt><dd className="inline font-medium">{info.email}</dd></div>
              <div><dt className="inline text-slate-500">Role: </dt><dd className="inline font-medium">{info.role}</dd></div>
              <div><dt className="inline text-slate-500">Dibuat: </dt><dd className="inline font-medium">{info.created_at ? new Date(info.created_at).toLocaleDateString("id-ID") : "—"}</dd></div>
              <div><dt className="inline text-slate-500">Login terakhir: </dt><dd className="inline font-medium">{info.last_sign_in_at ? new Date(info.last_sign_in_at).toLocaleString("id-ID") : "Belum pernah"}</dd></div>
            </dl>
          ) : (
            <p className="text-sm text-slate-600">
              Atlet belum memiliki akun login.{info?.suggested_email && <> Email yang akan dipakai: <code>{info.suggested_email}</code></>}
            </p>
          )}
          {message && <p className={`rounded-lg px-3 py-2 text-sm ${message.startsWith("✓") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message}</p>}
          <div className="flex flex-wrap gap-2">
            {!info?.has_account && (
              <button type="button" className="btn-primary text-sm" disabled={busy}
                onClick={() => void call("/api/admin/athlete-accounts", "POST", { athlete_id: athleteId }, "✓ Akun dibuat")}>
                Buat Akun
              </button>
            )}
            {info?.has_account && info.account_id && (
              <>
                <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={resetPassword}>Reset Password</button>
                {info.account_status === "ACTIVE" ? (
                  <button type="button" className="btn-secondary text-sm" disabled={busy}
                    onClick={() => void call("/api/admin/accounts", "PATCH", { id: info.account_id, action: "disable" }, "✓ Akun dinonaktifkan")}>
                    Nonaktifkan Akun
                  </button>
                ) : (
                  <button type="button" className="btn-secondary text-sm" disabled={busy}
                    onClick={() => void call("/api/admin/accounts", "PATCH", { id: info.account_id, action: "enable" }, "✓ Akun diaktifkan")}>
                    Aktifkan Akun
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
