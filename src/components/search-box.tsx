"use client";

import * as React from "react";
import { Search, Loader2 } from "lucide-react";
import { globalSearch } from "@/app/actions/search";

export function SearchBox() {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(async () => {
      if (q.length < 2) { setResults([]); return; }
      setLoading(true);
      try {
        const r = await globalSearch(q);
        setResults(r);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search projects, tasks, opportunities, applications, people, organizations, documents…"
          className="h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-10 text-sm focus:border-accent focus:outline-none"
        />
        {loading && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-faint" />}
      </div>

      <div className="mt-4 space-y-1">
        {results.map((r) => (
          <a key={r.type + r.id} href={r.href} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">
            <span className="flex items-center gap-2">
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-muted">{r.type}</span>
              {r.title}
            </span>
            {r.subtitle && <span className="text-xs text-muted">{r.subtitle}</span>}
          </a>
        ))}
        {q.length >= 2 && !loading && results.length === 0 && (
          <p className="px-1 py-4 text-sm text-muted">No results for &quot;{q}&quot;.</p>
        )}
        {q.length < 2 && <p className="px-1 py-4 text-sm text-muted">Type at least two characters to search across your operating system.</p>}
      </div>
    </div>
  );
}
