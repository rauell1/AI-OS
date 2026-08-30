import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { handleCallback } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") || "";
  const provider = (state.split(":")[0] as any) || "gmail";
  if (!code) return NextResponse.redirect(new URL("/integrations?error=missing_code", req.url));
  try {
    await handleCallback(provider, code, user.id);
  } catch (e: any) {
    return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(e?.message || "callback_failed")}`, req.url));
  }
  return NextResponse.redirect(new URL("/integrations?connected=" + provider, req.url));
}
