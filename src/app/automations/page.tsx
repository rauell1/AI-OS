import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/widgets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { CreateAutomation, AutomationRow } from "@/components/automation-controls";

export default async function AutomationsPage() {
  const user = await requireUser();
  const db = await getDb();
  const [rules, runs] = await Promise.all([
    db.query(`SELECT * FROM automation_rules WHERE user_id = ? ORDER BY created_at DESC`, [user.id]),
    db.query(
      `SELECT r.*, a.name AS rule_name FROM automation_runs r JOIN automation_rules a ON a.id = r.rule_id WHERE a.user_id = ? ORDER BY r.started_at DESC LIMIT 12`,
      [user.id]
    ),
  ]);

  return (
    <div>
      <PageHeader title="Automations" description="Event-driven and scheduled workflows. Sensitive actions never default to auto-execute."
        action={<CreateAutomation />} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          {rules.map((r) => <AutomationRow key={r.id} rule={r} />)}
          {rules.length === 0 && <Card><CardContent><p className="text-sm text-muted">No automations yet. Create one to run your daily brief, deadline alerts or follow-up reminders automatically.</p></CardContent></Card>}
        </div>
        <Card>
          <CardHeader><CardTitle>Run history</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {runs.map((r) => (
              <div key={r.id} className="rounded-lg border border-border p-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.rule_name}</span>
                  <span className={`text-[11px] ${r.status === "success" ? "text-success" : r.status === "error" ? "text-danger" : "text-faint"}`}>{r.status}</span>
                </div>
                <p className="text-[11px] text-muted">{relativeTime(r.started_at)} · {r.actions_created} action(s)</p>
              </div>
            ))}
            {runs.length === 0 && <p className="text-sm text-muted">No runs yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
