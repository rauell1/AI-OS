import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: "rauell-os", db: "up", time: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, service: "rauell-os", db: "down", error: err instanceof Error ? err.message : "unknown" },
      { status: 503 }
    );
  }
}
