import { afterEach, describe, expect, it, vi } from "vitest";
import { isOwnerEmail, normalizeEmail, ownerEmail, REGISTRATION_ENABLED } from "../src/lib/auth-policy";

const OWNER = "owner@example.com";

afterEach(() => {
  delete process.env.OWNER_EMAIL;
  vi.restoreAllMocks();
});

describe("single-user authentication policy", () => {
  it("allows the configured owner email", () => {
    process.env.OWNER_EMAIL = OWNER;
    expect(isOwnerEmail(OWNER)).toBe(true);
    expect(isOwnerEmail("  Owner@EXAMPLE.com ")).toBe(true);
  });

  it("rejects every other email", () => {
    process.env.OWNER_EMAIL = OWNER;
    expect(isOwnerEmail("someone@example.com")).toBe(false);
    expect(isOwnerEmail("owner+other@example.com")).toBe(false);
  });

  it("normalizes email casing and whitespace", () => {
    expect(normalizeEmail("  Owner@EXAMPLE.com ")).toBe(OWNER);
  });

  it("reads the owner from the environment, not from source", () => {
    process.env.OWNER_EMAIL = "  Someone@Example.COM ";
    expect(ownerEmail()).toBe("someone@example.com");
  });

  // Denying is the safe direction: the alternative admits anyone who can reach
  // the app. The console error is what makes the lockout diagnosable.
  it("denies everyone and reports why when OWNER_EMAIL is unset", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(ownerEmail()).toBeNull();
    expect(isOwnerEmail("anyone@example.com")).toBe(false);
    expect(isOwnerEmail("")).toBe(false);
    expect(err.mock.calls.flat().join(" ")).toContain("OWNER_EMAIL is not set");
  });

  it("keeps public registration permanently disabled", () => {
    expect(REGISTRATION_ENABLED).toBe(false);
  });
});
