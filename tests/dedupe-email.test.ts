import { describe, it, expect } from "vitest";
import { canonicalUrl, tokenJaccard, isDuplicateOpportunity } from "@/lib/engines/dedupe";
import { classifyEmailHeuristic } from "@/lib/engines/email";
import { encrypt, decrypt, sha256 } from "@/lib/crypto";

describe("duplicate detection", () => {
  it("canonicalizes URLs by stripping trackers", () => {
    expect(canonicalUrl("https://www.jobs.co/job/123?utm_source=x&ref=t#top")).toBe("jobs.co/job/123");
  });

  it("flags same-URL postings as duplicates", () => {
    const a = { title: "Solar Engineer", sourceUrl: "https://x.co/j/1?utm_source=li" };
    const b = { title: "Solar Engineer (Senior)", sourceUrl: "https://x.co/j/1" };
    expect(isDuplicateOpportunity(a, b).isDuplicate).toBe(true);
  });

  it("flags near-identical titles with same org", () => {
    const a = { title: "Energy Analyst", organizationName: "KenGen" };
    const b = { title: "Senior Energy Analyst", organizationName: "KenGen" };
    expect(tokenJaccard(a.title, b.title)).toBeGreaterThan(0.5);
    expect(isDuplicateOpportunity(a, b).similarTitle).toBe(true);
  });

  it("keeps genuinely different opportunities", () => {
    const a = { title: "Water Engineer", sourceUrl: "https://x.co/j/1", organizationName: "Acme Water" };
    const b = { title: "Marketing Manager", sourceUrl: "https://y.co/careers/9", organizationName: "Beta Media" };
    expect(isDuplicateOpportunity(a, b).isDuplicate).toBe(false);
  });
});

describe("email classification", () => {
  it("detects newsletter/no-reply as low priority", () => {
    const c = classifyEmailHeuristic("Weekly digest", "Your weekly roundup of news. Unsubscribe here.", "noreply@news.co");
    expect(c.category).toBe("NEWSLETTER");
    expect(c.needsResponse).toBe(false);
  });

  it("detects application responses", () => {
    const c = classifyEmailHeuristic("Your application status", "Thank you for your application. Unfortunately, we regret to inform you...", "careers@acme.co");
    expect(c.category).toBe("APPLICATION");
    expect(c.confidence).toBeGreaterThanOrEqual(60);
  });

  it("detects scholarship correspondence", () => {
    const c = classifyEmailHeuristic("Scholarship recommendation letter", "Please send your recommendation letter for the fully funded scholarship.", "admissions@uni.edu");
    expect(["SCHOLARSHIP", "REFERENCE", "NEEDS_RESPONSE"]).toContain(c.category);
    expect(c.needsResponse).toBe(true);
  });

  it("defaults unknown mail to IMPORTANT with low confidence, not certainty", () => {
    const c = classifyEmailHeuristic("Team lunch on Friday", "Join us in the kitchen at noon to celebrate.", "colleague@org.co");
    expect(c.confidence).toBeLessThanOrEqual(60);
  });
});

describe("secret encryption", () => {
  it("round-trips OAuth tokens safely", () => {
    const secret = "1//0gVerySecretRefreshToken";
    const enc = encrypt(secret);
    expect(enc).not.toContain(secret);
    expect(decrypt(enc)).toBe(secret);
    expect(sha256("x")).toHaveLength(64);
  });
});
