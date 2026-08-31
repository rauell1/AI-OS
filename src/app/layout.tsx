import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getDb, runAsUser } from "@/lib/db";
import { AppShell } from "@/components/app-shell";
import NextTopLoader from 'nextjs-toploader';

export const metadata: Metadata = {
  metadataBase: new URL("https://ai-os.rauell.systems"),
  title: "Rauell OS — Roy's Personal AI Operating System",
  description: "A unified personal intelligence and productivity platform for Roy Okola Otieno.",
};

export const dynamic = "force-dynamic";

const themeScript = `(function(){try{var t=localStorage.getItem('theme')||'dark';document.documentElement.classList.toggle('dark',t==='dark');}catch(e){document.documentElement.classList.add('dark');}})();`;

async function AuthenticatedShell({ user, children }: { user: Awaited<ReturnType<typeof getCurrentUser>> & {}; children: React.ReactNode }) {
  const db = await getDb();
  // Scope explicitly rather than letting the data layer re-derive the user from
  // the session cookie. This component renders inside a <Suspense> boundary, and
  // that ambient lookup does not reliably survive the streaming boundary - when
  // it failed, the RLS guard fired and took out the whole page render, including
  // /login. The user is already in hand here, so there is nothing to re-derive.
  let unread = 0;
  let approvals = 0;
  try {
    const [unreadRow, approvalsRow] = await runAsUser(user.id, () =>
      Promise.all([
        db.get<{ c: number }>(`SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0`, [user.id]),
        db.get<{ c: number }>(`SELECT COUNT(*) c FROM approvals WHERE user_id = ? AND status = 'pending'`, [user.id]),
      ])
    );
    unread = unreadRow?.c || 0;
    approvals = approvalsRow?.c || 0;
  } catch (err: any) {
    // These are two badge counts in the navigation. They are not worth failing
    // a page render for, and because this runs in the root layout a throw here
    // takes down every route - including /login, which is how you get back in.
    console.error(
      `[rauell-os] Could not load navigation counts: ${err?.message || err}. Rendering them as zero.`
    );
  }
  return <AppShell user={user} unread={unread} approvals={approvals}>{children}</AppShell>;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const isPublic = !user; // login is handled by middleware; treat missing user as public

  if (isPublic) {
    return (
      <html lang="en" className="dark">
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        </head>
        <body>
          <NextTopLoader color="#14b8a6" showSpinner={false} />
          {children}
        </body>
      </html>
    );
  }

  return (
    <html lang="en" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <NextTopLoader color="#14b8a6" showSpinner={false} />
        <Suspense fallback={<AppShell user={user} unread={0} approvals={0}>{children}</AppShell>}>
          <AuthenticatedShell user={user}>{children}</AuthenticatedShell>
        </Suspense>
      </body>
    </html>
  );
}
