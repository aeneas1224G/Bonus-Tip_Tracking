"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { changeUsername } from "@/app/actions/account";
import type { ActionState } from "@/app/actions/auth";
import { Banner, Button, Field, inputClass } from "./ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Change sign-in name"}
    </Button>
  );
}

export function UsernameForm({ current }: { current: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(changeUsername, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
      {state.success ? <Banner tone="success">{state.success}</Banner> : null}

      <Field
        label="New sign-in name"
        hint="An email address, or a plain name. Capitals do not matter — it is stored lowercase."
      >
        <input
          name="username"
          defaultValue={current}
          autoComplete="username"
          spellCheck={false}
          autoCapitalize="none"
          required
          className={inputClass}
        />
      </Field>

      <Field
        label="Your current password"
        hint="Confirms it is you. Your password is not being changed."
      >
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>

      <Submit />
    </form>
  );
}
