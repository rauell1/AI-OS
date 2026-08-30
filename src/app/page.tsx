import Link from "next/link";
import { Target, FileText, FolderKanban, Users, Bot, AlertTriangle, CheckCheck, ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getDailyBrief, getMetrics } from "@/lib/brief";
import { formatDate, relativeTime } from "@/lib/utils";
import { PageHeader, StatCard, ScoreBar, SectionTitle } from "@/components/widgets";
import { Badge, Card, CardContent } from "@/components/ui";
import { TaskFormDialog } from "@/components/task-form-dialog";
import { RunBriefButton } from "@/components/quick-actions";

const statusTone: Record<string, any> = {
  reviewing: "info", preparing: "warning", ready_for_review: "accent", ready_to_submit: "accent",
  submitted: "success", interview: "info", offer: "success", rejected: "danger", withdrawn: "neutral",
  discovered: "neutral", shortlisted: "accent", archived: "neutral", new: "neutral", active: "success",
};

function deadlineHref(type: string) {
  if (type === "application") return "/applications";
  if (type === "opportunity") return "/opportunities";
  return "/tasks";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [brief, metrics, projects, approvals] = await Promise.all([
    getDailyBrief(user.id),
    getMetrics(user.id),
    getDb().then((db) => db.query<{ id: string; name: string }>(`SELECT id, name FROM projects WHERE user_id = ? ORDER BY name`, [user.id])),
    getDb().then((db) => db.query(`SELECT id, proposed_action, type FROM approvals WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 5`, [user.id])),
  ]);

  return (
    <div>
      <PageHeader
        title={`${brief.greeting}, Roy`}
        description={formatDate(brief.generatedAt, true) + " · Your daily command center"}
        action={<div className="flex items-center gap-2"><RunBriefButton /><TaskFormDialog projects={projects} /></div>}
      />

      {/* Metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map((m) => (
          <StatCard key={m.label} label={m.label} value={m.value} hint={m.hint} />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left: focus + deadlines + applications */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div className="border-b border-border px-4 py-3"><SectionTitle>What deserves your attention</SectionTitle></div>
            <CardContent className="space-y-2">
              {brief.focus.length === 0 && <p className="text-sm text-muted">All clear. A good day for deep work.</p>}
              {brief.focus.map((f, i) => (
                <div key={i} className="flex gap-3 rounded-lg bg-surface-2/50 p-3 text-sm">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-fg">{i + 1}</span>
                  <span>{f}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1 text-sm text-accent">
                <span>Recommended next: {brief.recommendation}</span>
                <ArrowRight size={14} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <div className="border-b border-border px-4 py-3"><SectionTitle>Upcoming deadlines</SectionTitle></div>
            <CardContent className="space-y-1.5">
              {brief.urgentDeadlines.length === 0 && <p className="text-sm text-muted">No deadlines in the next two weeks.</p>}
              {brief.urgentDeadlines.map((d) => (
                <Link key={d.id} href={deadlineHref(d.type)} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
                  <span className="flex items-center gap-2"><AlertTriangle size={14} className={d.days != null && d.days < 0 ? "text-danger" : "text-warning"} />{d.title}</span>
                  <span className="text-xs text-muted">{d.due ? (d.days != null && d.days < 0 ? `${Math.abs(d.days)}d overdue` : `${d.days}d`) : "no date"}</span>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <SectionTitle>Applications in progress</SectionTitle>
              <Link href="/applications" className="text-xs text-accent">View all</Link>
            </div>
            <CardContent className="space-y-1.5">
              {brief.applications.length === 0 && <p className="text-sm text-muted">No active applications yet.</p>}
              {brief.applications.map((a) => (
                <Link key={a.id} href={`/applications/${a.id}`} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
                  <span className="flex items-center gap-2"><FileText size={14} className="text-faint" />{a.title}</span>
                  <span className="flex items-center gap-2"><Badge tone={statusTone[a.status] || "neutral"}>{a.status.replace(/_/g, " ")}</Badge></span>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <SectionTitle>Project actions</SectionTitle>
              <Link href="/projects" className="text-xs text-accent">Projects</Link>
            </div>
            <CardContent className="space-y-3">
              {brief.projectActions.length === 0 && <p className="text-sm text-muted">No active projects.</p>}
              {brief.projectActions.map((p) => (
                <div key={p.id}>
                  <Link href={`/projects/${p.id}`} className="flex items-center gap-2 text-sm font-medium hover:text-accent">
                    <FolderKanban size={14} className="text-faint" /> {p.name}
                  </Link>
                  {p.nextActions?.length > 0 && (
                    <ul className="ml-6 mt-1 list-disc text-xs text-muted">
                      {p.nextActions.slice(0, 3).map((a: string, i: number) => <li key={i}>{a}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right: opportunities, follow-ups, leads, approvals */}
        <div className="space-y-5">
          <Card>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <SectionTitle>Recommended opportunities</SectionTitle>
              <Link href="/opportunities" className="text-xs text-accent">All</Link>
            </div>
            <CardContent className="space-y-2.5">
              {brief.opportunities.length === 0 && <p className="text-sm text-muted">No scored opportunities yet.</p>}
              {brief.opportunities.map((o) => (
                <Link key={o.id} href="/opportunities" className="block rounded-lg p-2 hover:bg-surface-2">
                  <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Target size={14} className="text-faint" />{o.title}</span><span className="tnum text-xs font-semibold">{Math.round(o.overall)}%</span></div>
                  <ScoreBar value={o.overall} className="mt-1.5" />
                  <div className="mt-1 flex items-center gap-2"><Badge tone="accent">{o.recommendation}</Badge><span className="text-[11px] text-muted">{o.type}</span></div>
                </Link>
              ))}
            </CardContent>
          </Card>

          {approvals.length > 0 && (
            <Card>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <SectionTitle>Awaiting your approval</SectionTitle>
                <Link href="/approvals" className="text-xs text-accent">Center</Link>
              </div>
              <CardContent className="space-y-1.5">
                {approvals.map((a) => (
                  <Link key={a.id} href="/approvals" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
                    <CheckCheck size={14} className="text-accent" /> {a.proposed_action}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <div className="border-b border-border px-4 py-3"><SectionTitle>Follow-ups due</SectionTitle></div>
            <CardContent className="space-y-1.5">
              {brief.followups.length === 0 && <p className="text-sm text-muted">No follow-ups due soon.</p>}
              {brief.followups.map((f) => (
                <div key={f.id} className="rounded-lg px-2 py-2 text-sm">
                  <span>{f.note}</span>
                  <span className="ml-2 text-xs text-muted">{f.due_date ? formatDate(f.due_date) : ""}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <SectionTitle>Lead opportunities</SectionTitle>
              <Link href="/network" className="text-xs text-accent">Network</Link>
            </div>
            <CardContent className="space-y-2">
              {brief.leads.length === 0 && <p className="text-sm text-muted">No leads yet.</p>}
              {brief.leads.map((l) => (
                <div key={l.id} className="rounded-lg p-2 hover:bg-surface-2">
                  <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Users size={14} className="text-faint" />{l.solution}</span><span className="tnum text-xs font-semibold">{Math.round(l.score)}</span></div>
                  <ScoreBar value={l.score} className="mt-1.5" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Link href="/ai" className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft p-4 text-sm font-medium text-accent hover:bg-accent/10">
            <Bot size={16} /> Ask your Chief of Staff
          </Link>
        </div>
      </div>
    </div>
  );
}
