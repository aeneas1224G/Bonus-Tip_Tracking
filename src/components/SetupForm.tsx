"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { completeSetup } from "@/app/actions/setup";
import type { ActionState } from "@/app/actions/auth";
import { Banner, Button, Field, inputClass } from "./ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full py-3">
      {pending ? "Creating your account…" : "Create owner account"}
    </Button>
  );
}

export function SetupForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(completeSetup, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}

      <Field
        label="Setup token"
        hint="The SETUP_TOKEN you set in your hosting environment."
      >
        <input name="token" required autoComplete="off" className={inputClass} />
      </Field>

      <Field label="Choose a username">
        <input
          name="username"
          required
          autoComplete="username"
          placeholder="owner"
          className={inputClass}
        />
      </Field>

      <Field
        label="Choose a password"
        hint="At least 12 characters. This account controls payroll — use something you do not use anywhere else."
      >
        <input
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>

      <Field label="Confirm password">
        <input
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>

      <Submit />
    </form>
  );
}
