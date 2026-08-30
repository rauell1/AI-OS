import { prisma } from "@/lib/db";
import { daysUntil, deadlineLabel } from "@/lib/utils";

export type BriefAction = {
  kind: string;
  title: string;
  detail: string;
  urgency: "critical" | "high" | "medium";
  href: string;
  refType?: string;
  refId?: string;
};

export type BriefSection = {
  id: string;
  title: string;
  items: BriefAction[];
};

export type DailyBriefData = {
  headline: string;
  actionCount: number;
  sections: BriefSection[];
  generatedAt: string;
};

/**
 * Daily Brief builder. Deterministic: every item is derived from stored data,
 * so the brief works perfectly with AI disabled. Each item carries a direct
 * link and a reason.
 */
export async function buildDailyBrief(userId: string, now = new Date()): Promise<DailyBriefData> {
  const in7 = new Date(now.getTime() + 7 * 86400000);

  const [
    dueTasks, overdueTasks,
    upcomingDeadlines,
    needsResponse,
    followUpsDue,
    appsNeedingAction,
    recentOpportunities,
    upcomingMeetings,
    staleProjects,
  ] = await Promise.all([
    prisma.task.findMany({
      where: { userId, status: { in: ["INBOX", "NEXT", "IN_PROGRESS"] }, dueAt: { not: null, lte: new Date(now.getTime() + 86400000) } },
      orderBy: { priorityScore: "desc" }, take: 5,
    }),
    prisma.task.count({ where: { userId, status: { in: ["INBOX", "NEXT", "IN_PROGRESS"] }, dueAt: { lt: now } } }),
    prisma.opportunity.findMany({
      where: { userId, status: { in: ["NEW", "SHORTLISTED"] }, deadlineAt: { not: null, lte: in7 } },
      orderBy: { deadlineAt: "asc" }, take: 5,
    }),
    prisma.emailMessage.findMany({
      where: { userId, needsResponse: true, respondedAt: null, direction: "INBOUND" },
      orderBy: { receivedAt: "desc" }, take: 4,
    }),
    prisma.followUp.findMany({
      where: { userId, status: "OPEN", dueAt: { lte: now } },
      include: { person: true, lead: { include: { organization: true } } },
      orderBy: { dueAt: "asc" }, take: 5,
    }),
    prisma.application.findMany({
      where: { userId, status: { in: ["PREPARING", "READY_FOR_REVIEW", "READY_TO_SUBMIT", "REVIEWING", "SHORTLISTED"] } },
      include: { opportunity: true, requirements: true },
      orderBy: { deadlineAt: "asc" }, take: 5,
    }),
    prisma.opportunity.findMany({
      where: { userId, status: "NEW", fitScore: { gte: 70 } },
      orderBy: { fitScore: "desc" }, take: 3,
    }),
    prisma.calendarEvent.findMany({
      where: { userId, startAt: { gte: now, lte: new Date(now.getTime() + 3 * 86400000) } },
      orderBy: { startAt: "asc" }, take: 4,
    }),
    prisma.project.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: { lastActivityAt: "asc" }, take: 3,
    }),
  ]);

  const actions: BriefAction[] = [];
  const focus: BriefAction[] = [];

  for (const t of dueTasks) {
    const days = daysUntil(t.dueAt);
    actions.push({
      kind: "task",
      title: t.title,
      detail: days !== null && days < 0 ? `Overdue by ${Math.abs(days)}d` : days === 0 ? "Due today" : `Due ${deadlineLabel(days).toLowerCase()}`,
      urgency: days !== null && days <= 1 ? "critical" : "high",
      href: `/tasks?focus=${t.id}`,
      refType: "TASK", refId: t.id,
    });
  }
  if (overdueTasks > dueTasks.length) {
    actions.push({ kind: "task", title: `${overdueTasks} overdue tasks`, detail: "Review and reschedule or close them", urgency: "high", href: "/tasks?filter=overdue" });
  }

  for (const o of upcomingDeadlines) {
    const days = daysUntil(o.deadlineAt);
    const reqMissing = await prisma.applicationRequirement.count({
      where: { application: { opportunityId: o.id }, status: { in: ["MISSING", "REQUESTED"] } },
    }).catch(() => 0);
    actions.push({
      kind: o.type === "SCHOLARSHIP" || o.type === "PROGRAMME" ? "scholarship" : "opportunity",
      title: o.title,
      detail: `${deadlineLabel(days)}${reqMissing ? `, ${reqMissing} requirement(s) missing` : ""}`,
      urgency: days !== null && days <= 3 ? "critical" : "high",
      href: `/opportunities/${o.id}`,
      refType: "OPPORTUNITY", refId: o.id,
    });
  }

  for (const e of needsResponse) {
    const days = Math.floor((now.getTime() - e.receivedAt.getTime()) / 86400000);
    actions.push({
      kind: "email",
      title: e.subject || "(no subject)",
      detail: `From ${e.fromName ?? e.fromEmail ?? "unknown"}, awaiting reply ${days > 0 ? `${days}d` : "today"}`,
      urgency: days >= 3 ? "high" : "medium",
      href: `/inbox?focus=${e.id}`,
      refType: "EMAIL", refId: e.id,
    });
  }

  for (const f of followUpsDue) {
    actions.push({
      kind: "followup",
      title: f.title,
      detail: f.person?.name ?? f.lead?.organization?.name ?? "Follow-up due",
      urgency: "high",
      href: f.leadId ? `/leads` : `/network`,
      refType: "FOLLOWUP", refId: f.id,
    });
  }

  for (const a of appsNeedingAction) {
    const missing = a.requirements.filter((r) => r.status === "MISSING").length;
    const days = daysUntil(a.deadlineAt ?? a.opportunity.deadlineAt);
    if (a.status === "READY_TO_SUBMIT") {
      focus.push({ kind: "application", title: `Ready to submit: ${a.opportunity.title}`, detail: "Final review pending", urgency: "high", href: `/applications/${a.id}`, refType: "APPLICATION", refId: a.id });
    } else if (missing > 0) {
      focus.push({ kind: "application", title: `${a.opportunity.title}`, detail: `${missing} document(s)/requirement(s) still missing${days !== null ? `, deadline ${deadlineLabel(days).toLowerCase()}` : ""}`, urgency: days !== null && days <= 7 ? "critical" : "medium", href: `/applications/${a.id}`, refType: "APPLICATION", refId: a.id });
    }
  }

  for (const o of recentOpportunities) {
    focus.push({
      kind: "opportunity", title: o.title,
      detail: `${o.fitLabel ?? "Scored"} at ${o.fitScore ?? "?"}% profile match`,
      urgency: "medium", href: `/opportunities/${o.id}`, refType: "OPPORTUNITY", refId: o.id,
    });
  }

  for (const m of upcomingMeetings) {
    focus.push({
      kind: "meeting", title: m.title,
      detail: m.startAt.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }),
      urgency: "medium", href: "/reviews", refType: "CALENDAR", refId: m.id,
    });
  }

  for (const p of staleProjects) {
    const days = p.lastActivityAt ? Math.floor((now.getTime() - p.lastActivityAt.getTime()) / 86400000) : null;
    if (days === null || days >= 7) {
      focus.push({ kind: "project", title: p.name, detail: `No recorded activity ${days === null ? "logged" : `for ${days}d`}`, urgency: "medium", href: `/projects/${p.id}`, refType: "PROJECT", refId: p.id });
    }
  }

  const sections: BriefSection[] = [
    { id: "attention", title: "Needs attention today", items: dedupeActions(actions) },
    { id: "focus", title: "Worth your time", items: dedupeActions(focus) },
  ];
  const actionCount = sections.reduce((s, x) => s + x.items.length, 0);
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return {
    headline: actionCount
      ? `${greeting}, Roy. ${actionCount} action${actionCount === 1 ? "" : "s"} deserve${actionCount === 1 ? "s" : ""} attention today.`
      : `${greeting}, Roy. Nothing urgent is slipping. Good day to get ahead.`,
    actionCount,
    sections,
    generatedAt: now.toISOString(),
  };
}

function dedupeActions(items: BriefAction[]): BriefAction[] {
  const seen = new Set<string>();
  const out: BriefAction[] = [];
  for (const item of items) {
    const key = item.refId ?? item.title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 8) break;
  }
  return out;
}
