import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { OWNER_EMAIL, isOwnerEmail, ownerEmail, normalizeEmail } from "../src/lib/auth-policy";

// Addresses that are obviously not a real identity: documentation examples and
// fixtures for the email classifier.
const PLACEHOLDER = /@(example\.(com|org|net)|localhost|b\.com|news\.co|acme\.co|uni\.edu|org\.co)$/i;
// `postgresql://user:password@host/db` matches an email pattern from the
// password onwards. Those are connection-string templates, not addresses.
const CONNECTION_STRING = /(postgres(ql)?:\/\/|^password@|^[A-Za-z0-9._%+-]*:[^@]*@)/i;

function trackedFiles(): string[] {
  // --others --exclude-standard covers new files that are not committed yet,
  // so a fresh file carrying a foreign address is caught before it lands.
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((f) => f !== "package-lock.json");
}

/** Reads the working copy, so fixing a file makes this pass without committing. */
function read(file: string): string | null {
  try {
    const stat = statSync(file);
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024) return null;
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function emailsIn(file: string): string[] {
  const text = read(file);
  if (!text) return [];
  const offenders: string[] = [];
  for (const line of text.split("\n")) {
    for (const email of line.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []) {
      if (PLACEHOLDER.test(email)) continue;
      // Check the surrounding line, not the match: the connection-string
      // markers sit to the left of what the email pattern captured.
      if (CONNECTION_STRING.test(line.slice(Math.max(0, line.indexOf(email) - 40)))) continue;
      offenders.push(email);
    }
  }
  return offenders;
}

// The address that must never appear again. Built from fragments on purpose:
// writing it as a literal would make this file the thing it is checking for.
const FORMER_ADDRESS = ["roy", ["rauell", "systems"].join(".")].join("@");

describe("owner identity", () => {
  it("is a single constant", () => {
    expect(OWNER_EMAIL).toBe("royokola3@gmail.com");
    expect(ownerEmail()).toBe(OWNER_EMAIL);
    expect(normalizeEmail(OWNER_EMAIL)).toBe(OWNER_EMAIL);
  });

  it("accepts the owner in any casing or with surrounding space", () => {
    expect(isOwnerEmail(OWNER_EMAIL)).toBe(true);
    expect(isOwnerEmail(OWNER_EMAIL.toUpperCase())).toBe(true);
    expect(isOwnerEmail(`  ${OWNER_EMAIL}  `)).toBe(true);
  });

  it("rejects every other address, including the one that leaked into the dashboard", () => {
    for (const other of [
      FORMER_ADDRESS,
      "someone.else@example.com",
      // Gmail treats a plus-address as the same mailbox; this application does
      // an exact match and must not.
      OWNER_EMAIL.replace("@", "+other@"),
      // A lookalike domain that merely starts with the owner's address.
      `${OWNER_EMAIL}.attacker.test`,
      OWNER_EMAIL.replace(/\.com$/, ".co"),
      "",
    ]) {
      expect(isOwnerEmail(other), other).toBe(false);
    }
  });

  it("ignores an OWNER_EMAIL environment variable naming anyone else", () => {
    const previous = process.env.OWNER_EMAIL;
    try {
      process.env.OWNER_EMAIL = FORMER_ADDRESS;
      expect(ownerEmail()).toBe(OWNER_EMAIL);
      expect(isOwnerEmail(FORMER_ADDRESS)).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.OWNER_EMAIL;
      else process.env.OWNER_EMAIL = previous;
    }
  });

  // The rule is that no other identity appears anywhere in this repository.
  // Asserted against the committed tree so it holds for anyone who checks it
  // out, not just for the working copy on one machine.
  it("is the only real address anywhere in the repository", () => {
    const offenders: string[] = [];
    for (const file of trackedFiles()) {
      for (const email of emailsIn(file)) {
        if (normalizeEmail(email) !== OWNER_EMAIL) offenders.push(`${file}: ${email}`);
      }
    }
    expect(offenders, `unexpected email address(es):\n${offenders.join("\n")}`).toEqual([]);
  });

  it("has no reference to the former address anywhere in the repository", () => {
    const offenders = trackedFiles().filter((file) => read(file)?.includes(FORMER_ADDRESS));
    expect(offenders, `still referenced in:\n${offenders.join("\n")}`).toEqual([]);
  });
});
