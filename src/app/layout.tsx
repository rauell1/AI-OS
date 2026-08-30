import "./globals.css";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { AppShell } from "@/components/app-shell";
import { CommandPalette } from "@/components/command-palette";

export const metadata: Metadata = {
  title: "Rauell OS — Roy's Personal AI Operating System",
  description: "A unified personal intelligence and productivity platform for Roy Okola Otieno.",
};

export const dynamic = "force-dynamic";

const themeScript = `(function(){try{var t=localStorage.getItem('theme')||'dark';document.documentElement.classList.toggle('dark',t==='dark');}catch(e){document.documentElement.classList.add('dark');}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const isPublic = !user; // login/register handled by middleware; treat missing user as public

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

  const db = await getDb();
  const unread = (await db.get<{ c: number }>(`SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0`, [user.id]))?.c || 0;
  const approvals = (await db.get<{ c: number }>(`SELECT COUNT(*) c FROM approvals WHERE user_id = ? AND status = 'pending'`, [user.id]))?.c || 0;

  return (
    <html lang="en" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppShell user={user} unread={unread} approvals={approvals}>
          {children}
        </AppShell>
        <CommandPalette />
      </body>
    </html>
  );
}
