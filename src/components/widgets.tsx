import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, hint, href }: { label: string; value: number | string; hint?: string; href?: string }) {
  const Comp = href ? "a" : "div";
  return (
    <Comp href={href} className={cn("card flex flex-col gap-1 p-4 transition-colors", href && "hover:border-accent/40")}>
      <span className="text-2xl font-semibold tnum">{value}</span>
      <span className="text-xs text-muted">{label}</span>
      {hint && <span className="text-[11px] text-danger">{hint}</span>}
    </Comp>
  );
}

export function ScoreBar({ value, className }: { value: number; className?: string }) {
  const tone = value >= 80 ? "bg-success" : value >= 60 ? "bg-accent" : value >= 40 ? "bg-warning" : "bg-danger";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}>
      <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-fg">{children}</h2>
      {action}
    </div>
  );
}

export function KeyValue({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{value ?? "—"}</span>
    </div>
  );
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-faint">{children}</p>;
}

/**
 * For a section with no rows yet. A bare "0" or an empty list reads as a broken
 * page; this says which it is and what would fill it.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-surface-2/30 px-6 py-8 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
