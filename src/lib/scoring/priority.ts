import { daysUntil } from "@/lib/utils";

// Matches the free-text values actually written to tasks.status / tasks.source
// (see src/lib/schema.ts and src/app/actions/tasks.ts) - main has no DB enums.
export type TaskStatus = "inbox" | "next" | "in_progress" | "waiting" | "blocked" | "scheduled" | "done" | "cancelled";
export type TaskSource =
  | "manual" | "email" | "calendar" | "application" | "scholarship_deadline" | "job_application"
  | "lead_followup" | "github" | "project" | "ai_recommendation" | "document" | "meeting" | "automation";

export type PriorityInput = {
  title: string;
  status: TaskStatus;
  source: TaskSource;
  dueAt?: string | null;
  effortMin?: number | null;
  goalId?: string | null;
  applicationId?: string | null;
  personId?: string | null;
  leadId?: string | null;
  blocksCount?: number; // number of tasks depending on this one
  ageDays?: number; // time since creation
  applicationDeadline?: string | null;
};

export type PriorityResult = { score: number; reasons: string[] };

/**
 * Transparent task priority model. Every point is attributable to a stated
 * reason so the reason is always visible, and overriding status feeds back
 * into the score.
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
    scholarship_deadline: [14, "Scholarship deadline"],
    application: [12, "Application requirement"],
    job_application: [11, "Job application step"],
    lead_followup: [9, "Lead follow-up"],
    email: [7, "From email"],
    meeting: [6, "From meeting"],
    automation: [4, "Automation suggestion"],
    ai_recommendation: [4, "AI recommendation"],
    project: [5, "Project work"],
    github: [3, "GitHub activity"],
    document: [3, "Document task"],
    calendar: [5, "Calendar prep"],
  };
  const sw = sourceWeights[input.source];
  if (sw) { score += sw[0]; reasons.push(sw[1]); }

  // Strategic links (up to +12)
  if (input.goalId) { score += 6; reasons.push("Linked to a goal"); }
  if (input.applicationId) { score += 6; reasons.push("Linked to an application"); }
  if (input.leadId) { score += 4; reasons.push("Linked to a lead"); }
  if (input.personId) { score += 2; reasons.push("Involves another person"); }

  // Linked application deadline urgency
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
  if (input.status === "waiting") { score -= 20; reasons.push("Waiting on someone else"); }
  if (input.status === "blocked") { score -= 25; reasons.push("Blocked"); }
  if (input.status === "scheduled") { score -= 8; reasons.push("Scheduled for later"); }
  if (input.status === "done" || input.status === "cancelled") {
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
