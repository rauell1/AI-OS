/**
 * The only identity allowed to access this personal OS.
 *
 * Read from the environment rather than committed: this repository is public,
 * so a literal here publishes the owner's email address. It is deliberately
 * NOT a NEXT_PUBLIC_ variable - those are inlined into the browser bundle,
 * which would put the address back in public view.
 */
export const REGISTRATION_ENABLED = false as const;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

let missingOwnerWarned = false;

/** The configured owner address, or null when unset. */
export function ownerEmail(): string | null {
  const configured = process.env.OWNER_EMAIL;
  if (configured && configured.trim()) return normalizeEmail(configured);
  if (!missingOwnerWarned) {
    missingOwnerWarned = true;
    // Fails closed below, so say plainly why sign-in is rejected. A silent
    // denial here looks identical to a wrong password.
    console.error(
      "[rauell-os] OWNER_EMAIL is not set, so every sign-in will be rejected. " +
        "Set it to the owner's email address in the deployment environment."
    );
  }
  return null;
}

export function isOwnerEmail(value: string): boolean {
  const owner = ownerEmail();
  // No configured owner means no one is the owner. Denying is the safe
  // direction: the alternative would admit anyone who can reach the app.
  if (!owner) return false;
  return normalizeEmail(value) === owner;
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
