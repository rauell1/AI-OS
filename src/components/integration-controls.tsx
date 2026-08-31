"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plug, Check, RefreshCw, Unlink, AlertTriangle } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { getAuthUrl, syncIntegrationAction, disconnectIntegrationAction } from "@/app/actions/integrations";

export function IntegrationCard({ item }: { item: any }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = React.useState<string>();

  const connect = async () => {
    setError(undefined);
    const { url, configured } = await getAuthUrl(item.key);
    if (!configured || !url) { setError("Provider not configured. Add credentials to .env.local."); return; }
    window.location.href = url;
  };
  const sync = () => start(async () => {
    if (item.integrationId) {
      try {
        const result = await syncIntegrationAction(item.integrationId);
        if (result && result.errors && result.errors.length > 0) {
          setError(result.errors.join(", "));
        } else {
          setError(undefined);
        }
      } catch (err: any) {
        setError(err.message || "Failed to sync.");
      }
      router.refresh();
    }
  });
  const disconnect = () => start(async () => { if (item.integrationId) { await disconnectIntegrationAction(item.integrationId); router.refresh(); } });

  const connected = item.status === "connected";

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold">{item.name}</p>
          <p className="mt-0.5 text-xs text-muted">{item.description}</p>
        </div>
        {connected ? <Badge tone="success"><Check size={11} /> Connected</Badge>
          : item.configured ? <Badge tone="warning">Not connected</Badge>
          : <Badge tone="neutral">Unconfigured</Badge>}
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {!item.configured && (
        <div className="mt-3 rounded-lg border border-border bg-surface-2/50 p-2 text-[11px] text-muted">
          <p className="flex items-center gap-1 text-warning"><AlertTriangle size={12} /> Configuration required</p>
          <p className="mt-1">Add the relevant client ID/secret to <code>.env.local</code> (see README). The adapter and callback route are fully implemented.</p>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        {!connected && item.configured && (
          <Button size="sm" variant="primary" onClick={connect} disabled={pending}><Plug size={13} /> Connect</Button>
        )}
        {connected && (
          <>
            <Button size="sm" variant="outline" onClick={sync} disabled={pending}><RefreshCw size={13} /> Sync</Button>
            <Button size="sm" variant="ghost" onClick={disconnect} disabled={pending}><Unlink size={13} /> Disconnect</Button>
            <span className="text-[11px] text-faint">{item.lastSynced ? `Synced ${new Date(item.lastSynced).toLocaleString()}` : "Not synced yet"}</span>
          </>
        )}
      </div>
    </div>
  );
}
