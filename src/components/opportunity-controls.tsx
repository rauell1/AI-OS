"use client";

import * as React from "react";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Star, X, FilePlus2 } from "lucide-react";
import { Button, NativeSelect } from "@/components/ui";
import { scoreOpportunity, setOpportunityStatus, createApplicationFromOpportunity } from "@/app/actions/opportunities";

const SKIP_REASONS = ["Not eligible", "Poor fit", "Location", "Compensation", "Deadline passed", "Not interested", "Duplicate"];

export function OpportunityRow({ opp, score }: { opp: any; score?: { overall: number; recommendation: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showSkip, setShowSkip] = useState(false);
  const [reason, setReason] = useState(SKIP_REASONS[0]);

  const scoreNow = () => start(async () => { await scoreOpportunity(opp.id); router.refresh(); });
  const shortlist = () => start(async () => { await setOpportunityStatus(opp.id, "shortlisted"); router.refresh(); });
  const skip = () => start(async () => { await setOpportunityStatus(opp.id, "skipped", reason); router.refresh(); });
  const toApp = () => start(async () => { const r = await createApplicationFromOpportunity(opp.id); if (r.id) router.push(`/applications/${r.id}`); });

  const isNew = opp.status === "discovered";

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{opp.title}</p>
          <p className="text-[11px] text-muted">{opp.type} {opp.location ? `· ${opp.location}` : ""} {opp.deadline ? `· due ${opp.deadline}` : ""}</p>
        </div>
        {score && (
          <div className="shrink-0 text-right">
            <span className="text-lg font-semibold tnum">{Math.round(score.overall)}%</span>
            <p className="text-[10px] text-muted">{score.recommendation}</p>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!score && (
          <Button size="sm" variant="outline" onClick={scoreNow} disabled={pending}><Sparkles size={13} /> Score</Button>
        )}
        {isNew && (
          <>
            <Button size="sm" variant="primary" onClick={shortlist} disabled={pending}><Star size={13} /> Shortlist</Button>
            {!showSkip ? (
              <Button size="sm" variant="ghost" onClick={() => setShowSkip(true)} disabled={pending}><X size={13} /> Skip</Button>
            ) : (
              <>
                <NativeSelect className="h-8 w-40 text-xs" value={reason} onChange={(e) => setReason(e.target.value)}>
                  {SKIP_REASONS.map((r) => <option key={r}>{r}</option>)}
                </NativeSelect>
                <Button size="sm" variant="danger" onClick={skip} disabled={pending}>Confirm</Button>
              </>
            )}
          </>
        )}
        {(opp.status === "shortlisted" || opp.status === "discovered") && (
          <Button size="sm" variant="outline" onClick={toApp} disabled={pending}><FilePlus2 size={13} /> To application</Button>
        )}
        {opp.source_url && (
          <a href={opp.source_url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">Source ↗</a>
        )}
      </div>
    </div>
  );
}
