"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Button, Input, Label, Textarea, NativeSelect, Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose,
} from "@/components/ui";
import { createTask } from "@/app/actions/tasks";
import { createProject } from "@/app/actions/projects";
import { createOpportunity } from "@/app/actions/opportunities";
import { createOrganization, createPerson, createLead } from "@/app/actions/network";
import { uploadDocument } from "@/app/actions/documents";

function Modal({ title, description, trigger, children }: { title: string; description?: string; trigger: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle>{description && <p className="text-sm text-muted">{description}</p>}</DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function AddButton({ label, variant = "primary" }: { label: string; variant?: "primary" | "default" | "outline" | "ghost" }) {
  return <Button variant={variant} size="sm"><Plus size={15} /> {label}</Button>;
}

function Err({ error }: { error?: string }) {
  return error ? <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div> : null;
}

export function TaskFormDialog({ projects = [] }: { projects?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = React.useState<string>();
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(undefined);
    const res = await createTask(new FormData(e.currentTarget));
    if (res?.error) return setError(res.error);
    router.refresh();
    (e.target as HTMLFormElement).reset();
  };
  return (
    <Modal title="New task" description="Capture something that needs Roy's attention." trigger={<AddButton label="New task" />}>
      <form onSubmit={submit} className="space-y-3">
        <Err error={error} />
        <div><Label>Title</Label><Input name="title" required placeholder="e.g. Submit Erasmus motivation letter" /></div>
        <div><Label>Description</Label><Textarea name="description" rows={2} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Due date</Label><Input type="date" name="due_date" /></div>
          <div><Label>Priority</Label>
            <NativeSelect name="priority" defaultValue="3">
              <option value="1">P1 (low)</option><option value="2">P2</option><option value="3">P3 (medium)</option><option value="4">P4</option><option value="5">P5 (urgent)</option>
            </NativeSelect>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Effort</Label><Input name="effort" placeholder="1h" /></div>
          <div><Label>Project</Label>
            <NativeSelect name="project_id" defaultValue="">
              <option value="">None</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </NativeSelect>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
          <Button type="submit" variant="primary">Create</Button>
        </div>
      </form>
    </Modal>
  );
}

export function ProjectFormDialog() {
  const router = useRouter();
  const [error, setError] = React.useState<string>();
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError(undefined);
    const res = await createProject(new FormData(e.currentTarget));
    if (res?.error) return setError(res.error);
    router.refresh();
  };
  return (
    <Modal title="New project" trigger={<AddButton label="New project" />}>
      <form onSubmit={submit} className="space-y-3">
        <Err error={error} />
        <div><Label>Name</Label><Input name="name" required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Category</Label>
            <NativeSelect name="category" defaultValue="Product"><option>Product</option><option>Company</option><option>Learning</option><option>Portfolio</option><option>Volunteer</option><option>Consulting</option></NativeSelect>
          </div>
          <div><Label>Status</Label>
            <NativeSelect name="status" defaultValue="active"><option value="active">Active</option><option value="planning">Planning</option><option value="on_hold">On hold</option><option value="completed">Completed</option></NativeSelect>
          </div>
        </div>
        <div><Label>Overview</Label><Textarea name="overview" rows={3} /></div>
        <div className="flex justify-end gap-2">
          <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
          <Button type="submit" variant="primary">Create</Button>
        </div>
      </form>
    </Modal>
  );
}

export function OpportunityFormDialog({ organizations = [] }: { organizations?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = React.useState<string>();
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError(undefined);
    const res = await createOpportunity(new FormData(e.currentTarget));
    if (res?.error) return setError(res.error);
    router.refresh();
  };
  return (
    <Modal title="Add opportunity" description="Job, scholarship, programme, fellowship or grant." trigger={<AddButton label="Add opportunity" />}>
      <form onSubmit={submit} className="space-y-3">
        <Err error={error} />
        <div><Label>Title</Label><Input name="title" required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Type</Label>
            <NativeSelect name="type" defaultValue="job"><option value="job">Job</option><option value="scholarship">Scholarship</option><option value="programme">Programme</option><option value="fellowship">Fellowship</option><option value="grant">Grant</option></NativeSelect>
          </div>
          <div><Label>Organization</Label>
            <NativeSelect name="organization_id" defaultValue=""><option value="">None</option>{organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</NativeSelect>
          </div>
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
    </Modal>
  );
}

export function OrgFormDialog() {
  const router = useRouter();
  const [error, setError] = React.useState<string>();
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError(undefined);
    const res = await createOrganization(new FormData(e.currentTarget));
    if (res?.error) return setError(res.error);
    router.refresh();
  };
  return (
    <Modal title="Add organization" trigger={<AddButton label="Add org" variant="outline" />}>
      <form onSubmit={submit} className="space-y-3">
        <Err error={error} />
        <div><Label>Name</Label><Input name="name" required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Type</Label><NativeSelect name="type" defaultValue="other"><option>employer</option><option>university</option><option>company</option><option>nonprofit</option><option>client</option><option>lead</option><option>other</option></NativeSelect></div>
          <div><Label>Industry</Label><Input name="industry" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Location</Label><Input name="location" /></div><div><Label>Website</Label><Input name="website" placeholder="https://" /></div>
        </div>
        <div><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
        <div className="flex justify-end gap-2">
          <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
          <Button type="submit" variant="primary">Add</Button>
        </div>
      </form>
    </Modal>
  );
}

export function PersonFormDialog({ organizations = [] }: { organizations?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = React.useState<string>();
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError(undefined);
    const res = await createPerson(new FormData(e.currentTarget));
    if (res?.error) return setError(res.error);
    router.refresh();
  };
  return (
    <Modal title="Add person" trigger={<AddButton label="Add person" variant="outline" />}>
      <form onSubmit={submit} className="space-y-3">
        <Err error={error} />
        <div><Label>Name</Label><Input name="name" required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Title</Label><Input name="title" /></div>
          <div><Label>Organization</Label><NativeSelect name="organization_id" defaultValue=""><option value="">None</option>{organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</NativeSelect></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Email</Label><Input name="email" type="email" /></div><div><Label>Phone</Label><Input name="phone" /></div>
        </div>
        <div><Label>Relationship</Label><Input name="relationship" placeholder="Recruiter, referee, colleague…" /></div>
        <div><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
        <div className="flex justify-end gap-2">
          <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
          <Button type="submit" variant="primary">Add</Button>
        </div>
      </form>
    </Modal>
  );
}

export function LeadFormDialog({ organizations = [], people = [] }: { organizations?: { id: string; name: string }[]; people?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = React.useState<string>();
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError(undefined);
    const res = await createLead(new FormData(e.currentTarget));
    if (res?.error) return setError(res.error);
    router.refresh();
  };
  return (
    <Modal title="Add lead" description="Separate observed evidence from inference and hypothesis." trigger={<AddButton label="Add lead" variant="outline" />}>
      <form onSubmit={submit} className="space-y-3">
        <Err error={error} />
        <div><Label>Relevant solution / capability</Label><Input name="solution" required placeholder="Solar feasibility study" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Organization</Label><NativeSelect name="organization_id" defaultValue=""><option value="">None</option>{organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</NativeSelect></div>
          <div><Label>Contact</Label><NativeSelect name="person_id" defaultValue=""><option value="">None</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></div>
        </div>
        <div><Label>Observed evidence (fact)</Label><Textarea name="observed_evidence" rows={2} /></div>
        <div><Label>Inference</Label><Textarea name="inference" rows={2} /></div>
        <div><Label>Hypothesis</Label><Textarea name="hypothesis" rows={2} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Confidence (0-1)</Label><Input name="confidence" defaultValue="0.5" /></div>
          <div><Label>Score (0-100)</Label><Input name="score" defaultValue="50" /></div>
        </div>
        <div className="flex justify-end gap-2">
          <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
          <Button type="submit" variant="primary">Add</Button>
        </div>
      </form>
    </Modal>
  );
}

export function DocumentDialog() {
  const router = useRouter();
  const [error, setError] = React.useState<string>();
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError(undefined);
    const res = await uploadDocument(new FormData(e.currentTarget));
    if (res?.error) return setError(res.error);
    router.refresh();
  };
  return (
    <Modal title="Upload document" description="Stored locally; metadata in the database." trigger={<AddButton label="Upload" />}>
      <form onSubmit={submit} className="space-y-3">
        <Err error={error} />
        <div><Label>File</Label><Input type="file" name="file" required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Name</Label><Input name="name" placeholder="Degree certificate" /></div>
          <div><Label>Category</Label><NativeSelect name="category" defaultValue="general"><option value="cv">CV</option><option value="certificate">Certificate</option><option value="transcript">Transcript</option><option value="degree">Degree</option><option value="passport">Passport</option><option value="id">ID</option><option value="recommendation">Recommendation</option><option value="portfolio">Portfolio</option><option value="proposal">Proposal</option><option value="general">General</option></NativeSelect></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Issuer</Label><Input name="issuer" /></div>
          <div><Label>Sensitivity</Label><NativeSelect name="sensitivity" defaultValue="normal"><option value="normal">Normal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option></NativeSelect></div>
        </div>
        <div className="flex justify-end gap-2">
          <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
          <Button type="submit" variant="primary">Upload</Button>
        </div>
      </form>
    </Modal>
  );
}
