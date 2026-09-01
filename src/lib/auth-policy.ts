/**
 * The only identity allowed to access this personal OS.
 *
 * The owner address is a constant, not configuration. This application belongs
 * to one person, and an environment variable is one deploy-time typo away from
 * either locking that person out or admitting somebody else. A second identity
 * once reached the dashboard this way; there is now no value anywhere that can
 * name a different owner.
 *
 * If the owner ever genuinely changes, change it here - one line, reviewed, in
 * version control.
 */
export const OWNER_EMAIL = "royokola3@gmail.com";

export const REGISTRATION_ENABLED = false as const;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

let overrideWarned = false;

/** The owner address. Always set; never null. */
export function ownerEmail(): string {
  const configured = process.env.OWNER_EMAIL;
  if (configured && normalizeEmail(configured) !== OWNER_EMAIL && !overrideWarned) {
    overrideWarned = true;
    // Left in place rather than honoured. A deployment that sets this to
    // something else is misconfigured, and silently following it would hand the
    // account to whoever that address belongs to.
    console.error(
      `[rauell-os] OWNER_EMAIL is set to ${maskEmail(configured)}, which is not the owner ` +
        `of this application (${maskEmail(OWNER_EMAIL)}). It is being ignored. Remove the ` +
        "variable, or change OWNER_EMAIL in src/lib/auth-policy.ts if the owner has changed."
    );
  }
  return OWNER_EMAIL;
}

export function isOwnerEmail(value: string): boolean {
  return normalizeEmail(value) === OWNER_EMAIL;
}

/**
 * Partially redact an address for logging.
 *
 * Sign-in failures need to be diagnosable from the logs, but logs get pasted
 * into issues and chat windows. Keeping the first character and the domain is
 * enough to spot a wrong account or a typo without writing the full address
 * down.
 */
export function maskEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "(empty)";
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return `${trimmed.slice(0, 1)}***`;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  return `${local.slice(0, 1)}${"*".repeat(Math.max(local.length - 1, 1))}@${domain}`;
}
