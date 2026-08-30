"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowISO, toJSON } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { providerMeta, syncIntegration, disconnectIntegration, buildAuthUrl, type Provider } from "@/lib/integrations";

export async function getIntegrationStatus() {
  const user = await requireUser();
  const db = await getDb();
  const rows = await db.query(`SELECT * FROM integrations WHERE user_id = ?`, [user.id]);
  const metas = providerMeta();
  return metas.map((m) => {
    const row = rows.find((r) => r.provider === m.key);
    return {
      ...m,
      status: row?.status || (m.configured ? "not_connected" : "unconfigured"),
      lastSynced: row?.last_synced || null,
      integrationId: row?.id || null,
    };
  });
}

export async function getAuthUrl(provider: Provider): Promise<{ url: string | null; configured: boolean }> {
  await requireUser();
  const meta = providerMeta().find((m) => m.key === provider);
  if (!meta?.configured) return { url: null, configured: false };
  const url = buildAuthUrl(provider, "rauell");
  return { url, configured: true };
}

export async function syncIntegrationAction(integrationId: string) {
  const user = await requireUser();
  const result = await syncIntegration(integrationId, user.id);
  revalidatePath("/integrations");
  return result;
}

export async function disconnectIntegrationAction(integrationId: string) {
  const user = await requireUser();
  await disconnectIntegration(integrationId, user.id);
  revalidatePath("/integrations");
}

export async function updateIntegrationPermissions(integrationId: string, permissions: Record<string, boolean>) {
  const user = await requireUser();
  const db = await getDb();
  await db.update("integrations", integrationId, { permissions_json: toJSON(permissions), updated_at: nowISO() });
  await logActivity(user.id, "integration_permissions", "Updated integration permissions", "integration", integrationId);
  revalidatePath("/integrations");
}
