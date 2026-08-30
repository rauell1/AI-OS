import { prisma } from "@/lib/db";
import { complete } from "@/lib/ai/client";
import { aiEnabled } from "@/lib/env";
import { getPrompt } from "@/lib/ai/prompts";

export type WeeklyData = {
  rangeStart: string;
  rangeEnd: string;
  tasksCompleted: number;
  tasksCompletedTitles: string[];
  applicationsSubmitted: number;
  applicationsActive: number;
  opportunitiesDiscovered: number;
  scholarshipsDiscovered: number;
  leadsTouched: number;
  githubCommits: number;
  meetings: number;
  emailsNeedingResponse: number;
  overdueTasks: number;
  missedDeadlines: string[];
  upcomingWeek: { title: string; when: string }[];
};

export async function buildWeeklyData(userId: string, now = new Date()): Promise<WeeklyData> {
  const rangeEnd = now;
  const rangeStart = new Date(now.getTime() - 7 * 86400000);
  const nextWeek = new Date(now.getTime() + 7 * 86400000);

  const [tasksDone, appsSubmitted, appsActive, oppsNew, meets, overdue, ghRepos, followups] =
    await Promise.all([
      prisma.task.findMany({ where: { userId, status: "DONE", completedAt: { gte: rangeStart } }, select: { title: true } }),
      prisma.application.count({ where: { userId, submittedAt: { gte: rangeStart } } }),
      prisma.application.count({ where: { userId, status: { in: ["PREPARING", "SUBMITTED", "INTERVIEW", "ASSESSMENT", "READY_FOR_REVIEW", "READY_TO_SUBMIT"] } } }),
      prisma.opportunity.count({ where: { userId, createdAt: { gte: rangeStart } } }),
      prisma.calendarEvent.count({ where: { userId, startAt: { gte: rangeStart, lte: rangeEnd } } }),
      prisma.task.findMany({ where: { userId, status: { in: ["INBOX", "NEXT", "IN_PROGRESS"] }, dueAt: { lt: now } }, select: { title: true } }),
      prisma.projectRepository.findMany({ where: { project: { userId }, lastCommitAt: { gte: rangeStart } }, select: { fullName: true } }),
      prisma.followUp.count({ where: { userId, status: "OPEN" } }),
    ]);

  const oppsByType = await prisma.opportunity.groupBy({
    by: ["type"],
    where: { userId, createdAt: { gte: rangeStart } },
    _count: true,
  });
  const scholarshipCount = oppsByType
    .filter((o) => ["SCHOLARSHIP", "PROGRAMME", "FELLOWSHIP"].includes(o.type))
    .reduce((s, o) => s + o._count, 0);

  const upcoming = await prisma.opportunity.findMany({
    where: { userId, status: { in: ["NEW", "SHORTLISTED"] }, deadlineAt: { gte: now, lte: nextWeek } },
    select: { title: true, deadlineAt: true },
    take: 6,
  });
  const meetings = await prisma.calendarEvent.findMany({
    where: { userId, startAt: { gte: now, lte: nextWeek } },
    select: { title: true, startAt: true },
    take: 6,
  });

  const missed = await prisma.opportunity.findMany({
    where: { userId, status: { in: ["NEW", "SHORTLISTED"] }, deadlineAt: { lt: now } },
    select: { title: true },
  });

  return {
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    tasksCompleted: tasksDone.length,
    tasksCompletedTitles: tasksDone.slice(0, 8).map((t) => t.title),
    applicationsSubmitted: appsSubmitted,
    applicationsActive: appsActive,
    opportunitiesDiscovered: oppsNew,
    scholarshipsDiscovered: scholarshipCount,
    leadsTouched: followups,
    githubCommits: ghRepos.length,
    meetings: meets,
    emailsNeedingResponse: await prisma.emailMessage.count({ where: { userId, needsResponse: true, respondedAt: null } }),
    overdueTasks: overdue.length,
    missedDeadlines: missed.map((m) => m.title).slice(0, 4),
    upcomingWeek: [
      ...upcoming.map((u) => ({ title: u.title, when: u.deadlineAt?.toLocaleDateString("en-GB") ?? "" })),
      ...meetings.map((m) => ({ title: m.title, when: m.startAt.toLocaleDateString("en-GB") })),
    ].slice(0, 8),
  };
}

export async function buildWeeklyReview(
  userId: string,
  now = new Date()
): Promise<{ data: WeeklyData; narrative: string | null }> {
  const data = await buildWeeklyData(userId, now);
  let narrative: string | null = null;

  if (aiEnabled()) {
    try {
      const prompt = getPrompt("weekly-review");
      const res = await complete({
        role: "WRITING",
        purpose: "weekly-review",
        promptVersion: `weekly-review@${prompt.version}`,
        cacheSeconds: 3600,
        userId,
        messages: [
          { role: "system", content: prompt.template },
          { role: "user", content: JSON.stringify(data, null, 2) },
        ],
        temperature: 0.4,
        maxTokens: 700,
      });
      narrative = res.text;
    } catch {
      narrative = null; // deterministic sections still render
    }
  }
  return { data, narrative };
}
