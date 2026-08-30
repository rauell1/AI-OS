import type { AiProvider, ChatMessage } from "../types";
import { AiProviderError } from "../types";

type OpenAIResponse = {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

type OpenAIEmbeddingResponse = {
  data?: { embedding: number[] }[];
  error?: { message?: string };
};

export const openaiProvider: AiProvider = {
  name: "openai",
  async complete({ model, messages, maxTokens, temperature, json, signal }) {
    const res = await fetch(`${process.env.AI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: temperature ?? 0.4,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as OpenAIResponse;
    if (!res.ok) {
      throw new AiProviderError(
        data.error?.message || `OpenAI request failed (${res.status})`,
        "openai",
        res.status
      );
    }
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  },
  async embed({ model, input, signal }) {
    const res = await fetch(`${process.env.AI_BASE_URL || "https://api.openai.com/v1"}/embeddings`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify({ model, input }),
    });
    const data = (await res.json().catch(() => ({}))) as OpenAIEmbeddingResponse;
    if (!res.ok || !data.data?.[0]) {
      throw new AiProviderError(
        data.error?.message || `Embedding failed (${res.status})`,
        "openai",
        res.status
      );
    }
    return data.data[0].embedding;
  },
};

// --- Anthropic ---------------------------------------------------------------

type AnthropicResponse = {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
};

export const anthropicProvider: AiProvider = {
  name: "anthropic",
  async complete({ model, messages, maxTokens, temperature, signal }) {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const rest: ChatMessage[] = messages.filter((m) => m.role !== "system");
    const res = await fetch(`${process.env.AI_BASE_URL || "https://api.anthropic.com/v1"}/messages`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.AI_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        system: system || undefined,
        messages: rest.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: maxTokens,
        temperature: temperature ?? 0.4,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as AnthropicResponse;
    if (!res.ok) {
      throw new AiProviderError(
        data.error?.message || `Anthropic request failed (${res.status})`,
        "anthropic",
        res.status
      );
    }
    const text = (data.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    return { text, inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens };
  },
  async embed() {
    throw new AiProviderError("Anthropic does not provide an embeddings API", "anthropic");
  },
};

// --- Google Gemini -----------------------------------------------------------

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
};

export const googleProvider: AiProvider = {
  name: "google",
  async complete({ model, messages, maxTokens, temperature, json, signal }) {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
    const res = await fetch(
      `${process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta"}/models/${model}:generateContent?key=${process.env.AI_API_KEY}`,
      {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: temperature ?? 0.4,
            ...(json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      }
    );
    const data = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) {
      throw new AiProviderError(
        data.error?.message || `Gemini request failed (${res.status})`,
        "google",
        res.status
      );
    }
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
    return {
      text,
      inputTokens: data.usageMetadata?.promptTokenCount,
      outputTokens: data.usageMetadata?.candidatesTokenCount,
    };
  },
  async embed({ model, input, signal }) {
    const res = await fetch(
      `${process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta"}/models/${model}:embedContent?key=${process.env.AI_API_KEY}`,
      {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { parts: [{ text: input }] } }),
      }
    );
    const data = (await res.json().catch(() => ({}))) as { embedding?: { values?: number[] } };
    if (!res.ok || !data.embedding?.values) {
      throw new AiProviderError(`Gemini embedding failed (${res.status})`, "google", res.status);
    }
    return data.embedding.values;
  },
};

export const providers: Record<string, AiProvider> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  google: googleProvider,
};
