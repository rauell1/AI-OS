"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { newId, nowISO, toJSON } from "@/lib/utils";
import { logActivity } from "@/lib/activity";

export async function addDecision(formData: FormData) {
  const user = await requireUser();
  const decision = String(formData.get("decision") || "").trim();
  if (!decision) return { error: "Decision is required." };
  const db = await getDb();
  await db.insert("decisions", {
    id: newId("dec"),
    user_id: user.id,
    decision,
    context: String(formData.get("context") || "") || null,
    reason: String(formData.get("reason") || "") || null,
    related_json: toJSON([]),
    evidence_json: toJSON([]),
    created_at: nowISO(),
  });
  await logActivity(user.id, "decision_logged", `Decision: ${decision}`, "decision", undefined);
  revalidatePath("/decisions");
  return { ok: true };
}

export async function addDecisionForm(fd: FormData): Promise<void> {
  await addDecision(fd);
}
