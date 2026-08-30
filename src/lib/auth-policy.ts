/** The only identity allowed to create or access this personal OS. */
export const OWNER_EMAIL = "royokola3@gmail.com";
export const REGISTRATION_ENABLED = false as const;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isOwnerEmail(value: string): boolean {
  return normalizeEmail(value) === OWNER_EMAIL;
}
