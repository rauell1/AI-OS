"use client";

import * as React from "react";
import { useFormState } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bot, Loader2 } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { login, register } from "@/app/actions/auth";

export function AuthScreen({ mode }: { mode: "login" | "register" }) {
  const [state, action] = useFormState(mode === "login" ? login : register, {});
  const [pending, setPending] = React.useState(false);
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    action(fd);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-fg font-bold">R</div>
          <div>
            <p className="font-semibold leading-tight">Rauell OS</p>
            <p className="text-xs text-muted">Roy&apos;s Personal AI Operating System</p>
          </div>
        </div>
        <div className="card p-6">
          <h1 className="text-lg font-semibold">{mode === "login" ? "Welcome back, Roy" : "Create your account"}</h1>
          <p className="mb-4 mt-1 text-sm text-muted">
            {mode === "login" ? "Sign in to your command center." : "Set up the first owner account."}
          </p>
          <form onSubmit={submit} className="space-y-3">
            {state.error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</div>}
            {mode === "register" && (
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input id="name" name="name" placeholder="Roy Okola Otieno" required />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="roy@rauell.systems" required defaultValue="roy@rauell.systems" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required autoComplete={mode === "login" ? "current-password" : "new-password"} />
            </div>
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="primary" className="w-full" disabled={pending}>
              {pending && <Loader2 size={15} className="animate-spin" />}
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted">
            {mode === "login" ? (
              <>No account? <Link href="/register" className="text-accent">Create one</Link></>
            ) : (
              <>Already have an account? <Link href="/login" className="text-accent">Sign in</Link></>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
