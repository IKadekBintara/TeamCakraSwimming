"use client";

/**
 * Halaman Excel Sync — pusat pengelolaan sinkronisasi Database → Excel.
 * Semua data dari database; aksi via API admin; konfirmasi sebelum mutasi.
 */
import { useCallback, useEffect, useState } from "react";
import EventPicker, { type PickerEvent } from "@/components/EventPicker";

interface Config {
  id: string;
  name: string;
  event_id: string;
  file_path: string;
  worksheet_name: string;
  header_row: number;
  first_data_row: number;
  max_row: number | null;
  mapping: Record<string, string>;
  duplicate_strategy: string;
  enabled: boolean;
  last_sync_at?: string | null;
  last_check?: { ok: boolean; checks: Record<string, unknown>; error: string | null } | null;
  last_check_at?: string | null;
  last_dry_run?: { db_registrations: number; insert: number; update: number; skip: number; review_required: number; mismatch?: string[]; notes?: string[] } | null;
  last_dry_run_at?: string | null;
  events?: { name?: string; event_date?: string; status?: string } | null;
}

interface LogRow { id: number; action: string; detail: Record<string, unknown>; error_message: string | null; created_at: string }

type JobStats = Partial<Record<"PENDING" | "RETRYING" | "FAILED" | "REVIEW_REQUIRED" | "SUCCESS", number>>;

