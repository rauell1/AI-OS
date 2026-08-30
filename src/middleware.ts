import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { isOwnerEmail } from "./lib/auth-policy";

const COOKIE = "rauell_session";

const PUBLIC_PATHS = ["/login"];

function secret(): Uint8Array | null {
  const configured = process.env.AUTH_SECRET;
  if (!configured && process.env.NODE_ENV === "production") return null;
  return new TextEncoder().encode(configured || "dev-insecure-secret-change-me");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  if (
    pathname.startsWith("/_next") ||
    // Scheduled trigger: authenticates itself with CRON_SECRET, not a session.
    pathname === "/api/automations/run" ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/icons")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE)?.value;
  let valid = false;
  const signingSecret = secret();
  if (token && signingSecret) {
    try {
      const { payload } = await jwtVerify(token, signingSecret, { issuer: "rauell-os" });
      valid = typeof payload.sub === "string" && typeof payload.email === "string" && isOwnerEmail(payload.email);
    } catch {
      valid = false;
    }
  }

  if (!valid) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
