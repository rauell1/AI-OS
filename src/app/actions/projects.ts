"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { newId, nowISO, parseJSON, toJSON } from "@/lib/utils";
import { logActivity } from "@/lib/activity";

export async function createProject(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Project name is required." };
  const db = await getDb();
  const id = newId("prj");
  await db.insert("projects", {
    id,
    user_id: user.id,
    name,
    category: String(formData.get("category") || "General"),
    status: String(formData.get("status") || "active"),
    overview: String(formData.get("overview") || "") || null,
    goals_json: "[]",
    decisions_json: "[]",
    risks_json: "[]",
    ai_summary: null,
    next_actions_json: "[]",
    github_json: "[]",
    created_at: nowISO(),
    updated_at: nowISO(),
  });
  await logActivity(user.id, "project_created", `Created project: ${name}`, "project", id);
  revalidatePath("/projects");
  return { ok: true, id };
}

export async function updateProjectField(id: string, field: string, value: string) {
  const user = await requireUser();
  const db = await getDb();
  await db.update("projects", id, { [field]: value, updated_at: nowISO() });
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
}

export async function addProjectNote(projectId: string, title: string, body: string) {
  const user = await requireUser();
  const db = await getDb();
  await db.insert("notes", {
    id: newId("nts"),
    user_id: user.id,
    title: title || "Note",
    body,
    entity_type: "project",
    entity_id: projectId,
    created_at: nowISO(),
  });
  await logActivity(user.id, "note_added", `Added note to project`, "project", projectId);
  revalidatePath(`/projects/${projectId}`);
}

export async function addProjectTask(projectId: string, title: string, dueDate?: string, priority = 3) {
  const user = await requireUser();
  const db = await getDb();
  const id = newId("tsk");
  await db.insert("tasks", {
    id, user_id: user.id, title, source: "project", source_id: projectId, project_id: projectId,
    due_date: dueDate || null, priority, status: "next", effort: null, ai_reasoning: null,
    completion_evidence: null, created_at: nowISO(), updated_at: nowISO(),
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, id };
}

export async function setProjectStatus(id: string, status: string) {
  const user = await requireUser();
  const db = await getDb();
  await db.update("projects", id, { status, updated_at: nowISO() });
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
}

export async function deleteProject(id: string) {
  const user = await requireUser();
  const db = await getDb();
  await db.del("projects", id);
  logActivity(user.id, "project_deleted", `Deleted project ${id}`, "project", id);
  revalidatePath("/projects");
}
