import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, createSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in" };

async function signIn(formData: FormData): Promise<void> {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=missing");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    await prisma.auditLog
      .create({ data: { event: "LOGIN_FAILED", meta: { email } } })
      .catch(() => {});
    redirect("/login?error=invalid");
  }
  await createSession(user.id);
  await prisma.auditLog.create({ data: { event: "LOGIN", userId: user.id } }).catch(() => {});
  await recordActivity({ userId: user.id, type: "LOGIN", summary: "Signed in" });
  redirect("/home");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/home");
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in to Rauell OS</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-400)]">Roy&apos;s personal operating system.</p>
      <form action={signIn} className="mt-8 space-y-4">
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error === "invalid" ? "Invalid email or password." : "Enter your email and password."}
          </p>
        )}
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
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-[var(--color-ink-200)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-[var(--color-ink-900)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--color-ink-800)]"
        >
          Sign in
        </button>
      </form>
      <p className="mt-6 text-sm text-[var(--color-ink-400)]">
        First time?{" "}
        <Link href="/setup" className="font-medium text-[var(--color-accent)] hover:underline">
          Create the owner account
        </Link>
      </p>
    </main>
  );
}
