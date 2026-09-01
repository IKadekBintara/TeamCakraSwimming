"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Tombol hapus registrasi atlet dari event (dengan konfirmasi).
 *  Setelah sukses: baris DB terhapus → worker sync membersihkan & mengompaksi
 *  baris Excel + nomor urut menyusun ulang otomatis. */
export default function DeleteRegistrationButton({
  registrationId,
  athleteName,
  eventName,
}: {
  registrationId: string;
  athleteName: string;
  eventName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function onDelete() {
    const msg = `Hapus pendaftaran ${athleteName} dari event "${eventName}"?\n\n` +
      `• Data pendaftaran (termasuk pembayaran) dihapus permanen\n` +
      `• Baris atlet di Excel akan dihapus dan nomor urut menyusun ulang otomatis`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/registrations/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_id: registrationId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Gagal menghapus: ${data.error ?? res.status}`);
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
      title="Hapus pendaftaran dari event"
    >
      {busy ? "Menghapus…" : "Hapus"}
    </button>
  );
}
