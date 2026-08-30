"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { newId, nowISO, toJSON } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { scoreLead } from "@/lib/scoring";

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
  const orgId = String(formData.get("organization_id") || "") || null;
  const personId = String(formData.get("person_id") || "") || null;
  const observedEvidence = String(formData.get("observed_evidence") || "") || null;
  const org = orgId ? await db.get<{ name: string; industry?: string; location?: string; notes?: string }>(
    `SELECT name, industry, location, notes FROM organizations WHERE id = ?`, [orgId]
  ) : null;

  const result = scoreLead({
    organizationName: org?.name || "Unknown organization",
    industry: org?.industry || null,
    location: org?.location || null,
    description: org?.notes || null,
    solution,
    observedEvidenceCount: observedEvidence ? observedEvidence.split(/\n|;/).filter((s) => s.trim()).length : 0,
    evidenceSources: observedEvidence ? 1 : 0,
    hasPublicContact: !!org,
    hasKnownContact: !!personId,
  });

  await db.insert("leads", {
    id, user_id: user.id,
    organization_id: orgId,
    person_id: personId,
    solution,
    observed_evidence: observedEvidence,
    inference: String(formData.get("inference") || "") || null,
    hypothesis: String(formData.get("hypothesis") || "") || null,
    confidence: parseFloat(String(formData.get("confidence") || "0.5")) || 0.5,
    score: result.score,
    status: "new",
    created_at: nowISO(),
  });
  await logActivity(user.id, "lead_created", `Added lead: ${solution}`, "lead", id);
  revalidatePath("/network");
  return { ok: true, id };
}
