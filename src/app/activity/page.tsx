import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/widgets";
import { Card, CardContent } from "@/components/ui";

const typeTone: Record<string, any> = {
  task_created: "info", application_created: "accent", project_created: "success",
  integration_connected: "success", approval_resolved: "warning", document_uploaded: "neutral",
  decision_logged: "neutral", auth_login: "neutral",
};

export default async function ActivityPage() {
  const user = await requireUser();
  const db = await getDb();
  const events = await db.query(`SELECT * FROM activity_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`, [user.id]);

  return (
    <div>
      <PageHeader title="Activity Timeline" description="An immutable, auditable log of actions across your operating system." />
      <Card>
        <CardContent className="space-y-1 py-2">
          {events.map((e) => (
            <div key={e.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${typeTone[e.type] ? "bg-accent" : "bg-faint"}`} />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm">{e.summary}</p>
                  <span className="shrink-0 text-[11px] text-faint">{relativeTime(e.created_at)}</span>
                </div>
                {e.metadata_json && e.metadata_json !== "{}" && (
                  <p className="text-[11px] text-muted">{formatDate(e.created_at, true)}</p>
                )}
              </div>
            </div>
          ))}
          {events.length === 0 && <p className="px-2 py-4 text-sm text-muted">No activity recorded yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
