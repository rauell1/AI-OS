import { getDb } from "./db";
import { daysUntil, isOverdue, isoDaysFromNow, nowISO, parseJSON } from "./utils";

export interface Metric {
  label: string;
  value: number;
  hint?: string;
}

export async function getMetrics(userId: string): Promise<Metric[]> {
  const db = await getDb();
  const q = async (sql: string, params: any[] = []) =>
    (await db.get<{ c: number }>(sql, [userId, ...params]))?.c || 0;
  const now = nowISO();
  const in7Days = isoDaysFromNow(7);
  const [activeProjects, tasksDue, overdue, appsActive, appsSubmitted, opps, leads, followups, unread] = await Promise.all([
    q(`SELECT COUNT(*) c FROM projects WHERE user_id = ? AND status = 'active'`),
    q(`SELECT COUNT(*) c FROM tasks WHERE user_id = ? AND status NOT IN ('done','cancelled') AND due_date IS NOT NULL AND due_date <= ?`, [in7Days]),
    q(`SELECT COUNT(*) c FROM tasks WHERE user_id = ? AND status NOT IN ('done','cancelled') AND due_date IS NOT NULL AND due_date < ?`, [now]),
    q(`SELECT COUNT(*) c FROM applications WHERE user_id = ? AND status NOT IN ('submitted','offer','rejected','withdrawn','archived')`),
    q(`SELECT COUNT(*) c FROM applications WHERE user_id = ? AND status = 'submitted'`),
    q(`SELECT COUNT(*) c FROM opportunities WHERE user_id = ?`),
    q(`SELECT COUNT(*) c FROM leads WHERE user_id = ? AND status NOT IN ('closed','lost')`),
    q(`SELECT COUNT(*) c FROM followups WHERE user_id = ? AND status = 'pending' AND due_date <= ?`, [in7Days]),
    q(`SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0`),
  ]);
  return [
    { label: "Active projects", value: activeProjects },
    { label: "Tasks due (7d)", value: tasksDue },
    { label: "Overdue tasks", value: overdue, hint: overdue ? "attention" : undefined },
    { label: "Applications active", value: appsActive },
    { label: "Submitted", value: appsSubmitted },
    { label: "Opportunities", value: opps },
    { label: "Open leads", value: leads },
    { label: "Follow-ups due", value: followups },
    { label: "Unread alerts", value: unread },
  ];
}

export interface DeadlineItem {
  id: string;
  title: string;
  type: string;
  due: string | null;
  days: number | null;
  meta?: string;
}

export async function getUpcomingDeadlines(userId: string, days = 30): Promise<DeadlineItem[]> {
  const db = await getDb();
  const items: DeadlineItem[] = [];
  const apps = await db.query(
    `SELECT id, title, deadline, status FROM applications WHERE user_id = ? AND deadline IS NOT NULL AND deadline <= ? ORDER BY deadline ASC`,
    [userId, isoDaysFromNow(days)]
  );
  for (const a of apps) items.push({ id: a.id, title: a.title, type: "application", due: a.deadline, days: daysUntil(a.deadline), meta: a.status });
  const opps = await db.query(
    `SELECT id, title, deadline, type FROM opportunities WHERE user_id = ? AND deadline IS NOT NULL AND deadline <= ? ORDER BY deadline ASC`,
    [userId, isoDaysFromNow(days)]
  );
  for (const o of opps) items.push({ id: o.id, title: o.title, type: o.type, due: o.deadline, days: daysUntil(o.deadline) });
  const tasks = await db.query(
    `SELECT id, title, due_date, priority FROM tasks WHERE user_id = ? AND status NOT IN ('done','cancelled') AND due_date IS NOT NULL AND due_date <= ? ORDER BY due_date ASC`,
    [userId, isoDaysFromNow(days)]
  );
  for (const t of tasks) items.push({ id: t.id, title: t.title, type: "task", due: t.due_date, days: daysUntil(t.due_date), meta: `P${t.priority}` });
  items.sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
  return items;
}

