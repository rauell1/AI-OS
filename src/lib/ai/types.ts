export type ModelRole =
  | "FAST"
  | "RESEARCH"
  | "REASONING"
  | "WRITING"
  | "DOC_EXTRACT"
  | "EMBEDDING";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type CompletionRequest = {
  role: ModelRole;
  purpose: string; // logged, e.g. "job-match-analysis"
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  json?: boolean; // best-effort JSON output
  promptVersion?: string; // prompt registry version, logged for auditability
  refType?: string;
  refId?: string;
  cacheSeconds?: number;
  userId?: string | null;
};

export type CompletionResult = {
  text: string;
  provider: string;
  model: string;
  cached: boolean;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs: number;
};

export type EmbeddingResult = {
  vector: number[];
  model: string;
  provider: string;
};

export class AiDisabledError extends Error {
  constructor() {
    super("AI provider is not configured. Set AI_API_KEY in Settings or environment.");
    this.name = "AiDisabledError";
  }
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export interface AiProvider {
  name: string;
  complete(req: {
    model: string;
    messages: ChatMessage[];
    maxTokens: number;
    temperature?: number;
    json?: boolean;
    signal: AbortSignal;
  }): Promise<{ text: string; inputTokens?: number; outputTokens?: number }>;
  embed(req: { model: string; input: string; signal: AbortSignal }): Promise<number[]>;
}

/** Rough token estimate for cost tracking when usage is not reported. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
