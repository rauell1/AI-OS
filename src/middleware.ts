import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { isOwnerEmail } from "./lib/auth-policy";
import { PATHNAME_HEADER, isPublicPath } from "./lib/public-paths";

const COOKIE = "rauell_session";

function secret(): Uint8Array | null {
  const configured = process.env.AUTH_SECRET;
  if (!configured && process.env.NODE_ENV === "production") return null;
  return new TextEncoder().encode(configured || "dev-insecure-secret-change-me");
}

/**
 * Continue, telling the layout which path is being rendered.
 *
 * A layout cannot read the pathname on its own, and it needs it: only the
 * layout can turn a revoked session into a redirect (see src/app/layout.tsx),
 * and it must not do that on a public path, which would loop.
 *
 * Narrow on purpose. NextResponse.next({ request }) makes Next treat the
 * request as an internal rewrite, and that is not free: routed through it, a
 * Server Action loses its execution context, the data layer's
 * AsyncLocalStorage store comes back empty inside runAsSystem, and sign-in
 * dies on its first query with "Database access without a user context".
 * Bisection put it exactly here. So the rewrite is limited to the only
 * requests that can act on the header: GET navigations to a guarded path.
 * Everything else - every POST, and every public path, /login included -
 * continues untouched.
 */
function withPathname(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set(PATHNAME_HEADER, req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  // Signature, issuer, expiry and owner address only. Whether the session has
  // since been revoked is a question for the database, which the edge runtime
  // cannot reach - the root layout answers that one.
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
  return req.method === "GET" ? withPathname(req) : NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
