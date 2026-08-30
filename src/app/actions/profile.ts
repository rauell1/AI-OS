"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { newId, nowISO, toJSON } from "@/lib/utils";
import { logActivity } from "@/lib/activity";

export async function updateProfileField(field: string, value: string) {
  const user = await requireUser();
  const db = await getDb();
  const allowed = ["headline", "summary", "location", "nationality", "linkedin_url", "portfolio_url"];
  if (!allowed.includes(field)) return { error: "Field not editable" };
  const existing = await db.get(`SELECT user_id FROM profiles WHERE user_id = ?`, [user.id]);
  if (existing) await db.update("profiles", user.id, { [field]: value, updated_at: nowISO() });
  else await db.insert("profiles", { user_id: user.id, [field]: value, updated_at: nowISO() });
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function addSkill(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Skill name is required." };
  const db = await getDb();
  await db.insert("skills", {
    id: newId("skl"), user_id: user.id, name,
    category: String(formData.get("category") || "General"),
    proficiency: String(formData.get("proficiency") || "Proficient"),
    years: parseFloat(String(formData.get("years") || "0")) || 0,
    last_used: nowISO(),
    confidence: 1.0,
    ai_summary: null,
    verification: "user_provided",
    created_at: nowISO(),
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateSkillField(id: string, field: string, value: string) {
  const user = await requireUser();
  const db = await getDb();
  await db.update("skills", id, { [field]: value });
  revalidatePath("/settings");
}

export async function addEducation(formData: FormData) {
  const user = await requireUser();
  const institution = String(formData.get("institution") || "").trim();
  if (!institution) return { error: "Institution is required." };
  const db = await getDb();
  await db.insert("education", {
    id: newId("edu"), user_id: user.id, institution,
    degree: String(formData.get("degree") || "") || null,
    field: String(formData.get("field") || "") || null,
    start_year: parseInt(String(formData.get("start_year") || "0")) || null,
    end_year: parseInt(String(formData.get("end_year") || "0")) || null,
    status: String(formData.get("status") || "graduated"),
    details_json: "{}",
    verification: "user_provided",
    created_at: nowISO(),
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function addEmployment(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Title is required." };
  const db = await getDb();
  await db.insert("employment", {
    id: newId("emp"), user_id: user.id,
    organization_id: String(formData.get("organization_id") || "") || null,
    title,
    role_category: String(formData.get("role_category") || "") || null,
    start_date: String(formData.get("start_date") || "") || null,
    end_date: String(formData.get("end_date") || "") || null,
    current: formData.get("current") ? 1 : 0,
    location: String(formData.get("location") || "") || null,
    summary: String(formData.get("summary") || "") || null,
    responsibilities_json: "[]",
    verification: "user_provided",
    created_at: nowISO(),
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function addSkillForm(fd: FormData): Promise<void> {
  await addSkill(fd);
}

export async function addEducationForm(fd: FormData): Promise<void> {
  await addEducation(fd);
}

export async function addEmploymentForm(fd: FormData): Promise<void> {
  await addEmployment(fd);
}
