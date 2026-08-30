"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowISO, parseJSON } from "@/lib/utils";
import { logActivity, notify } from "@/lib/activity";

export async function resolveApproval(id: string, decision: "approved" | "rejected", note?: string) {
  const user = await requireUser();
  const db = await getDb();
  const approval = await db.get(`SELECT * FROM approvals WHERE id = ? AND user_id = ?`, [id, user.id]);
  if (!approval) return { error: "Approval not found" };
  await db.update("approvals", id, { status: decision, resolved_at: nowISO() });
  await logActivity(user.id, "approval_resolved", `Approval ${decision}: ${approval.proposed_action}`, "approval", id);

  if (decision === "approved") {
    const data = parseJSON<{ applicationId?: string; versionId?: string }>(approval.affected_data_json, {});
    if (data.versionId) {
      await db.update("application_versions", data.versionId, { approved: 1 });
      if (data.applicationId) {
        await db.update("applications", data.applicationId, { status: "ready_to_submit", updated_at: nowISO() });
      }
    }
    await notify(user.id, "approval", "Action approved", approval.proposed_action, "approval", id);
  }
  revalidatePath("/approvals");
  revalidatePath("/applications");
  return { ok: true };
}
