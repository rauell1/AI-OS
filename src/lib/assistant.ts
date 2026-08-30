import { getDb } from "./db";
import { getDailyBrief, getMetrics } from "./brief";
import { getMasterProfile } from "./profile";
import { aiEnabled, complete } from "./ai";
import { formatDate } from "./utils";

export interface AssistantContext {
  headline: string;
  metrics: Record<string, number>;
  brief: Awaited<ReturnType<typeof getDailyBrief>>;
  topOpportunities: { title: string; type: string; score: number | null; recommendation: string | null; deadline: string | null }[];
  openTasks: { title: string; due: string | null; priority: number }[];
  applications: { title: string; status: string; deadline: string | null }[];
}

export async function buildAssistantContext(userId: string): Promise<AssistantContext> {
  const [metrics, brief, profile] = await Promise.all([
    getMetrics(userId),
    getDailyBrief(userId),
    getMasterProfile(userId),
  ]);
  const db = await getDb();
  const opps = await db.query(
    `SELECT o.id, o.title, o.type, o.deadline, s.overall, s.recommendation
     FROM opportunities o LEFT JOIN opportunity_scores s ON s.opportunity_id = o.id
     WHERE o.user_id = ? ORDER BY s.overall DESC NULLS LAST LIMIT 10`,
    [userId]
  );
  const tasks = await db.query(
    `SELECT title, due_date, priority FROM tasks WHERE user_id = ? AND status NOT IN ('done','cancelled') ORDER BY due_date ASC LIMIT 10`,
    [userId]
  );
  const apps = await db.query(
    `SELECT title, status, deadline FROM applications WHERE user_id = ? ORDER BY deadline ASC LIMIT 10`,
    [userId]
  );
  return {
    headline: profile.headline,
    metrics: Object.fromEntries(metrics.map((m) => [m.label, m.value])),
    brief,
    topOpportunities: opps.map((o) => ({ title: o.title, type: o.type, score: o.overall ?? null, recommendation: o.recommendation ?? null, deadline: o.deadline })),
    openTasks: tasks.map((t) => ({ title: t.title, due: t.due_date, priority: t.priority })),
    applications: apps.map((a) => ({ title: a.title, status: a.status, deadline: a.deadline })),
  };
}

function ruleBasedAnswer(ctx: AssistantContext, question: string): string {
  const q = question.toLowerCase();
  if (/(focus|today|priority|should i do|what matters)/.test(q)) {
    const lines = [
      `Here is what deserves your attention today, ${ctx.brief.greeting.replace("Good ", "")}:`,
      ...ctx.brief.focus.map((f, i) => `${i + 1}. ${f}`),
      "",
      `Recommended next action: ${ctx.brief.recommendation}`,
    ];
    return lines.join("\n");
  }
  if (/(deadline|due|overdue)/.test(q)) {
    const items = ctx.brief.urgentDeadlines;
    if (!items.length) return "No upcoming deadlines in the next two weeks.";
    return [
      "Upcoming deadlines:",
      ...items.map((d) => `- ${d.title} (${d.type}) ${d.due ? formatDate(d.due) + " (" + (d.days! < 0 ? "overdue" : d.days + "d") + ")" : ""}`),
    ].join("\n");
  }
  if (/(opportunit|scholarship|program|master|job|fit|match)/.test(q)) {
    const m = q.match(/above\s*(\d+)/);
    const min = m ? parseInt(m[1]) : 0;
    const list = ctx.topOpportunities.filter((o) => (o.score ?? 0) >= min);
    if (!list.length) return min ? `No opportunities currently scored above ${min}%.` : "No scored opportunities yet.";
    return [
      `Opportunities${min ? ` above ${min}%` : ""}:`,
      ...list.map((o) => `- ${o.title} [${o.type}] — ${o.score ?? "?"}% ${o.recommendation ?? ""}${o.deadline ? " · due " + formatDate(o.deadline) : ""}`),
    ].join("\n");
  }
  if (/(task|todo)/.test(q)) {
    if (!ctx.openTasks.length) return "You have no open tasks.";
    return ["Open tasks:", ...ctx.openTasks.map((t) => `- ${t.title}${t.due ? " · " + formatDate(t.due) : ""} (P${t.priority})`)].join("\n");
  }
  if (/(application|apply)/.test(q)) {
    if (!ctx.applications.length) return "No applications tracked yet.";
    return ["Applications:", ...ctx.applications.map((a) => `- ${a.title} — ${a.status}${a.deadline ? " · " + formatDate(a.deadline) : ""}`)].join("\n");
  }
  if (/(follow.?up)/.test(q)) {
    return "Open follow-ups are surfaced in the Daily Brief and the Network tab. Use the Follow-ups view there.";
  }
  const counts = Object.entries(ctx.metrics).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k.toLowerCase()}`);
  return [
    `I can help with your priorities, deadlines, opportunities, tasks, applications and follow-ups.`,
    `Current snapshot: ${counts.join(", ") || "no active items"}.`,
    `Ask me things like "What should I focus on today?" or "Show opportunities above 85% fit."`,
  ].join("\n");
}

export async function answerQuestion(userId: string, history: { role: "user" | "assistant"; content: string }[], question: string): Promise<{ text: string; usedAI: boolean }> {
  const ctx = await buildAssistantContext(userId);
  const enabled = aiEnabled();
  if (enabled) {
    try {
      const res = await complete({
        agent: "chief_of_staff",
        userId,
        system:
          "You are Rauell OS, Roy's personal Chief of Staff. Use ONLY the provided structured context to answer. Be concise, specific, and cite evidence (scores, dates). Never invent facts, jobs, or deadlines. Avoid em dashes and en dashes. If the context lacks the answer, say so.",
        messages: [
          { role: "system", content: `CONTEXT:\n${JSON.stringify(ctx, null, 2)}` },
          ...history.map((h) => ({ role: h.role, content: h.content })),
          { role: "user", content: question },
        ],
        temperature: 0.2,
        maxTokens: 700,
      });
      if (res) return { text: res.text, usedAI: true };
    } catch {
      // fall through to rule-based
    }
  }
  return { text: ruleBasedAnswer(ctx, question), usedAI: false };
}
