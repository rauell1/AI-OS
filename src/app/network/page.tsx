import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PageHeader, ScoreBar } from "@/components/widgets";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { OrgFormDialog, PersonFormDialog, LeadFormDialog } from "@/components/modals";

export default async function NetworkPage() {
  const user = await requireUser();
  const db = await getDb();
  const [orgs, people, leads] = await Promise.all([
    db.query(`SELECT o.*, (SELECT COUNT(*) FROM people p WHERE p.organization_id = o.id) AS members FROM organizations o WHERE o.user_id = ? ORDER BY o.name`, [user.id]),
    db.query(`SELECT p.*, o.name AS org_name FROM people p LEFT JOIN organizations o ON p.organization_id = o.id WHERE p.user_id = ? ORDER BY p.name`, [user.id]),
    db.query(`SELECT * FROM leads WHERE user_id = ? ORDER BY score DESC`, [user.id]),
  ]);
  const orgOpts = orgs.map((o: any) => ({ id: o.id, name: o.name }));
  const peopleOpts = people.map((p: any) => ({ id: p.id, name: p.name }));

  return (
    <div>
      <PageHeader title="Network & CRM" description="One normalized view of organizations, people and business leads." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Organizations</CardTitle><OrgFormDialog /></CardHeader>
          <CardContent className="space-y-2">
            {orgs.map((o: any) => (
              <div key={o.id} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                <div>
                  <p className="text-sm font-medium">{o.name}</p>
                  <p className="text-[11px] text-muted">{[o.type, o.industry, o.location].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="text-right text-[11px] text-muted"><Badge tone="neutral">{o.members} people</Badge></div>
              </div>
            ))}
            {orgs.length === 0 && <p className="text-sm text-muted">No organizations yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>People</CardTitle><PersonFormDialog organizations={orgOpts} /></CardHeader>
          <CardContent className="space-y-2">
            {people.map((p: any) => (
              <div key={p.id} className="rounded-lg border border-border p-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{p.name}</p>
                  {p.relationship && <Badge tone="accent">{p.relationship}</Badge>}
                </div>
                <p className="text-[11px] text-muted">{[p.title, p.org_name].filter(Boolean).join(" · ")}</p>
                {p.notes && <p className="mt-1 text-xs text-muted">{p.notes}</p>}
              </div>
            ))}
            {people.length === 0 && <p className="text-sm text-muted">No people yet.</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader><CardTitle>Business leads</CardTitle><LeadFormDialog organizations={orgOpts} people={peopleOpts} /></CardHeader>
        <CardContent className="space-y-3">
          {leads.map((l: any) => (
            <div key={l.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{l.solution}</p>
                <span className="tnum text-sm font-semibold">{Math.round(l.score)}</span>
              </div>
              <ScoreBar value={l.score} className="my-1.5" />
              <div className="grid gap-2 text-xs sm:grid-cols-3">
                <div><p className="text-faint">Observed</p><p className="text-muted">{l.observed_evidence || "—"}</p></div>
                <div><p className="text-faint">Inference</p><p className="text-muted">{l.inference || "—"}</p></div>
                <div><p className="text-faint">Hypothesis</p><p className="text-muted">{l.hypothesis || "—"}</p></div>
              </div>
            </div>
          ))}
          {leads.length === 0 && <p className="text-sm text-muted">No leads yet. Add one with observed evidence, inference and hypothesis.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
