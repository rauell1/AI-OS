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
