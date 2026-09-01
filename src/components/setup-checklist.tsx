import Link from "next/link";
import { ArrowRight, Check, Circle, Settings2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui";
import { SectionTitle } from "@/components/widgets";
import type { SetupStatus } from "@/lib/setup-status";

/**
 * Shown while the account is still mostly empty. Zeros on every card are
 * correct but unreadable - they look identical to a broken deployment - so this
 * says which parts are genuinely not set up yet, and where to go.
 */
export function SetupChecklist({ status }: { status: SetupStatus }) {
  const done = status.steps.length - status.remaining;
  return (
    <Card className="mb-6 border-accent/30">
      <div className="border-b border-border px-4 py-3">
        <SectionTitle>
          Finish setting up
          <span className="ml-2 font-normal text-muted">
            {done} of {status.steps.length} done
          </span>
        </SectionTitle>
        <p className="text-sm text-muted">
          {status.rowCount === 0
            ? "This account has no data yet, so every count below reads zero. That is the empty state, not a fault."
            : "A few things are still unconnected. The counts below only reflect what has been set up."}
        </p>
      </div>
      <CardContent className="divide-y divide-border p-0">
        {status.steps.map((step) => (
          <div key={step.id} className="flex items-start gap-3 px-4 py-3">
            <span className={step.done ? "mt-0.5 text-success" : "mt-0.5 text-faint"}>
              {step.done ? <Check size={16} /> : <Circle size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={step.done ? "text-sm text-muted line-through" : "text-sm font-medium"}>{step.label}</p>
              <p className="mt-0.5 text-sm text-muted">{step.detail}</p>
            </div>
            {!step.done &&
              (step.href ? (
                <Link
                  href={step.href}
                  className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-sm text-accent hover:underline"
                >
                  Open <ArrowRight size={13} />
                </Link>
              ) : (
                <span
                  className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs text-faint"
                  title="Set this as an environment variable on your deployment"
                >
                  <Settings2 size={13} /> env
                </span>
              ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
