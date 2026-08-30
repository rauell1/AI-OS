import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/widgets";
import { Badge, Card, CardContent } from "@/components/ui";
import { DocumentDialog } from "@/components/modals";
import { deleteDocumentForm } from "@/app/actions/documents";

const sensTone: Record<string, any> = { normal: "neutral", confidential: "warning", restricted: "danger" };

export default async function DocumentsPage() {
  const user = await requireUser();
  const db = await getDb();
  const docs = await db.query(`SELECT * FROM documents WHERE user_id = ? ORDER BY created_at DESC`, [user.id]);

  return (
    <div>
      <PageHeader title="Document Vault" description="Secure document metadata with local file storage. Sensitive files are never sent to AI without an explicit purpose."
        action={<DocumentDialog />} />

      <div className="space-y-2">
        {docs.map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{d.name}</p>
              <p className="text-[11px] text-muted">{d.category} {d.issuer ? `· ${d.issuer}` : ""} · {(d.size_bytes / 1024).toFixed(0)} KB · {formatDate(d.created_at)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={sensTone[d.sensitivity] || "neutral"}>{d.sensitivity}</Badge>
              <a href={`/api/documents/${d.id}`} className="text-xs text-accent hover:underline">Open</a>
              <form action={deleteDocumentForm}>
                <input type="hidden" name="id" value={d.id} />
                <button className="text-xs text-faint hover:text-danger">Delete</button>
              </form>
            </div>
          </div>
        ))}
        {docs.length === 0 && <Card><CardContent><p className="text-sm text-muted">No documents yet. Upload a CV, certificate or transcript.</p></CardContent></Card>}
      </div>
    </div>
  );
}
