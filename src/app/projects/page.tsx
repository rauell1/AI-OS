import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { parseJSON } from "@/lib/utils";
import { PageHeader } from "@/components/widgets";
import { Badge, Card, CardContent } from "@/components/ui";
import { ProjectFormDialog } from "@/components/modals";

export default async function ProjectsPage() {
  const user = await requireUser();
  const db = await getDb();
  const projects = await db.query(
    `SELECT p.*, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status NOT IN ('done','cancelled')) AS open_tasks
     FROM projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC`,
    [user.id]
  );

  return (
    <div>
      <PageHeader title="Projects" description="Roy's parallel initiatives as first-class objects."
        action={<ProjectFormDialog />} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const next = parseJSON<string[]>(p.next_actions_json, []);
          return (
            <Link key={p.id} href={`/projects/${p.id}`} className="card p-4 transition-colors hover:border-accent/40">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-faint">{p.category}</span>
                <Badge tone={p.status === "active" ? "success" : "neutral"}>{p.status.replace(/_/g, " ")}</Badge>
              </div>
              <h3 className="font-semibold">{p.name}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{p.overview || "No overview yet."}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-muted">
                <span>{p.open_tasks} open tasks</span>
                <span>{next.length} next actions</span>
              </div>
            </Link>
          );
        })}
        {projects.length === 0 && <Card className="sm:col-span-2 lg:col-span-3"><CardContent><p className="text-sm text-muted">No projects yet. Create one to get started.</p></CardContent></Card>}
      </div>
    </div>
  );
}
