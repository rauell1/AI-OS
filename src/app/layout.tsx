import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  metadataBase: new URL("https://ai-os.rauell.systems"),
  title: "Rauell OS — Roy's Personal AI Operating System",
  description: "A unified personal intelligence and productivity platform for Roy Okola Otieno.",
};

export const dynamic = "force-dynamic";

const themeScript = `(function(){try{var t=localStorage.getItem('theme')||'dark';document.documentElement.classList.toggle('dark',t==='dark');}catch(e){document.documentElement.classList.add('dark');}})();`;

async function AuthenticatedShell({ user, children }: { user: Awaited<ReturnType<typeof getCurrentUser>> & {}; children: React.ReactNode }) {
  const db = await getDb();
  const [unreadRow, approvalsRow] = await Promise.all([
    db.get<{ c: number }>(`SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0`, [user.id]),
    db.get<{ c: number }>(`SELECT COUNT(*) c FROM approvals WHERE user_id = ? AND status = 'pending'`, [user.id]),
  ]);
  return <AppShell user={user} unread={unreadRow?.c || 0} approvals={approvalsRow?.c || 0}>{children}</AppShell>;
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
        <body>{children}</body>
      </html>
    );
  }

  return (
    <html lang="en" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Suspense fallback={<AppShell user={user} unread={0} approvals={0}>{children}</AppShell>}>
          <AuthenticatedShell user={user}>{children}</AuthenticatedShell>
        </Suspense>
      </body>
    </html>
  );
}
