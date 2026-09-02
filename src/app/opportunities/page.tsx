import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { parseJSON } from "@/lib/utils";
import { EmptyState, PageHeader, ScoreBar } from "@/components/widgets";
import { Badge, Card, CardContent } from "@/components/ui";
import { OpportunityFormDialog } from "@/components/opportunity-form-dialog";
import { OpportunityRow } from "@/components/opportunity-controls";

const TYPES = ["all", "job", "scholarship", "programme", "fellowship", "grant"];

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const type = params.type && params.type !== "all" ? params.type : null;
  const db = await getDb();
  const sql = `SELECT o.*, s.overall, s.recommendation FROM opportunities o
    LEFT JOIN opportunity_scores s ON s.opportunity_id = o.id
    WHERE o.user_id = ? ${type ? "AND o.type = ?" : ""} ORDER BY s.overall DESC NULLS LAST, o.created_at DESC`;
  const [opps, orgs] = await Promise.all([
    db.query(sql, type ? [user.id, type] : [user.id]),
    db.query<{ id: string; name: string }>(`SELECT id, name FROM organizations WHERE user_id = ?`, [user.id]),
  ]);

  return (
    <div>
      <PageHeader title="Opportunities" description="Jobs, scholarships, programmes, fellowships and grants with transparent scoring."
        action={<OpportunityFormDialog organizations={orgs} />} />

      <div className="mb-4 flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <Link key={t} href={t === "all" ? "/opportunities" : `/opportunities?type=${t}`}
            className={`rounded-full border px-3 py-1 text-xs ${type === (t === "all" ? null : t) ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2"}`}>
            {t}
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        {opps.map((o) => (
          <OpportunityRow key={o.id} opp={o} score={o.overall != null ? { overall: o.overall, recommendation: o.recommendation } : undefined} />
        ))}
        {opps.length === 0 && (
          <EmptyState
            title="No opportunities yet"
            description="Jobs, scholarships, fellowships and grants land here and get scored against your profile. Add one by hand, or connect a discovery source to have them arrive on their own."
            action={<Link href="/integrations" className="text-sm text-accent hover:underline">Connect a source</Link>}
          />
        )}
      </div>
    </div>
  );
}
