// Which paths are reachable without a session, and how the layout learns which
// path it is rendering.
//
// Shared by middleware and the root layout so the two cannot drift: a path the
// middleware lets through but the layout treats as private would redirect in a
// loop, and the reverse would leave a private page reachable.
//
// Deliberately dependency-free. Middleware runs on the edge runtime, so
// anything reachable from here must not touch the database, Node built-ins, or
// any module that does.

/** Set by middleware on the forwarded request; read by the root layout. */
export const PATHNAME_HEADER = "x-rauell-pathname";

/** Reachable without signing in. */
const PUBLIC_PREFIXES = ["/login"];

/** Served before authentication: framework assets, the cron entry point, icons. */
const UNGUARDED = [
  "/_next",
  // Scheduled trigger: authenticates itself with CRON_SECRET, not a session.
  "/api/automations/run",
  "/favicon.ico",
  "/logo.png",
  // A crawler that gets redirected to /login never reads the disallow rules.
  "/robots.txt",
  "/icons",
];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  return UNGUARDED.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
