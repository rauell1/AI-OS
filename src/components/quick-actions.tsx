"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { runDailyBriefNow } from "@/app/actions/automations";

export function RunBriefButton() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  return (
    <Button variant="outline" size="sm" disabled={loading}
      onClick={async () => { setLoading(true); await runDailyBriefNow(); router.refresh(); setLoading(false); }}>
      {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Run brief
    </Button>
  );
}
