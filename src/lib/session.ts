// Session token verification, with no database dependency.
//
// Split out of auth.ts so that db.ts can resolve the current user for Row
// Level Security without importing auth.ts, which imports db.ts in turn.

import { jwtVerify } from "jose";
import { isOwnerEmail } from "./auth-policy";

export const SESSION_COOKIE = "rauell_session";
export const SESSION_ISSUER = "rauell-os";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  /**
   * The account's session generation at the time this token was issued.
   * "Sign out everywhere" increments the stored value, which leaves every token
   * carrying an older number structurally valid but no longer current.
   */
  epoch: number;
}

let secretWarned = false;

export function sessionSecret(): Uint8Array {
  const configured = process.env.AUTH_SECRET;
  if (!configured && process.env.NODE_ENV === "production") {
    if (!secretWarned) {
      secretWarned = true;
      console.error(
        "[rauell-os] SECURITY: AUTH_SECRET is not set. Production authentication " +
          "is disabled until a long, stable AUTH_SECRET is configured."
      );
    }
    throw new Error("AUTH_SECRET is required in production; authentication is disabled until it is configured.");
  }
  return new TextEncoder().encode(configured || "dev-insecure-secret-change-me");
}

const sessionCache = new Map<string, SessionUser | null>();

/**
 * Structural check only: signature, issuer, expiry and owner address.
 *
 * Deliberately does not touch the database. It runs in edge middleware, which
 * has no database access, and inside the data layer's own scope resolution -
 * where a query here would recurse. Whether the session is still *current* is
 * checked in getCurrentUser, which runs on the server with a database.
 */
export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  if (sessionCache.has(token)) return sessionCache.get(token)!;
  
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { issuer: SESSION_ISSUER });
    if (!payload.sub || typeof payload.email !== "string" || !isOwnerEmail(payload.email)) {
      sessionCache.set(token, null);
      return null;
    }
    const user = {
      id: payload.sub,
      email: payload.email as string,
      name: payload.name as string,
      role: (payload.role as string) || "owner",
      epoch: typeof payload.epoch === "number" ? payload.epoch : 0,
    };
    sessionCache.set(token, user);
    return user;
  } catch {
    sessionCache.set(token, null);
    return null;
  }
}
