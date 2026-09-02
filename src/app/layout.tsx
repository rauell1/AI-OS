import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PATHNAME_HEADER, isPublicPath } from "@/lib/public-paths";
import { getDb, runAsUser } from "@/lib/db";
import { AppShell } from "@/components/app-shell";
import NextTopLoader from 'nextjs-toploader';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  metadataBase: new URL("https://ai-os.rauell.systems"),
  title: "Rauell OS - Roy's Personal AI Operating System",
  description: "A unified personal intelligence and productivity platform for Roy Okola Otieno.",
  // This is a private, single-account application: registration is disabled and
  // every route but /login is behind a session. There is nothing here for a
  // search engine or an AI crawler to index, and the sign-in page carries the
  // owner's name. Vercel sets noindex on preview URLs automatically but not on
  // a custom domain, so it is set explicitly here.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png"
  }
};

export const dynamic = "force-dynamic";

const themeScript = `(function(){try{var t=localStorage.getItem('theme')||'light';document.documentElement.classList.toggle('dark',t==='dark');}catch(e){}})();`;

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

  // No user on a page that needs one means the token is structurally valid -
  // middleware checked that much and let the request through - but no longer
  // current, which is what "sign out everywhere" does to it. Only the database
  // knows the account's session epoch, and the edge runtime cannot read it, so
  // this is the first place the question can be answered.
  //
  // It has to be answered HERE rather than in the page. The layout is the top
  // of the tree, so nothing has been flushed yet and redirect() can still send
  // a real 307. By the time a page body runs, the shell has begun streaming
  // with a 200 that can no longer become a redirect - which is why a revoked
  // session used to land on a blank page instead of being asked to sign in.
  if (!user) {
    const pathname = (await headers()).get(PATHNAME_HEADER) || "";
    // Never on /login itself: that would loop.
    if (pathname && !isPublicPath(pathname)) {
      redirect(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }

  if (!user) {
    return (
      <html lang="en">
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        </head>
        <body>
          <NextTopLoader color="#14b8a6" showSpinner={false} />
          {children}
          <Analytics />
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <NextTopLoader color="#14b8a6" showSpinner={false} />
        <Suspense fallback={<AppShell user={user} unread={0} approvals={0}>{children}</AppShell>}>
          <AuthenticatedShell user={user}>{children}</AuthenticatedShell>
        </Suspense>
        <Analytics />
      </body>
    </html>
  );
}
