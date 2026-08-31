"use client";

import * as React from "react";
import { Search, FileText } from "lucide-react";
import { Input, Badge, Card, CardContent } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { deleteDocumentForm } from "@/app/actions/documents";

const sensTone: Record<string, any> = { normal: "neutral", confidential: "warning", restricted: "danger" };

export function DocumentList({ docs }: { docs: any[] }) {
  const [query, setQuery] = React.useState("");

  const filtered = query
    ? docs.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()) || d.category?.toLowerCase().includes(query.toLowerCase()))
    : docs;

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <Input 
          placeholder="Search documents..." 
          value={query} 
          onChange={(e) => setQuery(e.target.value)} 
          className="pl-9" 
        />
      </div>

      {filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d) => (
            <div key={d.id} className="group relative flex flex-col justify-between rounded-xl border border-border bg-surface p-4 shadow-sm transition-all hover:border-border-strong hover:shadow-md">
              <div>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                    <FileText size={20} className="text-muted" />
                  </div>
                  <Badge tone={sensTone[d.sensitivity] || "neutral"}>{d.sensitivity}</Badge>
                </div>
                <h3 className="line-clamp-2 text-sm font-medium text-fg group-hover:text-accent" title={d.name}>
                  {d.name}
                </h3>
                <p className="mt-1 text-xs text-muted">
                  {d.category === d.issuer ? d.category : `${d.category}${d.issuer ? ` · ${d.issuer}` : ""}`}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <div className="text-[11px] text-faint">
                  {d.size_bytes ? `${(d.size_bytes / 1024).toFixed(0)} KB` : "Online file"} · {formatDate(d.created_at)}
                </div>
                <div className="flex items-center gap-2">
                  <form action={deleteDocumentForm}>
                    <input type="hidden" name="id" value={d.id} />
                    <button className="rounded p-1.5 text-faint hover:bg-danger/10 hover:text-danger" title="Delete">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                  </form>
                  <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener noreferrer" className="rounded bg-accent-soft px-3 py-1 text-xs font-medium text-accent hover:bg-accent hover:text-white transition-colors">
                    Open
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <FileText size={32} className="mb-3 text-faint" />
            <p className="text-sm font-medium">No documents found</p>
            <p className="mt-1 text-xs text-muted">Try a different search term or upload a new document.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
