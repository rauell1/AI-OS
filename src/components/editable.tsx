"use client";

import * as React from "react";
import { useTransition } from "react";

// Calls a server action (id, field, value) on blur. Keeps inline editing
// working without a full form submit.
export function ServerActionTextarea({
  action,
  id,
  field,
  value,
  rows = 4,
  placeholder,
}: {
  action: (id: string, field: string, value: string) => Promise<any>;
  id: string;
  field: string;
  value?: string;
  rows?: number;
  placeholder?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <textarea
      defaultValue={value || ""}
      rows={rows}
      placeholder={placeholder}
      onBlur={(e) => start(() => action(id, field, e.target.value))}
      className="w-full resize-y rounded-lg border border-border bg-surface p-3 text-sm focus:border-accent focus:outline-none"
    />
  );
}
