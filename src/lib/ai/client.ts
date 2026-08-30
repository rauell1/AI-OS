import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import env, { aiEnabled } from "@/lib/env";
import { providers } from "./providers";
import {
  AiDisabledError,
  AiProviderError,
  estimateTokens,
  type CompletionRequest,
  type CompletionResult,
  type ModelRole,
} from "./types";

/** Sensible default models per provider per role. Override with AI_MODEL_* env. */
const DEFAULT_MODELS: Record<string, Record<ModelRole, string>> = {
  openai: {
    FAST: "gpt-4o-mini",
    RESEARCH: "gpt-4o",
    REASONING: "gpt-4o",
    WRITING: "gpt-4o",
    DOC_EXTRACT: "gpt-4o-mini",
    EMBEDDING: "text-embedding-3-small",
  },
  anthropic: {
    FAST: "claude-3-5-haiku-latest",
    RESEARCH: "claude-3-5-sonnet-latest",
    REASONING: "claude-3-5-sonnet-latest",
    WRITING: "claude-3-5-sonnet-latest",
    DOC_EXTRACT: "claude-3-5-haiku-latest",
    EMBEDDING: "not-supported",
  },
  google: {
    FAST: "gemini-1.5-flash",
    RESEARCH: "gemini-1.5-pro",
    REASONING: "gemini-1.5-pro",
    WRITING: "gemini-1.5-pro",
    DOC_EXTRACT: "gemini-1.5-flash",
    EMBEDDING: "text-embedding-004",
  },
};

const ROLE_ENV: Record<ModelRole, string> = {
  FAST: "AI_MODEL_FAST",
  RESEARCH: "AI_MODEL_RESEARCH",
  REASONING: "AI_MODEL_REASONING",
  WRITING: "AI_MODEL_WRITING",
  DOC_EXTRACT: "AI_MODEL_DOC_EXTRACT",
  EMBEDDING: "AI_EMBEDDING_MODEL",
};

export function modelForRole(role: ModelRole): string {
  const envKey = ROLE_ENV[role];
  const override = (process.env[envKey] as string | undefined) || "";
  if (override) return override;
  return DEFAULT_MODELS[env.AI_PROVIDER]?.[role] ?? DEFAULT_MODELS.openai[role];
}

const TIMEOUT_MS = 45_000;
const MAX_RETRIES = 2;

function hashKey(req: CompletionRequest): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        p: env.AI_PROVIDER,
        r: req.role,
        m: modelForRole(req.role),
        msgs: req.messages,
        j: req.json ?? false,
        t: req.temperature ?? 0.4,
        v: 1,
      })
    )
    .digest("hex");
}

async function logRun(entry: {
  userId?: string | null;
  role: ModelRole;
  provider: string;
  model: string;
  purpose: string;
  status: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  error?: string;
  cached?: boolean;
  refType?: string;
  refId?: string;
  promptVersion?: string;
}) {
  try {
    await prisma.aiRun.create({
      data: {
        userId: entry.userId ?? undefined,
        role: entry.role,
        provider: entry.provider,
        model: entry.model,
        purpose: entry.purpose,
        status: entry.status,
        latencyMs: entry.latencyMs,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        costUsd: entry.costUsd,
        error: entry.error?.slice(0, 500),
        cached: entry.cached ?? false,
        refType: entry.refType,
        refId: entry.refId,
        promptVersion: entry.promptVersion,
      },
    });
  } catch (err) {
    console.error("[ai] failed to log run", err);
  }
}

function estimateCost(model: string, inTok: number, outTok: number): number | undefined {
  // Very rough public list-price estimates for visibility only.
  const per1k: Record<string, [number, number]> = {
    "gpt-4o-mini": [0.00015, 0.0006],
    "gpt-4o": [0.0025, 0.01],
    "claude-3-5-haiku-latest": [0.0008, 0.004],
    "claude-3-5-sonnet-latest": [0.003, 0.015],
    "gemini-1.5-flash": [0.000075, 0.0003],
    "gemini-1.5-pro": [0.00125, 0.005],
  };
  const rates = per1k[model];
  if (!rates) return undefined;
  return (inTok / 1000) * rates[0] + (outTok / 1000) * rates[1];
}

export async function aiAvailable(): Promise<boolean> {
  return aiEnabled();
}

/**
 * Core completion entry point with caching, timeout, retries, fallback and
 * usage logging. Throws AiDisabledError when no provider is configured so
 * callers can apply their deterministic fallback.
 */
