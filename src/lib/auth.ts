import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { getDb, runAsSystem } from "./db";
import { newId, nowISO } from "./utils";
import { isOwnerEmail, maskEmail, ownerEmail } from "./auth-policy";
import {
  SESSION_COOKIE as COOKIE,
  SESSION_ISSUER as ISSUER,
  sessionSecret as secret,
  verifySession,
  type SessionUser,
} from "./session";

export { verifySession };
export type { SessionUser };


export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}

export async function createSession(user: SessionUser): Promise<string> {
  const ttl = parseInt(process.env.SESSION_TTL || "2592000", 10);
  const token = await new SignJWT({ email: user.email, name: user.name, role: user.role, epoch: user.epoch })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(secret());
  return token;
}

export async function setSessionCookie(user: SessionUser) {
  const token = await createSession(user);
  const ttl = parseInt(process.env.SESSION_TTL || "2592000", 10);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttl,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

/**
 * The signed-in user, or null.
 *
 * verifySession checks the token is structurally valid; this also checks it is
 * still *current* against the account's session epoch, which is what makes
 * "sign out everywhere" work. That check needs the database, so it lives here
 * rather than in verifySession - which runs in edge middleware and inside the
 * data layer's own scope resolution, where a query would recurse.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  const user = await verifySession(token);
  if (!user) return null;
  if (!(await sessionIsCurrent(user))) return null;
  return user;
}

/** Whether a token's epoch still matches the account's. */
export async function sessionIsCurrent(user: SessionUser): Promise<boolean> {
  try {
    const current = await runAsSystem(async () => {
      const db = await getDb();
      const row = await db.get<{ session_epoch: number }>(
        `SELECT session_epoch FROM users WHERE id = ?`,
        [user.id]
      );
      return row ? Number(row.session_epoch) || 0 : null;
    });
    // No row means the account is gone; refuse rather than assume.
    if (current === null) return false;
    return current === user.epoch;
  } catch (err: any) {
    // A database blip must not silently sign the owner out of their own OS, and
    // the token is already cryptographically valid at this point.
    console.error(
      `[rauell-os] Could not check the session epoch: ${err?.message || err}. ` +
        "Accepting the token on its signature alone."
    );
    return true;
  }
}

/** The account's current session generation, for minting a new token. */
export async function currentSessionEpoch(userId: string): Promise<number> {
  return runAsSystem(async () => {
    const db = await getDb();
    const row = await db.get<{ session_epoch: number }>(`SELECT session_epoch FROM users WHERE id = ?`, [userId]);
    return Number(row?.session_epoch) || 0;
  });
}

/**
 * Invalidates every existing session for the account, including this one.
 * The only way to revoke a stolen token short of rotating AUTH_SECRET.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  await runAsSystem(async () => {
    const db = await getDb();
    await db.run(`UPDATE users SET session_epoch = COALESCE(session_epoch, 0) + 1 WHERE id = ?`, [userId]);
  });
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

// ---- Account creation / lookup --------------------------------------------

export async function findUserByEmail(email: string) {
  // Runs before sign-in, so there is no user scope yet.
  return runAsSystem(async () => {
    const db = await getDb();
    return db.get(`SELECT * FROM users WHERE email = ?`, [email.toLowerCase()]);
  });
}

export async function userCount(): Promise<number> {
  return runAsSystem(async () => {
    const db = await getDb();
    const row = await db.get(`SELECT COUNT(*) AS c FROM users`);
    return (row?.c as number) || 0;
  });
}

/**
 * Creates the owner account.
 *
 * This application has exactly one account, by design: sign-in is gated to
 * OWNER_EMAIL and row level security scopes every row to one user id. A second
 * account cannot sign in, cannot be reached, and only creates a way for the
 * wrong id to be picked up somewhere - so this refuses to make one rather than
 * quietly assigning it a "member" role that nothing honours.
 */
export async function createUser(email: string, name: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (!isOwnerEmail(normalized)) {
    console.error(
      `[rauell-os] Refused to create an account for ${maskEmail(normalized)}: ` +
        `it is not the owner address. Only ${maskEmail(ownerEmail())} may have an account.`
    );
    throw new Error("Only the owner address may have an account.");
  }
  return runAsSystem(async () => {
    const db = await getDb();
    const existing = await db.get<{ id: string }>(`SELECT id FROM users WHERE email = ?`, [normalized]);
    if (existing) return existing.id;
    const id = newId("usr");
    await db.insert("users", {
      id,
      email: normalized,
      name,
      password_hash: hashPassword(password),
      role: "owner",
      timezone: "Africa/Nairobi",
      settings_json: "{}",
      created_at: nowISO(),
    });
    return id;
  });
}

// ---- Middleware helpers (edge-safe, no DB) --------------------------------
export async function sessionFromRequest(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(COOKIE)?.value;
  return verifySession(token);
}

export function redirectToLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}
