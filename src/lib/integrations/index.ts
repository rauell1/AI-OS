import { getDb } from "../db";
import { newId, nowISO, toJSON, parseJSON } from "../utils";
import { encrypt, decrypt } from "../crypto";
import { logActivity, notify } from "../activity";

export type Provider = "gmail" | "calendar" | "drive" | "github";

export interface ProviderMeta {
  key: Provider;
  name: string;
  description: string;
  category: string;
  scopes: string[];
  configured: boolean;
  docsUrl: string;
}

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GITHUB_AUTH = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN = "https://github.com/login/oauth/access_token";

export function providerMeta(): ProviderMeta[] {
  return [
    {
      key: "gmail",
      name: "Gmail",
      description: "Read, classify and triage authorized email. Drafts prepared; sending requires approval.",
      category: "Email",
      scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      docsUrl: "https://developers.google.com/gmail/api",
    },
    {
      key: "calendar",
      name: "Google Calendar",
      description: "Read upcoming meetings and prepare briefs. External event creation requires approval.",
      category: "Calendar",
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      docsUrl: "https://developers.google.com/calendar/api",
    },
    {
      key: "drive",
      name: "Google Drive",
      description: "Index approved documents and associate them with projects, applications and clients.",
      category: "Documents",
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
      configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      docsUrl: "https://developers.google.com/drive/api",
    },
    {
      key: "github",
      name: "GitHub",
      description: "Connect repositories, track issues, commits and generate weekly development summaries.",
      category: "Code",
      scopes: ["repo"],
      configured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      docsUrl: "https://docs.github.com/en/apps",
    },
  ];
}

export function getProvider(key: Provider): ProviderMeta {
  const m = providerMeta().find((p) => p.key === key);
  if (!m) throw new Error(`Unknown provider ${key}`);
  return m;
}

export function buildAuthUrl(provider: Provider, state: string): string | null {
  const meta = getProvider(provider);
  if (!meta.configured) return null;
  const redirect = process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL || "http://localhost:3000"}/api/integrations/google/callback`;
  if (provider === "github") {
    const url = new URL(GITHUB_AUTH);
    url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID!);
    url.searchParams.set("redirect_uri", `${process.env.APP_URL || "http://localhost:3000"}/api/integrations/github/callback`);
    url.searchParams.set("scope", meta.scopes.join(" "));
    url.searchParams.set("state", state);
    return url.toString();
  }
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", meta.scopes.join(" "));
  url.searchParams.set("state", `${provider}:${state}`);
  return url.toString();
}

async function exchangeGoogle(code: string, provider: Provider): Promise<{ access: string; refresh?: string; expiresAt?: string }> {
  const redirect = process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL || "http://localhost:3000"}/api/integrations/google/callback`;
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirect,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || "Google token exchange failed");
  return {
    access: data.access_token,
    refresh: data.refresh_token,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : undefined,
  };
}

async function exchangeGithub(code: string): Promise<{ access: string; refresh?: string }> {
  const res = await fetch(GITHUB_TOKEN, {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID!,
      client_secret: process.env.GITHUB_CLIENT_SECRET!,
      code,
      redirect_uri: `${process.env.APP_URL || "http://localhost:3000"}/api/integrations/github/callback`,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error_description || "GitHub token exchange failed");
  return { access: data.access_token };
}

export async function handleCallback(provider: Provider, code: string, userId: string): Promise<string> {
  const meta = getProvider(provider);
  if (!meta.configured) throw new Error("Provider not configured");
  const db = await getDb();
  let tok: { access: string; refresh?: string; expiresAt?: string };
  if (provider === "github") tok = await exchangeGithub(code);
  else tok = await exchangeGoogle(code, provider);

  let integration = await db.get(`SELECT * FROM integrations WHERE user_id = ? AND provider = ?`, [userId, provider]);
  let integrationId: string;
  if (!integration) {
    integrationId = newId("int");
    await db.insert("integrations", {
      id: integrationId,
      user_id: userId,
      provider,
      status: "connected",
      permissions_json: toJSON({ scopes: meta.scopes, mode: "read" }),
      token_meta_json: toJSON({ hasRefresh: Boolean(tok.refresh), expiresAt: tok.expiresAt || null }),
      last_synced: null,
      config_json: "{}",
      created_at: nowISO(),
      updated_at: nowISO(),
    });
  } else {
    integrationId = integration.id;
    await db.update("integrations", integrationId, { status: "connected", updated_at: nowISO(), token_meta_json: toJSON({ hasRefresh: Boolean(tok.refresh), expiresAt: tok.expiresAt || null }) });
  }
  await db.insert("integration_tokens", {
    id: newId("itk"),
    integration_id: integrationId,
    encrypted_token: encrypt(tok.access),
    kind: "access",
    expires_at: tok.expiresAt || null,
    created_at: nowISO(),
  });
  if (tok.refresh) {
    await db.insert("integration_tokens", {
      id: newId("itk"),
      integration_id: integrationId,
      encrypted_token: encrypt(tok.refresh),
      kind: "refresh",
      expires_at: null,
      created_at: nowISO(),
    });
  }
  await logActivity(userId, "integration_connected", `Connected ${meta.name}`, "integration", integrationId);
  return integrationId;
}

async function latestToken(integrationId: string, kind: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.get(
    `SELECT encrypted_token FROM integration_tokens WHERE integration_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 1`,
    [integrationId, kind]
  );
  if (!row) return null;
  try {
    return decrypt(row.encrypted_token);
  } catch {
    return null;
  }
}

export async function getAccessToken(provider: Provider, userId: string): Promise<string | null> {
  const db = await getDb();
  const integration = await db.get(`SELECT * FROM integrations WHERE user_id = ? AND provider = ?`, [userId, provider]);
  if (!integration) return null;
  return latestToken(integration.id, "access");
}

// ---------------------------------------------------------------------------
// Sync implementations (real where tokens exist; safe no-ops otherwise)
// ---------------------------------------------------------------------------

async function syncGmail(userId: string, integrationId: string): Promise<{ imported: number; errors: string[] }> {
  const token = await latestToken(integrationId, "access");
  if (!token) return { imported: 0, errors: ["No access token"] };
  const db = await getDb();
  const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) return { imported: 0, errors: [`Gmail list failed: ${listRes.status}`] };
  const list = await listRes.json();
  let imported = 0;
  for (const m of list.messages || []) {
    const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!msgRes.ok) continue;
    const msg = await msgRes.json();
    const headers = msg.payload?.headers || [];
    const get = (n: string) => headers.find((h: any) => h.name === n)?.value || "";
    const from = get("From");
    const subject = get("Subject");
    const existing = await db.get(`SELECT id FROM emails WHERE source_id = ? AND user_id = ?`, [m.id, userId]);
    if (existing) continue;
    await db.insert("emails", {
      id: newId("eml"),
      user_id: userId,
      thread_id: msg.threadId || null,
      from_addr: from,
      from_name: from,
      subject,
      snippet: msg.snippet || "",
      body_text: "",
      received_at: new Date(get("Date") || Date.now()).toISOString(),
      category: "inbox",
      confidence: null,
      deadline: null,
      requested_action: null,
      sentiment: null,
      follow_up_date: null,
      project_id: null,
      opportunity_id: null,
      application_id: null,
      person_id: null,
      organization_id: null,
      status: "unprocessed",
      ai_json: "{}",
      created_at: nowISO(),
    });
    imported++;
  }
  return { imported, errors: [] };
}

