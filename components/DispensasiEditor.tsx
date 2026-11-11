"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { defaultClosing, defaultLayout, defaultOpening, type Letter } from "@/lib/dispensasi";

type Event = { id: string; name: string; event_date: string; location: string | null };
type Athlete = { id: string; full_name: string; school: string | null };
type Header = { bytes: ArrayBuffer; type: "image/png" | "image/jpeg" };

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2";
const layoutKey = "cakra:layout-surat-dispensasi";
const layoutFields = [
  { key: "margin", label: "Margin kiri dan kanan (pt)", min: 36, max: 90 },
  { key: "headerHeight", label: "Tinggi kop (pt)", min: 95, max: 180 },
  { key: "fontSize", label: "Ukuran huruf (pt)", min: 9, max: 15 },
  { key: "leading", label: "Jarak antarbaris (pt)", min: 13, max: 24 },
  { key: "signatureX", label: "Posisi tanda tangan (%)", min: 25, max: 85 },
  { key: "signatureGap", label: "Ruang tanda tangan (pt)", min: 30, max: 100 },
] as const;

function initialLetter(athlete: Athlete, event: Event): Letter {
  const issueDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date());
  return {
    athlete: athlete.full_name, school: athlete.school ?? "",
    event: event.name, venue: event.location ?? "",
    eventDate: event.event_date, eventEnd: "", leaveDates: [event.event_date],
    city: "Kencong", issueDate, number: "", attachment: "-", subject: "Permohonan Dispensasi",
    position: "Ketua", organization: "Team Cakra Swimming", signer: "I Ketut Kartika",
    opening: defaultOpening, closing: defaultClosing,
  };
}

const textFields = [
  ["athlete", "Nama atlet"], ["school", "Sekolah"], ["event", "Nama kejuaraan"], ["venue", "Lokasi lomba"],
  ["number", "Nomor surat"], ["attachment", "Lampiran"], ["subject", "Perihal"], ["city", "Tempat surat"],
  ["signer", "Nama penandatangan"], ["position", "Jabatan"], ["organization", "Organisasi"],
] as const;

function validate(letter: Letter) {
  if (!letter.athlete.trim() || !letter.school.trim() || !letter.event.trim() || !letter.venue.trim()) {
    return "Lengkapi nama atlet, sekolah, nama kejuaraan, dan lokasi lomba.";
  }
  if (!letter.issueDate || !letter.eventDate || !letter.leaveDates.length || letter.leaveDates.some((date) => !date)) {
    return "Lengkapi tanggal surat, jadwal lomba, dan semua tanggal izin.";
  }
  if (letter.eventEnd && letter.eventEnd < letter.eventDate) return "Tanggal akhir lomba harus sama atau setelah tanggal mulai.";
  return "";
}

