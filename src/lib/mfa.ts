// Second factor: enrolment, verification and recovery codes.
//
// Why this exists: one account, one password, and an address that is a constant
// in the source. Rate limiting makes guessing slow; it does nothing about a
// password that leaks somewhere else. A second factor is the only measure that
// survives the password being known.

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { getDb, runAsSystem, runAsUser } from "./db";
import { decrypt, encrypt } from "./crypto";
import { newId, nowISO } from "./utils";
import { TOTP_STEP_SECONDS, generateSecret, otpauthUri, verifyTotp } from "./totp";

export const RECOVERY_CODE_COUNT = 10;

export interface MfaStatus {
  enrolled: boolean;
  /** Enrolment is only complete once a code from the app has been accepted. */
  confirmed: boolean;
  recoveryCodesRemaining: number;
}

interface MfaRow {
  user_id: string;
  secret_encrypted: string;
  confirmed_at: string | null;
  last_used_step: string | null;
}

async function readRow(userId: string): Promise<MfaRow | undefined> {
  const db = await getDb();
  return db.get<MfaRow>(`SELECT * FROM user_mfa WHERE user_id = ?`, [userId]);
}

export async function getMfaStatus(userId: string): Promise<MfaStatus> {
  return runAsUser(userId, async () => {
    const db = await getDb();
    const row = await readRow(userId);
    const remaining = await db.get<{ c: number }>(
      `SELECT COUNT(*) c FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL`,
      [userId]
    );
    return {
      enrolled: Boolean(row),
      confirmed: Boolean(row?.confirmed_at),
      recoveryCodesRemaining: Number(remaining?.c) || 0,
    };
  });
}

/** True when sign-in must ask for a second factor. Runs before the session exists. */
export async function mfaRequired(userId: string): Promise<boolean> {
  return runAsSystem(async () => {
    const db = await getDb();
    const row = await db.get<MfaRow>(`SELECT confirmed_at FROM user_mfa WHERE user_id = ?`, [userId]);
    return Boolean(row?.confirmed_at);
  });
}

export interface EnrolmentOffer {
  secret: string;
  uri: string;
}

/**
 * Starts enrolment, replacing any unconfirmed attempt.
 *
 * A confirmed enrolment is never silently replaced: overwriting it would let
 * anyone with a live session quietly swap the second factor for their own.
 */
export async function beginEnrolment(userId: string, account: string): Promise<EnrolmentOffer> {
  return runAsUser(userId, async () => {
    const db = await getDb();
    const existing = await readRow(userId);
    if (existing?.confirmed_at) {
      throw new Error("Two-factor authentication is already enabled. Turn it off before enrolling again.");
    }
    const secret = generateSecret();
    if (existing) await db.run(`DELETE FROM user_mfa WHERE user_id = ?`, [userId]);
    await db.insert("user_mfa", {
      user_id: userId,
      secret_encrypted: encrypt(secret),
      confirmed_at: null,
      last_used_step: null,
      created_at: nowISO(),
    });
    return { secret, uri: otpauthUri(secret, account) };
  });
}

/**
 * Completes enrolment by proving the app produces matching codes, and issues
 * the recovery codes. They are returned once and stored only as hashes.
 */
export async function confirmEnrolment(userId: string, code: string): Promise<string[]> {
  return runAsUser(userId, async () => {
    const db = await getDb();
    const row = await readRow(userId);
    if (!row) throw new Error("Start enrolment before confirming it.");
    if (row.confirmed_at) throw new Error("Two-factor authentication is already enabled.");
    if (!verifyTotp(decrypt(row.secret_encrypted), code)) {
      throw new Error("That code is not right. Check your authenticator and try again.");
    }
    await db.run(`UPDATE user_mfa SET confirmed_at = ?, last_used_step = ? WHERE user_id = ?`, [
      nowISO(),
      currentStep(),
      userId,
    ]);
    return regenerateRecoveryCodes(userId);
  });
}

function currentStep(): string {
  return String(Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS));
}

export type MfaCheck = "ok" | "invalid" | "replayed" | "not-enrolled";

/**
 * Verifies a code at sign-in. Runs in system context: there is no session yet.
 *
 * A correct code is accepted only once. Without that, a code observed over a
 * shoulder or lifted from a phishing page stays usable for its whole window.
 */
export async function verifyMfaCode(userId: string, submitted: string): Promise<MfaCheck> {
  return runAsSystem(async () => {
    const db = await getDb();
    const row = await db.get<MfaRow>(`SELECT * FROM user_mfa WHERE user_id = ?`, [userId]);
    if (!row?.confirmed_at) return "not-enrolled";
    if (!verifyTotp(decrypt(row.secret_encrypted), submitted)) return "invalid";
    const step = currentStep();
    if (row.last_used_step === step) return "replayed";
    await db.run(`UPDATE user_mfa SET last_used_step = ? WHERE user_id = ?`, [step, userId]);
    return "ok";
  });
}

/** Consumes a recovery code. Each works once. */
export async function consumeRecoveryCode(userId: string, submitted: string): Promise<boolean> {
  const normalized = submitted.replace(/[\s-]/g, "").toUpperCase();
  if (normalized.length < 8) return false;
  return runAsSystem(async () => {
    const db = await getDb();
    const rows = await db.query<{ id: string; code_hash: string }>(
      `SELECT id, code_hash FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL`,
      [userId]
    );
    for (const row of rows) {
      if (bcrypt.compareSync(normalized, row.code_hash)) {
        await db.run(`UPDATE mfa_recovery_codes SET used_at = ? WHERE id = ?`, [nowISO(), row.id]);
        return true;
      }
    }
    return false;
  });
}

/** Fresh recovery codes, invalidating any that came before. Shown once. */
export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const db = await getDb();
  await db.run(`DELETE FROM mfa_recovery_codes WHERE user_id = ?`, [userId]);
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const code = readableCode();
    codes.push(code);
    await db.insert("mfa_recovery_codes", {
      id: newId("rec"),
      user_id: userId,
      code_hash: bcrypt.hashSync(code.replace(/-/g, ""), 10),
      used_at: null,
      created_at: nowISO(),
    });
  }
  return codes;
}

/**
 * Ten characters from an alphabet with no 0/O/1/I/L, grouped for transcription.
 * These get written on paper; the ambiguous glyphs are where that goes wrong.
 */
function readableCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += alphabet[randomInt(alphabet.length)];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

/** Turns the second factor off, requiring a current code to do it. */
export async function disableMfa(userId: string, code: string): Promise<void> {
  await runAsUser(userId, async () => {
    const db = await getDb();
    const row = await readRow(userId);
    if (!row?.confirmed_at) throw new Error("Two-factor authentication is not enabled.");
    const validTotp = verifyTotp(decrypt(row.secret_encrypted), code);
    if (!validTotp && !(await consumeRecoveryCode(userId, code))) {
      throw new Error("That code is not right. Two-factor authentication is still on.");
    }
    await db.run(`DELETE FROM mfa_recovery_codes WHERE user_id = ?`, [userId]);
    await db.run(`DELETE FROM user_mfa WHERE user_id = ?`, [userId]);
  });
}
