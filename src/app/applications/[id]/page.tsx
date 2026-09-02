import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { parseJSON, formatDate } from "@/lib/utils";
import { getMasterProfile } from "@/lib/profile";
import { matchRequirements } from "@/lib/cv";
import { PageHeader, ScoreBar } from "@/components/widgets";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import {
  ApplicationStatusSelect, AddRequirementForm, RequirementToggle, AddQuestionForm, GenerateButtons,
} from "@/components/application-controls";

const strengthTone: Record<string, any> = { strong: "success", developing: "warning", partial: "info", missing: "danger" };

export default async function ApplicationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const db = await getDb();
  const app = await db.get(`SELECT * FROM applications WHERE id = ? AND user_id = ?`, [id, user.id]);
  if (!app) return <p className="text-sm text-muted">Application not found.</p>;

  const [org, opp, requirements, questions, versions, events, profile] = await Promise.all([
    app.organization_id ? db.get(`SELECT name FROM organizations WHERE id = ?`, [app.organization_id]) : null,
    app.opportunity_id ? db.get(`SELECT * FROM opportunities WHERE id = ?`, [app.opportunity_id]) : null,
    db.query(`SELECT * FROM application_requirements WHERE application_id = ? ORDER BY satisfied ASC`, [app.id]),
    db.query(`SELECT * FROM application_questions WHERE application_id = ?`, [app.id]),
    db.query(`SELECT * FROM application_versions WHERE application_id = ? ORDER BY created_at DESC`, [app.id]),
    db.query(`SELECT * FROM application_events WHERE application_id = ? ORDER BY at DESC`, [app.id]),
    getMasterProfile(user.id),
  ]);

  const reqs = opp ? (parseJSON<Record<string, any>>(opp.structured_json, {}).requirements || []) : [];
  const match = reqs.length ? matchRequirements(profile, reqs) : [];
  const satisfiedCount = requirements.filter((r: any) => r.satisfied).length;

  return (
    <div>
      <PageHeader
        title={app.title}
        description={org?.name || (opp ? opp.title : "Application")}
        action={<ApplicationStatusSelect id={app.id} status={app.status} />}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Requirements */}
          <Card>
            <CardHeader><CardTitle>Requirements & checklist</CardTitle><div className="text-xs text-muted">{satisfiedCount}/{requirements.length} done</div></CardHeader>
            <CardContent className="space-y-2">
              <AddRequirementForm applicationId={app.id} />
              {requirements.map((r: any) => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                  <RequirementToggle id={r.id} satisfied={!!r.satisfied} />
                  <div className="flex-1">
                    <p className="text-sm">{r.label} {!r.required && <span className="text-[11px] text-faint">(optional)</span>}</p>
                    {r.evidence && <p className="text-[11px] text-muted">{r.evidence}</p>}
                  </div>
                </div>
              ))}
              {requirements.length === 0 && <p className="text-sm text-muted">No requirements tracked. Add the documents and steps needed.</p>}
            </CardContent>
          </Card>

          {/* AI requirement match (evidence-based) */}
          {match.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Requirement match analysis</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {match.map((m, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{m.requirement}</span>
                      <Badge tone={strengthTone[m.strength]}>{m.strength}</Badge>
                    </div>
                    <ScoreBar value={m.strength === "strong" ? 95 : m.strength === "developing" ? 55 : m.strength === "partial" ? 65 : 10} className="mt-1" />
                    {m.evidence.length > 0 && <p className="mt-1 text-[11px] text-muted">Evidence: {m.evidence.slice(0, 3).join(" · ")}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Questions */}
          <Card>
            <CardHeader><CardTitle>Application questions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <AddQuestionForm applicationId={app.id} />
              {questions.map((q: any) => (
                <div key={q.id} className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium">{q.question}</p>
                  {q.tailored_answer ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{q.tailored_answer}</p> : <p className="mt-1 text-xs text-faint">No answer yet.</p>}
                </div>
              ))}
              {questions.length === 0 && <p className="text-sm text-muted">No questions added.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Prepare & send</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <GenerateButtons applicationId={app.id} />
              <p className="text-[11px] text-muted">Generated drafts are routed to the Approval Center before any use or submission.</p>
              {app.deadline && <p className="text-sm">Deadline: <span className="font-medium">{formatDate(app.deadline)}</span></p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Versions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {versions.map((v: any) => (
                <details key={v.id} className="rounded-lg border border-border p-2.5">
                  <summary className="flex cursor-pointer items-center justify-between text-sm">
                    <span className="capitalize">{v.kind} v{v.version}</span>
                    <span className="text-[11px] text-muted">{v.approved ? "approved" : "draft"}</span>
                  </summary>
                  <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-xs text-muted">{v.content}</pre>
                </details>
              ))}
              {versions.length === 0 && <p className="text-sm text-muted">No generated documents yet.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {events.map((e: any) => (
                <div key={e.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <div><p>{e.note}</p><p className="text-[11px] text-faint">{formatDate(e.at, true)}</p></div>
                </div>
              ))}
              {events.length === 0 && <p className="text-sm text-muted">No events yet.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
