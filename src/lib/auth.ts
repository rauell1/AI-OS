import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { getDb, runAsSystem } from "./db";
import { newId, nowISO } from "./utils";
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
  const token = await new SignJWT({ email: user.email, name: user.name, role: user.role })
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
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttl,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE)?.value;
  // Scope for RLS is resolved inside the database layer from this same
  // cookie, so nothing needs to be established here.
  return verifySession(token);
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

export async function findUserById(id: string) {
  return runAsSystem(async () => {
    const db = await getDb();
    return db.get(`SELECT * FROM users WHERE id = ?`, [id]);
  });
}

export async function userCount(): Promise<number> {
  return runAsSystem(async () => {
    const db = await getDb();
    const row = await db.get(`SELECT COUNT(*) AS c FROM users`);
    return (row?.c as number) || 0;
  });
}

export async function createUser(email: string, name: string, password: string) {
  // Registration creates the row that scoping would key on, so it must run as
  // system. The context also covers the userCount() lookup below.
  return runAsSystem(async () => {
  const db = await getDb();
  const count = await userCount();
  const id = newId("usr");
  await db.insert("users", {
    id,
    email: email.toLowerCase(),
    name,
    password_hash: hashPassword(password),
    role: count === 0 ? "owner" : "member",
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
