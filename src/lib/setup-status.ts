// What a fresh account still needs before the rest of the system has anything
// to work with.
//
// Every screen here is driven by rows scoped to one user, so an account with no
// rows renders zeros everywhere - accurate, and indistinguishable from a broken
// deployment. This turns that state into a list of things to do.

import { getDb } from "./db";
import { aiEnabled, aiProviderStatus } from "./ai";
import { tokenEncryptionConfigured } from "./crypto";

export interface SetupStep {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  href?: string;
  /** True when only an environment variable can fix it, not a click in the UI. */
  configOnly?: boolean;
}

export interface SetupStatus {
  steps: SetupStep[];
  remaining: number;
  /** Rows the account owns across the tables the dashboard reads. */
  rowCount: number;
}

async function countFor(userId: string, tables: string[]): Promise<number> {
  const db = await getDb();
  let total = 0;
  for (const table of tables) {
    try {
      const row = await db.get<{ c: number }>(`SELECT COUNT(*) c FROM ${table} WHERE user_id = ?`, [userId]);
      total += Number(row?.c) || 0;
    } catch {
      // A table missing on an older schema should not break the checklist.
    }
  }
  return total;
}

export async function getSetupStatus(userId: string): Promise<SetupStatus> {
  const [profileRows, contentRows, integrationRows, automationRows] = await Promise.all([
    countFor(userId, ["profiles", "education", "employment", "skills"]),
    countFor(userId, ["projects", "opportunities", "applications", "tasks", "goals"]),
    countFor(userId, ["integrations"]),
    countFor(userId, ["automation_rules"]),
  ]);

  const providers = aiProviderStatus().filter((p) => p.configured);

  const steps: SetupStep[] = [
    {
      id: "profile",
      label: "Import your profile",
      detail: profileRows
        ? `${profileRows} profile record(s) on file.`
        : "Upload a LinkedIn export or a CV so scoring, matching and the CV engine have something to match against.",
      done: profileRows > 0,
      href: "/profile/import",
    },
    {
      id: "ai",
      label: "Configure an AI provider",
      detail: aiEnabled()
        ? `Configured: ${providers.map((p) => p.provider).join(", ")}.`
        : "The daily brief, opportunity scoring, chat and CV tailoring all degrade to nothing without a key. Set NVIDIA_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY.",
      done: aiEnabled(),
      configOnly: true,
    },
    {
      id: "tokens",
      label: "Set a token encryption key",
      detail: tokenEncryptionConfigured()
        ? "Integration tokens are encrypted with a configured key."
        : "Integrations cannot store tokens until TOKEN_ENCRYPTION_KEY is set. Generate one with: openssl rand -base64 32",
      done: tokenEncryptionConfigured(),
      configOnly: true,
    },
    {
      id: "integrations",
      label: "Connect Google or GitHub",
      detail: integrationRows
        ? `${integrationRows} integration(s) connected.`
        : "Email, calendar and repository activity are what fill the inbox and the daily brief on their own.",
      done: integrationRows > 0,
      href: "/integrations",
    },
    {
      id: "content",
      label: "Add your first project or opportunity",
      detail: contentRows
        ? `${contentRows} record(s) across projects, opportunities, applications and tasks.`
        : "Everything on the dashboard counts these. Add one by hand, or let an integration bring them in.",
      done: contentRows > 0,
      href: "/projects",
    },
    {
      id: "automations",
      label: "Schedule an automation",
      detail: automationRows
        ? `${automationRows} rule(s) scheduled.`
        : "A daily brief or opportunity sweep keeps the system working when you are not looking at it.",
      done: automationRows > 0,
      href: "/automations",
    },
  ];

  return {
    steps,
    remaining: steps.filter((s) => !s.done).length,
    rowCount: profileRows + contentRows + integrationRows + automationRows,
  };
}
