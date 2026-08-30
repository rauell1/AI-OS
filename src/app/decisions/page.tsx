import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/widgets";
import { Card, CardContent, Input, Label, Textarea, Button } from "@/components/ui";
import { addDecisionForm } from "@/app/actions/decisions";

export default async function DecisionsPage() {
  const user = await requireUser();
  const db = await getDb();
  const decisions = await db.query(`SELECT * FROM decisions WHERE user_id = ? ORDER BY created_at DESC`, [user.id]);

  return (
    <div>
      <PageHeader title="Decision Log" description="Record important decisions, context and reasoning for future reference." />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-2">
          {decisions.map((d) => (
            <div key={d.id} className="card p-4">
              <p className="text-sm font-medium">{d.decision}</p>
              {d.context && <p className="mt-1 text-sm text-muted">Context: {d.context}</p>}
              {d.reason && <p className="mt-1 text-sm text-muted">Reason: {d.reason}</p>}
              <p className="mt-1 text-[11px] text-faint">{formatDate(d.created_at, true)}</p>
            </div>
          ))}
          {decisions.length === 0 && <Card><CardContent><p className="text-sm text-muted">No decisions logged yet.</p></CardContent></Card>}
        </div>
        <Card>
          <CardContent className="space-y-3 pt-4">
            <p className="text-sm font-medium">Log a decision</p>
            <form action={addDecisionForm} className="space-y-3">
              <div><Label>Decision</Label><Input name="decision" required placeholder="e.g. Declined X offer" /></div>
              <div><Label>Context</Label><Textarea name="context" rows={2} /></div>
              <div><Label>Reason</Label><Textarea name="reason" rows={2} /></div>
              <Button type="submit" variant="primary" size="sm">Save</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
