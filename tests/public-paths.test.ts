import { describe, expect, it } from "vitest";
import { PATHNAME_HEADER, isPublicPath } from "../src/lib/public-paths";

// This list is the contract between middleware and the root layout. If the two
// ever disagree, the failure is not subtle: a path the middleware lets through
// but the layout treats as private redirects in a loop, and the reverse leaves
// a private page reachable with a revoked session.
describe("isPublicPath", () => {
  it("lets the sign-in page through, or the redirect would loop", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/login/")).toBe(true);
  });

  it("lets through what is served before authentication", () => {
    for (const p of ["/_next/static/chunk.js", "/favicon.ico", "/logo.png", "/robots.txt", "/icons/apple.png"]) {
      expect(isPublicPath(p), p).toBe(true);
    }
  });

  it("lets the cron entry point through: it carries CRON_SECRET, not a session", () => {
    expect(isPublicPath("/api/automations/run")).toBe(true);
  });

  it("guards everything else", () => {
    for (const p of ["/", "/tasks", "/settings", "/settings/security", "/applications/abc", "/api/export"]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });

  it("does not let a prefix match reach past a path segment", () => {
    // "/loginable" starts with "/login" but is not the sign-in page, and must
    // not be treated as public.
    expect(isPublicPath("/loginable")).toBe(false);
    expect(isPublicPath("/robots.txt.evil")).toBe(false);
  });

  it("names the header the layout reads", () => {
    expect(PATHNAME_HEADER).toBe("x-rauell-pathname");
  });
});
