"use client";

import * as React from "react";
import { AlertTriangle, Check, Copy, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import {
  confirmMfaEnrolment,
  disableMfaAction,
  regenerateCodesAction,
  signOutEverywhereAction,
  startMfaEnrolment,
  type MfaActionState,
} from "@/app/actions/mfa";
import type { MfaStatus } from "@/lib/mfa";

function Codes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle size={15} /> Save these now. They are not shown again.
      </p>
      <p className="mt-1 text-sm text-muted">
        Each works once, and each is a way back in if you lose your phone. Registration is disabled on this
        application, so without one of these a lost authenticator means a lost account.
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-1 font-mono text-sm">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <Button
        size="sm"
        variant="outline"
        className="mt-3"
        onClick={() => {
          navigator.clipboard?.writeText(codes.join("\n")).then(
            () => setCopied(true),
            () => setCopied(false)
          );
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy all"}
      </Button>
    </div>
  );
}

export function SecuritySettings({ status, email }: { status: MfaStatus; email: string }) {
  const [offer, setOffer] = React.useState<MfaActionState | null>(null);
  const [confirmState, confirmAction] = React.useActionState(confirmMfaEnrolment, {} as MfaActionState);
  const [disableState, disableAction] = React.useActionState(disableMfaAction, {} as MfaActionState);
  const [misc, setMisc] = React.useState<MfaActionState | null>(null);

  const enabled = status.confirmed;
  const codes = confirmState.recoveryCodes || misc?.recoveryCodes;

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              {enabled ? <ShieldCheck size={17} className="text-success" /> : <ShieldOff size={17} className="text-warning" />}
              Two-factor authentication
            </h2>
            <p className="mt-1 text-sm text-muted">
              {enabled
                ? `On. Sign-in asks for a code after your password. ${status.recoveryCodesRemaining} recovery code(s) left.`
                : "Off. Your password is the only thing protecting this account — and it is the only account there is."}
            </p>
          </div>
        </div>

        {!enabled && !offer && (
          <Button
            variant="primary"
            size="sm"
            className="mt-4"
            onClick={async () => setOffer(await startMfaEnrolment())}
          >
            <KeyRound size={14} /> Set up
          </Button>
        )}

        {!enabled && offer?.error && (
          <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{offer.error}</p>
        )}

        {!enabled && offer?.secret && !confirmState.recoveryCodes && (
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-sm font-medium">1. Add this to your authenticator</p>
              <p className="mt-1 text-sm text-muted">
                Enter it by hand as a time-based key for <span className="text-fg">{email}</span>:
              </p>
              <p className="mt-2 select-all break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm">{offer.secret}</p>
              <p className="mt-2 text-sm text-muted">
                On a phone you can open{" "}
                <a href={offer.uri} className="text-accent underline">
                  this enrolment link
                </a>{" "}
                instead.
              </p>
            </div>
            <form action={confirmAction} className="space-y-2">
              <p className="text-sm font-medium">2. Confirm it works</p>
              {confirmState.error && (
                <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {confirmState.error}
                </p>
              )}
              <Label htmlFor="confirm-code">Code from the app</Label>
              <Input id="confirm-code" name="code" required autoComplete="one-time-code" placeholder="123456" />
              <Button type="submit" variant="primary" size="sm">
                Turn on
              </Button>
            </form>
          </div>
        )}

        {codes && <Codes codes={codes} />}
        {(confirmState.notice || misc?.notice) && !codes && (
          <p className="mt-3 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm">
            {confirmState.notice || misc?.notice}
          </p>
        )}

        {enabled && (
          <div className="mt-4 space-y-4">
            <Button size="sm" variant="outline" onClick={async () => setMisc(await regenerateCodesAction())}>
              Issue new recovery codes
            </Button>
            <form action={disableAction} className="space-y-2 border-t border-border pt-4">
              <p className="text-sm font-medium">Turn off two-factor authentication</p>
              <p className="text-sm text-muted">Needs a current code, or a recovery code.</p>
              {disableState.error && (
                <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {disableState.error}
                </p>
              )}
              {disableState.notice && (
                <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">{disableState.notice}</p>
              )}
              <Input name="code" required placeholder="123456" autoComplete="one-time-code" />
              <Button type="submit" size="sm" variant="outline">
                Turn off
              </Button>
            </form>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="font-semibold">Sessions</h2>
        <p className="mt-1 text-sm text-muted">
          A sign-in lasts 30 days. There is no list of devices, so if you suspect a session was taken — a lost
          laptop, a browser extension you no longer trust — this is the way to end it. It signs out everything,
          including this browser.
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={async () => setMisc(await signOutEverywhereAction())}>
          Sign out everywhere
        </Button>
      </div>
    </div>
  );
}
