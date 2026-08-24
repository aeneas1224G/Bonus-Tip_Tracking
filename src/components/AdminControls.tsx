"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { lockPeriod, unlockPeriod } from "@/app/actions/admin";
import type { ActionState } from "@/app/actions/auth";
import { Banner, Button } from "./ui";

function Submit({
  label,
  pendingLabel,
  variant,
  confirm,
}: {
  label: string;
  pendingLabel: string;
  variant: "primary" | "danger";
  confirm: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirm)) event.preventDefault();
      }}
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function LockControls({
  startDate,
  locked,
  totalCents,
}: {
  startDate: string;
  locked: boolean;
  totalCents: number;
}) {
  const action = locked ? unlockPeriod : lockPeriod;
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const dollars = (totalCents / 100).toFixed(2);

  return (
    <div>
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
      {state.success ? <Banner tone="success">{state.success}</Banner> : null}
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="startDate" value={startDate} />
        {locked ? (
          <Submit
            label="Unlock period"
            pendingLabel="Unlocking…"
            variant="danger"
            confirm="Unlocking lets hours and rentals change, which can change what people are owed. The snapshot of what was already paid is kept. Continue?"
          />
        ) : (
          <Submit
            label="Lock period for payroll"
            pendingLabel="Locking…"
            variant="primary"
            confirm={`Lock this pay period at $${dollars} total? Employees will not be able to change anything until you unlock it.`}
          />
        )}
        <p className="text-sm text-ink/60">
          {locked
            ? "Locked. Entries are frozen and the totals are final."
            : "Locking freezes every entry and pins the current bonus rates to this period."}
        </p>
      </form>
    </div>
  );
}
