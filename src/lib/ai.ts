import { getDb } from "./db";
import { newId, nowISO } from "./utils";

export type AIProviderName = "openai" | "anthropic" | "gemini";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionOpts {
  system?: string;
  messages: ChatMessage[];
  model?: string;
  provider?: AIProviderName;
  temperature?: number;
  json?: boolean;
  maxTokens?: number;
  agent?: string;
  promptVersion?: string;
  userId?: string;
}

export interface CompletionResult {
  text: string;
  model: string;
  provider: AIProviderName;
  tokens?: number;
  cost?: number;
}

export function aiEnabled(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY
  );
}

function resolveProvider(requested?: AIProviderName): AIProviderName | null {
  if (requested && providerKey(requested)) return requested;
  const def = (process.env.AI_DEFAULT_PROVIDER as AIProviderName) || "openai";
  if (providerKey(def)) return def;
  if (providerKey("openai")) return "openai";
  if (providerKey("anthropic")) return "anthropic";
  if (providerKey("gemini")) return "gemini";
  return null;
}

function providerKey(p: AIProviderName): string | undefined {
  return p === "openai"
    ? process.env.OPENAI_API_KEY
    : p === "anthropic"
      ? process.env.ANTHROPIC_API_KEY
      : process.env.GEMINI_API_KEY;
}

function defaultModel(p: AIProviderName): string {
  return p === "openai"
    ? process.env.OPENAI_MODEL || "gpt-4o-mini"
    : p === "anthropic"
      ? process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest"
      : process.env.GEMINI_MODEL || "gemini-1.5-flash";
}

async function postJson(url: string, headers: Record<string, string>, body: any, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`AI provider error ${res.status}: ${text.slice(0, 300)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function callProvider(
  provider: AIProviderName,
  opts: CompletionOpts,
  model: string
): Promise<CompletionResult> {
  if (provider === "openai") {
    const body: any = {
      model,
      messages: [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        ...opts.messages,
      ],
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 1200,
    };
    if (opts.json) body.response_format = { type: "json_object" };
    const data = await postJson("https://api.openai.com/v1/chat/completions", {
      Authorization: `Bearer ${providerKey("openai")}`,
    }, body);
    return {
      text: data.choices?.[0]?.message?.content || "",
      model,
      provider,
      tokens: data.usage?.total_tokens,
      cost: estimateCost("openai", model, data.usage?.total_tokens),
    };
  }

  if (provider === "anthropic") {
    const data = await postJson(
      "https://api.anthropic.com/v1/messages",
      {
        "x-api-key": providerKey("anthropic")!,
        "anthropic-version": "2023-06-01",
      },
      {
        model,
        max_tokens: opts.maxTokens ?? 1200,
        temperature: opts.temperature ?? 0.3,
        system: opts.system,
        messages: opts.messages.filter((m) => m.role !== "system"),
      }
    );
    return {
      text: data.content?.map((c: any) => c.text || "").join("") || "",
      model,
      provider,
      tokens: data.usage?.input_tokens + data.usage?.output_tokens,
      cost: estimateCost("anthropic", model, data.usage?.input_tokens + data.usage?.output_tokens),
    };
  }

  // Gemini
  const contents = [...(opts.system ? [{ role: "user", parts: [{ text: `System: ${opts.system}` }] }, { role: "model", parts: [{ text: "Understood." }] }] : []), ...opts.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))];
  const genConfig: any = { temperature: opts.temperature ?? 0.3, maxOutputTokens: opts.maxTokens ?? 1200 };
  if (opts.json) genConfig.responseMimeType = "application/json";
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${providerKey("gemini")}`,
    {},
    { contents, generationConfig: genConfig }
  );
  return {
    text: data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "",
    model,
    provider,
    tokens: data.usageMetadata?.totalTokenCount,
    cost: estimateCost("gemini", model, data.usageMetadata?.totalTokenCount),
  };
}

function estimateCost(p: AIProviderName, model: string, tokens?: number): number | undefined {
  if (!tokens) return undefined;
  // Very rough per-1M-token estimates for surfacing cost only.
  const table: Record<string, number> = {
    "gpt-4o-mini": 0.15,
    "gpt-4o": 5,
    "claude-3-5-haiku-latest": 0.8,
    "claude-3-5-sonnet-latest": 3,
    "gemini-1.5-flash": 0.15,
    "gemini-1.5-pro": 1.25,
  };
  const rate = table[model] ?? 1;
  return Number(((tokens / 1_000_000) * rate).toFixed(6));
}

let runLogDisabled = false;
async function logRun(opts: CompletionOpts, result: CompletionResult | null, error?: string) {
  if (runLogDisabled) return;
  try {
    const db = await getDb();
    await db.insert("ai_runs", {
      id: newId("air"),
      user_id: opts.userId || null,
      agent: opts.agent || "chat",
      model: result?.model || opts.model || null,
      prompt_version: opts.promptVersion || null,
      input_json: JSON.stringify({ system: opts.system, messages: opts.messages.length }),
      output_json: JSON.stringify({ text: result?.text?.slice(0, 500), error }),
      tokens: result?.tokens ?? null,
      cost: result?.cost ?? null,
      status: error ? "error" : "success",
      created_at: nowISO(),
    });
  } catch {
    runLogDisabled = true;
  }
}

/**
 * Complete a chat. Returns null when no AI provider is configured so callers
 * can fall back to deterministic, rule-based logic.
 */
export async function complete(opts: CompletionOpts): Promise<CompletionResult | null> {
  const provider = resolveProvider(opts.provider);
  if (!provider) {
    await logRun(opts, null, "no_provider");
    return null;
  }
  const model = opts.model || defaultModel(provider);
  let lastErr: any;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await callProvider(provider, opts, model);
      await logRun(opts, result);
      return result;
    } catch (e: any) {
      lastErr = e;
      // simple retry on transient errors
      if (!/timeout|abort|5\d\d/i.test(String(e?.message))) break;
    }
  }
  await logRun(opts, null, lastErr?.message);
  throw lastErr || new Error("AI call failed");
}

/** Ask the model for a JSON object. Falls back to returning null if no provider. */
export async function completeJSON<T = any>(opts: CompletionOpts): Promise<T | null> {
  const res = await complete({ ...opts, json: true });
  if (!res) return null;
  try {
    let t = res.text.trim();
    if (t.startsWith("```")) t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
    return JSON.parse(t) as T;
  } catch {
    return null;
  }
}
