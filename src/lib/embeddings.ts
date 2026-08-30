import { OpenAI } from "openai";
import { getDb } from "@/lib/db";

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  
  try {
    const openai = new OpenAI({ apiKey: key });
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      encoding_format: "float",
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error("Embedding generation failed:", error);
    return null;
  }
}

export async function embedKnowledgeItem(itemId: string) {
  const db = await getDb();
  const item = await db.get(`SELECT id, title, body FROM knowledge_items WHERE id = ?`, [itemId]);
  if (!item) return;

  const content = `${item.title}\n\n${item.body || ""}`;
  const embedding = await generateEmbedding(content);
  
  if (embedding) {
    // pgvector uses a string format '[0.1, 0.2, ...]'
    const vectorStr = `[${embedding.join(",")}]`;
    // Only write the vector when pgvector is actually installed; the column is
    // plain TEXT otherwise and the similarity operators do not exist.
    if (db.supportsVectorSearch) {
      await db.run(`UPDATE knowledge_items SET embedding_status = 'embedded', embedding_vector = $1 WHERE id = $2`, [vectorStr, itemId]);
    } else {
      await db.run(`UPDATE knowledge_items SET embedding_status = 'embedded' WHERE id = ?`, [itemId]);
    }
  } else {
    await db.run(`UPDATE knowledge_items SET embedding_status = 'failed' WHERE id = ?`, [itemId]);
  }
}

export async function searchKnowledge(query: string, userId: string, limit = 5) {
  const db = await getDb();
  const keywordSearch = () =>
    db.query(
      `SELECT id, title, body FROM knowledge_items WHERE user_id = ? AND (title LIKE ? OR body LIKE ?) LIMIT ?`,
      [userId, `%${query}%`, `%${query}%`, limit]
    );

  // Keyword fallback whenever similarity search is unavailable: always on
  // SQLite, and on Postgres without pgvector, where the <=> operator below
  // would be a syntax error.
  if (!db.supportsVectorSearch) return keywordSearch();

  // Embedding the query needs an API key. Without one, fall back rather than
  // returning nothing - an empty result reads as "you have no notes".
  const embedding = await generateEmbedding(query);
  if (!embedding) return keywordSearch();
  
  const vectorStr = `[${embedding.join(",")}]`;
  // Cosine distance operator is <=>
  return await db.query(`
    SELECT id, title, body, 1 - (embedding_vector <=> $1) as similarity 
    FROM knowledge_items 
    WHERE user_id = $2 AND embedding_status = 'embedded'
    ORDER BY embedding_vector <=> $1
    LIMIT $3
  `, [vectorStr, userId, limit]);
}
