"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { newId, nowISO, parseJSON, toJSON } from "@/lib/utils";
import { logActivity, notify } from "@/lib/activity";
import { scoreJob, scoreScholarship, buildProfileIndex, type Factor } from "@/lib/scoring";
import { isDuplicateOpportunity } from "@/lib/engines/dedupe";

export async function createOpportunity(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Title is required." };
  const db = await getDb();
  const type = String(formData.get("type") || "job");
  const sourceUrl = String(formData.get("source_url") || "") || null;
  const orgId = String(formData.get("organization_id") || "") || null;
  const structured = parseJSON<Record<string, any>>(String(formData.get("structured_json") || "{}"), {});

  const [existing, org] = await Promise.all([
    db.query<{ id: string; title: string; source_url: string | null }>(
      `SELECT id, title, source_url FROM opportunities WHERE user_id = ? AND type = ?`,
      [user.id, type]
    ),
    orgId ? db.get<{ name: string }>(`SELECT name FROM organizations WHERE id = ?`, [orgId]) : null,
  ]);
  const dup = existing.find(
    (o) => isDuplicateOpportunity({ title, sourceUrl, organizationName: org?.name }, { title: o.title, sourceUrl: o.source_url, organizationName: org?.name }).isDuplicate
  );
  if (dup) return { error: "This looks like a duplicate of an existing opportunity.", duplicateId: dup.id };

  const id = newId("opp");
  await db.insert("opportunities", {
    id,
    user_id: user.id,
    type,
    title,
    organization_id: orgId,
    source_url: sourceUrl,
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

/** Normalizes free-text funding descriptions into the scholarship engine's funding-type vocabulary. */
function normalizeFundingType(text?: string): string | undefined {
  const t = (text || "").toLowerCase();
  if (!t) return undefined;
  if (/fully[- ]?funded|full funding/.test(t)) return "FULLY_FUNDED";
  if (/self[- ]?funded/.test(t)) return "SELF_FUNDED";
  if (/tuition only/.test(t)) return "TUITION_ONLY";
  if (/partial|scholarship/.test(t)) return "PARTIAL";
  return undefined;
}

export async function scoreOpportunity(id: string): Promise<{ overall: number; recommendation: string } | { error: string }> {
  const user = await requireUser();
  const db = await getDb();
  const opp = await db.get(`SELECT * FROM opportunities WHERE id = ? AND user_id = ?`, [id, user.id]);
  if (!opp) return { error: "Not found" };
  const index = await buildProfileIndex(user.id);
  const s = parseJSON<Record<string, any>>(opp.structured_json, {});
  const deadlineAt = opp.deadline ? new Date(opp.deadline) : null;
  const result =
    opp.type === "job"
      ? scoreJob(
          {
            title: opp.title,
            requirements: s.requirements || [],
            sectorTags: s.sector ? [s.sector] : s.sectorTags || [],
            location: opp.location,
            country: s.country || null,
            remoteMode: opp.remote ? "REMOTE" : s.remoteMode || null,
            deadlineAt,
            minQualifications: s.minQualifications || [],
            wantsDegree: s.wantsDegree,
          },
          index
        )
      : scoreScholarship(
          {
            title: opp.title,
            fieldRequirements: s.field ? [s.field] : s.fieldRequirements || s.requirements || [],
            degreeRequirement: s.degreeRequirement || null,
            englishRequirement: s.englishRequirement || null,
            englishWaiverPossible: s.englishWaiverPossible ?? null,
            fundingType: normalizeFundingType(s.funding) || s.fundingType || null,
            fundingCovers: [
              ...(s.tuitionCovered ? ["TUITION"] : []),
              ...(s.livingAllowance ? ["STIPEND"] : []),
              ...(s.travelAllowance ? ["TRAVEL"] : []),
              ...(s.fundingCovers || []),
            ],
            applicationFee: s.applicationFee ?? null,
            nationalityRestrictions: s.nationalityRestrictions || [],
            eligibilityNotes: s.eligibilityNotes || null,
            deadlineAt,
            country: s.country || null,
          },
          index
        );
  const dimensions = (result.factors as Factor[]).map((f) => ({
    key: f.dimension.toLowerCase().replace(/\s+/g, "_"),
    label: f.dimension,
    score: f.score,
    weight: f.weight,
    note: f.detail,
  }));
  // keep latest score only
  await db.run(`DELETE FROM opportunity_scores WHERE opportunity_id = ?`, [id]);
  await db.insert("opportunity_scores", {
    id: newId("osc"), opportunity_id: id, model: "evidence-engine-v2",
    overall: result.score, dimensions_json: toJSON(dimensions),
    explanation: result.explanation, recommendation: result.label, created_at: nowISO(),
  });
  await db.update("opportunities", id, { updated_at: nowISO(), last_verified: nowISO() });
  revalidatePath("/opportunities");
  return { overall: result.score, recommendation: result.label };
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
