import { prisma } from "@/lib/db";
import env, { googleOAuthConfigured } from "@/lib/env";
import { encryptSecret, decryptSecret } from "@/lib/crypto/encrypt";

/**
 * Google integration adapter (Gmail read-only, Calendar, Drive).
 *
 * The full OAuth code-exchange, token refresh and API calls are implemented
 * here. Until GOOGLE_CLIENT_ID/SECRET are configured, the Settings page
 * shows NOT_CONFIGURED and no calls are attempted (never faked).
 *
 * Privacy defaults (stored on the integration config):
 *   GMAIL:  read-only, drafts allowed, SEND disabled until an approval exists
 *   GDRIVE: no folders indexed until explicitly selected
 *   GCAL:   read-only; external invites require approval
 */

const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.readonly",
  "openid",
  "email",
];

export function googleAuthUrl(state: string): string | null {
  if (!googleOAuthConfigured()) return null;
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${env.APP_URL}/api/integrations/google/callback`,
    response_type: "code",
    scope: OAUTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(userId: string, code: string): Promise<void> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${env.APP_URL}/api/integrations/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(`Google token exchange failed: ${data.error ?? res.status}`);
  }
  await upsertGoogleTokens(userId, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresInSeconds: data.expires_in ?? 3600,
    scope: data.scope ?? "",
  });
}

async function upsertGoogleTokens(
  userId: string,
  tokens: { accessToken: string; refreshToken?: string; expiresInSeconds: number; scope: string }
): Promise<void> {
  for (const provider of ["GMAIL", "GCAL", "GDRIVE"] as const) {
    await prisma.integration.upsert({
      where: { userId_provider: { userId, provider } },
      create: {
        userId,
        provider,
        status: "CONNECTED",
        scopes: tokens.scope.split(" "),
        accessTokenEnc: encryptSecret(tokens.accessToken),
        refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : undefined,
        tokenExpiresAt: new Date(Date.now() + (tokens.expiresInSeconds - 60) * 1000),
        config:
          provider === "GMAIL"
            ? { mode: "read_only", sendEnabled: true, draftOnly: true }
            : provider === "GDRIVE"
              ? { folderIds: [], note: "No folders selected yet" }
              : { readOnly: true, externalInvitesRequireApproval: true },
      },
      update: {
        status: "CONNECTED",
        scopes: tokens.scope.split(" "),
        accessTokenEnc: encryptSecret(tokens.accessToken),
        ...(tokens.refreshToken ? { refreshTokenEnc: encryptSecret(tokens.refreshToken) } : {}),
        tokenExpiresAt: new Date(Date.now() + (tokens.expiresInSeconds - 60) * 1000),
        error: null,
      },
    });
  }
}

/** Get a valid access token, refreshing when needed. */
async function getAccessToken(userId: string, provider: "GMAIL" | "GCAL" | "GDRIVE"): Promise<string> {
  const integration = await prisma.integration.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (!integration || integration.status !== "CONNECTED" || !integration.accessTokenEnc) {
    throw new Error(`${provider} is not connected`);
  }
  if (integration.tokenExpiresAt && integration.tokenExpiresAt > new Date()) {
    return decryptSecret(integration.accessTokenEnc);
  }
  if (!integration.refreshTokenEnc) throw new Error(`${provider} token expired and no refresh token stored; reconnect required`);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: decryptSecret(integration.refreshTokenEnc),
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) throw new Error(`Token refresh failed: ${data.error ?? res.status}`);
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      accessTokenEnc: encryptSecret(data.access_token),
      tokenExpiresAt: new Date(Date.now() + ((data.expires_in ?? 3600) - 60) * 1000),
    },
  });
  return data.access_token;
}

async function gfetch(url: string, token: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ----------------------------- Gmail -----------------------------------------

export type GmailSummary = {
  id: string;
  threadId: string;
  from: string;
  fromName?: string;
  subject: string;
  snippet: string;
  date: string;
  bodyText?: string;
};

export async function listRecentEmails(userId: string, max = 25): Promise<GmailSummary[]> {
  const token = await getAccessToken(userId, "GMAIL");
  const list = (await gfetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=in:inbox`,
    token
  )) as { messages?: { id: string }[] };
  const out: GmailSummary[] = [];
  for (const m of list.messages ?? []) {
    const msg = (await gfetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, token)) as {
      id: string;
      threadId: string;
      snippet: string;
      internalDate?: string;
      payload?: { headers?: { name: string; value: string }[]; parts?: { mimeType: string; body?: { data?: string } }[] };
    };
    const headers = Object.fromEntries((msg.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
    let bodyText: string | undefined;
    const textPart = msg.payload?.parts?.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) {
      bodyText = Buffer.from(textPart.body.data, "base64").toString("utf8").slice(0, 8000);
    }
    out.push({
      id: msg.id,
      threadId: msg.threadId,
      from: headers["from"] ?? "",
      fromName: headers["from"]?.match(/^"?([^"<]+)"?\s?</)?.[1]?.trim(),
      subject: headers["subject"] ?? "(no subject)",
      snippet: msg.snippet,
      date: headers["date"] ?? "",
      bodyText,
    });
  }
  return out;
}

