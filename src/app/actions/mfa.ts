"use server";

import { revalidatePath } from "next/cache";
import { requireUser, revokeAllSessions } from "@/lib/auth";
import { beginEnrolment, confirmEnrolment, disableMfa, getMfaStatus, regenerateRecoveryCodes } from "@/lib/mfa";
import { runAsUser } from "@/lib/db";
import { formatSecretForDisplay } from "@/lib/totp";

export interface MfaActionState {
  error?: string;
  notice?: string;
  /** Shown once, at enrolment: the secret to type into the authenticator. */
  secret?: string;
  uri?: string;
  /** Shown once, after confirming: the recovery codes. */
  recoveryCodes?: string[];
}

export async function startMfaEnrolment(): Promise<MfaActionState> {
  const user = await requireUser();
  try {
    const offer = await beginEnrolment(user.id, user.email);
    return { secret: formatSecretForDisplay(offer.secret), uri: offer.uri };
  } catch (err: any) {
    return { error: err?.message || "Could not start enrolment." };
  }
}

export async function confirmMfaEnrolment(_prev: MfaActionState, formData: FormData): Promise<MfaActionState> {
  const user = await requireUser();
  const code = String(formData.get("code") || "").trim();
  try {
    const recoveryCodes = await confirmEnrolment(user.id, code);
    revalidatePath("/settings/security");
    return {
      notice: "Two-factor authentication is on. Save these recovery codes now — they are not shown again.",
      recoveryCodes,
    };
  } catch (err: any) {
    return { error: err?.message || "Could not confirm enrolment." };
  }
}

export async function disableMfaAction(_prev: MfaActionState, formData: FormData): Promise<MfaActionState> {
  const user = await requireUser();
  const code = String(formData.get("code") || "").trim();
  try {
    await disableMfa(user.id, code);
    revalidatePath("/settings/security");
    return { notice: "Two-factor authentication is off. Your password is now the only thing protecting this account." };
  } catch (err: any) {
    return { error: err?.message || "Could not turn it off." };
  }
}

export async function regenerateCodesAction(): Promise<MfaActionState> {
  const user = await requireUser();
  const status = await getMfaStatus(user.id);
  if (!status.confirmed) return { error: "Enable two-factor authentication first." };
  const codes = await runAsUser(user.id, () => regenerateRecoveryCodes(user.id));
  revalidatePath("/settings/security");
  return {
    notice: "New recovery codes issued. The previous set no longer works.",
    recoveryCodes: codes,
  };
}

export async function signOutEverywhereAction(): Promise<MfaActionState> {
  const user = await requireUser();
  await revokeAllSessions(user.id);
  // Including this one: the epoch bump makes this browser's token stale like
  // all the others, and the root layout turns that into a redirect to /login on
  // the next navigation.
  //
  // Deliberately does NOT clear this browser's cookie as well. That looks
  // tidier and breaks the page: the cookie would be gone for the re-render
  // Next performs as part of this very action, so the layout would redirect
  // mid-action, the render fails, and the client router is left showing a
  // stale shell under a /login URL. The token being dead is what matters, not
  // whether the browser is still carrying it.
  return { notice: "Every session has been signed out, including this one." };
}