export default function DispensasiEditor({ event, athletes }: { event: Event; athletes: Athlete[] }) {
  const [athleteId, setAthleteId] = useState(athletes[0].id);
  const [drafts, setDrafts] = useState<Record<string, Letter>>(() => ({
    [athletes[0].id]: initialLetter(athletes[0], event),
  }));
  const [layout, setLayout] = useState(defaultLayout);
  const [defaultHeader, setDefaultHeader] = useState<Header>();
  const [customHeader, setCustomHeader] = useState<Header>();
  const [headerError, setHeaderError] = useState("");
  const [layoutMessage, setLayoutMessage] = useState("");
  const [preview, setPreview] = useState<{ url: string; letter: Letter; layout: typeof defaultLayout; header: Header }>();
  const [pdfError, setPdfError] = useState("");
  const letter = drafts[athleteId];
  const header = customHeader ?? defaultHeader;
  const validation = validate(letter);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(layoutKey) ?? "null");
      if (saved && layoutFields.every(({ key, min, max }) =>
        typeof saved[key] === "number" && saved[key] >= min && saved[key] <= max)) setLayout(saved);
    } catch {
      // The default layout remains available if browser storage is unavailable.
    }
    const abort = new AbortController();
    fetch("/kop-surat-cakra.png", { signal: abort.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.arrayBuffer();
      })
      .then((bytes) => setDefaultHeader({ bytes, type: "image/png" }))
      .catch(() => { if (!abort.signal.aborted) setHeaderError("Kop bawaan gagal dimuat. Muat ulang halaman atau pilih gambar kop."); });
    return () => abort.abort();
  }, []);

  useEffect(() => {
    setPdfError("");
    if (validation || !header) return;
    let cancelled = false;
    let url: string | undefined;
    const timer = window.setTimeout(async () => {
      try {
        const { buildDispensasiPdf } = await import("@/lib/dispensasi-pdf");
        const leaveDates = Array.from(new Set(letter.leaveDates)).sort();
        const bytes = await buildDispensasiPdf({ ...letter, leaveDates }, layout, header);
        if (cancelled) return;
        const buffer = new ArrayBuffer(bytes.length);
        new Uint8Array(buffer).set(bytes);
        url = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
        setPreview({ url, letter, layout, header });
      } catch (error) {
        if (cancelled) return;
        const detail = error instanceof Error ? error.message : "";
        setPdfError(detail.includes("WinAnsi")
          ? "Ada karakter yang tidak didukung oleh huruf PDF. Ganti karakter tersebut dan coba lagi."
          : detail || "Pratinjau PDF gagal dibuat.");
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [letter, layout, header, validation]);

  function change<K extends keyof Letter>(key: K, value: Letter[K]) {
    setDrafts((previous) => ({ ...previous, [athleteId]: { ...previous[athleteId], [key]: value } }));
  }

  function selectAthlete(id: string) {
    const athlete = athletes.find((candidate) => candidate.id === id);
    if (!athlete) return;
    setDrafts((previous) => previous[id] ? previous : { ...previous, [id]: initialLetter(athlete, event) });
    setAthleteId(id);
  }

  async function uploadHeader(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    if (file.size > 3_000_000 || (file.type !== "image/png" && file.type !== "image/jpeg")) {
      setHeaderError("Pilih gambar PNG atau JPEG hingga 3 MB.");
      return;
    }
    try {
      setCustomHeader({ bytes: await file.arrayBuffer(), type: file.type });
      setHeaderError("");
    } catch {
      setHeaderError("Gambar kop gagal dibaca.");
    }
  }

  function saveLayout() {
    try {
      localStorage.setItem(layoutKey, JSON.stringify(layout));
      setLayoutMessage("Pengaturan tata letak tersimpan di browser ini.");
    } catch {
      setLayoutMessage("Pengaturan tata letak gagal disimpan di browser.");
    }
  }

  const ready = preview && preview.letter === letter && preview.layout === layout && preview.header === header;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <div className="card space-y-4">
        <label className="block text-sm font-semibold">
          Atlet terdaftar
          <select className={inputClass} value={athleteId} onChange={(event) => selectAthlete(event.target.value)}>
            {athletes.map((athlete) => <option key={athlete.id} value={athlete.id}>{athlete.full_name}</option>)}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {textFields.map(([key, label]) => (
            <label key={key} className="block text-sm">
              {label}
              <input className={inputClass} value={letter[key]} onChange={(event) => change(key, event.target.value)} />
            </label>
          ))}
          {([
            ["issueDate", "Tanggal surat"], ["eventDate", "Mulai lomba"], ["eventEnd", "Akhir lomba (opsional)"],
          ] as const).map(([key, label]) => (
            <label key={key} className="block text-sm">
              {label}
              <input className={inputClass} type="date" value={letter[key]} onChange={(event) => change(key, event.target.value)} />
            </label>
          ))}
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Tanggal izin sekolah</legend>
          {letter.leaveDates.map((date, index) => (
            <div className="flex items-center gap-2" key={index}>
              <input aria-label={`Tanggal izin ${index + 1}`} className={inputClass} type="date" value={date}
                onChange={(event) => change("leaveDates", letter.leaveDates.map((value, i) => i === index ? event.target.value : value))} />
              <button type="button" className="btn-secondary shrink-0" disabled={letter.leaveDates.length === 1}
                onClick={() => change("leaveDates", letter.leaveDates.filter((_, i) => i !== index))}>Hapus</button>
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={() => change("leaveDates", [...letter.leaveDates, ""])}>Tambah tanggal</button>
        </fieldset>
        <details className="border-t pt-3">
          <summary className="cursor-pointer font-semibold">Redaksi surat</summary>
          <p className="mt-2 text-sm text-slate-500">Gunakan {"{atlet}"}, {"{acara}"} dan {"{izin}"} untuk menyisipkan data otomatis.</p>
          {([["opening", "Paragraf pembuka"], ["closing", "Paragraf penutup"]] as const).map(([key, label]) => (
            <label className="mt-3 block text-sm" key={key}>
              {label}
              <textarea rows={4} className={inputClass} value={letter[key]} onChange={(event) => change(key, event.target.value)} />
            </label>
          ))}
        </details>
        <details className="border-t pt-3">
          <summary className="cursor-pointer font-semibold">Tata letak dan kop</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {layoutFields.map(({ key, label, min, max }) => (
              <label key={key} className="text-sm">
                {label}
                <span className="ml-1 font-medium">{layout[key]}</span>
                <input className="mt-2 block w-full" type="range" min={min} max={max} step={key === "fontSize" ? 0.5 : 1}
                  value={layout[key]} onChange={(event) => {
                    setLayout({ ...layout, [key]: Number(event.target.value) });
                    setLayoutMessage("");
                  }} />
              </label>
            ))}
          </div>
          <label className="mt-3 block text-sm">Ganti kop (PNG atau JPEG)
            <input type="file" accept="image/png,image/jpeg" className={inputClass} onChange={uploadHeader} />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={saveLayout}>Simpan tata letak</button>
            <button type="button" className="btn-secondary" onClick={() => {
              setLayout(defaultLayout);
              setCustomHeader(undefined);
              setHeaderError("");
              setLayoutMessage("");
            }}>Pakai tata letak bawaan</button>
          </div>
          {layoutMessage && <p role="status" className="mt-2 text-sm">{layoutMessage}</p>}
        </details>
      </div>
      <section className="card min-w-0 space-y-3" aria-label="Pratinjau surat">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Pratinjau A4</h2>
          {ready && <a className="btn-primary" href={preview.url} download={`Surat Dispensasi - ${letter.athlete.replace(/[\\/:*?"<>|]/g, "-")}.pdf`}>
            Unduh PDF
          </a>}
        </div>
        {headerError && <p role="alert" className="text-sm text-red-700">{headerError}</p>}
        {ready
          ? <iframe className="h-[72vh] min-h-96 w-full rounded-lg border bg-white" title="Pratinjau PDF surat dispensasi" src={preview.url} />
          : <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm text-slate-800">{validation || pdfError || "Menyiapkan pratinjau PDF…"}</p>}
      </section>
    </div>
  );
}
