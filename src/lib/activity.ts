import "server-only";
import { prisma } from "@/lib/db";
import type { Actor } from "@/generated/prisma/client";

export type ActivityType =
  | "OPPORTUNITY_DISCOVERED"
  | "OPPORTUNITY_SHORTLISTED"
  | "OPPORTUNITY_SKIPPED"
  | "APPLICATION_CREATED"
  | "APPLICATION_STATUS_CHANGED"
  | "APPLICATION_SUBMITTED"
  | "CV_GENERATED"
  | "COVER_LETTER_GENERATED"
  | "TASK_CREATED"
  | "TASK_COMPLETED"
  | "EMAIL_IMPORTED"
  | "EMAIL_CLASSIFIED"
  | "DOCUMENT_UPLOADED"
  | "CONTACT_CREATED"
  | "ORGANIZATION_CREATED"
  | "LEAD_CREATED"
  | "MEETING_LOGGED"
  | "MEETING_OCCURRED"
  | "PROJECT_UPDATED"
  | "REPOSITORY_SYNCED"
  | "AI_RECOMMENDATION"
  | "BRIEF_GENERATED"
  | "AUTOMATION_RAN"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_DECIDED"
  | "DECISION_RECORDED"
  | "GOAL_UPDATED"
  | "NOTE_CREATED"
  | "INTEGRATION_CONNECTED"
  | "INTEGRATION_DISCONNECTED"
  | "LOGIN"
  | "LOGOUT"
  | "SETUP"
  | "DATA_EXPORTED"
  | "PROFILE_UPDATED";

/** Append an immutable activity event. Never throws into caller flows. */
export async function recordActivity(opts: {
  userId: string;
  type: ActivityType;
  summary: string;
  actor?: Actor;
  refType?: string;
  refId?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.activityEvent.create({
      data: {
        userId: opts.userId,
        type: opts.type,
        summary: opts.summary,
        actor: opts.actor ?? "USER",
        refType: opts.refType,
        refId: opts.refId,
        meta: (opts.meta ?? undefined) as never,
      },
    });
  } catch (err) {
    console.error("[activity] failed to record", opts.type, err);
  }
}
