"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { newId, nowISO, parseJSON, toJSON, daysUntil, isoDaysFromNow } from "@/lib/utils";
import { logActivity, notify } from "@/lib/activity";
import { getDailyBrief } from "@/lib/brief";

function nextRunFor(frequency: string): string {
  const now = Date.now();
  const map: Record<string, number> = { hourly: 3600_000, daily: 86400_000, weekly: 604800_000, monthly: 2592000000 };
  return new Date(now + (map[frequency] || 86400_000)).toISOString();
}

export async function createRule(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Rule name is required." };
  const db = await getDb();
  const frequency = String(formData.get("frequency") || "daily");
  const id = newId("rul");
  await db.insert("automation_rules", {
    id, user_id: user.id, name,
    trigger: String(formData.get("trigger") || "daily_brief"),
    frequency,
    status: "active",
    config_json: toJSON({ note: String(formData.get("note") || "") }),
    last_run: null,
    next_run: nextRunFor(frequency),
    created_at: nowISO(),
    updated_at: nowISO(),
  });
  await logActivity(user.id, "automation_created", `Created automation: ${name}`, "automation", id);
  revalidatePath("/automations");
  return { ok: true, id };
}

export async function toggleRule(id: string, status: "active" | "paused") {
  const user = await requireUser();
  const db = await getDb();
  await db.update("automation_rules", id, { status, updated_at: nowISO() });
  revalidatePath("/automations");
}

export async function executeRule(
  ruleId: string,
  actingUserId?: string
): Promise<{ actions: number; result: string }> {
  const db = await getDb();
  const rule = await db.get(`SELECT * FROM automation_rules WHERE id = ?`, [ruleId]);
  if (!rule) return { actions: 0, result: "not found" };
  // The scheduled run has no session cookie, so the owner is passed in.
  // requireUser() would throw UNAUTHENTICATED and fail every nightly run.
  const user = actingUserId ? { id: actingUserId } : await requireUser();
  const runId = newId("arn");
  await db.insert("automation_runs", {
    id: runId, rule_id: ruleId, started_at: nowISO(), finished_at: null, status: "running",
    result_json: "{}", errors_json: "[]", actions_created: 0, created_at: nowISO(),
  });
  let actions = 0;
  let result = "";
  try {
    if (rule.trigger === "daily_brief") {
      const brief = await getDailyBrief(user.id);
      await notify(user.id, "automation", "Your daily brief is ready", brief.focus[0] || "Open Rauell OS for your briefing.", "brief", null);
      result = `${brief.focus.length} focus points generated.`;
      actions = 1;
    } else if (rule.trigger === "deadline_alerts") {
      const due = await db.query(
        `SELECT title, deadline FROM applications WHERE user_id = ? AND deadline IS NOT NULL AND deadline <= ? AND status NOT IN ('submitted','offer','rejected','withdrawn','archived')
         UNION ALL
         SELECT title, deadline FROM opportunities WHERE user_id = ? AND deadline IS NOT NULL AND deadline <= ?`,
        [user.id, isoDaysFromNow(7), user.id, isoDaysFromNow(7)]
      );
      for (const d of due) {
        const days = daysUntil(d.deadline);
        await notify(user.id, "deadline", `Deadline${days != null ? ` in ${days}d` : ""}: ${d.title}`, `Due ${d.deadline}`, "deadline", null);
        actions++;
      }
      result = `${actions} deadline alert(s).`;
    } else if (rule.trigger === "followup_reminders") {
      const due = await db.query(
        `SELECT id, note, due_date FROM followups WHERE user_id = ? AND status = 'pending' AND due_date <= ?`,
        [user.id, isoDaysFromNow(7)]
      );
      for (const f of due) {
        await notify(user.id, "followup", "Follow-up due", f.note || "A follow-up is due.", "followup", f.id);
        actions++;
      }
      result = `${actions} follow-up reminder(s).`;
    } else if (rule.trigger === "web_scraper") {
      // Lazy load to avoid module cycles or massive cold starts
      const { researchOpportunities } = await import("@/lib/agents/researcher");
      await researchOpportunities(user.id);
      result = "Web scraper ran successfully.";
      actions = 1;
    } else {
      result = "Trigger executed (no specific action).";
      actions = 0;
    }
    await db.update("automation_runs", runId, { status: "success", finished_at: nowISO(), actions_created: actions, result_json: toJSON({ result }) });
    await db.update("automation_rules", ruleId, { last_run: nowISO(), next_run: nextRunFor(rule.frequency), updated_at: nowISO() });
  } catch (e: any) {
    await db.update("automation_runs", runId, { status: "error", finished_at: nowISO(), errors_json: toJSON([e?.message || "error"]) });
    result = e?.message || "error";
  }
  return { actions, result };
}

export async function runRuleById(id: string) {
  await executeRule(id);
  revalidatePath("/automations");
  return { ok: true };
}

export async function runDailyBriefNow() {
  const user = await requireUser();
  const db = await getDb();
  let rule = await db.get(`SELECT id FROM automation_rules WHERE user_id = ? AND trigger = 'daily_brief'`, [user.id]);
  if (!rule) {
    const id = newId("rul");
    await db.insert("automation_rules", {
      id, user_id: user.id, name: "Daily Brief", trigger: "daily_brief", frequency: "daily", status: "active",
      config_json: "{}", last_run: null, next_run: nextRunFor("daily"), created_at: nowISO(), updated_at: nowISO(),
    });
    rule = { id };
  }
  await executeRule(rule.id);
  revalidatePath("/");
  revalidatePath("/activity");
  return { ok: true };
}

export async function runAllDue(userId: string) {
  const db = await getDb();
  const rules = await db.query(`SELECT id FROM automation_rules WHERE user_id = ? AND status = 'active' AND (next_run IS NULL OR next_run <= ?)`, [userId, nowISO()]);
  for (const r of rules) await executeRule(r.id, userId);
  return { ran: rules.length };
}

export async function createGoal(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Goal title is required." };
  const db = await getDb();
  await db.insert("goals", {
    id: newId("goal"), user_id: user.id, title,
    description: String(formData.get("description") || "") || null,
    status: "active", linked_json: "[]", created_at: nowISO(),
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function createGoalForm(fd: FormData): Promise<void> {
  await createGoal(fd);
}
