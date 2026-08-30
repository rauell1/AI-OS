import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { parseJSON, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/widgets";
import { Badge, Card, CardContent, CardHeader, CardTitle, NativeSelect } from "@/components/ui";
import { ProjectStatusSelect, AddNote, AddTaskInline } from "@/components/project-controls";
import { TaskRow } from "@/components/task-controls";
import { ServerActionTextarea } from "@/components/editable";
import { updateProjectField } from "@/app/actions/projects";

export default async function ProjectDetail({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const db = await getDb();
  const project = await db.get(`SELECT * FROM projects WHERE id = ? AND user_id = ?`, [params.id, user.id]);
  if (!project) return <p className="text-sm text-muted">Project not found.</p>;
  const tasks = await db.query(`SELECT * FROM tasks WHERE project_id = ? AND status NOT IN ('done','cancelled') ORDER BY priority DESC`, [project.id]);
  const notes = await db.query(`SELECT * FROM notes WHERE entity_type='project' AND entity_id = ? ORDER BY created_at DESC`, [project.id]);
  const goals = parseJSON<string[]>(project.goals_json, []);
  const next = parseJSON<string[]>(project.next_actions_json, []);

  return (
    <div>
      <PageHeader
        title={project.name}
        description={project.category}
        action={<ProjectStatusSelect id={project.id} status={project.status} />}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
            <CardContent>
              <ServerActionTextarea
                action={updateProjectField}
                id={project.id}
                field="overview"
                value={project.overview || ""}
                rows={4}
                placeholder="Describe the project…"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Tasks</CardTitle><div><AddTaskInline projectId={project.id} /></div></CardHeader>
            <CardContent className="space-y-2">
              {tasks.map((t) => <TaskRow key={t.id} task={t} />)}
              {tasks.length === 0 && <p className="text-sm text-muted">No open tasks.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Notes & decisions</CardTitle><div><AddNote projectId={project.id} /></div></CardHeader>
            <CardContent className="space-y-3">
              {notes.map((n) => (
                <div key={n.id} className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="mt-1 text-sm text-muted">{n.body}</p>
                  <p className="mt-1 text-[11px] text-faint">{formatDate(n.created_at, true)}</p>
                </div>
              ))}
              {notes.length === 0 && <p className="text-sm text-muted">No notes yet.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Goals</CardTitle></CardHeader>
            <CardContent>
              {goals.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{goals.map((g, i) => <li key={i}>{g}</li>)}</ul> : <p className="text-sm text-muted">No goals set.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Next actions</CardTitle></CardHeader>
            <CardContent>
              {next.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{next.map((a, i) => <li key={i}>{a}</li>)}</ul> : <p className="text-sm text-muted">No next actions.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
            <CardContent>
              <Link href="/documents" className="text-sm text-accent">Manage documents →</Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
