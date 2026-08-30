"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { newId, nowISO, toJSON } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { createHash } from "node:crypto";

const DOC_DIR = path.join(process.cwd(), "data", "documents");

import { put, del } from "@vercel/blob";

export async function uploadDocument(formData: FormData) {
  const user = await requireUser();
  const file = formData.get("file") as File | null;
  const name = String(formData.get("name") || file?.name || "Untitled").trim();
  if (!file || file.size === 0) return { error: "Please choose a file." };
  
  let stored = "";
  let provider = "local";
  const ext = path.extname(file.name) || ".bin";
  const buf = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(buf).digest("hex");
  
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`documents/${newId("doc")}${ext}`, file, { access: 'public' });
    stored = blob.url;
    provider = "vercel_blob";
  } else {
    if (!fs.existsSync(DOC_DIR)) fs.mkdirSync(DOC_DIR, { recursive: true });
    stored = `${newId("doc")}${ext}`;
    fs.writeFileSync(path.join(DOC_DIR, stored), buf);
  }

  const db = await getDb();
  const id = newId("doc");
  await db.insert("documents", {
    id, user_id: user.id, name,
    category: String(formData.get("category") || "general"),
    issuer: String(formData.get("issuer") || "") || null,
    date: String(formData.get("date") || "") || null,
    expiry: String(formData.get("expiry") || "") || null,
    sensitivity: String(formData.get("sensitivity") || "normal"),
    file_path: stored,
    storage_provider: provider,
    hash,
    version: 1,
    size_bytes: buf.length,
    mime: file.type || "application/octet-stream",
    applications_json: "[]",
    created_at: nowISO(),
  });
  await logActivity(user.id, "document_uploaded", `Uploaded document: ${name}`, "document", id);
  revalidatePath("/documents");
  return { ok: true, id };
}

export async function deleteDocument(id: string) {
  const user = await requireUser();
  const db = await getDb();
  const doc = await db.get(`SELECT * FROM documents WHERE id = ? AND user_id = ?`, [id, user.id]);
  if (!doc) return { error: "Not found" };
  
  try {
    if (doc.storage_provider === "vercel_blob" && doc.file_path) {
      await del(doc.file_path);
    } else if (doc.file_path) {
      fs.unlinkSync(path.join(DOC_DIR, doc.file_path));
    }
  } catch { /* ignore */ }
  
  await db.del("documents", id);
  await logActivity(user.id, "document_deleted", `Deleted document ${id}`, "document", id);
  revalidatePath("/documents");
}

export async function deleteDocumentForm(fd: FormData): Promise<void> {
  const id = String(fd.get("id") || "");
  if (id) await deleteDocument(id);
}
