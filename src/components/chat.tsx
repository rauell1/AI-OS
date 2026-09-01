"use client";

import * as React from "react";
import Image from "next/image";
import { Bot, User, Sparkles, Loader2, Paperclip, X, FileText, Image as ImageIcon } from "lucide-react";
import { Button, Input } from "@/components/ui";

interface Attachment {
  id?: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl?: string;
}

interface Msg {
  id?: string;
  role: "user" | "assistant";
  content: string;
  usedAI?: boolean;
  attachments?: Attachment[];
}

const GREETING: Msg = {
  role: "assistant",
  content: "I am your Chief of Staff. Ask about your work, or attach PDFs, images, and notes. Your conversation and materials are saved to your private assistant memory.",
};
const SUGGESTIONS = [
  "What should I focus on today?",
  "Show opportunities above 85% fit",
  "What deadlines are coming up?",
  "Summarize my open applications",
];
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md";
const MAX_BYTES = 10 * 1024 * 1024;

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function AttachmentCard({ attachment }: { attachment: Attachment }) {
  const image = attachment.mimeType.startsWith("image/");
  const content = (
    <span className="flex min-w-0 items-center gap-2">
      {image ? <ImageIcon size={14} /> : <FileText size={14} />}
      <span className="max-w-48 truncate">{attachment.name}</span>
      <span className="shrink-0 text-[10px] text-faint">{formatBytes(attachment.sizeBytes)}</span>
    </span>
  );
  return attachment.downloadUrl ? (
    <a href={attachment.downloadUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs hover:border-accent/50">
      {content}
    </a>
  ) : (
    <span className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs">{content}</span>
  );
}

export function Chat() {
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [threadId, setThreadId] = React.useState<string | null>(null);
  const [input, setInput] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [initializing, setInitializing] = React.useState(true);
  const [error, setError] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ai/chat", { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to load assistant memory.");
        setThreadId(data.threadId);
        setMessages(data.messages?.length ? data.messages : [GREETING]);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message);
          setMessages([GREETING]);
        }
      })
      .finally(() => setInitializing(false));
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, files]);

  const chooseFiles = (selected: FileList | null) => {
    if (!selected) return;
    const next = [...files, ...Array.from(selected)];
    if (next.length > 5) {
      setError("You can upload up to 5 files at a time.");
      return;
    }
    const oversized = next.find((file) => file.size > MAX_BYTES);
    if (oversized) {
      setError(`${oversized.name} exceeds the 10 MB limit.`);
      return;
    }
    setError("");
    setFiles(next);
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = async (text: string) => {
    const q = text.trim();
    if ((!q && !files.length) || loading || initializing) return;
    const outgoingFiles = files;
    const displayQuestion = q || "Please review the attached files.";
    const optimisticId = `pending-${Date.now()}`;
    const optimisticAttachments = outgoingFiles.map((file) => ({
      name: file.name, mimeType: file.type, sizeBytes: file.size,
    }));
    setInput("");
    setFiles([]);
    setError("");
    setMessages((current) => [...current, {
      id: optimisticId, role: "user", content: displayQuestion, attachments: optimisticAttachments,
    }]);
    setLoading(true);
    try {
      const form = new FormData();
      form.set("question", q);
      if (threadId) form.set("threadId", threadId);
      outgoingFiles.forEach((file) => form.append("files", file));
      const res = await fetch("/api/ai/chat", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to send message.");
      setThreadId(data.threadId);
      setMessages((current) => [
        ...current.map((message) => message.id === optimisticId
          ? { ...message, id: data.userMessageId, attachments: data.attachments }
          : message),
        { id: data.assistantMessageId, role: "assistant", content: data.text || "No response.", usedAI: data.usedAI },
      ]);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unable to reach the assistant.";
      setError(detail);
      setMessages((current) => [...current, { role: "assistant", content: `I could not process that message: ${detail}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-1" aria-live="polite">
        {initializing && (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted"><Loader2 size={16} className="animate-spin" /> Loading assistant memory…</div>
        )}
        {!initializing && messages.map((message, index) => (
          <div key={message.id || index} className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}>
            {message.role === "assistant" && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent overflow-hidden"><Image src="/logo.png" alt="AI" width={20} height={20} className="object-contain" /></div>}
            <div className={`max-w-[86%] rounded-xl border p-3 text-sm sm:max-w-[78%] ${message.role === "user" ? "border-accent/30 bg-accent-soft" : "border-border bg-surface"}`}>
              <p className="whitespace-pre-wrap">{message.content}</p>
              {!!message.attachments?.length && <div className="mt-3 flex flex-wrap gap-2">{message.attachments.map((attachment, i) => <AttachmentCard key={attachment.id || `${attachment.name}-${i}`} attachment={attachment} />)}</div>}
              {message.usedAI === false && <p className="mt-1 text-[10px] text-faint">answered from your data (no AI provider configured)</p>}
            </div>
            {message.role === "user" && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted overflow-hidden"><Image src="/logo.png" alt="User" width={32} height={32} className="object-cover opacity-50 grayscale" /></div>}
          </div>
        ))}
        {loading && <div className="flex gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent overflow-hidden"><Image src="/logo.png" alt="AI" width={20} height={20} className="object-contain" /></div><div className="rounded-xl border border-border bg-surface p-3"><Loader2 size={16} className="animate-spin" /></div></div>}
      </div>

      {!initializing && !messages.some((message) => message.role === "user") && (
        <div className="mt-3 flex flex-wrap gap-2">{SUGGESTIONS.map((suggestion) => <button key={suggestion} onClick={() => send(suggestion)} className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:bg-surface-2">{suggestion}</button>)}</div>
      )}

      {!!files.length && (
        <div className="mt-2 flex flex-wrap gap-2 rounded-xl border border-border bg-surface p-2">
          {files.map((file, index) => (
            <span key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs">
              {file.type.startsWith("image/") ? <ImageIcon size={14} /> : <FileText size={14} />}
              <span className="max-w-48 truncate">{file.name}</span>
              <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))} className="text-muted hover:text-foreground"><X size={13} /></button>
            </span>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
      <form onSubmit={(event) => { event.preventDefault(); void send(input); }} className="mt-2 flex items-center gap-2">
        <input ref={fileRef} type="file" multiple accept={ACCEPT} onChange={(event) => chooseFiles(event.target.files)} className="hidden" />
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={loading || initializing} aria-label="Attach files"><Paperclip size={16} /></Button>
        <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask or attach materials…" disabled={initializing} />
        <Button type="submit" variant="primary" disabled={loading || initializing || (!input.trim() && !files.length)}><Sparkles size={15} /> <span className="hidden sm:inline">Ask</span></Button>
      </form>
      <p className="mt-1.5 text-center text-[10px] text-faint">PDFs, images, text and Markdown · up to 5 files · 10 MB each · stored in your private memory</p>
    </div>
  );
}
