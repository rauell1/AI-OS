import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { resolveWithin, serveHeaders } from "@/lib/file-serving";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOC_DIR = path.join(process.cwd(), "data", "documents");

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const doc = await db.get(`SELECT * FROM documents WHERE id = ? AND user_id = ?`, [params.id, user.id]);
  if (!doc || !doc.file_path) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (doc.storage_provider === "google_drive" && /^https:\/\//.test(doc.file_path)) {
    return NextResponse.redirect(doc.file_path);
  }
  // doc.file_path is stored data, and a Drive sync can put anything in it.
  const filePath = resolveWithin(DOC_DIR, doc.file_path);
  if (!filePath) {
    console.error(`[rauell-os] Refused to serve document ${params.id}: stored path escapes the document directory.`);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: "File missing" }, { status: 404 });
  const buf = fs.readFileSync(filePath);
  const { contentType, disposition } = serveHeaders(doc.mime, doc.name);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=60",
    },
  });
}
