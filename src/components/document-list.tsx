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
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-surface-2 text-xs text-muted border-b border-border">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Sensitivity</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((d) => (
                <tr key={d.id} className="transition-colors hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <FileText size={15} className="text-muted shrink-0" />
                      <span className="truncate max-w-[300px]" title={d.name}>{d.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{d.category} {d.issuer ? `· ${d.issuer}` : ""}</td>
                  <td className="px-4 py-3 text-muted">{(d.size_bytes / 1024).toFixed(0)} KB</td>
                  <td className="px-4 py-3 text-muted">{formatDate(d.created_at)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={sensTone[d.sensitivity] || "neutral"}>{d.sensitivity}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <a href={`/api/documents/${d.id}`} className="text-xs text-accent hover:underline">Open</a>
                      <form action={deleteDocumentForm}>
                        <input type="hidden" name="id" value={d.id} />
                        <button className="text-xs text-faint hover:text-danger">Delete</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
