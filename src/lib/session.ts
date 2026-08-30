// Session token verification, with no database dependency.
//
// Split out of auth.ts so that db.ts can resolve the current user for Row
// Level Security without importing auth.ts, which imports db.ts in turn.

import { jwtVerify } from "jose";

export const SESSION_COOKIE = "rauell_session";
export const SESSION_ISSUER = "rauell-os";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

let secretWarned = false;

export function sessionSecret(): Uint8Array {
  const configured = process.env.AUTH_SECRET;
  if (!configured && process.env.NODE_ENV === "production" && !secretWarned) {
    secretWarned = true;
    // The fallback below is committed to this repository, so anyone who can
    // read it can mint a valid owner session cookie. Deployments must set
    // AUTH_SECRET to a long random string.
    console.error(
      "[rauell-os] SECURITY: AUTH_SECRET is not set. Session cookies are being signed " +
        "with the public development fallback, which allows anyone to forge an owner " +
        "session. Set AUTH_SECRET to a long random value immediately."
    );
  }
  return new TextEncoder().encode(configured || "dev-insecure-secret-change-me");
}

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { issuer: SESSION_ISSUER });
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: payload.email as string,
      name: payload.name as string,
      role: (payload.role as string) || "owner",
    };
  } catch {
    return null;
  }
}
