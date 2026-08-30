import { redirect } from "next/navigation";
import { requireUser, destroySession } from "@/lib/auth/session";
import { buildDailyBrief } from "@/lib/engines/brief";
import { ensureAutomationRules } from "@/lib/automations/runner";
import { prisma } from "@/lib/db";
import { aiEnabled } from "@/lib/env";
import { unreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export const metadata = { title: "Daily Command Center" };

const URGENCY_STYLES: Record<string, string> = {
  critical: "bg-red-50 text-red-700",
  high: "bg-amber-50 text-amber-700",
  medium: "bg-sky-50 text-sky-700",
};

async function signOut(): Promise<void> {
  "use server";
  await destroySession();
  redirect("/login");
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--color-ink-200)] bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-[var(--color-ink-400)]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[var(--color-ink-900)]">{value}</p>
    </div>
  );
}

export default async function HomePage() {
  const user = await requireUser();
  await ensureAutomationRules(user.id); // idempotent

  const [brief, openTasks, activeApps, unread, aiRuns, pendingApprovals] = await Promise.all([
    buildDailyBrief(user.id),
    prisma.task.count({ where: { userId: user.id, status: { in: ["INBOX", "NEXT", "IN_PROGRESS"] } } }),
    prisma.application.count({
      where: { userId: user.id, status: { in: ["REVIEWING", "SHORTLISTED", "PREPARING", "READY_FOR_REVIEW", "READY_TO_SUBMIT", "SUBMITTED", "INTERVIEW"] } },
    }),
    unreadCount(user.id),
    prisma.aiRun.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
    prisma.approval.count({ where: { userId: user.id, status: "PENDING" } }),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-accent)]">
            Rauell OS
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{brief.headline}</h1>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-[var(--color-ink-200)] bg-white px-3 py-1.5 text-sm text-[var(--color-ink-600)] transition hover:border-[var(--color-ink-400)]"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open tasks" value={openTasks} />
        <Stat label="Active applications" value={activeApps} />
        <Stat label="Pending approvals" value={pendingApprovals} />
        <Stat label="Unread notifications" value={unread} />
      </section>

      {brief.sections.map((section) => (
        <section key={section.id} className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-ink-400)]">
            {section.title}
          </h2>
          {section.items.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-[var(--color-ink-200)] bg-white px-4 py-6 text-sm text-[var(--color-ink-400)]">
              Nothing here right now.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--color-ink-100)] overflow-hidden rounded-xl border border-[var(--color-ink-200)] bg-white">
              {section.items.map((item) => (
                <li key={`${item.kind}-${item.refId ?? item.title}`} className="flex items-start gap-3 px-4 py-3">
                  <span
                    className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${URGENCY_STYLES[item.urgency] ?? "bg-[var(--color-ink-100)] text-[var(--color-ink-600)]"}`}
                  >
                    {item.urgency}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-ink-900)]">{item.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--color-ink-600)]">{item.detail}</p>
                  </div>
                  <span className="ml-auto shrink-0 text-[11px] uppercase tracking-wide text-[var(--color-ink-400)]">
                    {item.kind}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="mt-10 text-xs text-[var(--color-ink-400)]">
        Brief generated {new Date(brief.generatedAt).toLocaleString("en-GB")} from your live data.
        {aiEnabled()
          ? " AI provider connected."
          : " AI provider not configured: deterministic engines only, which is fully functional."}
        {aiRuns > 0 ? ` ${aiRuns} AI runs in the last 7 days.` : ""}
      </p>
    </div>
  );
}
