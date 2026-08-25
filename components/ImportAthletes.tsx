"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizeCakra } from "@/lib/cakra";
import * as XLSX from "xlsx";
import { normalizeWhatsapp } from "@/types";

interface ParsedRow {
  full_name: string;
  nickname: string | null;
  birth_date: string | null;
  gender: "M" | "F" | null;
  school: string | null;
  grade: string | null;
  parent_name: string | null;
  whatsapp: string | null;
  address: string | null;
  program: string | null;
  group_name: string | null;
  cakra: string | null;
  status: "ACTIVE" | "INACTIVE";
  notes: string | null;
}

interface RowIssue {
  row: number;
  level: "error" | "warning";
  message: string;
}

function cell(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export default function ImportAthletes() {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [issues, setIssues] = useState<RowIssue[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function parseFile(file: File) {
    setResult(null);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    const parsed: ParsedRow[] = raw.map((r) => {
      const g = cell(r["JK"] ?? r["Gender"] ?? r["Jenis Kelamin"]);
      const st = (cell(r["Status"]) ?? "ACTIVE").toUpperCase();
      return {
        full_name: cell(r["Nama Lengkap"] ?? r["Nama"] ?? r["full_name"]) ?? "",
        nickname: cell(r["Panggilan"] ?? r["Nickname"]),
        birth_date: cell(r["Tanggal Lahir"] ?? r["birth_date"]),
        gender: g === "M" || g === "L" || g === "Laki-laki" ? "M" : g === "F" || g === "P" || g === "Perempuan" ? "F" : null,
        school: cell(r["Sekolah"] ?? r["School"]),
        grade: cell(r["Kelas"] ?? r["Grade"]),
        parent_name: cell(r["Orang Tua"] ?? r["Nama Orang Tua"] ?? r["parent_name"]),
        whatsapp: cell(r["WhatsApp"] ?? r["WA"] ?? r["whatsapp"]),
        address: cell(r["Alamat"] ?? r["Address"]),
        program: cell(r["Program"]),
        group_name: cell(r["Kelompok"] ?? r["Kelompok Latihan"] ?? r["group"]),
        cakra: cell(r["Cakra"] ?? r["Kelompok Cakra"] ?? r["cakra"]),
        status: st === "INACTIVE" || st === "NONAKTIF" ? "INACTIVE" : "ACTIVE",
        notes: cell(r["Catatan"] ?? r["Notes"]),
      };
    });

    // Validate
    const found: RowIssue[] = [];
    const seen = new Map<string, number>();
    parsed.forEach((r, i) => {
      const rowNum = i + 2; // header = row 1
      if (!r.full_name) {
        found.push({ row: rowNum, level: "error", message: "Nama wajib diisi" });
        return;
      }
      const key = r.full_name.toLowerCase();
      if (seen.has(key)) {
        found.push({ row: rowNum, level: "warning", message: `Duplikat nama dengan baris ${seen.get(key)}` });
      } else {
        seen.set(key, rowNum);
      }
      if (r.birth_date && isNaN(Date.parse(r.birth_date))) {
        found.push({ row: rowNum, level: "warning", message: `Format tanggal lahir tidak dikenal: ${r.birth_date}` });
      }
    });

    // Check duplicates against DB
    const names = parsed.filter((r) => r.full_name).map((r) => r.full_name);
    if (names.length > 0) {
      const { data: existing } = await supabase
        .from("athletes")
        .select("full_name")
        .in("full_name", names);
      const existingSet = new Set((existing ?? []).map((e) => e.full_name.toLowerCase()));
      parsed.forEach((r, i) => {
        if (r.full_name && existingSet.has(r.full_name.toLowerCase())) {
          found.push({ row: i + 2, level: "warning", message: `"${r.full_name}" sudah ada di database — akan dilewati` });
        }
      });
    }

    setRows(parsed);
    setIssues(found);
  }

  async function doImport() {
    setImporting(true);
    setResult(null);
    try {
      const errorRows = new Set(issues.filter((i) => i.level === "error").map((i) => i.row));

      // Fetch group map
      const { data: groups } = await supabase.from("training_groups").select("id, name");
      const groupMap = new Map((groups ?? []).map((g) => [g.name.toLowerCase(), g.id]));

      // Fetch existing names to skip
      const { data: existing } = await supabase.from("athletes").select("full_name");
      const existingSet = new Set((existing ?? []).map((e) => e.full_name.toLowerCase()));

      const toInsert = rows
        .map((r, i) => ({ r, rowNum: i + 2 }))
        .filter(({ r, rowNum }) => !errorRows.has(rowNum) && r.full_name && !existingSet.has(r.full_name.toLowerCase()))
        .map(({ r }) => ({
          full_name: r.full_name,
          nickname: r.nickname,
          birth_date: r.birth_date && !isNaN(Date.parse(r.birth_date)) ? r.birth_date : null,
          gender: r.gender,
          school: r.school,
          grade: r.grade,
          parent_name: r.parent_name,
          whatsapp: r.whatsapp ? normalizeWhatsapp(r.whatsapp) : null,
          address: r.address,
          program: r.program,
          cakra: r.cakra ? normalizeCakra(r.cakra) : null,
          group_id: r.group_name
            ? groupMap.get(r.group_name.toLowerCase())
              ?? groupMap.get(r.group_name.toLowerCase().replace(/^team\s+/, ""))
              ?? groupMap.get(`team ${r.group_name.toLowerCase()}`)
              ?? null
            : null,
          status: r.status,
          notes: r.notes,
        }));

      if (toInsert.length === 0) {
        setResult("Tidak ada baris valid untuk diimpor.");
        return;
      }

      const { error } = await supabase.from("athletes").insert(toInsert);
      if (error) throw error;

      await supabase.from("audit_logs").insert({
        action: "import_excel",
        entity: "athletes",
        details: { inserted: toInsert.length, skipped: rows.length - toInsert.length },
      });

      setResult(`✓ Berhasil mengimpor ${toInsert.length} atlet (${rows.length - toInsert.length} dilewati).`);
      setRows([]);
      setIssues([]);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      setResult(`✗ Gagal: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setImporting(false);
    }
  }

  const errorCount = issues.filter((i) => i.level === "error").length;

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold">Import Atlet dari Excel</h2>
        <p className="text-sm text-slate-500">
          Format kolom: Nama Lengkap, Panggilan, Tanggal Lahir, JK, Sekolah, Kelas, Orang Tua, WhatsApp, Alamat, Program, Kelompok, Status, Catatan
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) parseFile(f);
        }}
      />

      {issues.length > 0 && (
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          {issues.map((i, idx) => (
            <p key={idx} className={i.level === "error" ? "text-red-700" : "text-amber-700"}>
              {i.level === "error" ? "✗" : "⚠"} Baris {i.row}: {i.message}
            </p>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[480px] text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2">Kelompok</th>
                  <th className="px-3 py-2">Program</th>
                  <th className="px-3 py-2">WhatsApp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i} className={issues.some((is) => is.row === i + 2 && is.level === "error") ? "bg-red-50" : ""}>
                    <td className="px-3 py-1.5 text-slate-400">{i + 2}</td>
                    <td className="px-3 py-1.5 font-medium">{r.full_name || <span className="text-red-600">(kosong)</span>}</td>
                    <td className="px-3 py-1.5">{r.group_name ?? "—"}</td>
                    <td className="px-3 py-1.5">{r.program ?? "—"}</td>
                    <td className="px-3 py-1.5">{r.whatsapp ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={doImport}
            disabled={importing || rows.length === 0 || errorCount === rows.length}
            className="btn-primary"
          >
            {importing ? "Mengimpor..." : `Konfirmasi Import (${rows.length - errorCount} baris)`}
          </button>
        </>
      )}

      {result && (
        <p className={`rounded-lg px-3 py-2 text-sm ${result.startsWith("✓") ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {result}
        </p>
      )}
    </div>
  );
}
