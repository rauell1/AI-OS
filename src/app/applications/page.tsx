import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/widgets";
import { Badge, Card, CardContent } from "@/components/ui";

const tone: Record<string, any> = {
  reviewing: "info", preparing: "warning", ready_for_review: "accent", ready_to_submit: "accent",
  submitted: "success", interview: "info", offer: "success", rejected: "danger", withdrawn: "neutral", archived: "neutral",
};

export default async function ApplicationsPage() {
  const user = await requireUser();
  const db = await getDb();
  const apps = await db.query(
    `SELECT a.*, o.name AS org_name,
      (SELECT COUNT(*) FROM application_requirements r WHERE r.application_id = a.id) AS req_total,
      (SELECT COUNT(*) FROM application_requirements r WHERE r.application_id = a.id AND r.satisfied = 1) AS req_done
     FROM applications a LEFT JOIN organizations o ON a.organization_id = o.id
     WHERE a.user_id = ? ORDER BY a.deadline ASC NULLS LAST, a.updated_at DESC`,
    [user.id]
  );

  return (
    <div>
      <PageHeader title="Applications" description="A dedicated workspace for every job, scholarship and programme application." />
      <div className="space-y-2">
        {apps.map((a) => (
          <Link key={a.id} href={`/applications/${a.id}`} className="block rounded-lg border border-border p-3 hover:border-accent/40">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-[11px] text-muted">{a.org_name || "—"} {a.deadline ? `· due ${formatDate(a.deadline)}` : ""}</p>
              </div>
              <div className="flex items-center gap-3">
                {a.req_total > 0 && (
                  <span className="text-xs text-muted">{a.req_done}/{a.req_total} reqs</span>
                )}
                <Badge tone={tone[a.status] || "neutral"}>{a.status.replace(/_/g, " ")}</Badge>
              </div>
            </div>
          </Link>
        ))}
        {apps.length === 0 && <Card><CardContent><p className="text-sm text-muted">No applications yet. Create one from an opportunity or add manually.</p></CardContent></Card>}
      </div>
    </div>
  );
}
