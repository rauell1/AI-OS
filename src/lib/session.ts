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

import { cache } from "react";

export const verifySession = cache(async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { issuer: SESSION_ISSUER });
    if (!payload.sub || typeof payload.email !== "string" || !isOwnerEmail(payload.email)) return null;
    return {
      id: payload.sub,
      email: payload.email as string,
      name: payload.name as string,
      role: (payload.role as string) || "owner",
    };
  } catch {
    return null;
  }
});
