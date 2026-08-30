import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { getDb } from "./db";
import { newId, nowISO } from "./utils";

const COOKIE = "rauell_session";
const ISSUER = "rauell-os";

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET || "dev-insecure-secret-change-me";
  return new TextEncoder().encode(s);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

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

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER });
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
  return verifySession(token);
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

// ---- Account creation / lookup --------------------------------------------

export async function findUserByEmail(email: string) {
  const db = await getDb();
  return db.get(`SELECT * FROM users WHERE email = ?`, [email.toLowerCase()]);
}

export async function findUserById(id: string) {
  const db = await getDb();
  return db.get(`SELECT * FROM users WHERE id = ?`, [id]);
}

export async function userCount(): Promise<number> {
  const db = await getDb();
  const row = await db.get(`SELECT COUNT(*) AS c FROM users`);
  return (row?.c as number) || 0;
}

export async function createUser(email: string, name: string, password: string) {
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
