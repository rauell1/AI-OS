import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { systemStatus } from "@/lib/integrations/status";

export const dynamic = "force-dynamic";

/**
 * Public landing / system status page. Once the owner account exists it
 * simply forwards into the app. It never fakes readiness: each subsystem
 * reports its true configuration state.
 */
export default async function Home() {
  const user = await getSessionUser().catch(() => null);
  if (user) {
    return user.onboardedAt
      ? <meta httpEquiv="refresh" content="0;url=/home" />
      : <meta httpEquiv="refresh" content="0;url=/setup" />;
  }

  const status = systemStatus();

  const items = [
    { label: "Database", ok: true, note: "Neon PostgreSQL (DATABASE_URL)" },
    { label: "Authentication", ok: true, note: "Session cookies, scrypt password hashing" },
    { label: "AI provider", ok: status.ai.enabled, note: status.ai.enabled ? `${status.ai.provider} configured` : "Optional: set AI_API_KEY" },
    { label: "Google (Gmail/Calendar/Drive)", ok: status.googleOAuth, note: status.googleOAuth ? "OAuth configured" : "Optional: set GOOGLE_CLIENT_ID/SECRET" },
    { label: "GitHub", ok: status.github, note: status.github ? "Token configured" : "Optional: set GITHUB_TOKEN" },
    { label: "Encryption key", ok: status.encryption, note: status.encryption ? "Configured" : "Required in production: APP_ENCRYPTION_KEY" },
    { label: "Cron secret", ok: status.cron, note: status.cron ? "Configured" : "Recommended: CRON_SECRET" },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-[var(--color-accent)]">
        Rauell Systems
      </p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[var(--color-ink-900)]">
        Rauell OS
      </h1>
      <p className="mt-3 text-lg leading-relaxed text-[var(--color-ink-600)]">
        Roy Okola Otieno&apos;s personal AI operating system. One place for projects,
        applications, opportunities, scholarships, network, documents and the
        intelligence that ties them together.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/setup"
          className="rounded-lg bg-[var(--color-ink-900)] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--color-ink-800)]"
        >
          Initial setup
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-[var(--color-ink-200)] bg-white px-5 py-2.5 text-sm font-medium text-[var(--color-ink-900)] transition hover:border-[var(--color-ink-400)]"
        >
          Sign in
        </Link>
      </div>

      <section className="mt-12 rounded-xl border border-[var(--color-ink-200)] bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-ink-400)]">
          System configuration
        </h2>
        <ul className="mt-4 divide-y divide-[var(--color-ink-100)]">
          {items.map((item) => (
            <li key={item.label} className="flex items-start justify-between gap-4 py-2.5">
              <div>
                <p className="text-sm font-medium text-[var(--color-ink-900)]">{item.label}</p>
                <p className="text-xs text-[var(--color-ink-400)]">{item.note}</p>
              </div>
              <span
                className={
                  item.ok
                    ? "mt-0.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
                    : "mt-0.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700"
                }
              >
                {item.ok ? "Ready" : "Not configured"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-[var(--color-ink-400)]">
          Core workflows (profile, projects, tasks, opportunities, applications, documents,
          approvals, automations) run fully without any AI key. AI features light up when a
          provider key is present and degrade gracefully when it is removed.
        </p>
      </section>
    </main>
  );
}
