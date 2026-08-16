"use client";

export default function GroupDistribution({
  items,
}: {
  items: { name: string; count: number }[];
}) {
  const max = Math.max(1, ...items.map((i) => i.count));

  return (
    <div className="card">
      <h2 className="mb-4 font-semibold">Atlet per Kelompok</h2>
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">Belum ada kelompok.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.name}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium text-slate-700">{i.name}</span>
                <span className="text-slate-500">{i.count} atlet</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${(i.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
