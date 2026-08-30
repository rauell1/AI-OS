import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, createSession } from "@/lib/auth/session";
import { hashPassword, passwordStrengthError } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { ensureAutomationRules } from "@/lib/automations/runner";
import { recordActivity } from "@/lib/activity";
import { notify } from "@/lib/notifications";
import env from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata = { title: "Initial setup" };

async function createOwner(formData: FormData): Promise<void> {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const setupToken = String(formData.get("setupToken") ?? "");

  if (env.SETUP_TOKEN && setupToken !== env.SETUP_TOKEN) {
    redirect("/setup?error=token");
  }
  if (!name || !email || !password) redirect("/setup?error=missing");
  const strength = passwordStrengthError(password);
  if (strength) redirect(`/setup?error=${encodeURIComponent(strength)}`);

  const existing = await prisma.user.count();
  if (existing > 0) redirect("/login");

  const user = await prisma.user.create({
    data: { name, email, passwordHash: hashPassword(password) },
  });
  await prisma.profile.create({
    data: { userId: user.id, fullName: name, email },
  });
  await ensureAutomationRules(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } });
  await notify({
    userId: user.id,
    type: "SYSTEM",
    title: "Welcome to Rauell OS",
    body: "Your workspace is ready. Run the seed import or add your profile details to begin.",
  });
  await recordActivity({ userId: user.id, type: "SETUP", summary: "Owner account created" });
  await createSession(user.id);
  await prisma.auditLog.create({ data: { event: "SETUP", userId: user.id } }).catch(() => {});
  redirect("/home");
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/home");
  const userCount = await prisma.user.count();
  if (userCount > 0) redirect("/login");
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Set up Rauell OS</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-400)]">
        Create the owner account. This is Roy&apos;s personal system: exactly one account.
      </p>
      <form action={createOwner} className="mt-8 space-y-4">
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error === "token"
              ? "Invalid setup token."
              : error === "missing"
                ? "All fields are required."
                : error}
          </p>
        )}
        {env.SETUP_TOKEN !== "" && (
          <div>
            <label htmlFor="setupToken" className="block text-sm font-medium">
              Setup token
            </label>
            <input
              id="setupToken"
              name="setupToken"
              type="password"
              required
              className="mt-1 w-full rounded-lg border border-[var(--color-ink-200)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            />
            <p className="mt-1 text-xs text-[var(--color-ink-400)]">
              Required because SETUP_TOKEN is configured on this deployment.
            </p>
          </div>
        )}
        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            Full name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
            defaultValue="Roy Okola Otieno"
            className="mt-1 w-full rounded-lg border border-[var(--color-ink-200)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-[var(--color-ink-200)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-[var(--color-ink-200)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <p className="mt-1 text-xs text-[var(--color-ink-400)]">
            At least 10 characters with mixed case or numbers.
          </p>
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-[var(--color-ink-900)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--color-ink-800)]"
        >
          Create account and continue
        </button>
      </form>
      <p className="mt-6 text-sm text-[var(--color-ink-400)]">
        Already set up?{" "}
        <Link href="/login" className="font-medium text-[var(--color-accent)] hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
