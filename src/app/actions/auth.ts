"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { findUserByEmail, verifyPassword, setSessionCookie, clearSessionCookie, getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/activity";
import { isOwnerEmail, normalizeEmail, REGISTRATION_ENABLED } from "@/lib/auth-policy";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const email = normalizeEmail(parsed.data.email);
  if (!isOwnerEmail(email)) return { error: "Invalid email or password." };
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    return { error: "Invalid email or password." };
  }
  await setSessionCookie({ id: user.id, email: user.email, name: user.name, role: user.role });
  await recordAudit(user.id, "auth_login");
  redirect("/");
}

export async function register(_prev: { error?: string }, _formData: FormData): Promise<{ error?: string }> {
  // Retained as a fail-closed server action so stale browser bundles or direct
  // action requests can never create an account.
  if (!REGISTRATION_ENABLED) {
    return { error: "Registration is permanently disabled for this private application." };
  }
  return { error: "Registration is unavailable." };
}

export async function logout() {
  clearSessionCookie();
  redirect("/login");
}

export async function ensureProfile(): Promise<{ needsSetup: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { needsSetup: true };
  return { needsSetup: false };
}
