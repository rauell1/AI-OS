"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  clearSessionCookie,
  currentSessionEpoch,
  findUserByEmail,
  getCurrentUser,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { consumeRecoveryCode, mfaRequired, verifyMfaCode } from "@/lib/mfa";
import { clearPendingMfa, readPendingMfa, startPendingMfa } from "@/lib/mfa-session";
import { recordAudit } from "@/lib/activity";
import { runAsUser } from "@/lib/db";
import {
  callerKey,
  checkSignInAllowed,
  clearSignInAttempts,
  recordFailedSignIn,
  WINDOW_MINUTES,
} from "@/lib/rate-limit";
import { isOwnerEmail, maskEmail, normalizeEmail, ownerEmail, REGISTRATION_ENABLED } from "@/lib/auth-policy";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export interface LoginState {
  error?: string;
  /** The password was right; the browser should now ask for a code. */
  mfaRequired?: boolean;
}

export async function login(prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const email = normalizeEmail(parsed.data.email);

  // Checked before the password is verified, so a locked-out caller cannot use
  // the timing of a bcrypt comparison as an oracle either.
  const caller = callerKey(headers());
  const limit = await checkSignInAllowed(caller);
  if (!limit.allowed) {
    console.warn(
      `[rauell-os] Sign-in refused: ${limit.recent} failed attempts from this caller in the ` +
        `last ${WINDOW_MINUTES} minutes. Locked for another ${limit.retryInMinutes} minute(s).`
    );
    return { error: `Too many attempts. Try again in ${limit.retryInMinutes} minute(s).` };
  }

  // The browser deliberately gets one message for every failure, so it cannot
  // be used to discover whether an account exists. The three causes are very
  // different to fix, though, so the server records which one it was.
  if (!isOwnerEmail(email)) {
    console.warn(
      `[rauell-os] Sign-in rejected: ${maskEmail(email)} is not the owner ` +
        `(${maskEmail(ownerEmail())}). The address entered must match exactly.`
    );
    await recordFailedSignIn(caller);
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
    await recordFailedSignIn(caller);
    return { error: "Invalid email or password." };
  }
  if (!verifyPassword(parsed.data.password, user.password_hash)) {
    console.warn(
      `[rauell-os] Sign-in rejected: wrong password for ${maskEmail(email)}. ` +
        "The email and account matched, so only the password is wrong."
    );
    await recordFailedSignIn(caller);
    return { error: "Invalid email or password." };
  }
  // The password is right. If a second factor is enrolled, no session is issued
  // yet - only a short-lived, signed marker naming who is part-way through.
  if (await mfaRequired(user.id)) {
    await startPendingMfa(user.id);
    return { mfaRequired: true };
  }

  await clearSignInAttempts(caller);
  await setSessionCookie({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    epoch: await currentSessionEpoch(user.id),
  });
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

/**
 * The second step. Accepts a code from the authenticator or a recovery code.
 *
 * Rate limited separately and more tightly than the password step: six digits
 * is a million possibilities, which is only a real obstacle if the number of
 * guesses is small.
 */
export async function verifyMfa(prev: LoginState, formData: FormData): Promise<LoginState> {
  const pending = await readPendingMfa();
  if (!pending) {
    return { error: "That took too long. Enter your email and password again." };
  }

  const caller = `mfa:${callerKey(headers())}`;
  const limit = await checkSignInAllowed(caller);
  if (!limit.allowed) {
    console.warn(
      `[rauell-os] Second factor refused: ${limit.recent} failed attempts from this caller. ` +
        `Locked for another ${limit.retryInMinutes} minute(s).`
    );
    return { error: `Too many attempts. Try again in ${limit.retryInMinutes} minute(s).`, mfaRequired: true };
  }

  const submitted = String(formData.get("code") || "").trim();
  if (!submitted) return { error: "Enter the code from your authenticator.", mfaRequired: true };

  const check = await verifyMfaCode(pending.userId, submitted);
  let accepted = check === "ok";
  let usedRecoveryCode = false;

  if (!accepted && check !== "replayed") {
    // Recovery codes are longer than six digits, so this only runs for input
    // that was never a plausible authenticator code.
    accepted = await consumeRecoveryCode(pending.userId, submitted);
    usedRecoveryCode = accepted;
  }

  if (!accepted) {
    await recordFailedSignIn(caller);
    console.warn(
      `[rauell-os] Second factor rejected (${check}) for the owner. ` +
        (check === "replayed" ? "That code was already used." : "Code did not match.")
    );
    return {
      error: check === "replayed" ? "That code has already been used. Wait for the next one." : "That code is not right.",
      mfaRequired: true,
    };
  }

  const user = await findUserByEmail(ownerEmail());
  if (!user) {
    console.error("[rauell-os] Second factor passed but the owner row has gone.");
    return { error: "Something went wrong. Try again." };
  }

  if (usedRecoveryCode) {
    console.warn("[rauell-os] Signed in with a RECOVERY CODE. One fewer remains; issue new ones from Settings.");
  }
  await clearPendingMfa();
  await clearSignInAttempts(caller);
  await clearSignInAttempts(callerKey(headers()));
  await setSessionCookie({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    epoch: await currentSessionEpoch(user.id),
  });
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
