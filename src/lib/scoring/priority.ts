import type { TaskSource, TaskStatus } from "@/generated/prisma/client";
import { daysUntil } from "@/lib/utils";

export type PriorityInput = {
  title: string;
  status: TaskStatus;
  source: TaskSource;
  dueAt?: Date | null;
  effortMin?: number | null;
  goalId?: string | null;
  applicationId?: string | null;
  personId?: string | null;
  leadId?: string | null;
  blocksCount?: number; // number of tasks depending on this one
  ageDays?: number; // time since creation
  applicationDeadline?: Date | null;
};

export type PriorityResult = { score: number; reasons: string[] };

/**
 * Transparent task priority model. Every point is attributable to a stated
 * reason so Roy can always see why a task ranks where it does, and can
 * override by moving status (status feeds back into the score).
 */
export function scoreTaskPriority(input: PriorityInput): PriorityResult {
  const reasons: string[] = [];
  let score = 35; // neutral base

  // Deadline proximity (up to +30)
  const days = daysUntil(input.dueAt ?? null);
  if (days !== null) {
    if (days < 0) { score += 30; reasons.push(`Overdue by ${Math.abs(days)} day(s)`); }
    else if (days === 0) { score += 28; reasons.push("Due today"); }
    else if (days <= 2) { score += 24; reasons.push(`Due in ${days} day(s)`); }
    else if (days <= 7) { score += 15; reasons.push(`Due within a week`); }
    else if (days <= 21) { score += 7; reasons.push("Due within three weeks"); }
    else { score += 2; reasons.push("Distant deadline"); }
  }

  // Source weight (up to +14)
  const sourceWeights: Partial<Record<TaskSource, [number, string]>> = {
    SCHOLARSHIP_DEADLINE: [14, "Scholarship deadline"],
    APPLICATION: [12, "Application requirement"],
    JOB_APPLICATION: [11, "Job application step"],
    LEAD_FOLLOWUP: [9, "Lead follow-up"],
    EMAIL: [7, "From email"],
    MEETING: [6, "From meeting"],
    AUTOMATION: [4, "Automation suggestion"],
    AI_RECOMMENDATION: [4, "AI recommendation"],
    PROJECT: [5, "Project work"],
    GITHUB: [3, "GitHub activity"],
    DOCUMENT: [3, "Document task"],
    CALENDAR: [5, "Calendar prep"],
  };
  const sw = sourceWeights[input.source];
  if (sw) { score += sw[0]; reasons.push(sw[1]); }

  // Strategic links (up to +12)
  if (input.goalId) { score += 6; reasons.push("Linked to a goal"); }
  if (input.applicationId) { score += 6; reasons.push("Linked to an application"); }
  if (input.leadId) { score += 4; reasons.push("Linked to a lead"); }
  if (input.personId) { score += 2; reasons.push("Involves another person"); }

  // App deadline urgency via linked application
  const appDays = daysUntil(input.applicationDeadline ?? null);
  if (appDays !== null && appDays >= 0 && appDays <= 14) {
    score += 12;
    reasons.push(`Linked application closes in ${appDays} day(s)`);
  }

  // Blocking others (up to +8)
  if ((input.blocksCount ?? 0) > 0) {
    score += Math.min(8, (input.blocksCount ?? 0) * 4);
    reasons.push(`Blocks ${input.blocksCount} other task(s)`);
  }

  // Quick win (up to +3)
  if ((input.effortMin ?? 0) > 0 && (input.effortMin ?? 0) <= 15) {
    score += 3;
    reasons.push("Quick task (15 min or less)");
  }

  // Age / staleness (up to +5)
  if ((input.ageDays ?? 0) >= 14) { score += 5; reasons.push("Open for two weeks or more"); }
  else if ((input.ageDays ?? 0) >= 7) { score += 2; reasons.push("Open for over a week"); }

  // Status penalties
  if (input.status === "WAITING") { score -= 20; reasons.push("Waiting on someone else"); }
  if (input.status === "BLOCKED") { score -= 25; reasons.push("Blocked"); }
  if (input.status === "SCHEDULED") { score -= 8; reasons.push("Scheduled for later"); }
  if (input.status === "DONE" || input.status === "CANCELLED") {
    score = 0;
    reasons.length = 0;
    reasons.push("Closed");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, reasons };
}

export function priorityTier(score: number): { label: string; tone: "critical" | "high" | "medium" | "low" } {
  if (score >= 80) return { label: "Critical", tone: "critical" };
  if (score >= 60) return { label: "High", tone: "high" };
  if (score >= 40) return { label: "Medium", tone: "medium" };
  return { label: "Low", tone: "low" };
}
