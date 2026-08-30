"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { createOpportunity } from "@/app/actions/opportunities";
import {
  Button, Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, Input, Label, NativeSelect, Textarea,
} from "@/components/ui";

export function OpportunityFormDialog({ organizations = [] }: { organizations?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    const result = await createOpportunity(new FormData(event.currentTarget));
    if (result?.error) return setError(result.error);
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="primary" size="sm"><Plus size={15} /> Add opportunity</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add opportunity</DialogTitle><p className="text-sm text-muted">Job, scholarship, programme, fellowship or grant.</p></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
          <div><Label>Title</Label><Input name="title" required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Type</Label><NativeSelect name="type" defaultValue="job"><option value="job">Job</option><option value="scholarship">Scholarship</option><option value="programme">Programme</option><option value="fellowship">Fellowship</option><option value="grant">Grant</option></NativeSelect></div>
            <div><Label>Organization</Label><NativeSelect name="organization_id" defaultValue=""><option value="">None</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</NativeSelect></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Deadline</Label><Input type="date" name="deadline" /></div>
            <div><Label>Location</Label><Input name="location" placeholder="Nairobi, Kenya" /></div>
          </div>
          <div><Label>Source URL</Label><Input name="source_url" placeholder="https://" /></div>
          <div><Label>Description</Label><Textarea name="description" rows={3} /></div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
            <Button type="submit" variant="primary">Add</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
