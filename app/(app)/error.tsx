"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Error state yang aman untuk user: pesan jelas, tombol Retry,
 * tanpa membocorkan stack trace / detail internal.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Catat ke console untuk diagnosa admin; user hanya melihat pesan ramah.
    console.error("App error:", error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-6xl pt-14 lg:pt-0">
      <div className="empty-state" role="alert">
        <p className="empty-state-title">Gagal memuat halaman.</p>
        <p className="empty-state-desc">
          Terjadi kendala saat mengambil data. Koneksi atau sesi mungkin terputus — coba muat ulang.
          {error.digest && <span className="mt-1 block text-[10px] text-slate-400">Kode: {error.digest}</span>}
        </p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={reset} className="btn-primary text-sm">Coba Lagi</button>
          <Link href="/dashboard" className="btn-secondary text-sm">Ke Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
