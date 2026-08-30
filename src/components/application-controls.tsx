"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { NativeSelect, Button, Input, Textarea, Label } from "@/components/ui";
import { setApplicationStatus, addRequirement, toggleRequirement, addQuestion, requestCVApproval, requestCoverLetterApproval } from "@/app/actions/applications";

const STATUSES = ["discovered","reviewing","shortlisted","preparing","ready_for_review","ready_to_submit","submitted","interview","assessment","offer","rejected","withdrawn","waitlisted","accepted","archived"];

export function ApplicationStatusSelect({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <NativeSelect className="h-9 w-48 text-sm" value={status} disabled={pending}
      onChange={(e) => start(async () => { await setApplicationStatus(id, e.target.value); router.refresh(); })}>
      {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
    </NativeSelect>
  );
}

export function AddRequirementForm({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  return (
    <form action={async (fd) => { await addRequirement(applicationId, fd.get("label") as string, fd.get("required") === "on"); router.refresh(); }} className="flex gap-2">
      <Input name="label" placeholder="Required document or step" className="h-8 text-sm" />
      <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" name="required" defaultChecked /> Req</label>
      <Button type="submit" size="sm" variant="primary">Add</Button>
    </form>
  );
}

export function RequirementToggle({ id, satisfied }: { id: string; satisfied: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button onClick={() => start(() => toggleRequirement(id, !satisfied))} disabled={pending}
      className={`flex h-5 w-5 items-center justify-center rounded-full border ${satisfied ? "border-success bg-success text-white" : "border-border-strong"}`}>
      {satisfied ? "✓" : ""}
    </button>
  );
}

export function AddQuestionForm({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  return (
    <form action={async (fd) => { await addQuestion(applicationId, fd.get("question") as string, fd.get("canonical") as string); router.refresh(); }} className="space-y-2 rounded-lg border border-border p-3">
      <Input name="question" placeholder="Question prompt" />
      <Textarea name="canonical" rows={2} placeholder="Canonical answer (optional)" />
      <Button type="submit" size="sm" variant="primary">Add question</Button>
    </form>
  );
}

export function GenerateButtons({ applicationId }: { applicationId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={pending}
        onClick={() => start(async () => { await requestCVApproval(applicationId); router.push("/approvals"); })}>
        Generate CV
      </Button>
      <Button size="sm" variant="outline" disabled={pending}
        onClick={() => start(async () => { await requestCoverLetterApproval(applicationId); router.push("/approvals"); })}>
        Generate cover letter
      </Button>
    </div>
  );
}