export default function ExcelSyncPage() {
  const [settings, setSettings] = useState<{ enabled: boolean } | null>(null);
  const [worker, setWorker] = useState<{ status: string; last_heartbeat: string | null } | null>(null);
  const [configs, setConfigs] = useState<Config[] | null>(null);
  const [stats, setStats] = useState<Record<string, JobStats>>({});
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [wizard, setWizard] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmGlobalOff, setConfirmGlobalOff] = useState(false);


  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/excel-sync");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat");
      setSettings({ enabled: Boolean(json.settings?.enabled) });
      setWorker(json.worker);
      setConfigs(json.configurations ?? []);
      setStats(json.job_stats ?? {});
      setLogs((json.logs ?? []).slice(0, 30));
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : "Gagal memuat", err: true });
    }
  }, []);


  /** POST aksi diagnostik (test_connection / dry_run) lalu poll hasilnya. */
  const runDiagnostic = useCallback(async (id: string, action: "test_connection" | "dry_run") => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/excel-sync/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal");
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const r2 = await fetch("/api/admin/excel-sync");
        const j2 = await r2.json();
        if (!r2.ok) continue;
        const cfg = (j2.configurations ?? []).find((c: Config) => c.id === id);
        const stamp = action === "test_connection" ? cfg?.last_check_at : cfg?.last_dry_run_at;
        if (stamp && Date.now() - new Date(stamp).getTime() < 120000) {
          setToast({ msg: action === "test_connection" ? "Test Connection selesai." : "Dry Run selesai." });
          break;
        }
      }
      await load();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : "Gagal", err: true });
    } finally {
      setBusyId(null);
    }
  }, [load]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function patchGlobal(enabled: boolean) {
    try {
      const res = await fetch("/api/admin/excel-sync", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_global", enabled }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal");
      setToast({ msg: enabled ? "Excel Sync diaktifkan secara global." : "Excel Sync dimatikan secara global." });
      await load();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : "Gagal", err: true });
    }
  }

  async function patchConfig(id: string, body: Record<string, unknown>, okMsg: string) {
    try {
      const res = await fetch(`/api/admin/excel-sync/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal");
      setToast({ msg: okMsg });
      await load();
      return true;
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : "Gagal", err: true });
      return false;
    }
  }

  if (!settings || configs === null) {
    return <div className="pt-14 lg:pt-0"><div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-navy-800" /></div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pt-14 lg:pt-0">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sinkronisasi Excel</h1>
          <p className="text-sm text-slate-500">Database adalah sumber utama. Excel hanyalah salinan administratif opsional.</p>
        </div>
        <button type="button" className="btn-primary text-sm" onClick={() => setWizard(true)} disabled={!settings.enabled}>
          + Tambah Konfigurasi
        </button>
      </header>

      {!settings.enabled && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200" role="status">
          <strong>Sinkronisasi Excel sedang dinonaktifkan.</strong> Database, pendaftaran, dan pembayaran tetap berjalan normal; konfigurasi & file Excel tidak dihapus. Saat diaktifkan kembali, gunakan Sync Now / Reconcile untuk mengejar perubahan yang tertunda.
        </div>
      )}

      {/* Status global & worker */}
      <section className="card grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Excel Sync Global</p>
          <div className="mt-2 flex items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${settings.enabled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200" : "bg-slate-200 text-slate-600 dark:bg-navy-700 dark:text-slate-300"}`}>
              {settings.enabled ? "ON" : "OFF"}
            </span>
            {settings.enabled ? (
              <button type="button" className="btn-secondary text-xs" onClick={() => setConfirmGlobalOff(true)}>Matikan Global</button>
            ) : (
              <button type="button" className="btn-primary text-xs" onClick={() => patchGlobal(true)}>Aktifkan Global</button>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Worker RDP</p>
          <div className="mt-2 flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${worker?.status === "CONNECTED" ? "bg-emerald-500" : worker?.status === "DEGRADED" ? "bg-amber-500" : "bg-red-500"}`} />
            <span className="text-sm font-medium">{worker?.status ?? "OFFLINE"}</span>
            {worker?.last_heartbeat && (
              <span className="text-xs text-slate-500">· detak terakhir {new Date(worker.last_heartbeat).toLocaleTimeString("id-ID")}</span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">Jika OFFLINE, job menunggu dan akan diproses saat worker kembali.</p>
        </div>
      </section>

      {/* Daftar konfigurasi */}
      <section aria-label="Daftar konfigurasi">
        {configs.length === 0 ? (
          <div className="card py-12 text-center">
            <p className="font-semibold">Belum ada konfigurasi Excel Sync.</p>
            <p className="mt-1 text-sm text-slate-500">Fitur ini opsional — event tetap berjalan normal tanpa Excel.</p>
            <button type="button" className="btn-primary mt-4 text-sm" onClick={() => setWizard(true)} disabled={!settings.enabled}>
              Tambah Konfigurasi
            </button>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-navy-700">
                  <th className="px-2 py-2">Nama</th><th className="px-2 py-2">Event</th><th className="px-2 py-2">File / Worksheet</th>
                  <th className="px-2 py-2">Status</th><th className="px-2 py-2">Pending/Failed</th><th className="px-2 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((c) => {
                  const s = stats[c.id] ?? {};
                  return (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0 dark:border-navy-800">
                      <td className="px-2 py-2 font-medium">{c.name}</td>
                      <td className="px-2 py-2">{c.events?.name ?? "—"}</td>
                      <td className="max-w-[220px] truncate px-2 py-2 font-mono text-xs" title={c.file_path}>{c.file_path} · {c.worksheet_name}</td>
                      <td className="px-2 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.enabled && settings.enabled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200" : "bg-slate-200 text-slate-600 dark:bg-navy-700 dark:text-slate-300"}`}>
                          {c.enabled ? (settings.enabled ? "ENABLED" : "ENABLED (GLOBAL OFF)") : "DISABLED"}
                        </span>
                        {c.last_sync_at && (
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            Sync: {new Date(c.last_sync_at).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {(s.PENDING ?? 0) + (s.RETRYING ?? 0)} / <span className={(s.FAILED ?? 0) > 0 ? "font-bold text-red-600" : ""}>{s.FAILED ?? 0}</span>
                        {(s.REVIEW_REQUIRED ?? 0) > 0 && <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">{s.REVIEW_REQUIRED} review</span>}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button" className="btn-secondary px-2 py-1 text-xs"
                            disabled={busyId === c.id}
                            onClick={() => runDiagnostic(c.id, "test_connection")}
                          >
                            Test Connection
                          </button>
                          <button
                            type="button" className="btn-secondary px-2 py-1 text-xs"
                            disabled={busyId === c.id}
                            onClick={() => runDiagnostic(c.id, "dry_run")}
                          >
                            Dry Run
                          </button>
                          <button
                            type="button" className="btn-secondary px-2 py-1 text-xs"
                            disabled={busyId === c.id}
                            onClick={() => patchConfig(c.id, { action: "toggle_config", enabled: !c.enabled }, c.enabled ? `${c.name} dimatikan.` : `${c.name} diaktifkan.`)}
                          >
                            {c.enabled ? "Disable" : "Enable"}
                          </button>
                          <button
                            type="button" className="btn-secondary px-2 py-1 text-xs"
                            disabled={busyId === c.id}
                            onClick={() => patchConfig(c.id, { action: "sync_now" }, `Sync Now diantrekan untuk ${c.name}.`)}
                          >
                            Sync Now
                          </button>
                          <button
                            type="button" className="btn-secondary px-2 py-1 text-xs text-red-600"
                            disabled={busyId === c.id}
                            onClick={() => {
                              if (confirm(`Hapus konfigurasi sinkronisasi "${c.name}"?\n\nData database dan file Excel TIDAK akan dihapus.`)) {
                                patchConfig(c.id, { action: "delete_config" }, `Konfigurasi ${c.name} dihapus (data tidak disentuh).`);
                              }
                            }}
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {configs.some((c) => c.last_check_at || c.last_dry_run_at) && (
          <div className="mt-3 space-y-2">
            {configs.filter((c) => c.last_check_at || c.last_dry_run_at).map((c) => (
              <details key={c.id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-navy-700">
                <summary className="cursor-pointer font-medium">
                  Hasil diagnostik — {c.name}
                  {c.last_check && (
                    <span className={`ml-2 rounded px-1.5 py-0.5 ${c.last_check.ok ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200" : "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200"}`}>
                      Test: {c.last_check.ok ? "OK" : "GAGAL"}
                    </span>
                  )}
                  {c.last_dry_run && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 dark:bg-navy-700">
                      Dry Run: +{c.last_dry_run.insert} / ~{c.last_dry_run.update} / ={c.last_dry_run.skip} / !{c.last_dry_run.review_required}
                    </span>
                  )}
                </summary>
                {c.last_check && (
                  <div className="mt-2 space-y-1">
                    <p className="font-semibold">Test Connection ({c.last_check_at ? new Date(c.last_check_at).toLocaleString("id-ID") : "-"})</p>
                    <ul className="list-disc pl-5">
                      <li>File ada: {String(c.last_check.checks?.file_exists ?? false)} · Worksheet: {String(c.last_check.checks?.worksheet ?? false)} · Writable: {String(c.last_check.checks?.writable_dir ?? false)}</li>
                      <li>Ukuran: {Number(c.last_check.checks?.size_bytes ?? 0).toLocaleString("id-ID")} byte</li>
                      {c.last_check.error && <li className="text-red-600 dark:text-red-400">Error: {c.last_check.error}</li>}
                    </ul>
                  </div>
                )}
                {c.last_dry_run && (
                  <div className="mt-2 space-y-1">
                    <p className="font-semibold">Dry Run ({c.last_dry_run_at ? new Date(c.last_dry_run_at).toLocaleString("id-ID") : "-"}) — DB: {c.last_dry_run.db_registrations} registrasi</p>
                    {(c.last_dry_run.mismatch?.length ?? 0) > 0 && (
                      <ul className="list-disc pl-5 text-amber-700 dark:text-amber-300">
                        {c.last_dry_run.mismatch!.map((m, i) => <li key={i}>{m}</li>)}
                      </ul>
                    )}
                    {(c.last_dry_run.notes?.length ?? 0) > 0 && (
                      <ul className="list-disc pl-5 text-red-600 dark:text-red-400">
                        {c.last_dry_run.notes!.map((n, i) => <li key={i}>{n}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </details>
            ))}
          </div>
        )}
      </section>

      {/* Log */}
      <section className="card">
        <h2 className="mb-2 font-semibold">Log Aktivitas</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada aktivitas.</p>
        ) : (
          <ul className="space-y-1 text-xs" role="log">
            {logs.map((l) => (
              <li key={l.id} className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1 last:border-0 dark:border-navy-800">
                <span><span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-navy-700">{l.action}</span> {l.error_message ?? ""}</span>
                <time className="shrink-0 text-slate-400">{new Date(l.created_at).toLocaleString("id-ID")}</time>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Konfirmasi global OFF */}
      {confirmGlobalOff && (
        <Modal onClose={() => setConfirmGlobalOff(false)} title="Matikan Excel Sync Global?">
          <p className="text-sm">Mematikan Excel Sync hanya menghentikan otomatisasi ke Excel.</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>Database, pendaftaran, pembayaran, dan atlet tetap normal.</li>
            <li>Konfigurasi tidak dihapus dan file Excel tidak disentuh.</li>
            <li>Saat diaktifkan lagi, jalankan reconciliation untuk mengejar perubahan.</li>
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setConfirmGlobalOff(false)}>Batal</button>
            <button type="button" className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700" onClick={async () => { setConfirmGlobalOff(false); await patchGlobal(false); }}>
              Ya, Matikan Sinkronisasi
            </button>
          </div>
        </Modal>
      )}

      {wizard && <Wizard onClose={() => setWizard(false)} onDone={async (msg) => { setWizard(false); setToast({ msg }); await load(); }} />}

      {toast && (
        <div className={`fixed bottom-5 right-5 z-[60] rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.err ? "bg-red-600" : "bg-emerald-600"}`}>{toast.msg}</div>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="card w-full max-w-lg space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/** Wizard konfigurasi baru: event → file → worksheet → area → mapping → duplikat → simpan. */
function Wizard({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [step, setStep] = useState(1);
  const [ev, setEv] = useState<PickerEvent | null>(null);
  const [filePath, setFilePath] = useState("C:\\Users\\kadexagent\\Documents\\atlet cakra\\FORMULIR PENDAFTARAN A1.xlsx");
  const [worksheet, setWorksheet] = useState("FORMULIR A1");
  const [headerRow, setHeaderRow] = useState("21");
  const [firstDataRow, setFirstDataRow] = useState("22");
  const [maxRow, setMaxRow] = useState("29");
  const [cfgName, setCfgName] = useState("");
  const [strategy, setStrategy] = useState("skip");
  const [mappingText, setMappingText] = useState(
    '{\n  "no": "NO",\n  "ku": "KU",\n  "gender": "PA/PI",\n  "name": "NAMA",\n  "birth_date": "Tanggal Lahir"\n}'
  );
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  let mapping: Record<string, string> = {};
  try { mapping = JSON.parse(mappingText); } catch { /* ditampilkan sbg error saat submit */ }

  function next() {
    setErr(null);
    if (step === 2 && !filePath.trim()) return setErr("File Excel wajib diisi.");
    if (step === 3 && !worksheet.trim()) return setErr("Worksheet wajib diisi.");
    if (step === 5) {
      try { JSON.parse(mappingText); } catch { return setErr("Mapping JSON tidak valid."); }
    }
    setStep(step + 1);
  }

  async function submit(enabled: boolean) {
    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/admin/excel-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cfgName || `${ev?.name} → ${worksheet}`,
          event_id: ev!.id,
          file_path: filePath.trim(),
          worksheet_name: worksheet.trim(),
          header_row: Number(headerRow), first_data_row: Number(firstDataRow),
          max_row: maxRow ? Number(maxRow) : null,
          mapping, duplicate_strategy: strategy,
          enabled,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menyimpan");
      onDone(enabled ? "Konfigurasi dibuat & ENABLED." : "Konfigurasi dibuat (DISABLED). Aktifkan lewat tombol Enable.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="card flex max-h-[90vh] w-full max-w-xl flex-col space-y-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Konfigurasi Baru — Langkah {step}/6</h3>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>

        {step === 1 && (
          <div>
            <p className="mb-2 text-sm text-slate-500">Pilih event yang akan disinkronkan.</p>
            <EventPicker onPick={(e) => { setEv(e); setStep(2); }} pickLabel="Pilih" />
          </div>
        )}

        {step === 2 && (
          <label className="block text-sm">
            Path file Excel di komputer/RDP (server-side, tidak diekspos ke publik):
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-navy-600 dark:bg-navy-900" value={filePath} onChange={(e) => setFilePath(e.target.value)} />
          </label>
        )}

        {step === 3 && (
          <label className="block text-sm">
            Nama worksheet:
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-navy-600 dark:bg-navy-900" value={worksheet} onChange={(e) => setWorksheet(e.target.value)} />
          </label>
        )}

        {step === 4 && (
          <div className="grid grid-cols-3 gap-3 text-sm">
            <label>Baris Header<input type="number" min={1} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 dark:border-navy-600 dark:bg-navy-900" value={headerRow} onChange={(e) => setHeaderRow(e.target.value)} /></label>
            <label>Baris Data Pertama<input type="number" min={2} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 dark:border-navy-600 dark:bg-navy-900" value={firstDataRow} onChange={(e) => setFirstDataRow(e.target.value)} /></label>
            <label>Baris Maks (opsional)<input type="number" className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 dark:border-navy-600 dark:bg-navy-900" value={maxRow} onChange={(e) => setMaxRow(e.target.value)} /></label>
            <p className="col-span-3 text-xs text-slate-500">Untuk FORMULIR A1: header baris 21, data mulai 22, maksimal 29 agar blok tanda tangan tidak tersentuh.</p>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3 text-sm">
            <label className="block">
              Mapping field database → kolom Excel (JSON):
              <textarea rows={7} spellCheck={false} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-navy-600 dark:bg-navy-900" value={mappingText} onChange={(e) => setMappingText(e.target.value)} />
            </label>
            <label className="block">
              Strategi duplikat:
              <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-navy-600 dark:bg-navy-900" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
                <option value="skip">Skip — jangan sentuh yang sudah ada</option>
                <option value="update_empty_fields">Lengkapi field kosong dari database</option>
              </select>
            </label>
            <p className="text-xs text-slate-500">Field tersedia: no, ku, gender, name, birth_date, athlete_id, registration_id, race_names, payment_status, total_amount.</p>
          </div>
        )}

        {step === 6 && ev && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-slate-50 px-4 py-3 dark:bg-navy-800/60">
              <p className="font-semibold">{cfgName || `${ev.name} → ${worksheet}`}</p>
              <p className="text-xs text-slate-500">{filePath} · sheet &quot;{worksheet}&quot; · header r{headerRow}, data r{firstDataRow}{maxRow ? `–${maxRow}` : "+"}</p>
            </div>
            <ul className="list-disc pl-5 text-xs text-slate-500">
              <li>Konfigurasi disimpan dulu; aktifkan bila sudah yakin.</li>
              <li>Sync hanya menulis area tabel atlet — template lain tidak disentuh.</li>
              <li>Duplicate check otomatis: nama ternormalisasi + registration_id stabil.</li>
            </ul>
            {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary text-sm" disabled={saving} onClick={() => submit(false)}>Simpan (Disabled)</button>
              <button type="button" className="btn-primary text-sm" disabled={saving} onClick={() => submit(true)}>Simpan & Enable</button>
            </div>
          </div>
        )}

        {step > 1 && step < 6 && (
          <div className="flex justify-between">
            <button type="button" className="btn-secondary text-sm" onClick={() => setStep(step - 1)}>← Kembali</button>
            <button type="button" className="btn-primary text-sm" onClick={next}>Lanjut →</button>
          </div>
        )}
        {step > 1 && step === 6 && (
          <div className="flex justify-start">
            <button type="button" className="btn-secondary text-sm" onClick={() => setStep(5)}>← Kembali</button>
          </div>
        )}
      </div>
    </div>
  );
}
