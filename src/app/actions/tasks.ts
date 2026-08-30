"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { newId, nowISO, parseJSON, toJSON } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { scorePriority } from "@/lib/scoring";

export async function createTask(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Title is required." };
  const db = await getDb();
  const priority = parseInt(String(formData.get("priority") || "3"), 10) || 3;
  const due = String(formData.get("due_date") || "") || null;
  const id = newId("tsk");
  await db.insert("tasks", {
    id,
    user_id: user.id,
    title,
    description: String(formData.get("description") || "") || null,
    source: "manual",
    source_id: null,
    project_id: String(formData.get("project_id") || "") || null,
    opportunity_id: String(formData.get("opportunity_id") || "") || null,
    application_id: String(formData.get("application_id") || "") || null,
    person_id: String(formData.get("person_id") || "") || null,
    organization_id: String(formData.get("organization_id") || "") || null,
    due_date: due,
    priority,
    status: String(formData.get("status") || "inbox"),
    effort: String(formData.get("effort") || "") || null,
    ai_reasoning: null,
    completion_evidence: null,
    created_at: nowISO(),
    updated_at: nowISO(),
  });
  await logActivity(user.id, "task_created", `Created task: ${title}`, "task", id);
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true, id };
}

export async function updateTaskStatus(id: string, status: string) {
  const user = await requireUser();
  const db = await getDb();
  const updates: any = { status, updated_at: nowISO() };
  if (status === "done") updates.completion_evidence = "Completed via app.";
  await db.update("tasks", id, updates);
  await logActivity(user.id, "task_status", `Task ${status}: ${id}`, "task", id);
  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function completeTask(id: string) {
  await updateTaskStatus(id, "done");
}

export async function saveTaskPriority(id: string, priority: number) {
  const user = await requireUser();
  const db = await getDb();
  await db.update("tasks", id, { priority, updated_at: nowISO() });
  revalidatePath("/tasks");
}

export async function deleteTask(id: string) {
  const user = await requireUser();
  const db = await getDb();
  await db.del("tasks", id);
  await logActivity(user.id, "task_deleted", `Deleted task ${id}`, "task", id);
  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function autoPrioritizeTasks() {
  const user = await requireUser();
  const db = await getDb();
  const tasks = await db.query(`SELECT * FROM tasks WHERE user_id = ? AND status NOT IN ('done','cancelled')`, [user.id]);
  for (const t of tasks) {
    const { score, reasons } = scorePriority({ dueDate: t.due_date, basePriority: t.priority, effortMinutes: t.effort ? parseInt(t.effort) * 60 : undefined });
    await db.update("tasks", t.id, { ai_reasoning: reasons.join(" "), updated_at: nowISO() });
  }
  revalidatePath("/tasks");
  return { ok: true, count: tasks.length };
}

export async function autoPrioritizeForm(): Promise<void> {
  await autoPrioritizeTasks();
}
