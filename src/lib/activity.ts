import { getDb } from "./db";
import { newId, nowISO, toJSON } from "./utils";

export async function logActivity(
  userId: string,
  type: string,
  summary: string,
  entityType?: string | null,
  entityId?: string | null,
  metadata?: Record<string, any>
) {
  const db = await getDb();
  await db.insert("activity_events", {
    id: newId("act"),
    user_id: userId,
    type,
    summary,
    entity_type: entityType || null,
    entity_id: entityId || null,
    metadata_json: toJSON(metadata || {}),
    created_at: nowISO(),
  });
}

export async function notify(
  userId: string,
  type: string,
  title: string,
  body?: string | null,
  entityType?: string | null,
  entityId?: string | null
) {
  const db = await getDb();
  await db.insert("notifications", {
    id: newId("ntf"),
    user_id: userId,
    type,
    title,
    body: body || null,
    entity_type: entityType || null,
    entity_id: entityId || null,
    read: 0,
    created_at: nowISO(),
  });
}

export async function recordAudit(
  userId: string | undefined,
  action: string,
  entityType?: string | null,
  entityId?: string | null,
  meta?: Record<string, any>
) {
  const db = await getDb();
  await db.insert("audit_logs", {
    id: newId("aud"),
    user_id: userId || null,
    action,
    entity_type: entityType || null,
    entity_id: entityId || null,
    meta_json: toJSON(meta || {}),
    created_at: nowISO(),
  });
}

export interface ApprovalInput {
  userId: string;
  type: string;
  proposedAction: string;
  why?: string;
  affectedData?: Record<string, any>;
  aiReasoning?: string;
  preview?: string;
  entityType?: string;
  entityId?: string;
}

export async function createApproval(input: ApprovalInput): Promise<string> {
  const db = await getDb();
  const id = newId("apr");
  await db.insert("approvals", {
    id,
    user_id: input.userId,
    type: input.type,
    proposed_action: input.proposedAction,
    why: input.why || null,
    affected_data_json: toJSON(input.affectedData || {}),
    ai_reasoning: input.aiReasoning || null,
    preview: input.preview || null,
    status: "pending",
    created_at: nowISO(),
    resolved_at: null,
  });
  await notify(input.userId, "approval", "Action awaiting your approval", input.proposedAction, input.entityType, input.entityId);
  return id;
}
