"use client";

import * as React from "react";
import { useTransition } from "react";
import { Trash2, Check } from "lucide-react";
import { NativeSelect, Button } from "@/components/ui";
import { updateTaskStatus, deleteTask, saveTaskPriority } from "@/app/actions/tasks";
import { formatDate } from "@/lib/utils";

const statusOptions = ["inbox", "next", "in_progress", "waiting", "blocked", "scheduled", "done", "cancelled"];
const priorityOptions = [1, 2, 3, 4, 5];

export function TaskRow({ task }: { task: any }) {
  const [pending, start] = useTransition();
  const overdue = task.due_date && new Date(task.due_date).getTime() < Date.now() && task.status !== "done";
  return (
    <div className={`flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 ${task.status === "done" ? "opacity-60" : ""}`}>
      <button
        onClick={() => start(() => updateTaskStatus(task.id, task.status === "done" ? "inbox" : "done"))}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${task.status === "done" ? "border-accent bg-accent text-accent-fg" : "border-border-strong"}`}
        aria-label="Toggle done"
      >
        {task.status === "done" && <Check size={12} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${task.status === "done" ? "line-through" : ""}`}>{task.title}</p>
        <p className="text-[11px] text-muted">
          {task.due_date ? <span className={overdue ? "text-danger" : ""}>{formatDate(task.due_date)}</span> : "No due date"}
          {task.effort ? ` · ${task.effort}` : ""}
          {task.ai_reasoning ? ` · ${task.ai_reasoning}` : ""}
        </p>
      </div>
      <NativeSelect
        className="h-8 w-32 text-xs"
        value={task.status}
        onChange={(e) => start(() => updateTaskStatus(task.id, e.target.value))}
        disabled={pending}
      >
        {statusOptions.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
      </NativeSelect>
      <NativeSelect
        className="h-8 w-16 text-xs"
        value={String(task.priority)}
        onChange={(e) => start(() => saveTaskPriority(task.id, parseInt(e.target.value)))}
        disabled={pending}
      >
        {priorityOptions.map((p) => <option key={p} value={p}>P{p}</option>)}
      </NativeSelect>
      <button onClick={() => start(() => deleteTask(task.id))} className="text-faint hover:text-danger" aria-label="Delete">
        <Trash2 size={15} />
      </button>
    </div>
  );
}
