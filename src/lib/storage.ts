import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import env from "@/lib/env";
import { sha256 } from "@/lib/crypto/encrypt";

/**
 * File storage adapter. V1 stores files on local disk under FILE_STORAGE_DIR
 * (gitignored). The interface is deliberately narrow so an S3-compatible
 * object storage can replace it without touching callers.
 */
export type StoredFile = { storageKey: string; sizeBytes: number; hash: string };

function baseDir(): string {
  return path.resolve(process.cwd(), env.FILE_STORAGE_DIR);
}

function safeKey(key: string): string {
  // Prevent path traversal; keys are `${userId}/${documentId}-${filename}`
  const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
  if (normalized.includes("..")) throw new Error("Invalid storage key");
  return normalized;
}

export async function putFile(userId: string, documentId: string, filename: string, data: Buffer): Promise<StoredFile> {
  const safeName = filename.replace(/[^a-zA-Z0-9._\- ]/g, "_").slice(0, 120);
  const key = safeKey(`${userId}/${documentId}-${safeName}`);
  const full = path.join(baseDir(), key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  return { storageKey: key, sizeBytes: data.length, hash: sha256(data) };
}

export async function getFile(storageKey: string): Promise<Buffer | null> {
  const full = path.join(baseDir(), safeKey(storageKey));
  try {
    return await fs.readFile(full);
  } catch {
    return null;
  }
}

export async function deleteFile(storageKey: string): Promise<void> {
  const full = path.join(baseDir(), safeKey(storageKey));
  await fs.rm(full, { force: true });
}