export async function complete(req: CompletionRequest): Promise<CompletionResult> {
  if (!aiEnabled()) throw new AiDisabledError();

  // Budget guard: stop paid calls when the configured monthly budget is spent.
  const spent = await monthlySpend();
  if (spent >= env.AI_MONTHLY_BUDGET_USD) {
    const err = new AiProviderError(
      `Monthly AI budget of $${env.AI_MONTHLY_BUDGET_USD} reached (spent $${spent.toFixed(2)}). Raise AI_MONTHLY_BUDGET_USD to continue.`,
      env.AI_PROVIDER
    );
    await logRun({
      userId: req.userId, role: req.role, provider: env.AI_PROVIDER, model: modelForRole(req.role),
      purpose: req.purpose, status: "FAILED", error: err.message, refType: req.refType, refId: req.refId,
    });
    throw err;
  }

  // Cache lookup
  const key = hashKey(req);
  const cached = await prisma.aiCache.findUnique({ where: { key } }).catch(() => null);
  if (cached && (!cached.expiresAt || cached.expiresAt > new Date())) {
    const val = cached.response as { text: string; model: string; inputTokens?: number; outputTokens?: number };
    await logRun({
      userId: req.userId, role: req.role, provider: env.AI_PROVIDER, model: val.model,
      purpose: req.purpose, status: "SUCCESS", cached: true, refType: req.refType, refId: req.refId,
    });
    return {
      text: val.text,
      provider: env.AI_PROVIDER,
      model: val.model,
      cached: true,
      latencyMs: 0,
      inputTokens: val.inputTokens,
      outputTokens: val.outputTokens,
    };
  }

  const model = modelForRole(req.role);
  const provider = providers[env.AI_PROVIDER];
  const started = Date.now();
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await provider.complete({
        model,
        messages: req.messages,
        maxTokens: req.maxTokens ?? env.AI_MAX_OUTPUT_TOKENS,
        temperature: req.temperature,
        json: req.json,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - started;
      const inputTokens = res.inputTokens ?? estimateTokens(req.messages.map((m) => m.content).join(" "));
      const outputTokens = res.outputTokens ?? estimateTokens(res.text);
      const costUsd = estimateCost(model, inputTokens, outputTokens);

      if (req.cacheSeconds) {
        const expiresAt = new Date(Date.now() + req.cacheSeconds * 1000);
        await prisma.aiCache
          .upsert({
            where: { key },
            create: { key, response: { text: res.text, model, inputTokens, outputTokens }, expiresAt },
            update: { response: { text: res.text, model, inputTokens, outputTokens }, expiresAt },
          })
          .catch(() => {});
      }

      await logRun({
        userId: req.userId, role: req.role, provider: env.AI_PROVIDER, model,
        purpose: req.purpose, status: "SUCCESS", latencyMs, inputTokens, outputTokens, costUsd,
        refType: req.refType, refId: req.refId,
      });

      return {
        text: res.text,
        provider: env.AI_PROVIDER,
        model,
        cached: false,
        inputTokens,
        outputTokens,
        costUsd,
        latencyMs,
      };
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      const isTimeout = err instanceof Error && err.name === "AbortError";
      const retryable =
        err instanceof AiProviderError ? (!err.status || err.status >= 500 || err.status === 429) : isTimeout;
      if (!retryable || attempt === MAX_RETRIES) break;
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }

  const latencyMs = Date.now() - started;
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  await logRun({
    userId: req.userId, role: req.role, provider: env.AI_PROVIDER, model,
    purpose: req.purpose, status: lastError instanceof Error && lastError.name === "AbortError" ? "TIMEOUT" : "FAILED",
    latencyMs, error: message, refType: req.refType, refId: req.refId,
  });
  throw lastError instanceof Error ? lastError : new AiProviderError(message, env.AI_PROVIDER);
}

/** Completion that parses a JSON object, stripping markdown fences if present. */
export async function completeJSON<T>(req: CompletionRequest): Promise<T> {
  const res = await complete({ ...req, json: true });
  let text = res.text.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiProviderError(`Model returned invalid JSON: ${text.slice(0, 200)}`, res.provider);
  }
}

export async function embedText(input: string): Promise<number[]> {
  if (!aiEnabled() || !env.AI_EMBEDDING_MODEL) throw new AiDisabledError();
  const provider = providers[env.AI_PROVIDER];
  const model = modelForRole("EMBEDDING");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const vector = await provider.embed({ model, input: input.slice(0, 8000), signal: controller.signal });
    await logRun({
      role: "EMBEDDING", provider: env.AI_PROVIDER, model, purpose: "embedding", status: "SUCCESS",
      inputTokens: estimateTokens(input),
    });
    return vector;
  } catch (err) {
    await logRun({
      role: "EMBEDDING", provider: env.AI_PROVIDER, model, purpose: "embedding", status: "FAILED",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function monthlySpend(): Promise<number> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const agg = await prisma.aiRun.aggregate({
    where: { createdAt: { gte: monthStart }, costUsd: { not: null } },
    _sum: { costUsd: true },
  });
  return agg._sum.costUsd ?? 0;
}

export type { CompletionRequest, CompletionResult, ModelRole } from "./types";
