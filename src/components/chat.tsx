"use client";

import * as React from "react";
import { Bot, User, Sparkles, Loader2 } from "lucide-react";
import { Button, Input } from "@/components/ui";

interface Msg { role: "user" | "assistant"; content: string; usedAI?: boolean }

const SUGGESTIONS = [
  "What should I focus on today?",
  "Show opportunities above 85% fit",
  "What deadlines are coming up?",
  "Which scholarships should I consider?",
  "Summarize my open applications",
];

export function Chat() {
  const [messages, setMessages] = React.useState<Msg[]>([
    { role: "assistant", content: "I am your Chief of Staff. I query your actual data (tasks, opportunities, applications, projects) to answer. Ask me what matters today." },
  ]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setInput("");
    const history = messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: q }]);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history: history.slice(-12) }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.text || "No response.", usedAI: data.usedAI }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Sorry, I could not reach the assistant. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Bot size={16} /></div>}
            <div className={`max-w-[80%] rounded-xl border p-3 text-sm ${m.role === "user" ? "border-accent/30 bg-accent-soft" : "border-border bg-surface"}`}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.usedAI === false && <p className="mt-1 text-[10px] text-faint">answered from your data (no AI provider configured)</p>}
            </div>
            {m.role === "user" && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted"><User size={16} /></div>}
          </div>
        ))}
        {loading && <div className="flex gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent"><Bot size={16} /></div><div className="rounded-xl border border-border bg-surface p-3"><Loader2 size={16} className="animate-spin" /></div></div>}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:bg-surface-2">{s}</button>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mt-2 flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask your Chief of Staff…" />
        <Button type="submit" variant="primary" disabled={loading}><Sparkles size={15} /> Ask</Button>
      </form>
    </div>
  );
}
