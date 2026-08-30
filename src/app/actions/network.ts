"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { newId, nowISO, toJSON } from "@/lib/utils";
import { logActivity } from "@/lib/activity";

export async function createOrganization(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Organization name is required." };
  const db = await getDb();
  const id = newId("org");
  await db.insert("organizations", {
    id, user_id: user.id, name,
    type: String(formData.get("type") || "other"),
    industry: String(formData.get("industry") || "") || null,
    location: String(formData.get("location") || "") || null,
    website: String(formData.get("website") || "") || null,
    notes: String(formData.get("notes") || "") || null,
    created_at: nowISO(),
  });
  await logActivity(user.id, "org_created", `Added organization: ${name}`, "organization", id);
  revalidatePath("/network");
  return { ok: true, id };
}

export async function createPerson(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Person name is required." };
  const db = await getDb();
  const id = newId("per");
  await db.insert("people", {
    id, user_id: user.id, name,
    title: String(formData.get("title") || "") || null,
    organization_id: String(formData.get("organization_id") || "") || null,
    email: String(formData.get("email") || "") || null,
    phone: String(formData.get("phone") || "") || null,
    relationship: String(formData.get("relationship") || "") || null,
    notes: String(formData.get("notes") || "") || null,
    created_at: nowISO(),
  });
  await logActivity(user.id, "person_created", `Added person: ${name}`, "person", id);
  revalidatePath("/network");
  return { ok: true, id };
}

export async function createLead(formData: FormData) {
  const user = await requireUser();
  const solution = String(formData.get("solution") || "").trim();
  if (!solution) return { error: "Describe the relevant solution or capability." };
  const db = await getDb();
  const id = newId("led");
  await db.insert("leads", {
    id, user_id: user.id,
    organization_id: String(formData.get("organization_id") || "") || null,
    person_id: String(formData.get("person_id") || "") || null,
    solution,
    observed_evidence: String(formData.get("observed_evidence") || "") || null,
    inference: String(formData.get("inference") || "") || null,
    hypothesis: String(formData.get("hypothesis") || "") || null,
    confidence: parseFloat(String(formData.get("confidence") || "0.5")) || 0.5,
    score: parseFloat(String(formData.get("score") || "50")) || 50,
    status: "new",
    created_at: nowISO(),
  });
  await logActivity(user.id, "lead_created", `Added lead: ${solution}`, "lead", id);
  revalidatePath("/network");
  return { ok: true, id };
}
