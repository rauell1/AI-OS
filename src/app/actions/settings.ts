"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { nowISO, toJSON, parseJSON } from "@/lib/utils";
import { logActivity } from "@/lib/activity";

export async function updatePreference(key: string, value: string) {
  const user = await requireUser();
  const db = await getDb();
  const existing = await db.get(`SELECT * FROM user_preferences WHERE user_id = ?`, [user.id]);
  let prefs: Record<string, any> = {};
  if (existing) prefs = parseJSON(existing.prefs_json, {});
  prefs[key] = value;
  if (existing) await db.update("user_preferences", user.id, { prefs_json: toJSON(prefs), updated_at: nowISO() });
  else await db.insert("user_preferences", { user_id: user.id, prefs_json: toJSON(prefs), created_at: nowISO(), updated_at: nowISO() });
  await logActivity(user.id, "preference_updated", `Updated preference: ${key}`, "preference", key);
  revalidatePath("/settings");
  return { ok: true };
}
