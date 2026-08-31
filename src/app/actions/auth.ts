"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { findUserByEmail, verifyPassword, setSessionCookie, clearSessionCookie, getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/activity";
import { runAsUser } from "@/lib/db";
import { isOwnerEmail, maskEmail, normalizeEmail, ownerEmail, REGISTRATION_ENABLED } from "@/lib/auth-policy";

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

  // The browser deliberately gets one message for every failure, so it cannot
  // be used to discover whether an account exists. The three causes are very
  // different to fix, though, so the server records which one it was.
  if (!isOwnerEmail(email)) {
    const configured = ownerEmail();
    console.warn(
      `[rauell-os] Sign-in rejected: ${maskEmail(email)} is not the owner. ` +
        (configured
          ? `OWNER_EMAIL is ${maskEmail(configured)} - the address entered must match it exactly.`
          : "OWNER_EMAIL is not set, so no address can match.")
    );
    return { error: "Invalid email or password." };
  }

  const user = await findUserByEmail(email);
  if (!user) {
    // OWNER_EMAIL names an account the database does not have. Registration is
    // permanently disabled, so this cannot be resolved through the UI: either
    // OWNER_EMAIL or the users row has to change.
    console.error(
      `[rauell-os] Sign-in rejected: ${maskEmail(email)} is the configured owner, ` +
        "but no user row has that email. OWNER_EMAIL and the account in the " +
        "database disagree; make them match."
    );
    return { error: "Invalid email or password." };
  }
  if (!verifyPassword(parsed.data.password, user.password_hash)) {
    console.warn(
      `[rauell-os] Sign-in rejected: wrong password for ${maskEmail(email)}. ` +
        "The email and account matched, so only the password is wrong."
    );
    return { error: "Invalid email or password." };
  }
  await setSessionCookie({ id: user.id, email: user.email, name: user.name, role: user.role });
  // Scope explicitly. This runs mid-sign-in, in the same request that just set
  // the session cookie, so the data layer cannot be relied on to re-derive the
  // user from that cookie - and an audit row must never be what stops someone
  // signing in.
  try {
    await runAsUser(user.id, () => recordAudit(user.id, "auth_login"));
  } catch (err: any) {
    console.error(`[rauell-os] Could not record the sign-in audit entry: ${err?.message || err}. Signing in anyway.`);
  }
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
