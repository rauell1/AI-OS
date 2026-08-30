"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { NativeSelect, Textarea, Input, Button, Label } from "@/components/ui";
import { setProjectStatus, addProjectNote, addProjectTask } from "@/app/actions/projects";

export function ProjectStatusSelect({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <NativeSelect
      className="h-8 w-36 text-xs"
      value={status}
      disabled={pending}
      onChange={(e) => start(async () => { await setProjectStatus(id, e.target.value); router.refresh(); })}
    >
      <option value="active">Active</option>
      <option value="planning">Planning</option>
      <option value="on_hold">On hold</option>
      <option value="completed">Completed</option>
    </NativeSelect>
  );
}

export function AddNote({ projectId }: { projectId: string }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  return (
    <div>
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-xs text-accent">+ Add note</button>
      ) : (
        <form action={async (fd) => { await addProjectNote(projectId, fd.get("title") as string, fd.get("body") as string); setOpen(false); router.refresh(); }} className="space-y-2 rounded-lg border border-border p-3">
          <Input name="title" placeholder="Note title" />
          <Textarea name="body" rows={3} placeholder="What happened, decided, or needs doing?" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">Cancel</button>
            <Button type="submit" size="sm" variant="primary">Save</Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function AddTaskInline({ projectId }: { projectId: string }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  return (
    <div>
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-xs text-accent">+ Add task</button>
      ) : (
        <form action={async (fd) => { await addProjectTask(projectId, fd.get("title") as string, fd.get("due") as string || undefined); setOpen(false); router.refresh(); }} className="flex gap-2">
          <Input name="title" placeholder="Task title" className="h-8 text-sm" />
          <Input type="date" name="due" className="h-8 w-40 text-sm" />
          <Button type="submit" size="sm" variant="primary">Add</Button>
        </form>
      )}
    </div>
  );
}
