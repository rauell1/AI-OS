import { prisma } from "@/lib/db";

export type SearchHit = {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  score: number;
};

/**
 * Global search across the knowledge graph. SQL-first (works offline); the AI
 * assistant can layer semantic search on top when embeddings are enabled.
 */
export async function globalSearch(userId: string, query: string, limit = 8): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const like = { contains: q, mode: "insensitive" as const };
  const hits: SearchHit[] = [];

  const [tasks, projects, opps, apps, orgs, people, docs, notes, emails, leads] = await Promise.all([
    prisma.task.findMany({ where: { userId, OR: [{ title: like }, { description: like }] }, take: 5, orderBy: { priorityScore: "desc" } }),
    prisma.project.findMany({ where: { userId, OR: [{ name: like }, { overview: like }] }, take: 5 }),
    prisma.opportunity.findMany({ where: { userId, OR: [{ title: like }, { organizationName: like }, { description: like }] }, take: 6, orderBy: { fitScore: "desc" } }),
    prisma.application.findMany({ where: { userId, opportunity: { OR: [{ title: like }, { organizationName: like }] } }, include: { opportunity: true }, take: 5 }),
    prisma.organization.findMany({ where: { userId, OR: [{ name: like }, { description: like }, { industry: like }] }, take: 5 }),
    prisma.person.findMany({ where: { userId, OR: [{ name: like }, { title: like }, { email: like }] }, take: 5 }),
    prisma.document.findMany({ where: { userId, OR: [{ name: like }, { category: like }] }, take: 5 }),
    prisma.note.findMany({ where: { userId, OR: [{ title: like }, { body: like }] }, take: 5 }),
    prisma.emailMessage.findMany({ where: { userId, OR: [{ subject: like }, { snippet: like }] }, take: 5, orderBy: { receivedAt: "desc" } }),
    prisma.lead.findMany({ where: { userId, OR: [{ solution: like }, { notes: like }] }, include: { organization: true }, take: 5 }),
  ]);

  for (const t of tasks) hits.push({ type: "Task", id: t.id, title: t.title, subtitle: t.status, href: `/tasks?focus=${t.id}`, score: 90 + t.priorityScore / 100 });
  for (const p of projects) hits.push({ type: "Project", id: p.id, title: p.name, subtitle: p.status, href: `/projects/${p.id}`, score: 85 });
  for (const o of opps) hits.push({ type: o.type === "JOB" ? "Job" : o.type === "SCHOLARSHIP" ? "Scholarship" : "Opportunity", id: o.id, title: o.title, subtitle: o.organizationName ?? undefined, href: `/opportunities/${o.id}`, score: 82 + (o.fitScore ?? 0) / 100 });
  for (const a of apps) hits.push({ type: "Application", id: a.id, title: a.opportunity.title, subtitle: a.status, href: `/applications/${a.id}`, score: 88 });
  for (const o of orgs) hits.push({ type: "Organization", id: o.id, title: o.name, subtitle: o.industry ?? undefined, href: `/network?org=${o.id}`, score: 75 });
  for (const p of people) hits.push({ type: "Person", id: p.id, title: p.name, subtitle: p.title ?? undefined, href: `/network?person=${p.id}`, score: 75 });
  for (const d of docs) hits.push({ type: "Document", id: d.id, title: d.name, subtitle: d.category, href: `/documents`, score: 72 });
  for (const n of notes) hits.push({ type: "Note", id: n.id, title: n.title, href: `/search?note=${n.id}`, score: 70 });
  for (const e of emails) hits.push({ type: "Email", id: e.id, title: e.subject || "(no subject)", subtitle: e.fromName ?? e.fromEmail ?? undefined, href: `/inbox?focus=${e.id}`, score: 74 });
  for (const l of leads) hits.push({ type: "Lead", id: l.id, title: l.solution, subtitle: l.organization?.name, href: `/leads?focus=${l.id}`, score: 71 });

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
