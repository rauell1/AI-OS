"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { createTask } from "@/app/actions/tasks";
import {
  Button, Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, Input, Label, NativeSelect, Textarea,
} from "@/components/ui";

export function TaskFormDialog({ projects = [] }: { projects?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    const form = event.currentTarget;
    const result = await createTask(new FormData(form));
    if (result?.error) return setError(result.error);
    form.reset();
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm"><Plus size={15} /> New task</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <p className="text-sm text-muted">Capture something that needs Roy&apos;s attention.</p>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
          <div><Label>Title</Label><Input name="title" required placeholder="e.g. Submit Erasmus motivation letter" /></div>
          <div><Label>Description</Label><Textarea name="description" rows={2} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Due date</Label><Input type="date" name="due_date" /></div>
            <div><Label>Priority</Label><NativeSelect name="priority" defaultValue="3">
              <option value="1">P1 (low)</option><option value="2">P2</option><option value="3">P3 (medium)</option><option value="4">P4</option><option value="5">P5 (urgent)</option>
            </NativeSelect></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Effort</Label><Input name="effort" placeholder="1h" /></div>
            <div><Label>Project</Label><NativeSelect name="project_id" defaultValue="">
              <option value="">None</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </NativeSelect></div>
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
            <Button type="submit" variant="primary">Create</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
