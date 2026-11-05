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
    <div className="stat-card">
      <p className="stat-label">{label}</p>
      <p className={`stat-value [overflow-wrap:anywhere] ${tone ?? ""}`}>
        {value}
      </p>
      {hint && <p className="mt-3 text-xs leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}
