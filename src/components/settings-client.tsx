"use client";

import * as React from "react";
import { useTransition } from "react";
import { Input, Label, Textarea, NativeSelect, Button } from "@/components/ui";
import { updateProfileField } from "@/app/actions/profile";
import { updatePreference } from "@/app/actions/settings";

function Field({ label, name, value, textarea }: { label: string; name: string; value?: string; textarea?: boolean }) {
  const [pending, start] = useTransition();
  const [v, setV] = React.useState(value || "");
  return (
    <div>
      <Label>{label}</Label>
      {textarea ? (
        <Textarea defaultValue={v} rows={3} onBlur={(e) => start(() => { updateProfileField(name, e.target.value); })} className="text-sm" />
      ) : (
        <Input defaultValue={v} onBlur={(e) => start(() => { updateProfileField(name, e.target.value); })} className="text-sm" />
      )}
    </div>
  );
}

export function ProfileSettings({ headline, summary, location, nationality, linkedin, portfolio }: any) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Professional headline" name="headline" value={headline} /></div>
      <div className="sm:col-span-2"><Field label="Summary" name="summary" value={summary} textarea /></div>
      <Field label="Location" name="location" value={location} />
      <Field label="Nationality" name="nationality" value={nationality} />
      <Field label="LinkedIn URL" name="linkedin_url" value={linkedin} />
      <Field label="Portfolio URL" name="portfolio_url" value={portfolio} />
    </div>
  );
}

export function AISettings({ provider }: { provider: string }) {
  const [pending, start] = useTransition();
  const [val, setVal] = React.useState(provider);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <NativeSelect value={val} disabled={pending}
          onChange={(e) => { setVal(e.target.value); start(() => { updatePreference("aiProvider", e.target.value); }); }}
          className="w-48 text-sm">
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Google Gemini</option>
        </NativeSelect>
        <span className="text-xs text-muted">Default model role routing (set API keys in .env.local)</span>
      </div>
      <p className="text-[11px] text-faint">The system works fully without any AI key using deterministic, rule-based logic. Add keys to enable semantic assistance.</p>
    </div>
  );
}