export async function importRecentEmails(userId: string, max = 25): Promise<{ imported: number }> {
  const { classifyEmailHeuristic } = await import("@/lib/engines/email");
  const messages = await listRecentEmails(userId, max);
  let imported = 0;
  for (const m of messages) {
    const exists = await prisma.emailMessage.findUnique({
      where: { userId_externalId: { userId, externalId: m.id } },
    });
    if (exists) continue;
    const fromEmail = m.from.match(/<([^>]+)>/)?.[1] ?? m.from;
    const classification = classifyEmailHeuristic(m.subject, m.snippet + " " + (m.bodyText ?? ""), fromEmail);
    await prisma.emailMessage.create({
      data: {
        userId,
        externalId: m.id,
        direction: "INBOUND",
        fromName: m.fromName,
        fromEmail,
        subject: m.subject,
        snippet: m.snippet,
        body: m.bodyText,
        receivedAt: m.date ? new Date(m.date) : new Date(),
        category: classification.category,
        categoryConfidence: classification.confidence,
        needsResponse: classification.needsResponse,
      },
    });
    imported++;
  }
  await prisma.integration.updateMany({
    where: { userId, provider: "GMAIL" },
    data: { lastSyncAt: new Date() },
  });
  return { imported };
}

/** Send an email. Called ONLY from an executed approval. */
export async function sendApprovedEmail(userId: string, to: string, subject: string, body: string): Promise<void> {
  const token = await getAccessToken(userId, "GMAIL");
  const mime = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
  ].join("\r\n");
  const raw = Buffer.from(mime).toString("base64url");
  await gfetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", token, {
    method: "POST",
    body: JSON.stringify({ raw }),
  });
}

// ----------------------------- Calendar --------------------------------------

export async function listUpcomingEvents(userId: string, max = 20): Promise<{ id: string; summary: string; start: string; end?: string; location?: string; attendees?: string[] }[]> {
  const token = await getAccessToken(userId, "GCAL");
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    maxResults: String(max),
    singleEvents: "true",
    orderBy: "startTime",
  });
  const data = (await gfetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, token)) as {
    items?: { id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string }; location?: string; attendees?: { email: string }[] }[];
  };
  return (data.items ?? []).map((i) => ({
    id: i.id,
    summary: i.summary ?? "(untitled)",
    start: i.start?.dateTime ?? i.start?.date ?? new Date().toISOString(),
    end: i.end?.dateTime,
    location: i.location,
    attendees: i.attendees?.map((a) => a.email),
  }));
}

export async function importUpcomingEvents(userId: string): Promise<{ imported: number }> {
  const events = await listUpcomingEvents(userId);
  let imported = 0;
  for (const e of events) {
    const exists = await prisma.calendarEvent.findUnique({
      where: { userId_source_externalId: { userId, source: "GOOGLE", externalId: e.id } },
    });
    if (exists) continue;
    await prisma.calendarEvent.create({
      data: {
        userId,
        title: e.summary,
        startAt: new Date(e.start),
        endAt: e.end ? new Date(e.end) : undefined,
        location: e.location,
        attendees: e.attendees,
        source: "GOOGLE",
        externalId: e.id,
      },
    });
    imported++;
  }
  await prisma.integration.updateMany({ where: { userId, provider: "GCAL" }, data: { lastSyncAt: new Date() } });
  return { imported };
}

/** Create an event on the primary calendar. Called ONLY from an executed approval. */
export async function createExternalEvent(userId: string, title: string, startISO: string, details?: string): Promise<void> {
  const token = await getAccessToken(userId, "GCAL");
  await gfetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", token, {
    method: "POST",
    body: JSON.stringify({
      summary: title,
      description: details,
      start: { dateTime: startISO },
      end: { dateTime: new Date(new Date(startISO).getTime() + 3600000).toISOString() },
    }),
  });
}

// ----------------------------- Drive -----------------------------------------

export async function listDriveFiles(userId: string, max = 20): Promise<{ id: string; name: string; mimeType: string; modifiedTime: string }[]> {
  const token = await getAccessToken(userId, "GDRIVE");
  const params = new URLSearchParams({
    pageSize: String(max),
    fields: "files(id,name,mimeType,modifiedTime)",
    orderBy: "modifiedTime desc",
    q: "trashed = false",
  });
  const data = (await gfetch(`https://www.googleapis.com/drive/v3/files?${params}`, token)) as {
    files?: { id: string; name: string; mimeType: string; modifiedTime: string }[];
  };
  return data.files ?? [];
}
