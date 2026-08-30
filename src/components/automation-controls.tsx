"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Pause, Plus } from "lucide-react";
import { Button, Input, Label, NativeSelect, Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui";
import { createRule, toggleRule, runRuleById } from "@/app/actions/automations";

const TRIGGERS = ["daily_brief", "integration_sync", "deadline_alerts", "followup_reminders", "weekly_review", "opportunity_scan"];
const FREQ = ["hourly", "daily", "weekly", "monthly"];

export function CreateAutomation() {
  const router = useRouter();
  const [error, setError] = React.useState<string>();
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError(undefined);
    const res = await createRule(new FormData(e.currentTarget));
    if (res?.error) return setError(res.error);
    router.refresh();
  };
  return (
    <Dialog>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Plus size={15} /> New automation</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New automation</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
          <div><Label>Name</Label><Input name="name" required placeholder="Daily brief at 7am" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Trigger</Label><NativeSelect name="trigger" defaultValue="daily_brief">{TRIGGERS.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</NativeSelect></div>
            <div><Label>Frequency</Label><NativeSelect name="frequency" defaultValue="daily">{FREQ.map((f) => <option key={f} value={f}>{f}</option>)}</NativeSelect></div>
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

export function AutomationRow({ rule }: { rule: any }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-3">
      <div>
        <p className="text-sm font-medium">{rule.name}</p>
        <p className="text-[11px] text-muted">{rule.trigger.replace(/_/g, " ")} · {rule.frequency} · next {rule.next_run ? new Date(rule.next_run).toLocaleString() : "—"}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-[11px] ${rule.status === "active" ? "text-success" : "text-faint"}`}>{rule.status}</span>
        <button onClick={() => start(async () => { await toggleRule(rule.id, rule.status === "active" ? "paused" : "active"); router.refresh(); })}
          className="rounded-lg border border-border p-1.5 text-muted hover:bg-surface-2" aria-label="Toggle">
          {rule.status === "active" ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button onClick={() => start(async () => { await runRuleById(rule.id); router.refresh(); })} disabled={pending}
          className="rounded-lg border border-accent/30 bg-accent-soft p-1.5 text-accent hover:bg-accent/10" aria-label="Run now">
          <Play size={14} />
        </button>
      </div>
    </div>
  );
}
