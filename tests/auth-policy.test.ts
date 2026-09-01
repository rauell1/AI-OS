import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isOwnerEmail,
  maskEmail,
  normalizeEmail,
  ownerEmail,
  REGISTRATION_ENABLED,
} from "../src/lib/auth-policy";

const OWNER = "royokola3@gmail.com";

afterEach(() => {
  delete process.env.OWNER_EMAIL;
  vi.restoreAllMocks();
});

describe("single-user authentication policy", () => {
  it("allows the owner email", () => {
    expect(isOwnerEmail(OWNER)).toBe(true);
    expect(isOwnerEmail(`  ${OWNER.toUpperCase()} `)).toBe(true);
  });

  it("rejects every other email", () => {
    expect(isOwnerEmail("someone@example.com")).toBe(false);
    expect(isOwnerEmail(OWNER.replace("@", "+other@"))).toBe(false);
    expect(isOwnerEmail("")).toBe(false);
  });

  it("normalizes email casing and whitespace", () => {
    expect(normalizeEmail("  Owner@EXAMPLE.com ")).toBe("owner@example.com");
  });

  // The owner is a constant, not configuration: an environment variable is one
  // deploy-time typo away from handing the account to somebody else.
  it("ignores an OWNER_EMAIL variable and says so", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.OWNER_EMAIL = "someone@example.com";
    expect(ownerEmail()).toBe(OWNER);
    expect(isOwnerEmail("someone@example.com")).toBe(false);
    expect(err.mock.calls.flat().join(" ")).toContain("is being ignored");
  });

  it("is unaffected by OWNER_EMAIL being unset", () => {
    expect(ownerEmail()).toBe(OWNER);
    expect(isOwnerEmail(OWNER)).toBe(true);
  });

  it("keeps public registration permanently disabled", () => {
    expect(REGISTRATION_ENABLED).toBe(false);
  });
});

describe("maskEmail", () => {
  it("keeps the first character and the domain", () => {
    expect(maskEmail("someone1234@example.com")).toBe("s**********@example.com");
    expect(maskEmail("a@b.com")).toBe("a*@b.com");
  });

  it("never contains the full local part", () => {
    const masked = maskEmail("verylongname@example.com");
    expect(masked).not.toContain("verylongname");
    expect(masked.endsWith("@example.com")).toBe(true);
  });

  it("handles input that is not an address", () => {
    expect(maskEmail("")).toBe("(empty)");
    expect(maskEmail("   ")).toBe("(empty)");
    expect(maskEmail("notanemail")).toBe("n***");
  });
});