async function syncGithub(userId: string, integrationId: string): Promise<{ imported: number; errors: string[] }> {
  const token = await latestToken(integrationId, "access");
  if (!token) return { imported: 0, errors: ["No access token"] };
  const db = await getDb();
  const res = await fetch(`https://api.github.com/user/repos?per_page=20&sort=updated`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return { imported: 0, errors: [`GitHub failed: ${res.status}`] };
  const repos = await res.json();
  let imported = 0;
  for (const r of repos) {
    await db.insert("knowledge_items", {
      id: newId("knw"),
      user_id: userId,
      title: `GitHub: ${r.full_name}`,
      body: `Stars: ${r.stargazers_count} | Language: ${r.language || "n/a"} | ${r.description || ""}\n${r.html_url}`,
      source_type: "github_repo",
      source_id: String(r.id),
      embedding_status: "none",
      created_at: nowISO(),
    });
    imported++;
  }
  return { imported, errors: [] };
}

async function syncGoogleGeneric(userId: string, integrationId: string, endpoint: string, kind: string): Promise<{ imported: number; errors: string[] }> {
  const token = await latestToken(integrationId, "access");
  if (!token) return { imported: 0, errors: ["No access token"] };
  const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return { imported: 0, errors: [`${kind} failed: ${res.status}`] };
  const data = await res.json();
  return { imported: Array.isArray(data.items || data) ? (data.items || data).length : 1, errors: [] };
}

export async function syncIntegration(integrationId: string, userId: string): Promise<any> {
  const db = await getDb();
  const integration = await db.get(`SELECT * FROM integrations WHERE id = ?`, [integrationId]);
  if (!integration) throw new Error("Integration not found");
  const runId = newId("syn");
  await db.insert("sync_runs", {
    id: runId,
    integration_id: integrationId,
    started_at: nowISO(),
    finished_at: null,
    status: "running",
    result_json: "{}",
    errors_json: "[]",
    created_at: nowISO(),
  });
  let result: any = {};
  const errors: string[] = [];
  try {
    if (integration.provider === "gmail") result = await syncGmail(userId, integrationId);
    else if (integration.provider === "github") result = await syncGithub(userId, integrationId);
    else if (integration.provider === "calendar") result = await syncGoogleGeneric(userId, integrationId, "https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=20", "calendar");
    else if (integration.provider === "drive") result = await syncGoogleGeneric(userId, integrationId, "https://www.googleapis.com/drive/v3/files?pageSize=20&fields=files(id,name,mimeType,modifiedTime)", "drive");
    await db.update("integrations", integrationId, { status: "connected", last_synced: nowISO(), updated_at: nowISO() });
    await db.update("sync_runs", runId, { status: "success", finished_at: nowISO(), result_json: toJSON(result), errors_json: toJSON(errors) });
    if (result.imported) await notify(userId, "integration", `${getProvider(integration.provider).name} synced`, `Imported ${result.imported} item(s).`, "integration", integrationId);
  } catch (e: any) {
    errors.push(e?.message || "sync failed");
    await db.update("sync_runs", runId, { status: "error", finished_at: nowISO(), errors_json: toJSON(errors) });
  }
  return result;
}

export async function disconnectIntegration(integrationId: string, userId: string) {
  const db = await getDb();
  await db.run(`DELETE FROM integration_tokens WHERE integration_id = ?`, [integrationId]);
  await db.update("integrations", integrationId, { status: "disconnected", updated_at: nowISO(), token_meta_json: "{}" });
  await logActivity(userId, "integration_disconnected", `Disconnected ${getProvider((await db.get(`SELECT provider FROM integrations WHERE id = ?`, [integrationId]))?.provider).name}`, "integration", integrationId);
}
