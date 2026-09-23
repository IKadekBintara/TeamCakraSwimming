/**
 * ATOMIC SAVE untuk workbook Excel.
 * ================================
 * MASALAH: `wb.xlsx.writeFile(path)` menulis LANGSUNG ke file tujuan — handle
 * tulis terbuka selama penulisan. Bila Syncthing (atau Excel) sedang memegang
 * file itu, Windows menolak dengan "being used by another process"
 * (sharing violation). Pola lama `rm` lalu `writeFile` memperparah: ada
 * jendela waktu file TIDAK ADA, tepat saat Syncthing mencoba me-replace-nya
 * ("moving for conflict: removing item to be replaced").
 *
 * SOLUSI: tulis ke file TEMP di folder yang sama, lalu RENAME atomik
 * menimpa tujuan. Rename di volume yang sama bersifat atomik di NTFS:
 * pembaca (Syncthing) selalu melihat file utuh — versi lama atau baru,
 * tidak pernah setengah jadi, dan tidak pernah "file hilang".
 *
 * Retry dengan backoff menangani sharing violation sementara (Syncthing/
 * antivirus/Excel yang masih memegang handle sesaat).
 */
import { rename as fsRename, rm as fsRm, open as fsOpen, stat as fsStat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Kode error Windows yang berarti "file sedang dipakai proses lain". */
function isSharingViolation(e) {
  const code = e?.code ?? "";
  const msg = String(e?.message ?? "");
  return (
    code === "EBUSY" || code === "EPERM" || code === "EACCES" || code === "ENOTEMPTY" ||
    /being used by another process|sharing violation|busy|locked/i.test(msg)
  );
}

/**
 * Simpan workbook secara ATOMIC (temp + rename), dengan retry.
 * @returns {{ tmp: string, retries: number }}
 */
export async function saveWorkbookAtomic(wb, targetPath, { retries = 8, baseDelayMs = 120 } = {}) {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const tmp = path.join(dir, `.${base}.tmp-${process.pid}-${Date.now()}`);

  // 1) Tulis SELALU ke temp (tidak pernah menyentuh file tujuan saat menulis).
  await wb.xlsx.writeFile(tmp);

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // 2) Rename atomik menimpa tujuan.
      await fsRename(tmp, targetPath);
      return { tmp, retries: attempt };
    } catch (e) {
      lastErr = e;
      if (!isSharingViolation(e)) {
        // Error lain (mis. direktori hilang) — bersihkan temp lalu lempar.
        await fsRm(tmp, { force: true }).catch(() => {});
        throw e;
      }
      // Pembaca (Syncthing/AV/Excel) masih memegang handle → tunggu & ulangi.
      await sleep(baseDelayMs * (attempt + 1));
    }
  }

  // Gagal setelah semua retry: JANGAN tinggalkan temp sampah.
  await fsRm(tmp, { force: true }).catch(() => {});
  const err = new Error(
    `saveWorkbookAtomic gagal menimpa "${targetPath}" setelah ${retries + 1} percobaan: ${lastErr?.message ?? lastErr}`
  );
  err.code = lastErr?.code ?? "ATOMIC_SAVE_FAILED";
  throw err;
}

/** Pastikan file bisa dibaca + ditulis (handle dilepas segera). */
export async function assertFileReleasable(p) {
  const fh = await fsOpen(p, fsConstants.O_RDWR);
  const st = await fh.stat();
  await fh.close();
  return st.size;
}

/** Ada sisa file temp milik worker? (untuk pembersihan) */
export async function listStaleTemps(targetPath) {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const { readdir } = await import("node:fs/promises");
  const names = await readdir(dir);
  return names.filter((n) => n.startsWith(`.${base}.tmp-`)).map((n) => path.join(dir, n));
}

export { fsStat };
