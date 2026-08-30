"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { newId, nowISO, parseJSON, toJSON } from "@/lib/utils";
import { logActivity, notify } from "@/lib/activity";
import { getProfileContext } from "@/lib/profile";
import { scoreJob, scoreProgramme } from "@/lib/scoring";

export async function createOpportunity(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Title is required." };
  const db = await getDb();
  const type = String(formData.get("type") || "job");
  const id = newId("opp");
  const structured = parseJSON<Record<string, any>>(String(formData.get("structured_json") || "{}"), {});
  await db.insert("opportunities", {
    id,
    user_id: user.id,
    type,
    title,
    organization_id: String(formData.get("organization_id") || "") || null,
    source_url: String(formData.get("source_url") || "") || null,
    source_name: String(formData.get("source_name") || "Manual"),
    description: String(formData.get("description") || "") || null,
    raw_text: null,
    published_date: nowISO(),
    deadline: String(formData.get("deadline") || "") || null,
    location: String(formData.get("location") || "") || null,
    remote: formData.get("remote") ? 1 : 0,
    compensation: String(formData.get("compensation") || "") || null,
    status: "discovered",
    structured_json: toJSON(structured),
    evidence_json: "[]",
    last_verified: null,
    created_at: nowISO(),
    updated_at: nowISO(),
  });
  await logActivity(user.id, "opportunity_created", `Added opportunity: ${title}`, "opportunity", id);
  revalidatePath("/opportunities");
  return { ok: true, id };
}

export async function scoreOpportunity(id: string): Promise<{ overall: number; recommendation: string } | { error: string }> {
  const user = await requireUser();
  const db = await getDb();
  const opp = await db.get(`SELECT * FROM opportunities WHERE id = ? AND user_id = ?`, [id, user.id]);
  if (!opp) return { error: "Not found" };
  const ctx = await getProfileContext(user.id);
  const s = parseJSON<Record<string, any>>(opp.structured_json, {});
  let score;
  if (opp.type === "job") {
    score = scoreJob(
      { title: opp.title, description: opp.description, requirements: s.requirements || [], location: opp.location, remote: !!opp.remote, compensation: opp.compensation, sector: s.sector, seniority: s.seniority },
      ctx
    );
  } else {
    score = scoreProgramme(
      { title: opp.title, funding: s.funding, tuitionCovered: s.tuitionCovered, livingAllowance: s.livingAllowance, travelAllowance: s.travelAllowance, englishRequirement: s.englishRequirement, admissionCompetitiveness: s.admissionCompetitiveness, careerRelevance: s.careerRelevance, deadline: opp.deadline, applicationFee: s.applicationFee, field: s.field },
      ctx
    );
  }
  // keep latest score only
  await db.run(`DELETE FROM opportunity_scores WHERE opportunity_id = ?`, [id]);
  await db.insert("opportunity_scores", {
    id: newId("osc"), opportunity_id: id, model: "deterministic-v1",
    overall: score.overall, dimensions_json: toJSON(score.dimensions),
    explanation: score.explanation.join(" "), recommendation: score.recommendation, created_at: nowISO(),
  });
  await db.update("opportunities", id, { updated_at: nowISO(), last_verified: nowISO() });
  revalidatePath("/opportunities");
  return { overall: score.overall, recommendation: score.recommendation };
}

export async function setOpportunityStatus(id: string, status: string, reason?: string) {
  const user = await requireUser();
  const db = await getDb();
  await db.update("opportunities", id, { status, updated_at: nowISO() });
  if (status === "skipped" && reason) {
    await db.update("opportunities", id, { evidence_json: toJSON([{ skipped_reason: reason }]) });
  }
  await logActivity(user.id, "opportunity_status", `Opportunity ${status}: ${id}${reason ? " (" + reason + ")" : ""}`, "opportunity", id);
  revalidatePath("/opportunities");
}

export async function createApplicationFromOpportunity(opportunityId: string) {
  const user = await requireUser();
  const db = await getDb();
  const opp = await db.get(`SELECT * FROM opportunities WHERE id = ? AND user_id = ?`, [opportunityId, user.id]);
  if (!opp) return { error: "Opportunity not found" };
  const existing = await db.get(`SELECT id FROM applications WHERE opportunity_id = ?`, [opportunityId]);
  if (existing) return { ok: true, id: existing.id, already: true };
  const id = newId("app");
  await db.insert("applications", {
    id, user_id: user.id, opportunity_id: opp.id, title: opp.title, organization_id: opp.organization_id,
    status: "reviewing", deadline: opp.deadline, fit_score: null, ai_analysis_json: "{}", timeline_json: "[]",
    notes: null, created_at: nowISO(), updated_at: nowISO(),
  });
  await db.insert("application_events", { id: newId("ape"), application_id: id, type: "created", at: nowISO(), note: "Workspace created from opportunity." });
  await logActivity(user.id, "application_created", `Created application: ${opp.title}`, "application", id);
  revalidatePath("/applications");
  return { ok: true, id };
}