export interface DailyBrief {
  greeting: string;
  generatedAt: string;
  focus: string[];
  urgentDeadlines: DeadlineItem[];
  applications: any[];
  importantEmails: any[];
  meetings: any[];
  projectActions: any[];
  followups: any[];
  opportunities: any[];
  leads: any[];
  recommendation: string;
}

export async function getDailyBrief(userId: string): Promise<DailyBrief> {
  const db = await getDb();
  const [deadlines, apps, emails, meetings, projects, followups, opps, leads] = await Promise.all([
    getUpcomingDeadlines(userId, 14),
    db.query(
      `SELECT a.id, a.title, a.status, a.deadline, o.name AS org FROM applications a LEFT JOIN organizations o ON a.organization_id = o.id WHERE a.user_id = ? AND a.status NOT IN ('submitted','offer','rejected','withdrawn','archived') ORDER BY a.deadline ASC LIMIT 5`,
      [userId]
    ),
    db.query(
      `SELECT id, subject, from_name, received_at, category, requested_action FROM emails WHERE user_id = ? AND status = 'unprocessed' ORDER BY received_at DESC LIMIT 5`,
      [userId]
    ),
    db.query(
      `SELECT id, title, starts_at, location FROM calendar_events WHERE user_id = ? AND starts_at >= ? ORDER BY starts_at ASC LIMIT 5`,
      [userId, nowISO()]
    ),
    db.query(
      `SELECT id, name, status, next_actions_json, updated_at FROM projects WHERE user_id = ? AND status = 'active' ORDER BY updated_at ASC LIMIT 5`,
      [userId]
    ),
    db.query(
      `SELECT id, note, due_date, entity_type FROM followups WHERE user_id = ? AND status = 'pending' AND due_date <= ? ORDER BY due_date ASC LIMIT 5`,
      [userId, isoDaysFromNow(7)]
    ),
    db.query(
      `SELECT o.id, o.title, o.type, s.overall, s.recommendation FROM opportunities o LEFT JOIN opportunity_scores s ON s.opportunity_id = o.id WHERE o.user_id = ? AND o.status = 'discovered' ORDER BY s.overall DESC LIMIT 5`,
      [userId]
    ),
    db.query(
      `SELECT id, solution, score, status FROM leads WHERE user_id = ? AND status NOT IN ('closed','lost') ORDER BY score DESC LIMIT 5`,
      [userId]
    ),
  ]);

  const focus: string[] = [];
  const overdue = deadlines.filter((d) => (d.days ?? 0) < 0);
  if (overdue.length) focus.push(`${overdue.length} deadline(s) are overdue. Address these first.`);
  const soon = deadlines.filter((d) => (d.days ?? 99) >= 0 && (d.days ?? 99) <= 7);
  if (soon.length) focus.push(`${soon.length} item(s) need attention within 7 days.`);
  if (apps.length) focus.push(`${apps.length} application(s) are in progress; check missing requirements.`);
  if (emails.length) focus.push(`${emails.length} email(s) awaiting triage.`);
  if (opps.length) focus.push(`${opps.length} opportunity(s) match your profile above 70%.`);
  if (!focus.length) focus.push("Nothing urgent. A good day to make progress on SafariCharge and deep work.");

  const recommendation =
    deadlines.find((d) => (d.days ?? 99) <= 4)?.title ||
    apps[0]?.title ||
    opps[0]?.title ||
    "Focus on the highest-fit opportunity or your most strategic project today.";

  return {
    greeting: greeting(),
    generatedAt: nowISO(),
    focus,
    urgentDeadlines: deadlines.slice(0, 8),
    applications: apps,
    importantEmails: emails,
    meetings,
    projectActions: projects.map((p) => ({ ...p, nextActions: parseJSON<string[]>(p.next_actions_json, []) })),
    followups,
    opportunities: opps,
    leads,
    recommendation,
  };
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
