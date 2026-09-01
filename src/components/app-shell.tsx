"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Inbox, CheckSquare, FolderKanban, Target, FileText, Users, Folder,
  Bot, Workflow, CheckCheck, Search, Activity, Gavel, Plug, Settings, Menu, X, Bell,
  LogOut, Plus, Command, Sun, Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, Input, Avatar, AvatarFallback, AvatarImage, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui";
import { logout } from "@/app/actions/auth";
import { Chat } from "@/components/chat";

const LogoIcon = ({ size = 17 }: { size?: number }) => (
  <img src="/logo.png" alt="" style={{ width: size, height: size }} className="object-contain" />
);

export const NAV = [
  { href: "/", label: "Command Center", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/opportunities", label: "Opportunities", icon: Target },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/network", label: "Network", icon: Users },
  { href: "/documents", label: "Documents", icon: Folder },
  { href: "/ai", label: "AI Assistant", icon: LogoIcon },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/approvals", label: "Approvals", icon: CheckCheck },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/decisions", label: "Decisions", icon: Gavel },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ user, unread, approvals, children }: { user: any; unread: number; approvals: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [theme, setTheme] = React.useState<"dark" | "light">("light");

  React.useEffect(() => {
    const t = (localStorage.getItem("theme") as any) || "light";
    setTheme(t);
    document.documentElement.classList.toggle("dark", t === "dark");
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => setMobileOpen(false), [pathname]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const commands = [
    { label: "Go to Command Center", run: () => router.push("/") },
    { label: "Go to Tasks", run: () => router.push("/tasks") },
    { label: "Go to Projects", run: () => router.push("/projects") },
    { label: "Go to Opportunities", run: () => router.push("/opportunities") },
    { label: "Go to Applications", run: () => router.push("/applications") },
    { label: "Go to Network", run: () => router.push("/network") },
    { label: "Go to Documents", run: () => router.push("/documents") },
    { label: "Go to AI Assistant", run: () => router.push("/ai") },
    { label: "Go to Automations", run: () => router.push("/automations") },
    { label: "Go to Approvals", run: () => router.push("/approvals") },
    { label: "Go to Integrations", run: () => router.push("/integrations") },
    { label: "Go to Settings", run: () => router.push("/settings") },
    { label: "New Task", run: () => router.push("/tasks?new=1") },
    { label: "New Project", run: () => router.push("/projects?new=1") },
    { label: "Add Opportunity", run: () => router.push("/opportunities?new=1") },
    { label: "Run Daily Brief", run: () => router.push("/?brief=1") },
  ];
  const filtered = query ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())) : commands;

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <img src="/logo.png" alt="Rauell OS" className="h-7 w-7 rounded-md object-contain" />
          <span className="font-semibold tracking-tight">Rauell OS</span>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} prefetch={true}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active ? "bg-accent-soft text-accent font-medium" : "text-muted hover:bg-surface-2 hover:text-fg")}>
                <Icon size={17} />
                <span>{item.label}</span>
                {item.href === "/approvals" && approvals > 0 && (
                  <span className="ml-auto rounded-full bg-danger px-1.5 text-[10px] font-semibold text-white">{approvals}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3 text-[11px] text-faint">
          Roy Okola Otieno · Personal AI OS
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-surface p-2 shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-2 py-3">
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="Rauell OS" className="h-6 w-6 rounded-md object-contain" />
                <span className="font-semibold">Rauell OS</span>
              </div>
              <button onClick={() => setMobileOpen(false)}><X size={18} /></button>
            </div>
            <nav className="mt-2 space-y-1">
              {NAV.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} prefetch={true}
                    className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm", active ? "bg-accent-soft text-accent" : "text-muted")}>
                    <Icon size={17} /> {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
          <button className="md:hidden" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
          <button onClick={() => setPaletteOpen(true)}
            className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-muted md:max-w-md min-w-0">
            <Search size={15} className="shrink-0" /> <span className="truncate text-left">Search or run a command…</span>
            <kbd className="ml-auto hidden shrink-0 rounded border border-border px-1.5 text-[10px] md:inline">⌘K</kbd>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button onClick={toggleTheme} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="Toggle theme">
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <Link href="/approvals" className="relative rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="Approvals">
              <CheckCheck size={17} />
              {approvals > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" />}
            </Link>
            <Link href="/activity" className="relative rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="Notifications">
              <Bell size={17} />
              {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" />}
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-1 flex items-center gap-2 rounded-lg p-1 hover:bg-surface-2">
                  <Avatar>
                    <AvatarImage src="/logo.png" alt="User Profile" />
                    <AvatarFallback className="text-[11px]">{initials(user.name)}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="max-w-56 truncate px-2 py-1.5 text-xs text-muted" title={user.email}>{user.email}</div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/settings">Settings</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/profile">Profile</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout()} className="text-danger focus:text-danger"><LogOut size={14} /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
        </main>
      </div>

      {/* Command palette */}
      <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Command size={16} /> Command palette</DialogTitle>
          </DialogHeader>
          <Input autoFocus placeholder="Type a command…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="mt-3 max-h-72 overflow-y-auto">
            {filtered.map((c) => (
              <button key={c.label} onClick={() => { setPaletteOpen(false); setQuery(""); c.run(); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2">
                <Plus size={14} className="text-faint" /> {c.label}
              </button>
            ))}
            {!filtered.length && <p className="px-3 py-4 text-sm text-muted">No commands found.</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Global AI Dialog */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-4 py-3 border-b border-border m-0">
            <DialogTitle className="flex items-center gap-2 font-semibold">
              <img src="/logo.png" alt="Rauell" className="h-5 w-5 object-contain" /> AI Assistant
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden p-4">
            <Chat />
          </div>
        </DialogContent>
      </Dialog>

      {/* Global AI FAB */}
      <button 
        onClick={() => setAiOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/20 transition-transform hover:scale-105 active:scale-95 overflow-hidden"
        aria-label="Open AI Assistant"
      >
        <img src="/logo.png" alt="AI" className="h-8 w-8 object-contain brightness-0 invert" />
      </button>
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}
