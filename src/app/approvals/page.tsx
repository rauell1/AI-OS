import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/widgets";
import { Badge, Card, CardContent } from "@/components/ui";
import { ApprovalCard } from "@/components/approval-controls";

export default async function ApprovalsPage() {
  const user = await requireUser();
  const db = await getDb();
  const [pending, resolved] = await Promise.all([
    db.query(`SELECT * FROM approvals WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC`, [user.id]),
    db.query(`SELECT * FROM approvals WHERE user_id = ? AND status != 'pending' ORDER BY resolved_at DESC LIMIT 20`, [user.id]),
  ]);

  return (
    <div>
      <PageHeader title="Approval Center" description="AI may prepare drafts and recommend actions, but sending email, submitting applications, publishing and deleting all require your explicit approval." />

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2"><h2 className="text-sm font-semibold">Awaiting your approval</h2><Badge tone="warning">{pending.length}</Badge></div>
          <div className="space-y-2">
            {pending.map((a) => <ApprovalCard key={a.id} approval={a} />)}
            {pending.length === 0 && <Card><CardContent><p className="text-sm text-muted">Nothing awaiting approval. Generated CVs, cover letters and external actions appear here.</p></CardContent></Card>}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2"><h2 className="text-sm font-semibold">History</h2></div>
          <div className="space-y-2">
            {resolved.map((a) => (
              <div key={a.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{a.proposed_action}</span>
                  <Badge tone={a.status === "approved" ? "success" : "danger"}>{a.status}</Badge>
                </div>
                <p className="text-[11px] text-faint">{a.resolved_at ? new Date(a.resolved_at).toLocaleString() : ""}</p>
              </div>
            ))}
            {resolved.length === 0 && <Card><CardContent><p className="text-sm text-muted">No resolved approvals yet.</p></CardContent></Card>}
          </div>
        </div>
      </div>
    </div>
  );
}
