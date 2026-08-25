export default function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  /** Warna semantik opsional (success/warning/danger); default netral agar angka yang jadi fokus. */
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-0.5 text-[20px] font-bold leading-tight tracking-tight text-navy-900 [overflow-wrap:anywhere] sm:text-[28px] ${tone ?? ""}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
