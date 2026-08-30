import { prisma } from "@/lib/db";
import env, { googleOAuthConfigured, githubConfigured, cronSecretConfigured, encryptionConfigured, aiEnabled } from "@/lib/env";

export type IntegrationStatusInfo = {
  provider: string;
  label: string;
  status: "NOT_CONFIGURED" | "CONNECTED" | "ERROR" | "DISCONNECTED";
  configured: boolean; // credentials exist at env level
  connected: boolean; // OAuth/token stored for this user
  lastSyncAt?: Date;
  detail: string;
  privacy: string;
};

export async function integrationsOverview(userId: string): Promise<IntegrationStatusInfo[]> {
  const rows = await prisma.integration.findMany({ where: { userId } });
  const get = (p: string) => rows.find((r) => r.provider === p);

  const gmail = get("GMAIL");
  const gcal = get("GCAL");
  const gdrive = get("GDRIVE");
  const github = get("GITHUB");

  return [
    {
      provider: "GMAIL",
      label: "Gmail",
      status: (gmail?.status ?? "NOT_CONFIGURED") as IntegrationStatusInfo["status"],
      configured: googleOAuthConfigured(),
      connected: gmail?.status === "CONNECTED",
      lastSyncAt: gmail?.lastSyncAt ?? undefined,
      detail: gmail?.status === "CONNECTED" ? "Connected via Google OAuth" : googleOAuthConfigured() ? "Credentials present; not yet authorized" : "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
      privacy: "Read-only by default. Sending requires an approved action in the Approval Center.",
    },
    {
      provider: "GCAL",
      label: "Google Calendar",
      status: (gcal?.status ?? "NOT_CONFIGURED") as IntegrationStatusInfo["status"],
      configured: googleOAuthConfigured(),
      connected: gcal?.status === "CONNECTED",
      lastSyncAt: gcal?.lastSyncAt ?? undefined,
      detail: gcal?.status === "CONNECTED" ? "Connected" : googleOAuthConfigured() ? "Credentials present; not yet authorized" : "Uses the same Google OAuth credentials",
      privacy: "Read-only. Creating external invitations requires approval.",
    },
    {
      provider: "GDRIVE",
      label: "Google Drive",
      status: (gdrive?.status ?? "NOT_CONFIGURED") as IntegrationStatusInfo["status"],
      configured: googleOAuthConfigured(),
      connected: gdrive?.status === "CONNECTED",
      lastSyncAt: gdrive?.lastSyncAt ?? undefined,
      detail: gdrive?.status === "CONNECTED" ? "Connected; select folders to index in config" : "No folders indexed until selected",
      privacy: "Read-only. Selected folders only.",
    },
    {
      provider: "GITHUB",
      label: "GitHub",
      status: (github?.status ?? "NOT_CONFIGURED") as IntegrationStatusInfo["status"],
      configured: githubConfigured(),
      connected: Boolean(env.GITHUB_TOKEN) || github?.status === "CONNECTED",
      lastSyncAt: github?.lastSyncAt ?? undefined,
      detail: env.GITHUB_TOKEN ? "Server token configured (GITHUB_TOKEN)" : "Set GITHUB_TOKEN or complete OAuth",
      privacy: "Read-only repositories, commits and issues. No write access in V1.",
    },
    {
      provider: "LOCAL_BRIDGE",
      label: "Rauell Local Bridge (future)",
      status: "NOT_CONFIGURED",
      configured: false,
      connected: false,
      detail: "Planned companion app for approved local folders. Not installed.",
      privacy: "Would index only explicitly approved folders. Never credential stores.",
    },
  ];
}

export function systemStatus() {
  return {
    ai: { enabled: aiEnabled(), provider: env.AI_PROVIDER, embeddings: Boolean(env.AI_EMBEDDING_MODEL && aiEnabled()) },
    googleOAuth: googleOAuthConfigured(),
    github: githubConfigured(),
    cron: cronSecretConfigured(),
    encryption: encryptionConfigured(),
  };
}
