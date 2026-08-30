import { prisma } from "@/lib/db";
import { buildDailyBrief } from "@/lib/engines/brief";
import { buildWeeklyReview } from "@/lib/engines/weekly";
import { detectFollowUps, materializeFollowUps } from "@/lib/engines/followups";
import { notify } from "@/lib/notifications";
import { recordActivity } from "@/lib/activity";
import { buildProfileIndex } from "@/lib/scoring/profile-index";
import { scoreJob, scoreScholarship } from "@/lib/scoring/job-scholarship";
import { syncAllGitHub } from "@/lib/integrations/github";
import { daysUntil } from "@/lib/utils";
import type { AutomationMode } from "@/generated/prisma/client";

export type RuleResult = {
  summary: string;
  actionsCreated?: number;
  details?: Record<string, unknown>;
};

export type RuleDefinition = {
  key: string;
  name: string;
  description: string;
  defaultMode: AutomationMode;
  schedule: string; // human-readable
  /** Returns the ms timestamp for the next run given now. */
  nextRun: (now: Date) => Date;
  run: (userId: string, mode: AutomationMode) => Promise<RuleResult>;
};

const DAY = 86400000;

function tomorrowAt(hour: number, minute = 0, now = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function nextWeekly(day: number, hour: number, now = new Date()): Date {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  const delta = (day - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return d;
}

export const RULES: RuleDefinition[] = [
  {
    key: "daily-brief",
    name: "Daily Brief",
    description: "Generates today's briefing: deadlines, emails needing response, follow-ups, priorities.",
    defaultMode: "AUTO_PREPARE",
    schedule: "daily 06:30",
    nextRun: (now) => tomorrowAt(6, 30, now),
    run: async (userId) => {
      const brief = await buildDailyBrief(userId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.brief.upsert({
        where: { userId_type_forDate: { userId, type: "DAILY", forDate: today } },
        create: { userId, type: "DAILY", forDate: today, content: brief as never },
        update: { content: brief as never },
      });
      await recordActivity({ userId, type: "BRIEF_GENERATED", actor: "AUTOMATION", summary: "Daily brief generated" });
      return { summary: `Daily brief generated: ${brief.actionCount} attention items.`, details: { actionCount: brief.actionCount } };
    },
  },
  {
    key: "weekly-review",
    name: "Weekly Review",
    description: "Compiles the week: completed work, application progress, project activity, upcoming focus.",
    defaultMode: "AUTO_PREPARE",
    schedule: "weekly Sun 18:00",
    nextRun: (now) => nextWeekly(0, 18, now),
    run: async (userId) => {
      const review = await buildWeeklyReview(userId);
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      await prisma.brief.create({
        data: { userId, type: "WEEKLY", forDate: weekStart, content: review.data as never, aiNarrative: review.narrative },
      });
      return { summary: "Weekly review generated.", details: { tasks: review.data.tasksCompleted } };
    },
  },
  {
    key: "deadline-scan",
    name: "Deadline Radar",
    description: "Scans opportunity and application deadlines; raises notifications and creates prep tasks.",
    defaultMode: "AUTO_EXECUTE_SAFE",
    schedule: "daily 07:00",
    nextRun: (now) => tomorrowAt(7, 0, now),
    run: async (userId, mode) => {
      const now = new Date();
      const soon = new Date(now.getTime() + 14 * DAY);
      const opps = await prisma.opportunity.findMany({
        where: { userId, status: { in: ["NEW", "SHORTLISTED"] }, deadlineAt: { gte: now, lte: soon } },
      });
      let actions = 0;
      for (const o of opps) {
        const days = daysUntil(o.deadlineAt);
        if (days === null || days < 0) continue;
        const existing = await prisma.notification.findFirst({
          where: { userId, refType: "OPPORTUNITY", refId: o.id, type: "DEADLINE", createdAt: { gte: new Date(now.getTime() - 3 * DAY) } },
        });
        if (!existing) {
          await notify({
            userId, type: "DEADLINE", severity: days <= 7 ? "WARNING" : "INFO",
            title: `${o.title}: deadline in ${days} day(s)`,
            body: o.organizationName ?? undefined,
            refType: "OPPORTUNITY", refId: o.id,
          });
          actions++;
        }
        if (mode === "AUTO_EXECUTE_SAFE") {
          const hasTask = await prisma.task.findFirst({
            where: { userId, source: "SCHOLARSHIP_DEADLINE", sourceRef: o.id, status: { notIn: ["DONE", "CANCELLED"] } },
          });
          if (!hasTask) {
            await prisma.task.create({
              data: {
                userId,
                title: `Decide and prepare: ${o.title}`,
                source: o.type === "SCHOLARSHIP" || o.type === "PROGRAMME" ? "SCHOLARSHIP_DEADLINE" : "JOB_APPLICATION",
                sourceRef: o.id,
                dueAt: o.deadlineAt,
                status: "INBOX",
              },
            });
            actions++;
          }
        }
      }
      // Applications close to deadline with missing requirements
      const apps = await prisma.application.findMany({
        where: { userId, status: { in: ["PREPARING", "REVIEWING", "SHORTLISTED", "READY_FOR_REVIEW"] }, deadlineAt: { not: null } },
        include: { requirements: true, opportunity: true },
      });
      for (const a of apps) {
        const days = daysUntil(a.deadlineAt);
        if (days === null || days < 0 || days > 10) continue;
        const missing = a.requirements.filter((r) => r.status === "MISSING");
        if (missing.length) {
          await notify({
            userId, type: "APPLICATION", severity: days <= 5 ? "CRITICAL" : "WARNING",
            title: `${a.opportunity.title}: ${missing.length} requirement(s) missing, ${days}d left`,
            refType: "APPLICATION", refId: a.id,
          });
          actions++;
        }
      }
      return { summary: `Deadline scan complete: ${actions} alert(s)/task(s) created.`, actionsCreated: actions };
    },
  },
  {
    key: "followup-scan",
    name: "Follow-up Radar",
    description: "Detects conversations and leads that went quiet and proposes follow-ups.",
    defaultMode: "AUTO_EXECUTE_SAFE",
    schedule: "daily 08:00",
    nextRun: (now) => tomorrowAt(8, 0, now),
    run: async (userId) => {
      const candidates = await detectFollowUps(userId);
      const created = await materializeFollowUps(userId, candidates);
      if (created) {
        await notify({
          userId, type: "FOLLOW_UP", severity: "INFO",
          title: `${created} follow-up(s) recommended`,
          body: candidates.slice(0, 3).map((c) => c.title).join(" | "),
        });
      }
      return { summary: `${created} follow-up(s) created from ${candidates.length} candidate(s).`, actionsCreated: created };
    },
  },
  {
    key: "opportunity-rescore",
    name: "Opportunity Re-scoring",
    description: "Recomputes transparent fit scores for unscored or stale opportunities.",
    defaultMode: "AUTO_EXECUTE_SAFE",
    schedule: "daily 07:30",
    nextRun: (now) => tomorrowAt(7, 30, now),
    run: async (userId) => {
      const index = await buildProfileIndex(userId);
      const stale = await prisma.opportunity.findMany({
        where: {
          userId,
          status: { in: ["NEW", "SHORTLISTED"] },
          OR: [{ fitScore: null }, { lastVerifiedAt: null }],
        },
        take: 50,
      });
      let updated = 0;
      for (const o of stale) {
        const isEdu = o.type === "SCHOLARSHIP" || o.type === "PROGRAMME" || o.type === "FELLOWSHIP";
        const result = isEdu
          ? scoreScholarship({
              title: o.title, fieldRequirements: o.fieldRequirements as string[] | null,
              degreeRequirement: o.degreeRequirement, englishRequirement: o.englishRequirement,
              englishWaiverPossible: o.englishWaiverPossible, greRequired: o.greRequired,
              fundingType: o.fundingType, fundingCovers: o.fundingCovers as string[] | null,
              stipend: o.stipend, applicationFee: o.applicationFee, feeCurrency: o.feeCurrency,
              nationalityRestrictions: o.nationalityRestrictions as string[] | null,
              eligibilityNotes: o.eligibilityNotes, deadlineAt: o.deadlineAt,
              durationMonths: o.durationMonths, country: o.country,
            }, index)
          : scoreJob({
              title: o.title, requirements: o.requirements as string[] | null,
              sectorTags: o.sectorTags as string[] | null, location: o.location,
              country: o.country, remoteMode: o.remoteMode, deadlineAt: o.deadlineAt,
              minQualifications: o.minQualifications as string[] | null,
            }, index);
        await prisma.opportunity.update({
          where: { id: o.id },
          data: {
            fitScore: result.score,
            fitBreakdown: result.factors as never,
            fitLabel: result.label,
            fitExplanation: result.explanation,
            lastVerifiedAt: new Date(),
          },
        });
        updated++;
      }
      return { summary: `Re-scored ${updated} opportunit(ies).`, actionsCreated: updated };
    },
  },
  {
    key: "github-sync",
    name: "GitHub Project Sync",
    description: "Refreshes repository stats for linked projects and flags inactive work.",
    defaultMode: "MANUAL",
    schedule: "weekly Mon 08:00",
    nextRun: (now) => nextWeekly(1, 8, now),
    run: async (userId) => {
      const result = await syncAllGitHub(userId);
      return { summary: result.summary, actionsCreated: result.updated };
    },
  },
];

export function getRule(key: string): RuleDefinition {
  const rule = RULES.find((r) => r.key === key);
  if (!rule) throw new Error(`Unknown automation rule: ${key}`);
  return rule;
}
