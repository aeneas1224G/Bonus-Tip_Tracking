"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { changePassword, changeUsername } from "@/app/actions/account";
import type { ActionState } from "@/app/actions/auth";
import { PASSWORD_MIN } from "@/lib/password";
import { Banner, Button, Field, inputClass } from "./ui";

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
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

      <Submit label="Change sign-in name" pendingLabel="Saving…" />
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(changePassword, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
      {state.success ? <Banner tone="success">{state.success}</Banner> : null}

      <Field label="Your current password">
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>

      <Field
        label="New password"
        hint={`At least ${PASSWORD_MIN} characters. Let a password manager generate it — there is no reset link if you lose it.`}
      >
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </Field>

      <Field label="Confirm new password">
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </Field>

      <Submit label="Change password" pendingLabel="Saving…" />
    </form>
  );
}
