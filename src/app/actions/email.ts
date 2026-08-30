"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { newId, nowISO, toJSON } from "@/lib/utils";
import { logActivity } from "@/lib/activity";

export async function addEmail(formData: FormData) {
  const user = await requireUser();
  const subject = String(formData.get("subject") || "").trim();
  if (!subject) return { error: "Subject is required." };
  const db = await getDb();
  await db.insert("emails", {
    id: newId("eml"),
    user_id: user.id,
    thread_id: null,
    from_addr: String(formData.get("from_addr") || "") || null,
    from_name: String(formData.get("from_name") || "") || null,
    subject,
    snippet: String(formData.get("snippet") || "") || null,
    body_text: null,
    received_at: nowISO(),
    category: String(formData.get("category") || "inbox"),
    confidence: null,
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
