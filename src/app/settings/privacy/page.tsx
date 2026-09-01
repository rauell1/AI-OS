import { getDb, runAsUser } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { aiProviderStatus } from "@/lib/ai";

export default async function PrivacyDashboard() {
  const user = await requireUser();
  const db = await getDb();
  
  const integrations = await db.query(`SELECT * FROM integrations WHERE user_id = ?`, [user.id]);
  const aiProviders = aiProviderStatus().filter((p) => p.configured);
  
  async function revokeAccess(formData: FormData) {
    "use server";
    const user = await requireUser();
    const db = await getDb();
    const integrationId = formData.get("integration_id") as string;
    await db.run(`UPDATE integrations SET status = 'disconnected', token_meta_json = '{}', permissions_json = '{}' WHERE id = ? AND user_id = ?`, [integrationId, user.id]);
    await db.run(`DELETE FROM integration_tokens WHERE integration_id = ?`, [integrationId]);
    revalidatePath("/settings/privacy");
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-semibold mb-2">Privacy & Integrations</h1>
      <p className="text-zinc-400 mb-8">Manage connected services, API access, and granular data permissions. Revoking access will immediately destroy any stored credentials.</p>
      
      <div className="grid gap-6">
        {integrations.length === 0 ? (
          <div className="p-8 border border-zinc-800 rounded-xl text-center text-zinc-500">
            No active integrations connected.
          </div>
        ) : (
          integrations.map((i) => (
            <div key={i.id} className="p-6 border border-zinc-800 rounded-xl bg-zinc-900/50 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-medium capitalize">{i.provider}</h3>
                <p className="text-sm text-zinc-400 mt-1">Status: <span className={i.status === 'connected' ? 'text-green-400' : 'text-zinc-500'}>{i.status}</span></p>
                <div className="mt-4">
                  <span className="text-xs font-mono bg-zinc-800 text-zinc-300 px-2 py-1 rounded">Scope: {JSON.parse(i.permissions_json || '{}').scope || 'Read-only defaults'}</span>
                </div>
              </div>
              <form action={revokeAccess}>
                <input type="hidden" name="integration_id" value={i.id} />
                <button type="submit" className="px-4 py-2 bg-red-900/50 hover:bg-red-800 text-red-100 text-sm font-medium rounded-lg transition-colors">
                  Revoke Access
                </button>
              </form>
            </div>
          ))
        )}
      </div>

      <h2 className="mt-10 mb-2 text-xl font-semibold">Where your data goes</h2>
      <p className="mb-4 text-sm text-zinc-400">
        Everything below leaves this application. Everything not listed stays in your own database.
      </p>
      <div className="space-y-3 text-sm">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="font-medium">Your database</p>
          <p className="mt-1 text-zinc-400">
            Neon PostgreSQL, over TLS. Passwords are stored as bcrypt hashes and integration tokens
            are encrypted with AES-256-GCM before they are written, so neither is readable from the
            database alone. Row level security scopes every query to your account.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="font-medium">Connected services</p>
          <p className="mt-1 text-zinc-400">
            {integrations.filter((i) => i.status === "connected").length > 0
              ? `Read access to ${integrations.filter((i) => i.status === "connected").map((i) => i.provider).join(", ")}. Revoking above deletes the stored token immediately.`
              : "None connected."}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="font-medium">AI providers</p>
          {aiProviders.length > 0 ? (
            <p className="mt-1 text-zinc-400">
              Text you ask the assistant about is sent to{" "}
              <span className="text-zinc-200">{aiProviders.map((p) => p.provider).join(", ")}</span>{" "}
              to be processed — that includes email bodies when you triage them, CV text when you
              tailor an application, and opportunity descriptions when they are scored. This is how
              those features work; there is no on-device model. Scoring, matching and deduplication
              are rule-based and never leave this application.
            </p>
          ) : (
            <p className="mt-1 text-zinc-400">
              None configured, so nothing is sent to a model provider. AI features are inactive.
            </p>
          )}
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="font-medium">Never sent anywhere</p>
          <p className="mt-1 text-zinc-400">
            Your password hash and your stored OAuth tokens. Neither is included in an account
            export, and neither is written to a log.
          </p>
        </div>
      </div>
    </div>
  );
}
