"use client";

import { useState } from "react";

const ROLES = [
  ["parent", "Orang Tua"],
  ["athlete", "Atlet"],
  ["coach", "Pelatih"],
  ["group_leader", "Group Leader"],
  ["ketua_kelompok", "Ketua Kelompok"],
] as const;

export default function ManualNotifyForm() {
  const [role, setRole] = useState("parent");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [msg, setMsg] = useState("");

  async function submit() {
    if (!title.trim() || !message.trim()) {
      setMsg("Judul dan isi wajib diisi.");
      return;
    }
    setMsg("Mengirim…");
    const res = await fetch("/api/communication/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_role: role, title, message }),
    });
    const j = await res.json().catch(() => null);
    if (res.ok) {
      setMsg(`Terkirim ke ${j?.sent ?? 0} pengguna.`);
      setTitle("");
      setMessage("");
    } else {
      setMsg(j?.error ?? "Gagal mengirim");
    }
    setTimeout(() => setMsg(""), 3000);
  }

  return (
    <div className="card">
      <h2 className="card-title mb-3">Broadcast Manual</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="label">Ke Role
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="label md:col-span-2">Judul
          <input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Pengumuman latihan" />
        </label>
        <label className="label md:col-span-3">Isi Pesan
          <textarea className="input min-h-[70px]" value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} placeholder="Isi pengumuman…" />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={submit} className="btn-primary">Kirim Broadcast</button>
        <span className="text-xs text-slate-400">{msg}</span>
      </div>
    </div>
  );
}
