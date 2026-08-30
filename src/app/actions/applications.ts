"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { newId, nowISO, parseJSON, toJSON } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { getMasterProfile } from "@/lib/profile";
import { matchRequirements, generateCV, generateCoverLetter } from "@/lib/cv";
import { createApproval } from "@/lib/activity";

export async function updateApplicationField(id: string, field: string, value: string) {
  const user = await requireUser();
  const db = await getDb();
  await db.update("applications", id, { [field]: value, updated_at: nowISO() });
  revalidatePath(`/applications/${id}`);
  revalidatePath("/applications");
}

export async function setApplicationStatus(id: string, status: string) {
  const user = await requireUser();
  const db = await getDb();
  await db.update("applications", id, { status, updated_at: nowISO() });
  await db.insert("application_events", { id: newId("ape"), application_id: id, type: "status", at: nowISO(), note: `Status changed to ${status}.` });
  await logActivity(user.id, "application_status", `Application ${status}: ${id}`, "application", id);
  revalidatePath(`/applications/${id}`);
  revalidatePath("/applications");
}

export async function addRequirement(applicationId: string, label: string, required = true) {
  const user = await requireUser();
  const db = await getDb();
  await db.insert("application_requirements", {
    id: newId("are"), application_id: applicationId, label, required: required ? 1 : 0, satisfied: 0, evidence: null, notes: null,
  });
  revalidatePath(`/applications/${applicationId}`);
}

export async function toggleRequirement(id: string, satisfied: boolean) {
  const user = await requireUser();
  const db = await getDb();
  await db.update("application_requirements", id, { satisfied: satisfied ? 1 : 0 });
  revalidatePath("/applications");
}

export async function addQuestion(applicationId: string, question: string, canonical = "") {
  const user = await requireUser();
  const db = await getDb();
  await db.insert("application_questions", {
    id: newId("aqt"), application_id: applicationId, question, canonical_answer: canonical || null, tailored_answer: null, approved: 0, source_evidence: null,
  });
  revalidatePath(`/applications/${applicationId}`);
}

export async function saveApplicationVersion(applicationId: string, kind: string, title: string, content: string) {
  const user = await requireUser();
  const db = await getDb();
  const last = await db.get<{ v: number }>(`SELECT MAX(version) v FROM application_versions WHERE application_id = ?`, [applicationId]);
  const version = (last?.v || 0) + 1;
  const id = newId("avr");
  await db.insert("application_versions", {
    id, application_id: applicationId, kind, version, title: title || null, content, model: "template-v1",
    prompt_version: "v1", approved: 0, submitted: 0, created_at: nowISO(),
  });
  await logActivity(user.id, "version_saved", `Saved ${kind} v${version} for application ${applicationId}`, "application", applicationId);
  revalidatePath(`/applications/${applicationId}`);
  return { ok: true, id, version };
}

export async function approveVersion(id: string) {
  const user = await requireUser();
  const db = await getDb();
  await db.update("application_versions", id, { approved: 1 });
  revalidatePath("/applications");
}

export async function requestCVApproval(applicationId: string) {
  const user = await requireUser();
  const db = await getDb();
  const app = await db.get<any>(`SELECT * FROM applications WHERE id = ? AND user_id = ?`, [applicationId, user.id]);
  if (!app) return { error: "Application not found" };
  const profile = await getMasterProfile(user.id);
  const cv = generateCV(profile, app.title);
  const version = await saveApplicationVersion(applicationId, "cv", `CV for ${app.title}`, cv);
  await createApproval({
    userId: user.id,
    type: "finalize_cv",
    proposedAction: `Finalize tailored CV for ${app.title}`,
    why: "AI prepared a tailored CV from your master profile. Review before use.",
    affectedData: { applicationId, versionId: version.id },
    aiReasoning: "Drafted from verified profile evidence. No fabricated experience.",
    preview: cv.slice(0, 1500),
    entityType: "application",
    entityId: applicationId,
  });
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/approvals");
  return { ok: true };
}

export async function requestCoverLetterApproval(applicationId: string) {
  const user = await requireUser();
  const db = await getDb();
  const app = await db.get<any>(`SELECT * FROM applications WHERE id = ? AND user_id = ?`, [applicationId, user.id]);
  if (!app) return { error: "Application not found" };
  const [org, profile] = await Promise.all([
    appOrgName(db, app.organization_id),
    getMasterProfile(user.id),
  ]);
  const letter = generateCoverLetter(profile, app.title, org);
  const version = await saveApplicationVersion(applicationId, "cover", `Cover letter for ${app.title}`, letter);
  await createApproval({
    userId: user.id,
    type: "finalize_cover",
    proposedAction: `Finalize cover letter for ${app.title}`,
    why: "AI prepared a cover letter from your evidence. Review before use.",
    affectedData: { applicationId, versionId: version.id },
    aiReasoning: "Drafted from verified profile. Avoids em/en dashes and fabricated claims.",
    preview: letter.slice(0, 1500),
    entityType: "application",
    entityId: applicationId,
  });
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/approvals");
  return { ok: true };
}

async function appOrgName(db: any, orgId?: string): Promise<string | undefined> {
  if (!orgId) return undefined;
  const o = await db.get(`SELECT name FROM organizations WHERE id = ?`, [orgId]);
  return o?.name;
}
