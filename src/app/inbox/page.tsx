import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/widgets";
import { Badge, Button, Card, CardContent, Input, Label, NativeSelect, Textarea } from "@/components/ui";
import { addEmailForm, deleteEmailForm } from "@/app/actions/email";

const CATS = ["needs_response", "waiting", "important", "application", "scholarship", "job", "client", "lead", "project", "finance", "newsletter", "reference", "low_priority", "inbox"];

export default async function InboxPage({ searchParams }: { searchParams: { category?: string } }) {
  const user = await requireUser();
  const cat = searchParams.category;
  const db = await getDb();
  const emails = await db.query(
    `SELECT * FROM emails WHERE user_id = ? ${cat ? "AND category = ?" : ""} ORDER BY received_at DESC`,
    cat ? [user.id, cat] : [user.id]
  );

  const hasGmail = await db.get(`SELECT 1 FROM integrations WHERE user_id = ? AND provider = 'gmail' AND status = 'connected'`, [user.id]);

  return (
    <div>
      <PageHeader title="Inbox" description="Email intelligence: classification, extracted actions, deadlines and follow-ups."
        action={!hasGmail ? <Link href="/integrations"><Button size="sm" variant="outline">Connect Gmail</Button></Link> : undefined} />

      <div className="mb-6 flex overflow-x-auto pb-2 gap-2 hide-scrollbar" style={{ scrollbarWidth: 'none' }}>
        <Link href="/inbox" className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${!cat ? "border-accent bg-accent text-white" : "border-border bg-surface text-muted hover:bg-surface-2"}`}>All</Link>
        {CATS.map((c) => (
          <Link key={c} href={`/inbox?category=${c}`} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${cat === c ? "border-accent bg-accent text-white" : "border-border bg-surface text-muted hover:bg-surface-2"}`}>
            {c.replace(/_/g, " ")}
          </Link>
        ))}
      </div>

      {emails.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <div className="divide-y divide-border">
          {emails.map((e: any) => {
            const initial = e.from_name ? e.from_name[0] : (e.from_addr ? e.from_addr[0] : "?");
            return (
              <div key={e.id} className="group flex items-center gap-4 px-4 py-2 transition-colors hover:bg-surface-2 cursor-pointer">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs text-accent font-bold uppercase">
                  {initial}
                </div>
                
                <div className="w-48 shrink-0 truncate text-sm font-semibold text-fg">
                  {e.from_name || e.from_addr || "Unknown"}
                </div>
                
                <div className="min-w-0 flex-1 flex items-center gap-2 truncate text-sm">
                  {e.category && e.category !== "inbox" && (
                    <Badge tone={e.category === "needs_response" ? "warning" : "info"} className="shrink-0 h-5 px-1.5 text-[10px]">
                      {e.category.replace(/_/g, " ")}
                    </Badge>
                  )}
                  {e.requested_action && (
                    <Badge tone="accent" className="shrink-0 h-5 px-1.5 text-[10px]">Action</Badge>
                  )}
                  <span className="font-semibold text-fg truncate">{e.subject}</span>
                  <span className="text-muted truncate hidden md:inline-block">
                    - {e.snippet ? e.snippet.replace(/<[^>]+>/g, '') : ""}
                  </span>
                </div>
                
                <div className="shrink-0 flex items-center gap-2 ml-4">
                  <div className="hidden group-hover:flex items-center">
                    <form action={deleteEmailForm}>
                      <input type="hidden" name="id" value={e.id} />
                      <button className="rounded p-1.5 text-faint transition-colors hover:bg-danger/10 hover:text-danger" title="Delete email">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    </form>
                  </div>
                  <span className="text-xs font-medium text-muted w-16 text-right group-hover:hidden">
                    {formatDate(e.received_at, true)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      ) : (
        <Card>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted">
              {hasGmail 
                ? "No emails matched this category. Sync from the Integrations page to fetch new emails."
                : "No emails captured yet. Connect Gmail in Integrations to import and classify email, or log one manually below."}
            </p>
            <form action={addEmailForm} className="grid gap-2 rounded-lg border border-border p-3">
              <div className="grid grid-cols-2 gap-2">
                <div><Label>From</Label><Input name="from_name" placeholder="Sender name" /></div>
                <div><Label>Category</Label><NativeSelect name="category" defaultValue="needs_response">{CATS.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</NativeSelect></div>
              </div>
              <div><Label>Subject</Label><Input name="subject" required /></div>
              <div><Label>Requested action</Label><Input name="requested_action" placeholder="e.g. Send motivation letter" /></div>
              <div><Label>Deadline</Label><Input type="date" name="deadline" /></div>
              <div className="flex justify-end"><Button type="submit" size="sm" variant="primary">Log email</Button></div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
