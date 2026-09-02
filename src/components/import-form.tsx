"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Loader2, Upload } from "lucide-react";

export interface ImportResult {
  ok: boolean;
  message: string;
  counts?: { label: string; value: number }[];
  notes?: string[];
}

export function ImportForm({
  action,
  aiOn,
}: {
  action: (prev: ImportResult | null, formData: FormData) => Promise<ImportResult>;
  aiOn: boolean;
}) {
  const [state, formAction] = React.useActionState(action, null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    setPending(false);
  }, [state]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-2 text-3xl font-semibold">Master Data Importer</h1>
      <p className="mb-8 text-muted">
        Bring an existing profile in, so the rest of the system has something to work with.
      </p>

      <form
        action={formAction}
        onSubmit={() => setPending(true)}
        className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-border bg-surface-2/30 p-8 text-center"
      >
        <Upload size={28} className="text-muted" />
        <input
          type="file"
          name="file"
          accept=".zip,.pdf,.json"
          required
          className="block w-full text-sm text-muted file:mr-4 file:rounded-full file:border-0 file:bg-accent/20 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-accent hover:file:bg-accent/30"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2 font-medium text-accent-fg transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {pending && <Loader2 size={15} className="animate-spin" />}
          Process &amp; Import
        </button>
      </form>

      {state && (
        <div
          className={`mt-6 rounded-lg border p-4 text-sm ${
            state.ok ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10"
          }`}
        >
          <p className="flex items-center gap-2 font-medium">
            {state.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {state.message}
          </p>
          {state.counts && state.counts.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted">
              {state.counts.map((c) => (
                <li key={c.label}>
                  {c.label}: <span className="font-medium text-fg">{c.value}</span>
                </li>
              ))}
            </ul>
          )}
          {state.notes && state.notes.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              {state.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-8 space-y-2 text-sm text-muted">
        <p className="font-medium text-fg">What each format gives you</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="text-fg">LinkedIn ZIP</span> — skills, education, positions and projects.
            Parsed directly, no AI needed. Request it from LinkedIn under Settings → Data privacy →
            Get a copy of your data.
          </li>
          <li>
            <span className="text-fg">CV as PDF</span> — read by an AI provider and turned into the
            same records.{" "}
            {aiOn ? (
              "A provider is configured, so this will work."
            ) : (
              <span className="text-warning">
                No AI provider is configured, so PDFs cannot be read yet. Set NVIDIA_API_KEY,
                OPENAI_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY.
              </span>
            )}
          </li>
          <li>
            <span className="text-fg">JSON</span> — this app&apos;s own export, or a JSON Resume file.
          </li>
        </ul>
        <p className="pt-2">
          Importing never overwrites what is already there: records that match something on your
          profile are skipped, and existing headline, summary and location are left alone.
        </p>
      </div>
    </div>
  );
}
