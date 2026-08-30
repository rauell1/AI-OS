import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { parseJSON } from "@/lib/utils";
import { PageHeader } from "@/components/widgets";
import { Badge, Card, CardContent } from "@/components/ui";
import { TaskFormDialog } from "@/components/modals";
import { TaskRow } from "@/components/task-controls";
import { autoPrioritizeForm } from "@/app/actions/tasks";

const FILTERS = ["all", "inbox", "next", "in_progress", "waiting", "blocked", "scheduled", "done", "cancelled"];

export default async function TasksPage({ searchParams }: { searchParams: { status?: string } }) {
  const user = await requireUser();
  const status = searchParams.status && searchParams.status !== "all" ? searchParams.status : null;
  const db = await getDb();
  const sql = `SELECT * FROM tasks WHERE user_id = ? ${status ? "AND status = ?" : ""} ORDER BY (due_date IS NULL), due_date ASC, priority DESC`;
  const [tasks, countRows, projects] = await Promise.all([
    db.query(sql, status ? [user.id, status] : [user.id]),
    db.query<{ status: string; c: number }>(
      `SELECT status, COUNT(*) c FROM tasks WHERE user_id = ? GROUP BY status`,
      [user.id]
    ),
    db.query<{ id: string; name: string }>(`SELECT id, name FROM projects WHERE user_id = ?`, [user.id]),
  ]);
  const counts: Record<string, number> = Object.fromEntries(FILTERS.map((filter) => [filter, 0]));
  for (const row of countRows) {
    counts[row.status] = row.c;
    counts.all += row.c;
  }

  return (
    <div>
      <PageHeader title="Tasks" description="Unified task system across projects, email, applications and AI recommendations."
        action={<TaskFormDialog projects={projects} />} />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f} href={f === "all" ? "/tasks" : `/tasks?status=${f}`}
            className={`rounded-full border px-3 py-1 text-xs ${status === (f === "all" ? null : f) ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2"}`}>
            {f.replace(/_/g, " ")} <span className="opacity-60">{counts[f]}</span>
          </Link>
        ))}
        <form action={autoPrioritizeForm} className="ml-auto">
          <button className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:bg-surface-2">Auto-prioritize</button>
        </form>
      </div>

      <div className="space-y-2">
        {tasks.length === 0 && <Card><CardContent><p className="text-sm text-muted">No tasks here. Create one with the button above.</p></CardContent></Card>}
        {tasks.map((t) => <TaskRow key={t.id} task={t} />)}
      </div>
    </div>
  );
}
