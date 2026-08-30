import "dotenv/config";
import { ensureAutomationRules, runRule } from "../src/lib/automations/runner";
import { prisma } from "../src/lib/db";

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "roy@rauell.systems" } });
  await ensureAutomationRules(user.id);
  const rules = await prisma.automationRule.findMany({ where: { userId: user.id } });
  console.log("rules:", rules.map((r) => r.key).join(", "));
  for (const key of ["daily-brief", "deadline-scan", "followup-scan", "opportunity-rescore"]) {
    const rule = rules.find((r) => r.key === key)!;
    const result = await runRule(rule);
    console.log(key, "->", result.ok ? "OK" : "FAILED", "|", result.summary);
  }
  const runs = await prisma.automationRun.findMany({ where: { userId: user.id }, orderBy: { startedAt: "desc" }, take: 4 });
  console.log("runs recorded:", runs.map((r) => `${r.status}(${r.actionsCreated})`).join(", "));
  await prisma.$disconnect();
}
main();
