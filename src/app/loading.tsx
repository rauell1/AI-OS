export default function RouteLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading page">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded bg-surface-2" />
        <div className="h-4 w-80 max-w-full rounded bg-surface-2" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-28 rounded-xl border border-border bg-surface-2/50" />
        ))}
      </div>
    </div>
  );
}
