import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAttachment } from "@/lib/chat-memory";
import { serveHeaders } from "@/lib/file-serving";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const attachment = await getAttachment(user.id, params.id);
  if (!attachment) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const { contentType, disposition } = serveHeaders(attachment.mime_type, attachment.name);
  const headers = {
    "Content-Type": contentType,
    "Content-Disposition": disposition,
    "Cache-Control": "private, max-age=3600",
  };
  if (attachment.storage_provider === "vercel-blob") {
    const { get } = await import("@vercel/blob");
    const blob = await get(String(attachment.storage_path), { access: "private" });
    if (!blob) return NextResponse.json({ error: "File not found" }, { status: 404 });
    return new NextResponse(blob.stream, { headers });
  }

  try {
    const content = await fs.readFile(String(attachment.storage_path));
    return new NextResponse(content, { headers });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
