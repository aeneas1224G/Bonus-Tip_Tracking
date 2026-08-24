"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { loginAsAdmin, type ActionState } from "@/app/actions/auth";
import { Banner, Button, Field, inputClass } from "./ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full py-3">
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function AdminLoginForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(loginAsAdmin, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
      <Field label="Username">
        <input name="username" autoComplete="username" required className={inputClass} />
      </Field>
      <Field label="Password">
        <input
          name="password"
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
