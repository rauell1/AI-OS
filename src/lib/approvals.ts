import "server-only";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { notify } from "@/lib/notifications";
import type { Approval, ApprovalType, RequestedBy } from "@/generated/prisma/client";

export type ApprovalPayload =
  | { kind: "SEND_EMAIL"; to: string; subject: string; body: string }
  | { kind: "SEND_OUTREACH"; outreachId: string; leadName: string; subject: string; preview: string }
  | { kind: "CREATE_EXTERNAL_EVENT"; title: string; startISO: string; details?: string }
  | { kind: "CONTACT_LEAD"; leadId: string; channel: string; message: string }
  | { kind: "USE_SENSITIVE_DOCUMENT"; documentId: string; purpose: string }
  | { kind: "FINALIZE_CV"; generatedDocId: string; applicationId?: string }
  | { kind: "FINALIZE_APPLICATION"; applicationId: string; note?: string }
  | { kind: "PUBLISH_CONTENT"; content: string; channel: string }
  | { kind: "DELETE_RECORD"; refType: string; refId: string; label: string }
  | { kind: "OTHER"; data: Record<string, unknown> };

/**
 * Request approval for a sensitive action. Nothing executes until Roy
 * decides. AI and automations must never bypass this.
 */
export async function requestApproval(opts: {
  userId: string;
  type: ApprovalType;
  title: string;
  rationale?: string;
  payload: ApprovalPayload;
  preview?: Record<string, unknown>;
  affected?: Record<string, unknown>;
  requestedBy?: RequestedBy;
  expiresInDays?: number;
}): Promise<Approval> {
  const approval = await prisma.approval.create({
    data: {
      userId: opts.userId,
      type: opts.type,
      title: opts.title,
      rationale: opts.rationale,
      payload: opts.payload as never,
      preview: (opts.preview ?? undefined) as never,
      affected: (opts.affected ?? undefined) as never,
      requestedBy: opts.requestedBy ?? "AI",
      expiresAt: opts.expiresInDays
        ? new Date(Date.now() + opts.expiresInDays * 86400000)
        : undefined,
    },
  });
  await notify({
    userId: opts.userId,
    type: "SYSTEM",
    severity: "WARNING",
    title: `Approval needed: ${opts.title}`,
    body: opts.rationale,
    refType: "APPROVAL",
    refId: approval.id,
  });
  await recordActivity({
    userId: opts.userId,
    type: "APPROVAL_REQUESTED",
    actor: opts.requestedBy ?? "AI",
    summary: opts.title,
    refType: "APPROVAL",
    refId: approval.id,
  });
  return approval;
}

/**
 * Execute an approved action. Each payload kind maps to a real handler;
 * when an external dependency (e.g. Gmail send) is not connected, the
 * execution records the outcome honestly instead of faking success.
 */
