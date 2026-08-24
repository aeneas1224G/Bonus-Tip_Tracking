"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { loginWithPin, type ActionState } from "@/app/actions/auth";
import { Banner, Button } from "./ui";

type Employee = { id: string; name: string; initials: string | null };

function SubmitRow({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending} className="w-full py-3 text-base">
      {pending ? "Checking…" : "Sign in"}
    </Button>
  );
}

export function PinPad({ employees }: { employees: Employee[] }) {
  const [selected, setSelected] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [state, formAction] = useActionState<ActionState, FormData>(loginWithPin, {});
  const formRef = useRef<HTMLFormElement>(null);

  // A wrong PIN clears the pad so the next attempt starts clean.
  useEffect(() => {
    if (state.error) setPin("");
  }, [state.error]);

  if (!selected) {
    return (
      <div>
        <p className="mb-3 text-sm text-ink/60">Tap your name to enter hours.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {employees.map((employee) => (
            <button
              key={employee.id}
              onClick={() => setSelected(employee)}
              className="rounded-xl border border-ink/15 bg-white px-4 py-5 text-lg font-medium shadow-sm transition hover:border-clay hover:bg-clay/5"
            >
              {employee.name}
            </button>
          ))}
        </div>
        {employees.length === 0 ? (
          <Banner tone="warn">
            No employees have been set up yet. The owner can add them under Admin → Employees.
          </Banner>
        ) : null}
      </div>
    );
  }

  const press = (digit: string) => {
    setPin((current) => (current.length >= 4 ? current : current + digit));
  };

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="userId" value={selected.id} />
      <input type="hidden" name="pin" value={pin} />

      <div className="mb-4 flex items-center justify-between">
        <p className="text-lg font-medium">{selected.name}</p>
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setPin("");
          }}
          className="text-sm text-ink/60 underline"
        >
          Not you?
        </button>
      </div>

      {state.error ? <Banner tone="error">{state.error}</Banner> : null}

      <div className="mb-5 flex justify-center gap-3" aria-label={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={`h-4 w-4 rounded-full border-2 ${
              index < pin.length ? "border-clay bg-clay" : "border-ink/25"
            }`}
          />
        ))}
      </div>

      <div className="mx-auto grid max-w-xs grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => press(digit)}
            className="rounded-xl border border-ink/15 bg-white py-4 text-xl font-medium transition active:bg-sand"
          >
            {digit}
          </button>
        ))}
        <span />
        <button
          type="button"
          onClick={() => press("0")}
          className="rounded-xl border border-ink/15 bg-white py-4 text-xl font-medium transition active:bg-sand"
        >
          0
        </button>
        <button
          type="button"
          onClick={() => setPin((current) => current.slice(0, -1))}
          className="rounded-xl border border-ink/15 bg-white py-4 text-xl transition active:bg-sand"
          aria-label="Delete last digit"
        >
          ⌫
        </button>
      </div>

      <div className="mx-auto mt-4 max-w-xs">
        <SubmitRow disabled={pin.length !== 4} />
      </div>
    </form>
  );
}
