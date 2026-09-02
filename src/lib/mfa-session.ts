// The short-lived marker between "password accepted" and "code accepted".
//
// It is a signed JWT rather than a plain cookie value, and it is a different
// shape from a session token: a distinct issuer and a `stage` claim, so a
// pending marker can never be mistaken for a session, and a session can never
// be replayed into the second step. Five minutes, because it exists only to
// carry someone from one form to the next.

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sessionSecret } from "./session";

const PENDING_COOKIE = "rauell_mfa_pending";
const PENDING_ISSUER = "rauell-os-mfa";
const PENDING_TTL_SECONDS = 300;

export interface PendingMfa {
  userId: string;
}

export async function startPendingMfa(userId: string): Promise<void> {
  const token = await new SignJWT({ stage: "mfa" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(PENDING_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${PENDING_TTL_SECONDS}s`)
    .sign(sessionSecret());
  (await cookies()).set(PENDING_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PENDING_TTL_SECONDS,
  });
}

export async function readPendingMfa(): Promise<PendingMfa | null> {
  const token = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { issuer: PENDING_ISSUER });
    if (payload.stage !== "mfa" || typeof payload.sub !== "string") return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

export async function clearPendingMfa(): Promise<void> {
  (await cookies()).delete(PENDING_COOKIE);
}
