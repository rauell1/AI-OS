import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/widgets";
import { Badge, Button, Card, CardContent, Input, Label, NativeSelect, Textarea } from "@/components/ui";
import { addEmailForm } from "@/app/actions/email";

const CATS = ["needs_response", "waiting", "important", "application", "scholarship", "job", "client", "lead", "project", "finance", "newsletter", "reference", "low_priority", "inbox"];

export default async function InboxPage({ searchParams }: { searchParams: { category?: string } }) {
  const user = await requireUser();
  const cat = searchParams.category;
  const db = await getDb();
  const emails = await db.query(
    `SELECT * FROM emails WHERE user_id = ? ${cat ? "AND category = ?" : ""} ORDER BY received_at DESC`,
    cat ? [user.id, cat] : [user.id]
  );

  return (
    <div>
      <PageHeader title="Inbox" description="Email intelligence: classification, extracted actions, deadlines and follow-ups."
        action={<Link href="/integrations"><Button size="sm" variant="outline">Connect Gmail</Button></Link>} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/inbox" className={`rounded-full border px-3 py-1 text-xs ${!cat ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"}`}>all</Link>
        {CATS.map((c) => (
          <Link key={c} href={`/inbox?category=${c}`} className={`rounded-full border px-3 py-1 text-xs ${cat === c ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2"}`}>{c.replace(/_/g, " ")}</Link>
        ))}
      </div>

      <div className="space-y-2">
        {emails.map((e: any) => (
          <div key={e.id} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-medium">{e.subject}</p>
              <Badge tone="neutral">{e.category}</Badge>
            </div>
            <p className="text-[11px] text-muted">{e.from_name || e.from_addr || "Unknown"} · {formatDate(e.received_at, true)}</p>
            {e.requested_action && <p className="mt-1 text-sm text-muted"><span className="text-faint">Action: </span>{e.requested_action}</p>}
            {e.deadline && <p className="text-[11px] text-warning">Deadline: {formatDate(e.deadline)}</p>}
          </div>
        ))}
        {emails.length === 0 && (
          <Card>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted">No emails captured yet. Connect Gmail in Integrations to import and classify email, or log one manually below.</p>
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
    </div>
  );
}
