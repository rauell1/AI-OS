import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { answerQuestion } from "@/lib/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const question = String(body.question || "").slice(0, 2000);
  const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
  if (!question.trim()) return NextResponse.json({ error: "Empty question" }, { status: 400 });
  const answer = await answerQuestion(user.id, history, question);
  return NextResponse.json(answer);
}
