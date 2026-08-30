"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui";
import { resolveApproval } from "@/app/actions/approvals";

export function ApprovalCard({ approval }: { approval: any }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const decide = (d: "approved" | "rejected") => start(async () => { await resolveApproval(approval.id, d); router.refresh(); });
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase text-accent">{approval.type.replace(/_/g, " ")}</span>
          <p className="mt-1 text-sm font-medium">{approval.proposed_action}</p>
        </div>
        <span className="text-[11px] text-faint">{new Date(approval.created_at).toLocaleString()}</span>
      </div>
      {approval.why && <p className="mt-2 text-xs text-muted">{approval.why}</p>}
      {approval.ai_reasoning && <p className="mt-1 text-[11px] text-faint">AI: {approval.ai_reasoning}</p>}
      {approval.preview && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-2 text-[11px] text-muted">{approval.preview}</pre>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="primary" disabled={pending} onClick={() => decide("approved")}><Check size={14} /> Approve</Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={() => decide("rejected")}><X size={14} /> Reject</Button>
      </div>
    </div>
  );
}
