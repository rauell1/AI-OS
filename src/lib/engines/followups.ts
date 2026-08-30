import { prisma } from "@/lib/db";

export type FollowUpCandidate = {
  title: string;
  reason: string;
  dueAt: Date;
  personId?: string;
  leadId?: string;
  applicationId?: string;
  policyDays: number;
};

/**
 * Rule-based follow-up detection. Deliberately conservative to never harass:
 * at most one open follow-up per subject, and nudges respect policyDays.
 *
 * Rules:
 * 1. Outbound outreach (proposal/email) with no reply after N days -> follow up.
 * 2. Inbound email that asked something and got no response -> respond.
 * 3. Referee letter pending and application deadline near -> remind referee.
 * 4. Lead in OUTREACH_SENT with no reply after policy window -> nudge.
 */
export async function detectFollowUps(userId: string, now = new Date()): Promise<FollowUpCandidate[]> {
  const candidates: FollowUpCandidate[] = [];
  const openFollowUps = await prisma.followUp.findMany({ where: { userId, status: "OPEN" } });
  const hasOpen = (key: string) => openFollowUps.some((f) => f.sourceReason === key || f.title === key);

  // 1. Outreach sent without reply
  const sentOutreach = await prisma.outreach.findMany({
    where: { userId, status: "SENT", sentAt: { not: null } },
    include: { lead: { include: { organization: true } } },
  });
  for (const o of sentOutreach) {
    if (o.replyAt) continue;
    const sent = o.sentAt!;
    const days = Math.floor((now.getTime() - sent.getTime()) / 86400000);
    if (days >= 7) {
      const key = `outreach:${o.id}`;
      if (hasOpen(key)) continue;
      candidates.push({
        title: `Follow up on ${o.subject ?? "your outreach"} to ${o.lead.organization?.name ?? "the organization"}`,
        reason: `Sent ${days} days ago with no recorded reply`,
        dueAt: now,
        leadId: o.leadId,
        policyDays: 7,
      });
    }
  }

  // 2. Inbound emails needing response (older than 2 days)
  const emails = await prisma.emailMessage.findMany({
    where: { userId, direction: "INBOUND", needsResponse: true, respondedAt: null, receivedAt: { lt: new Date(now.getTime() - 2 * 86400000) } },
    orderBy: { receivedAt: "asc" },
    take: 20,
  });
  for (const e of emails) {
    const days = Math.floor((now.getTime() - e.receivedAt.getTime()) / 86400000);
    const key = `email:${e.id}`;
    if (hasOpen(key)) continue;
    candidates.push({
      title: `Respond to ${e.fromName ?? e.fromEmail ?? "sender"}: ${e.subject}`,
      reason: `Received ${days} days ago; marked as needing a response`,
      dueAt: now,
      policyDays: 3,
    });
  }

  // 3. Referee reminders before application deadlines
  const refs = await prisma.referee.findMany({ where: { userId, letterStatus: "PENDING" } });
  if (refs.length) {
    const apps = await prisma.application.findMany({
      where: { userId, status: { in: ["PREPARING", "READY_FOR_REVIEW", "READY_TO_SUBMIT"] }, deadlineAt: { not: null } },
      include: { opportunity: true },
    });
    for (const app of apps) {
      const deadline = app.deadlineAt ?? app.opportunity.deadlineAt;
      if (!deadline) continue;
      const days = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
      if (days <= 21 && days >= 0) {
        for (const ref of refs) {
          const key = `referee:${ref.id}:${app.id}`;
          if (hasOpen(key)) continue;
          candidates.push({
            title: `Confirm ${ref.name}'s recommendation letter for ${app.opportunity.title}`,
            reason: `Letter pending; deadline in ${days} days`,
            dueAt: new Date(now.getTime() + 86400000),
            applicationId: app.id,
            policyDays: 5,
          });
        }
      }
    }
  }

  // 4. Leads gone quiet
  const quietLeads = await prisma.lead.findMany({
    where: { userId, status: { in: ["OUTREACH_SENT", "REPLIED", "QUALIFIED"] } },
    include: { organization: true },
  });
  for (const lead of quietLeads) {
    const lastTouch = lead.updatedAt;
    const days = Math.floor((now.getTime() - lastTouch.getTime()) / 86400000);
    if (days >= 14) {
      const key = `lead:${lead.id}`;
      if (hasOpen(key)) continue;
      candidates.push({
        title: `Re-engage ${lead.organization?.name ?? lead.solution} lead`,
        reason: `No activity for ${days} days`,
        dueAt: now,
        leadId: lead.id,
        policyDays: 14,
      });
    }
  }

  return candidates;
}

/** Create follow-up rows for candidates that don't already exist. */
export async function materializeFollowUps(userId: string, candidates: FollowUpCandidate[]): Promise<number> {
  let created = 0;
  for (const c of candidates) {
    const exists = await prisma.followUp.findFirst({
      where: { userId, status: "OPEN", title: c.title },
    });
    if (exists) continue;
    await prisma.followUp.create({
      data: {
        userId,
        title: c.title,
        dueAt: c.dueAt,
        personId: c.personId,
        leadId: c.leadId,
        applicationId: c.applicationId,
        policyDays: c.policyDays,
        sourceReason: c.reason,
      },
    });
    created++;
  }
  return created;
}