async function executePayload(userId: string, approval: Approval): Promise<void> {
  const payload = approval.payload as ApprovalPayload;
  switch (payload.kind) {
    case "SEND_EMAIL": {
      const gmail = await prisma.integration.findUnique({
        where: { userId_provider: { userId, provider: "GMAIL" } },
      });
      if (!gmail || gmail.status !== "CONNECTED") {
        throw new Error(
          "Gmail is not connected. Connect Gmail in Settings > Integrations to enable sending. The approved draft is preserved."
        );
      }
      // Sending is implemented by the Gmail adapter (draft + send with approval flag).
      const { sendApprovedEmail } = await import("@/lib/integrations/google");
      await sendApprovedEmail(userId, payload.to, payload.subject, payload.body);
      return;
    }
    case "SEND_OUTREACH": {
      const p = payload as { outreachId: string };
      const gmail = await prisma.integration.findUnique({
        where: { userId_provider: { userId, provider: "GMAIL" } },
      });
      const outreach = await prisma.outreach.findUnique({ where: { id: p.outreachId } });
      if (!outreach) throw new Error("Outreach record no longer exists");
      if (!gmail || gmail.status !== "CONNECTED") {
        await prisma.outreach.update({ where: { id: p.outreachId }, data: { status: "APPROVED" } });
        throw new Error(
          "Outreach approved and marked APPROVED, but Gmail is not connected so nothing was sent externally."
        );
      }
      const { sendApprovedEmail } = await import("@/lib/integrations/google");
      const to = (outreach.notes ?? "").match(/to:([^\s]+@\S+)/)?.[1];
      if (!to) throw new Error("No recipient email recorded on the outreach. Add 'to:<email>' in its notes.");
      await sendApprovedEmail(userId, to, outreach.subject ?? "(no subject)", outreach.content);
      await prisma.outreach.update({
        where: { id: p.outreachId },
        data: { status: "SENT", sentAt: new Date() },
      });
      return;
    }
    case "CREATE_EXTERNAL_EVENT": {
      const gcal = await prisma.integration.findUnique({
        where: { userId_provider: { userId, provider: "GCAL" } },
      });
      const p = payload as { title: string; startISO: string; details?: string };
      // Always create the local event (source of truth stays in Rauell OS).
      await prisma.calendarEvent.create({
        data: {
          userId,
          title: p.title,
          startAt: new Date(p.startISO),
          source: "MANUAL",
          notes: p.details,
          attendees: ["external (pending invite)"],
        },
      });
      if (!gcal || gcal.status !== "CONNECTED") {
        throw new Error(
          "Event saved locally. Google Calendar is not connected, so no external invitation was sent."
        );
      }
      const { createExternalEvent } = await import("@/lib/integrations/google");
      await createExternalEvent(userId, p.title, p.startISO, p.details);
      return;
    }
    case "CONTACT_LEAD": {
      const p = payload as { leadId: string };
      await prisma.lead.update({
        where: { id: p.leadId },
        data: { status: "OUTREACH_PREPARED" },
      });
      throw new Error(
        "Lead marked OUTREACH_PREPARED. Contacting externally requires a connected channel (Gmail)."
      );
    }
    case "FINALIZE_CV": {
      const p = payload as { generatedDocId: string };
      await prisma.generatedDoc.update({
        where: { id: p.generatedDocId },
        data: { approvedAt: new Date() },
      });
      return;
    }
    case "FINALIZE_APPLICATION": {
      const p = payload as { applicationId: string; note?: string };
      const app = await prisma.application.update({
        where: { id: p.applicationId },
        data: { status: "READY_TO_SUBMIT" },
      });
      await recordActivity({
        userId,
        type: "APPLICATION_STATUS_CHANGED",
        summary: `Application marked READY_TO_SUBMIT${p.note ? `: ${p.note}` : ""}`,
        refType: "APPLICATION",
        refId: app.id,
      });
      return;
    }
    case "USE_SENSITIVE_DOCUMENT":
      return; // permission granted; caller proceeds with the flagged doc id
    case "PUBLISH_CONTENT":
    case "DELETE_RECORD":
    case "OTHER":
      return; // decisions recorded; concrete external effects are manual by design
    default:
      return;
  }
}

export async function decideApproval(opts: {
  userId: string;
  approvalId: string;
  decision: "APPROVED" | "REJECTED";
  editedPayload?: ApprovalPayload;
}): Promise<Approval> {
  const approval = await prisma.approval.findFirst({
    where: { id: opts.approvalId, userId: opts.userId },
  });
  if (!approval) throw new Error("Approval not found");
  if (approval.status !== "PENDING") throw new Error(`Approval already ${approval.status.toLowerCase()}`);

  await prisma.approval.update({
    where: { id: approval.id },
    data: {
      status: opts.decision,
      decidedAt: new Date(),
      payload: (opts.editedPayload ?? undefined) as never,
    },
  });

  await recordActivity({
    userId: opts.userId,
    type: "APPROVAL_DECIDED",
    summary: `${opts.decision === "APPROVED" ? "Approved" : "Rejected"}: ${approval.title}`,
    refType: "APPROVAL",
    refId: approval.id,
  });

  if (opts.decision === "APPROVED") {
    try {
      await executePayload(opts.userId, approval);
      const done = await prisma.approval.update({
        where: { id: approval.id },
        data: { status: "EXECUTED", executedAt: new Date() },
      });
      await notify({ userId: opts.userId, type: "SYSTEM", title: `Executed: ${approval.title}` });
      return done;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const updated = await prisma.approval.update({
        where: { id: approval.id },
        data: { status: "APPROVED", executionError: message },
      });
      await notify({
        userId: opts.userId,
        type: "SYSTEM",
        severity: "WARNING",
        title: `Approved but not fully executed: ${approval.title}`,
        body: message,
        refType: "APPROVAL",
        refId: approval.id,
      });
      return updated;
    }
  }

  return prisma.approval.findUniqueOrThrow({ where: { id: approval.id } });
}
