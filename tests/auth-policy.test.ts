import { describe, expect, it } from "vitest";
import { isOwnerEmail, normalizeEmail, OWNER_EMAIL, REGISTRATION_ENABLED } from "../src/lib/auth-policy";

describe("single-user authentication policy", () => {
  it("allows the configured owner email", () => {
    expect(isOwnerEmail(OWNER_EMAIL)).toBe(true);
    expect(isOwnerEmail("  RoyOkola3@GMAIL.COM ")).toBe(true);
  });

  it("rejects every other email", () => {
    expect(isOwnerEmail("someone@example.com")).toBe(false);
    expect(isOwnerEmail("royokola3+other@gmail.com")).toBe(false);
  });

  it("normalizes email casing and whitespace", () => {
    expect(normalizeEmail("  RoyOkola3@GMAIL.COM ")).toBe(OWNER_EMAIL);
  });

  it("keeps public registration permanently disabled", () => {
    expect(REGISTRATION_ENABLED).toBe(false);
  });
});
