/** The only identity allowed to create or access this personal OS. */
export const OWNER_EMAIL = "royokola3@gmail.com";
/** Previous seed default, retained only to migrate an existing owner account. */
export const LEGACY_OWNER_EMAIL = "roy@rauell.systems";
export const REGISTRATION_ENABLED = false as const;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isOwnerEmail(value: string): boolean {
  return normalizeEmail(value) === OWNER_EMAIL;
}
