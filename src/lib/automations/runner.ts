import { prisma } from "@/lib/db";
import { RULES, getRule } from "./registry";
import { recordActivity } from "@/lib/activity";
import type { AutomationRule } from "@/generated/prisma/client";

/** Ensure every defined rule exists for the user (idempotent). */
export async function ensureAutomationRules(userId: string): Promise<void> {
  const existing = await prisma.automationRule.findMany({ where: { userId } });
  for (const def of RULES) {
    if (!existing.some((e) => e.key === def.key)) {
      const now = new Date();
      await prisma.automationRule.create({
        data: {
          userId,
          key: def.key,
          name: def.name,
          trigger: "SCHEDULE",
          schedule: def.schedule,
          mode: def.defaultMode,
          enabled: true,
          nextRunAt: def.nextRun(now),
        },
      });
    }
  }
}

/**
 * Run a single rule for a user. Records an AutomationRun with result or error.
 * The mode flows into the rule so AUTO_EXECUTE_SAFE rules can take safe
 * actions (create tasks/notifications) while sensitive ones always need
 * explicit approval through the Approval Center.
 */
export async function runRule(rule: AutomationRule): Promise<{ ok: boolean; summary: string }> {
  const def = getRule(rule.key);
  const run = await prisma.automationRun.create({
    data: { ruleId: rule.id, userId: rule.userId, status: "RUNNING" },
  });
  try {
    const result = await def.run(rule.userId, rule.mode);
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        result: result as never,
        actionsCreated: result.actionsCreated ?? 0,
      },
    });
    await prisma.automationRule.update({
      where: { id: rule.id },
      data: { lastRunAt: new Date(), nextRunAt: def.nextRun(new Date()) },
    });
    await recordActivity({
      userId: rule.userId,
      type: "AUTOMATION_RAN",
      actor: "AUTOMATION",
      summary: `${rule.name}: ${result.summary}`,
      refType: "AUTOMATION_RUN",
      refId: run.id,
    });
    return { ok: true, summary: result.summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.automationRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: message.slice(0, 500) },
    });
    return { ok: false, summary: message };
  }
}

/** Run all due rules across all users (cron entry point). */
export async function runDueRules(now = new Date()): Promise<{ ran: number; results: { rule: string; user: string; ok: boolean; summary: string }[] }> {
  const due = await prisma.automationRule.findMany({
    where: { enabled: true, OR: [{ nextRunAt: { lte: now } }, { nextRunAt: null, lastRunAt: null }] },
    take: 50,
  });
  const results: { rule: string; user: string; ok: boolean; summary: string }[] = [];
  for (const rule of due) {
    const r = await runRule(rule);
    results.push({ rule: rule.name, user: rule.userId, ok: r.ok, summary: r.summary });
  }
  return { ran: due.length, results };
}
