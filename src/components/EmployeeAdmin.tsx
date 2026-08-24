"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createEmployee, resetPin, setEmployeeActive, unlockAccount } from "@/app/actions/admin";
import type { ActionState } from "@/app/actions/auth";
import { Banner, Button, Field, inputClass } from "./ui";

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <Banner tone="error">{state.error}</Banner>;
  if (state.success) return <Banner tone="success">{state.success}</Banner>;
  return null;
}

export function AddEmployeeForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createEmployee, {});

  return (
    <form action={formAction} className="space-y-4">
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name">
          <input name="name" required placeholder="Brecklyn" className={inputClass} />
        </Field>
        <Field label="Initials" hint="Optional — shown on closing duty.">
          <input name="initials" placeholder="br" maxLength={6} className={inputClass} />
        </Field>
        <Field label="4-digit PIN" hint="Tell them in person. It is stored hashed.">
          <input
            name="pin"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            required
            placeholder="4820"
            className={inputClass}
          />
        </Field>
      </div>
      <Submit label="Add employee" pendingLabel="Adding…" />
    </form>
  );
}

export function ResetPinForm({ userId, name }: { userId: string; name: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(resetPin, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="userId" value={userId} />
      <label className="block">
        <span className="mb-1 block text-xs text-ink/60">New PIN for {name}</span>
        <input
          name="pin"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          required
          placeholder="••••"
          className="w-28 rounded-lg border border-ink/20 px-3 py-1.5 text-sm tabular"
        />
      </label>
      <Submit label="Set PIN" pendingLabel="Saving…" />
      {state.error ? <span className="text-xs text-red-700">{state.error}</span> : null}
      {state.success ? <span className="text-xs text-emerald-700">{state.success}</span> : null}
    </form>
  );
}

export function ToggleActiveButton({
  userId,
  active,
  name,
}: {
  userId: string;
  active: boolean;
  name: string;
}) {
  const [, formAction] = useActionState<ActionState, FormData>(setEmployeeActive, {});
  const { pending } = useFormStatus();

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        onClick={(event) => {
          if (
            active &&
            !window.confirm(
              `Deactivate ${name}? They will not be able to sign in. Their past hours and pay are kept.`,
            )
          ) {
            event.preventDefault();
          }
        }}
        className="text-sm underline disabled:opacity-50"
      >
        {active ? "Deactivate" : "Reactivate"}
      </button>
    </form>
  );
}

export function UnlockButton({ userId }: { userId: string }) {
  const [, formAction] = useActionState<ActionState, FormData>(unlockAccount, {});
  const { pending } = useFormStatus();

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" disabled={pending} className="text-sm text-clay underline">
        Unlock now
      </button>
    </form>
  );
}
