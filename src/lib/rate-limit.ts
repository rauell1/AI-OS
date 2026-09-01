// Rate limiting for sign-in.
//
// One account exists and its address is a constant, so an attacker needs only
// the password. bcrypt makes each guess expensive but nothing made them
// *finite*: before this, sign-in could be attempted as fast as the platform
// would serve it.
//
// State lives in the database rather than in memory on purpose. Serverless
// functions do not share memory, so a per-instance counter resets every time
// the platform starts another lambda - which is exactly what sustained traffic
// causes. A shared store is the only kind that actually limits anything here.

import { getDb, runAsSystem } from "./db";
import { newId, nowISO } from "./utils";

/** Failures allowed from one caller inside the window before sign-in is refused. */
export const MAX_ATTEMPTS = 8;
/** How far back failures are counted, in minutes. */
export const WINDOW_MINUTES = 15;

export interface RateLimitResult {
  allowed: boolean;
  /** Failures already recorded for this caller inside the window. */
  recent: number;
  /** Minutes until the oldest counted failure falls out of the window. */
  retryInMinutes: number;
}

/**
 * Identifies the caller for rate-limiting purposes.
 *
 * `x-forwarded-for` is client-controlled in general, but on Vercel the platform
 * sets it and the leftmost entry is the connecting address. Behind Cloudflare
 * `cf-connecting-ip` is the more reliable one, so it is preferred. When neither
 * is present every caller shares one bucket, which fails towards limiting more
 * rather than less.
 */
export function callerKey(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

function windowStart(): string {
  return new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
}

/** Whether this caller may attempt a sign-in right now. */
export async function checkSignInAllowed(caller: string): Promise<RateLimitResult> {
  return runAsSystem(async () => {
    const db = await getDb();
    const since = windowStart();
    const rows = await db.query<{ attempted_at: string }>(
      `SELECT attempted_at FROM auth_attempts WHERE caller = ? AND attempted_at >= ? ORDER BY attempted_at ASC`,
      [caller, since]
    );
    const recent = rows.length;
    if (recent < MAX_ATTEMPTS) {
      return { allowed: true, recent, retryInMinutes: 0 };
    }
    const oldest = new Date(rows[0].attempted_at).getTime();
    const freeAt = oldest + WINDOW_MINUTES * 60_000;
    return {
      allowed: false,
      recent,
      retryInMinutes: Math.max(1, Math.ceil((freeAt - Date.now()) / 60_000)),
    };
  });
}

/** Records a failure. Also prunes rows that have aged out, so the table stays small. */
export async function recordFailedSignIn(caller: string): Promise<void> {
  await runAsSystem(async () => {
    const db = await getDb();
    await db.insert("auth_attempts", {
      id: newId("ath"),
      caller,
      attempted_at: nowISO(),
    });
    await db.run(`DELETE FROM auth_attempts WHERE attempted_at < ?`, [windowStart()]);
  });
}

/** Clears a caller's history after a successful sign-in. */
export async function clearSignInAttempts(caller: string): Promise<void> {
  await runAsSystem(async () => {
    const db = await getDb();
    await db.run(`DELETE FROM auth_attempts WHERE caller = ?`, [caller]);
  });
}
