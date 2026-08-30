import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { getDb } from "./db";
import { newId, nowISO } from "./utils";

export const MAX_CHAT_FILES = 5;
export const MAX_CHAT_FILE_BYTES = 10 * 1024 * 1024;
export const CHAT_FILE_ACCEPT = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/markdown",
] as const;

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  usedAI?: boolean;
  createdAt: string;
  attachments: ChatAttachment[];
}

function safeName(name: string) {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "upload";
}

async function extractText(file: File, buffer: Buffer): Promise<string> {
  if (file.type === "application/pdf") {
    try {
      const pdf = (await import("pdf-parse")).default;
      const parsed = await pdf(buffer);
      return parsed.text.replace(/\0/g, "").trim().slice(0, 100_000);
    } catch {
      return "";
    }
  }
  if (file.type === "text/plain" || file.type === "text/markdown") {
    return buffer.toString("utf8").replace(/\0/g, "").trim().slice(0, 100_000);
  }
  return "";
}

async function persistFile(userId: string, id: string, file: File, buffer: Buffer) {
  const filename = `${id}-${safeName(file.name)}`;
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`chat-uploads/${userId}/${filename}`, buffer, {
      access: "private",
      contentType: file.type,
      addRandomSuffix: false,
    });
    return { provider: "vercel-blob", storagePath: blob.pathname };
  }

  const base = process.env.RAUELL_DATA_DIR
    ? path.resolve(process.env.RAUELL_DATA_DIR, "chat-uploads")
    : path.resolve(process.cwd(), "data", "chat-uploads");
  const userDir = path.join(base, userId);
  await fs.mkdir(userDir, { recursive: true });
  const storagePath = path.join(userDir, filename);
  await fs.writeFile(storagePath, buffer);
  return { provider: "local", storagePath };
}

export function validateChatFiles(files: File[]) {
  if (files.length > MAX_CHAT_FILES) throw new Error(`Upload up to ${MAX_CHAT_FILES} files at a time.`);
  for (const file of files) {
    if (!CHAT_FILE_ACCEPT.includes(file.type as (typeof CHAT_FILE_ACCEPT)[number])) {
      throw new Error(`${file.name} is not a supported PDF, image, or text file.`);
    }
    if (file.size > MAX_CHAT_FILE_BYTES) throw new Error(`${file.name} exceeds the 10 MB limit.`);
    if (!file.size) throw new Error(`${file.name} is empty.`);
  }
}

export async function getOrCreateThread(userId: string, requestedId?: string | null) {
  const db = await getDb();
  if (requestedId) {
    const owned = await db.query("SELECT id FROM chat_threads WHERE id = ? AND user_id = ? LIMIT 1", [requestedId, userId]);
    if (owned[0]) return requestedId;
    throw new Error("Chat not found.");
  }
  const latest = await db.query(
    "SELECT id FROM chat_threads WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1",
    [userId]
  );
  if (latest[0]?.id) return String(latest[0].id);
  const id = newId("cht");
  const now = nowISO();
  await db.insert("chat_threads", { id, user_id: userId, title: "AI Assistant", created_at: now, updated_at: now });
  return id;
}

export async function loadChat(userId: string, requestedId?: string | null) {
  const threadId = await getOrCreateThread(userId, requestedId);
  const db = await getDb();
  const [rows, attachmentRows] = await Promise.all([
    db.query(
      "SELECT id, role, content, used_ai, created_at FROM chat_messages WHERE thread_id = ? AND user_id = ? ORDER BY created_at ASC",
      [threadId, userId]
    ),
    db.query(
      "SELECT id, message_id, name, mime_type, size_bytes FROM chat_attachments WHERE thread_id = ? AND user_id = ? ORDER BY created_at ASC",
      [threadId, userId]
    ),
  ]);
  const byMessage = new Map<string, ChatAttachment[]>();
  for (const row of attachmentRows) {
    const item = {
      id: String(row.id),
      name: String(row.name),
      mimeType: String(row.mime_type),
      sizeBytes: Number(row.size_bytes),
      downloadUrl: `/api/ai/attachments/${row.id}`,
    };
    byMessage.set(String(row.message_id), [...(byMessage.get(String(row.message_id)) || []), item]);
  }
  const messages: ChatMessage[] = rows.map((row) => ({
    id: String(row.id),
    role: row.role as ChatMessage["role"],
    content: String(row.content),
    usedAI: row.used_ai == null ? undefined : Boolean(row.used_ai),
    createdAt: String(row.created_at),
    attachments: byMessage.get(String(row.id)) || [],
  }));
  return { threadId, messages };
}

export async function storeUserMessage(userId: string, threadId: string, content: string, files: File[]) {
  validateChatFiles(files);
  const db = await getDb();
  const id = newId("msg");
  const now = nowISO();
  await db.insert("chat_messages", {
    id, thread_id: threadId, user_id: userId, role: "user", content, used_ai: null, created_at: now,
  });

  const attachments: Array<ChatAttachment & { extractedText: string }> = [];
  for (const file of files) {
    const attachmentId = newId("att");
    const buffer = Buffer.from(await file.arrayBuffer());
    const extractedText = await extractText(file, buffer);
    const stored = await persistFile(userId, attachmentId, file, buffer);
    await db.insert("chat_attachments", {
      id: attachmentId,
      message_id: id,
      thread_id: threadId,
      user_id: userId,
      name: safeName(file.name),
      mime_type: file.type,
      size_bytes: file.size,
      storage_provider: stored.provider,
      storage_path: stored.storagePath,
      extracted_text: extractedText || null,
      content_hash: createHash("sha256").update(buffer).digest("hex"),
      created_at: now,
    });
    if (extractedText) {
      await db.insert("knowledge_items", {
        id: newId("knw"), user_id: userId, title: `Chat upload: ${safeName(file.name)}`,
        body: extractedText, source_type: "chat_attachment", source_id: attachmentId,
        embedding_status: "none", embedding_vector: null, created_at: now,
      });
    }
    attachments.push({
      id: attachmentId, name: safeName(file.name), mimeType: file.type, sizeBytes: file.size,
      downloadUrl: `/api/ai/attachments/${attachmentId}`, extractedText,
    });
  }
  await db.run("UPDATE chat_threads SET updated_at = ? WHERE id = ? AND user_id = ?", [now, threadId, userId]);
  return { id, attachments };
}

export async function storeAssistantMessage(userId: string, threadId: string, content: string, usedAI: boolean) {
  const db = await getDb();
  const id = newId("msg");
  const now = nowISO();
  await db.insert("chat_messages", {
    id, thread_id: threadId, user_id: userId, role: "assistant", content,
    used_ai: usedAI ? 1 : 0, created_at: now,
  });
  await db.run("UPDATE chat_threads SET updated_at = ? WHERE id = ? AND user_id = ?", [now, threadId, userId]);
  return id;
}

export async function getAttachment(userId: string, id: string) {
  const db = await getDb();
  const rows = await db.query(
    "SELECT name, mime_type, storage_provider, storage_path FROM chat_attachments WHERE id = ? AND user_id = ? LIMIT 1",
    [id, userId]
  );
  return rows[0] || null;
}
