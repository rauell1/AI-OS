import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { answerQuestion } from "@/lib/assistant";
import { getOrCreateThread, loadChat, storeAssistantMessage, storeUserMessage } from "@/lib/chat-memory";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await loadChat(user.id, req.nextUrl.searchParams.get("threadId")));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load chat" }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    let question = "";
    let requestedThreadId: string | null = null;
    let files: File[] = [];
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      question = String(form.get("question") || "").slice(0, 4000).trim();
      requestedThreadId = String(form.get("threadId") || "") || null;
      files = form.getAll("files").filter((value): value is File => value instanceof File);
    } else {
      const body = await req.json();
      question = String(body.question || "").slice(0, 4000).trim();
      requestedThreadId = body.threadId ? String(body.threadId) : null;
    }
    if (!question && !files.length) {
      return NextResponse.json({ error: "Write a message or attach a file." }, { status: 400 });
    }

    const threadId = await getOrCreateThread(user.id, requestedThreadId);
    const prior = await loadChat(user.id, threadId);
    const displayQuestion = question || "Please review the attached files.";
    const stored = await storeUserMessage(user.id, threadId, displayQuestion, files);
    const fileContext = stored.attachments.map((file) => {
      if (file.extractedText) return `FILE: ${file.name}\n${file.extractedText.slice(0, 20_000)}`;
      if (file.mimeType.startsWith("image/")) return `IMAGE: ${file.name} (${file.mimeType}). The image is stored in memory, but no text could be extracted from it.`;
      return `FILE: ${file.name} (${file.mimeType})`;
    }).join("\n\n");
    const assistantQuestion = fileContext ? `${displayQuestion}\n\nATTACHED MATERIALS:\n${fileContext}` : displayQuestion;
    const history = prior.messages.slice(-20).map(({ role, content }) => ({ role, content }));
    const answer = await answerQuestion(user.id, history, assistantQuestion);
    const assistantMessageId = await storeAssistantMessage(user.id, threadId, answer.text, answer.usedAI);
    await logActivity(
      user.id,
      "assistant_chat",
      files.length ? `Sent a message with ${files.length} upload${files.length === 1 ? "" : "s"}` : "Sent a message to AI Assistant",
      "chat_thread",
      threadId,
      { messageId: stored.id, assistantMessageId, attachmentIds: stored.attachments.map((item) => item.id) }
    ).catch(() => undefined);

    return NextResponse.json({
      threadId, text: answer.text, usedAI: answer.usedAI,
      userMessageId: stored.id, assistantMessageId,
      attachments: stored.attachments.map(({ extractedText: _text, ...attachment }) => attachment),
    });
  } catch (error) {
    console.error("[ai-chat]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to send message" }, { status: 400 });
  }
}
