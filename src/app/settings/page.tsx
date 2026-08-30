import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getMasterProfile } from "@/lib/profile";
import { parseJSON } from "@/lib/utils";
import { PageHeader, KeyValue } from "@/components/widgets";
import { Badge, Card, CardContent, CardHeader, CardTitle, Button, Input, Label, Textarea } from "@/components/ui";
import { ProfileSettings, AISettings } from "@/components/settings-client";
import { getIntegrationStatus } from "@/app/actions/integrations";
import { createGoalForm } from "@/app/actions/automations";
import { aiProviderStatus } from "@/lib/ai";

export default async function SettingsPage() {
  const user = await requireUser();
  const [mp, prefsRow, integrations] = await Promise.all([
    getMasterProfile(user.id),
    getDb().then((db) => db.get(`SELECT prefs_json FROM user_preferences WHERE user_id = ?`, [user.id])),
    getIntegrationStatus(),
  ]);
  const prefs = parseJSON<{ aiProvider?: string }>(prefsRow?.prefs_json, {});
  const providers = aiProviderStatus();
  const requestedProvider = prefs.aiProvider || process.env.AI_DEFAULT_PROVIDER || "openai";
  const effectiveProvider = providers.find((item) => item.provider === requestedProvider && item.configured)?.provider
    || providers.find((item) => item.configured)?.provider
    || requestedProvider;
  const goals = mp.goals;

  return (
    <div>
      <PageHeader title="Settings" description="Profile, AI models, integrations, privacy, goals and data export." />

      <div className="space-y-5">
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent><ProfileSettings headline={mp.headline} summary={mp.profile?.summary} location={mp.profile?.location} nationality={mp.profile?.nationality} linkedin={mp.profile?.linkedin_url} portfolio={mp.profile?.portfolio_url} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>AI models</CardTitle></CardHeader>
          <CardContent><AISettings provider={effectiveProvider} providers={providers} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Privacy & connected services</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {integrations.map((i) => (
              <div key={i.key} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                <div>
                  <p className="text-sm font-medium">{i.name}</p>
                  <p className="text-[11px] text-muted">{i.configured ? (i.status === "connected" ? "Connected · encrypted tokens at rest" : "Configured, not connected") : "Not configured"}</p>
                </div>
                <Badge tone={i.status === "connected" ? "success" : i.configured ? "warning" : "neutral"}>{i.status.replace(/_/g, " ")}</Badge>
              </div>
            ))}
            <a href="/integrations" className="inline-block pt-2"><Button size="sm" variant="primary">Connect and sync services</Button></a>
            <a href="/settings/privacy" className="inline-block mt-3 mb-2"><Button size="sm" variant="outline">Manage Privacy & Access</Button></a>
            <p className="text-[11px] text-faint">Gmail/calendar read-only by default. Drive uses selected folders. GitHub is read-only. AI processing of documents requires explicit approval.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Goals</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {goals.map((g) => <div key={g.id} className="rounded-lg border border-border p-2.5 text-sm"><span className="font-medium">{g.title}</span><p className="text-[11px] text-muted">{g.description}</p></div>)}
            <form action={createGoalForm} className="flex gap-2 rounded-lg border border-border p-2">
              <Input name="title" placeholder="New goal" className="h-8 text-sm" />
              <Input name="description" placeholder="Description" className="h-8 text-sm" />
              <Button type="submit" size="sm" variant="primary">Add</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Data & account</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <a href="/api/export"><Button size="sm" variant="outline">Export all data (JSON)</Button></a>
            <span className="text-[11px] text-muted">You are never locked in. Export includes every table.</span>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
