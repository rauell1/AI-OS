"use server";

import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

export async function globalSearch(q: string): Promise<SearchHit[]> {
  const user = await requireUser();
  const term = (q || "").trim();
  if (term.length < 2) return [];
  const db = await getDb();
  const like = `%${term}%`;
  const hits: SearchHit[] = [];
  const push = (type: string, id: string, title: string, subtitle: string | undefined, href: string) =>
    hits.push({ type, id, title, subtitle, href });

  const projects = await db.query(`SELECT id, name, category FROM projects WHERE user_id = ? AND (name LIKE ? OR overview LIKE ?)`, [user.id, like, like]);
  projects.forEach((p) => push("project", p.id, p.name, p.category, `/projects/${p.id}`));

  const tasks = await db.query(`SELECT id, title FROM tasks WHERE user_id = ? AND title LIKE ?`, [user.id, like]);
  tasks.forEach((t) => push("task", t.id, t.title, "Task", "/tasks"));

  const opps = await db.query(`SELECT id, title, type FROM opportunities WHERE user_id = ? AND (title LIKE ? OR description LIKE ?)`, [user.id, like, like]);
  opps.forEach((o) => push("opportunity", o.id, o.title, o.type, "/opportunities"));

  const apps = await db.query(`SELECT id, title, status FROM applications WHERE user_id = ? AND title LIKE ?`, [user.id, like]);
  apps.forEach((a) => push("application", a.id, a.title, a.status, `/applications/${a.id}`));

  const orgs = await db.query(`SELECT id, name, type FROM organizations WHERE user_id = ? AND name LIKE ?`, [user.id, like]);
  orgs.forEach((o) => push("organization", o.id, o.name, o.type, "/network"));

  const people = await db.query(`SELECT id, name, title FROM people WHERE user_id = ? AND (name LIKE ? OR title LIKE ?)`, [user.id, like, like]);
  people.forEach((p) => push("person", p.id, p.name, p.title, "/network"));

  const docs = await db.query(`SELECT id, name, category FROM documents WHERE user_id = ? AND name LIKE ?`, [user.id, like]);
  docs.forEach((d) => push("document", d.id, d.name, d.category, "/documents"));

  const emails = await db.query(`SELECT id, subject FROM emails WHERE user_id = ? AND subject LIKE ?`, [user.id, like]);
  emails.forEach((e) => push("email", e.id, e.subject, "Email", "/inbox"));

  return hits.slice(0, 30);
}
