import { prisma } from "@/lib/db";
import { embedText } from "@/lib/ai/client";
import { embeddingsEnabled } from "@/lib/env";

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3);
}

export type RagHit = {
  id: string;
  title: string;
  snippet: string;
  sourceType: string;
  sourceId?: string;
  score: number;
  method: "semantic" | "keyword";
};

/**
 * Ingest a piece of knowledge with optional embedding. Embeddings are stored
 * as JSON arrays; the retrieval abstraction below is designed so the storage
 * can move to pgvector on Neon (see docs/DATABASE.md) without changing
 * callers.
 */
export async function ingestKnowledge(opts: {
  userId: string;
  sourceType: string;
  sourceId?: string;
  title: string;
  content: string;
}): Promise<{ embedded: boolean }> {
  let embedding: number[] | undefined;
  if (embeddingsEnabled()) {
    try {
      embedding = await embedText(`${opts.title}\n${opts.content}`.slice(0, 8000));
    } catch {
      embedding = undefined; // graceful: keyword search still works
    }
  }
  await prisma.knowledgeItem.create({
    data: {
      userId: opts.userId,
      sourceType: opts.sourceType,
      sourceId: opts.sourceId,
      title: opts.title.slice(0, 300),
      content: opts.content.slice(0, 20000),
      embedding: embedding ?? undefined,
      tokens: Math.ceil(opts.content.length / 4),
    },
  });
  return { embedded: Boolean(embedding) };
}

export async function searchKnowledge(userId: string, query: string, limit = 6): Promise<RagHit[]> {
  const items = await prisma.knowledgeItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  if (!items.length) return [];

  // Semantic path
  if (embeddingsEnabled()) {
    try {
      const qv = await embedText(query);
      const scored = items
        .filter((i) => Array.isArray(i.embedding))
        .map((i) => ({ item: i, score: cosine(qv, i.embedding as number[]) }))
        .filter((x) => x.score > 0.25)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      if (scored.length) {
        return scored.map(({ item, score }) => ({
          id: item.id,
          title: item.title,
          snippet: item.content.slice(0, 240),
          sourceType: item.sourceType,
          sourceId: item.sourceId ?? undefined,
          score: Math.round(score * 100),
          method: "semantic" as const,
        }));
      }
    } catch {
      // fall through to keyword
    }
  }

  // Keyword fallback (always available, zero cost)
  const qk = keywords(query);
  const qSet = new Set(qk);
  const scored = items
    .map((item) => {
      const text = `${item.title} ${item.content}`.toLowerCase();
      let hits = 0;
      for (const t of qSet) if (text.includes(t)) hits++;
      return { item, score: qSet.size ? hits / qSet.size : 0 };
    })
    .filter((x) => x.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map(({ item, score }) => ({
    id: item.id,
    title: item.title,
    snippet: item.content.slice(0, 240),
    sourceType: item.sourceType,
    sourceId: item.sourceId ?? undefined,
    score: Math.round(score * 100),
    method: "keyword" as const,
  }));
}
