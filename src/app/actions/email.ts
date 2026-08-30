"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { newId, nowISO, toJSON } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { classifyEmailHeuristic } from "@/lib/engines/email";

export async function addEmail(formData: FormData) {
  const user = await requireUser();
  const subject = String(formData.get("subject") || "").trim();
  if (!subject) return { error: "Subject is required." };
  const db = await getDb();
  const fromAddr = String(formData.get("from_addr") || "") || null;
  const snippet = String(formData.get("snippet") || "") || null;
  const manualCategory = String(formData.get("category") || "") || null;
  const classification = classifyEmailHeuristic(subject, snippet || "", fromAddr || undefined);
  await db.insert("emails", {
    id: newId("eml"),
    user_id: user.id,
    thread_id: null,
    from_addr: fromAddr,
    from_name: String(formData.get("from_name") || "") || null,
    subject,
    snippet,
    body_text: null,
    received_at: nowISO(),
    category: manualCategory || classification.category,
    confidence: manualCategory ? null : classification.confidence,
    deadline: String(formData.get("deadline") || "") || null,
    requested_action: String(formData.get("requested_action") || "") || null,
    sentiment: null,
    follow_up_date: String(formData.get("follow_up_date") || "") || null,
    project_id: null, opportunity_id: null, application_id: null, person_id: null, organization_id: null,
    status: "unprocessed",
    ai_json: "{}",
    created_at: nowISO(),
  });
  await logActivity(user.id, "email_added", `Logged email: ${subject}`, "email", undefined);
  revalidatePath("/inbox");
  return { ok: true };
}

export async function addEmailForm(fd: FormData): Promise<void> {
  await addEmail(fd);
}

export async function draftEmailReply(emailId: string, draftedBody: string) {
  const user = await requireUser();
  const db = await getDb();
  
  // Section 78 & Contradiction 2: Automated drafting must go through Approval Center
  await db.insert("approvals", {
    id: newId("apprv"),
    user_id: user.id,
    type: "email",
    proposed_action: "Send email reply",
    why: "Drafted reply to email",
    affected_data_json: toJSON({ emailId }),
    preview: draftedBody,
    status: "pending",
    created_at: nowISO(),
  });
  
  await logActivity(user.id, "email_drafted", `Drafted reply for email ${emailId} (pending approval)`, "email", emailId);
  revalidatePath("/inbox");
  revalidatePath("/approvals");
}
