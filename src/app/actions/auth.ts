"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { findUserByEmail, verifyPassword, createUser, setSessionCookie, clearSessionCookie, getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/activity";

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
  const user = await findUserByEmail(parsed.data.email);
  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    return { error: "Invalid email or password." };
  }
  await setSessionCookie({ id: user.id, email: user.email, name: user.name, role: user.role });
  await recordAudit(user.id, "auth_login");
  redirect("/");
}

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function register(prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Name, valid email and an 8+ character password are required." };
  const existing = await findUserByEmail(parsed.data.email);
  if (existing) return { error: "An account with that email already exists. Please sign in." };
  const id = await createUser(parsed.data.email, parsed.data.name, parsed.data.password);
  await setSessionCookie({ id, email: parsed.data.email, name: parsed.data.name, role: "owner" });
  await recordAudit(id, "auth_register");
  redirect("/");
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
