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
  integrations: { provider: string; status: string; last_synced: string | null }[];
  recentKnowledge: { title: string; body: string }[];
}

export async function buildAssistantContext(userId: string): Promise<AssistantContext> {
  const [metrics, brief, profile] = await Promise.all([
    getMetrics(userId),
    getDailyBrief(userId),
    getMasterProfile(userId),
  ]);
  const db = await getDb();
  const [opps, tasks, apps, integrations, knowledge] = await Promise.all([
    db.query(
      `SELECT o.id, o.title, o.type, o.deadline, s.overall, s.recommendation
       FROM opportunities o LEFT JOIN opportunity_scores s ON s.opportunity_id = o.id
       WHERE o.user_id = ? ORDER BY s.overall DESC NULLS LAST LIMIT 10`,
      [userId]
    ),
    db.query(
      `SELECT title, due_date, priority FROM tasks WHERE user_id = ? AND status NOT IN ('done','cancelled') ORDER BY due_date ASC LIMIT 10`,
      [userId]
    ),
    db.query(
      `SELECT title, status, deadline FROM applications WHERE user_id = ? ORDER BY deadline ASC LIMIT 10`,
      [userId]
    ),
    db.query(`SELECT provider, status, last_synced FROM integrations WHERE user_id = ?`, [userId]),
    db.query(`SELECT title, body FROM knowledge_items WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`, [userId]),
  ]);
  return {
    headline: profile.headline,
    metrics: Object.fromEntries(metrics.map((m) => [m.label, m.value])),
    brief,
    topOpportunities: opps.map((o) => ({ title: o.title, type: o.type, score: o.overall ?? null, recommendation: o.recommendation ?? null, deadline: o.deadline })),
    openTasks: tasks.map((t) => ({ title: t.title, due: t.due_date, priority: t.priority })),
    applications: apps.map((a) => ({ title: a.title, status: a.status, deadline: a.deadline })),
    integrations: integrations.map((i) => ({ provider: i.provider, status: i.status, last_synced: i.last_synced })),
    recentKnowledge: knowledge.map((k) => ({ title: k.title, body: k.body?.substring(0, 300) || "" })),
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
  if (/(automate|automation|workflow|schedule|alert me|remind me|run|send.*brief)/.test(q)) {
    let trigger = "daily_brief";
    let frequency = "daily";
    let name = "Custom Automation";
    
    if (q.includes("deadline") || q.includes("alert")) trigger = "deadline_alerts";
    if (q.includes("sync") || q.includes("integration") || q.includes("email")) trigger = "integration_sync";
    if (q.includes("follow") || q.includes("remind")) trigger = "followup_reminders";
    if (q.includes("review")) trigger = "weekly_review";
    if (q.includes("scan") || q.includes("opportunity")) trigger = "opportunity_scan";
    
    if (q.includes("hour")) frequency = "hourly";
    if (q.includes("week")) frequency = "weekly";
    if (q.includes("month")) frequency = "monthly";
    
    if (q.includes("brief")) name = "Daily Brief Delivery";
    else if (q.includes("deadline")) name = "Deadline Alerts";
    else if (q.includes("email") || q.includes("project")) name = "Email Triage Workflow";
    
    return JSON.stringify({ automation_request: { name, trigger, frequency } });
  }

  if (/(github|knowledge|repo)/.test(q)) {
    if (!ctx.recentKnowledge.length) return "I don't have any recent knowledge items or GitHub repos stored.";
    return ["Recent knowledge:", ...ctx.recentKnowledge.map(k => `- ${k.title}`)].join("\n");
  }
  
  if (/(integration|sync)/.test(q) && !q.includes("automate")) {
    if (!ctx.integrations.length) return "You have no integrations configured.";
    return ["Integrations:", ...ctx.integrations.map(i => `- ${i.provider}: ${i.status} (Last synced: ${i.last_synced ? formatDate(i.last_synced) : "never"})`)].join("\n");
  }

  const counts = Object.entries(ctx.metrics).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k.toLowerCase()}`);
  return [
    `I can help with your priorities, deadlines, opportunities, tasks, applications and follow-ups.`,
    `Current snapshot: ${counts.join(", ") || "no active items"}.`,
    `Ask me things like "What should I focus on today?", "Show my integrations" or "Set up an automation to run my daily brief."`,
  ].join("\n");
}

export async function answerQuestion(userId: string, history: { role: "user" | "assistant"; content: string }[], question: string): Promise<{ text: string; usedAI: boolean }> {
  const ctx = await buildAssistantContext(userId);
  const enabled = aiEnabled();
  let text = "";
  let usedAI = false;
  if (enabled) {
    try {
      const { searchKnowledge } = await import("./embeddings");
      const ragResults = await searchKnowledge(question, userId, 3);
      
      const res = await complete({
        agent: "chief_of_staff",
        userId,
        system:
          "You are Rauell OS, Roy's personal Chief of Staff. Use ONLY the provided structured context and RAG results to answer. Be concise, specific, and cite evidence (scores, dates). Never invent facts, jobs, or deadlines. Avoid em dashes and en dashes. If the context lacks the answer, say so.\nIf the user asks you to create an automation, workflow, schedule, or alert, you MUST reply ONLY with a JSON block like: `{\"automation_request\": {\"name\": \"...\", \"trigger\": \"...\", \"frequency\": \"...\"}}`. Allowed triggers: daily_brief, integration_sync, deadline_alerts, followup_reminders, weekly_review, opportunity_scan. Allowed frequencies: hourly, daily, weekly, monthly.",
        messages: [
          { role: "system", content: `CONTEXT:\n${JSON.stringify(ctx, null, 2)}\n\nKNOWLEDGE BASE RAG RESULTS:\n${JSON.stringify(ragResults, null, 2)}` },
          ...history.map((h) => ({ role: h.role, content: h.content })),
          { role: "user", content: question },
        ],
        temperature: 0.2,
        maxTokens: 700,
      });
      if (res) {
        text = res.text;
        usedAI = true;
      }
    } catch {
      // fall through to rule-based
    }
  }
  
  if (!text) {
    text = ruleBasedAnswer(ctx, question);
  }

  // Intercept automation requests
  if (text.includes("automation_request")) {
    try {
      const match = text.match(/\{[\s\S]*"automation_request"[\s\S]*\}/);
      const jsonStr = match ? match[0] : text;
      const parsed = JSON.parse(jsonStr);
      if (parsed.automation_request) {
        const { name, trigger, frequency } = parsed.automation_request;
        const db = await getDb();
        const { newId, nowISO } = await import("./utils");
        await db.insert("automation_rules", {
          id: newId("rul"),
          user_id: userId,
          name: name || "Custom Automation",
          trigger: trigger || "daily_brief",
          frequency: frequency || "daily",
          status: "active",
          config_json: "{}",
          created_at: nowISO(),
          updated_at: nowISO(),
        });
        text = `â I've successfully set up the **${name || "Custom"}** automation for you! It will trigger on \`${trigger || "daily_brief"}\` and run \`${frequency || "daily"}\`. You can manage it in your Automations dashboard.`;
      }
    } catch (e) {
      console.error("Failed to parse automation request:", e);
    }
  }

  return { text, usedAI };
}
