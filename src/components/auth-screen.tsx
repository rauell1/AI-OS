"use client";

import * as React from "react";
import Image from "next/image";
import { useFormState } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Bot, Loader2 } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { login, verifyMfa } from "@/app/actions/auth";

export function AuthScreen() {
  const [state, action] = useFormState(login, {});
  const [mfaState, mfaAction] = useFormState(verifyMfa, {});
  const [pending, setPending] = React.useState(false);
  const params = useSearchParams();
  const next = params.get("next") || "/";

  // Once the password is accepted the form swaps to the code step; either
  // action can set that, since a failed code keeps you on the second step.
  const awaitingCode = Boolean(state.mfaRequired || mfaState.mfaRequired);
  const error = awaitingCode ? mfaState.error : state.error || mfaState.error;

  React.useEffect(() => {
    setPending(false);
  }, [state, mfaState]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    if (awaitingCode) mfaAction(fd);
    else action(fd);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <Image src="/logo.png" alt="Rauell OS" width={36} height={36} className="rounded-lg object-contain" />
          <div>
            <p className="font-semibold leading-tight">Rauell OS</p>
            <p className="text-xs text-muted">Roy&apos;s Personal AI Operating System</p>
          </div>
        </div>
        <div className="card p-6">
          <h1 className="text-lg font-semibold">{awaitingCode ? "One more step" : "Welcome back, Roy"}</h1>
          <p className="mb-4 mt-1 text-sm text-muted">
            {awaitingCode
              ? "Enter the six-digit code from your authenticator app, or one of your recovery codes."
              : "Sign in to your private command center. New registrations are disabled."}
          </p>
          <form onSubmit={submit} className="space-y-3">
            {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
            {awaitingCode ? (
              <div>
                <Label htmlFor="code">Authentication code</Label>
                <Input
                  id="code"
                  name="code"
                  type="text"
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  inputMode="text"
                  placeholder="123456"
                />
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required autoComplete="email" />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" name="password" type="password" required autoComplete="current-password" />
                </div>
              </>
            )}
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="primary" className="w-full" disabled={pending}>
              {pending && <Loader2 size={15} className="animate-spin" />}
              {awaitingCode ? "Verify" : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted">Owner access only.</p>
        </div>
      </div>
    </div>
  );
}
