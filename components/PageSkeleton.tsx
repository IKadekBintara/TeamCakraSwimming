export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 pt-14 lg:pt-0" aria-busy="true" aria-label="Memuat halaman">
      <div className="space-y-2">
        <div className="skeleton h-7 w-56" />
        <div className="skeleton h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="stat-card">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton mt-2 h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="card space-y-3">
        <div className="skeleton h-4 w-40" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

export default PageSkeleton;
