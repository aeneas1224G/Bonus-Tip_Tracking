"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { addTip, deleteTip, saveDayNumbers, saveShift } from "@/app/actions/entry";
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

export function HoursForm({
  date,
  userId,
  currentHours,
  readOnly,
  readOnlyReason,
}: {
  date: string;
  userId: string;
  currentHours: string;
  readOnly?: boolean;
  readOnlyReason?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveShift, {});

  if (readOnly) {
    return (
      <div>
        <p className="tabular text-2xl font-semibold">{currentHours || "—"} hrs</p>
        {readOnlyReason ? <p className="mt-1 text-sm text-ink/60">{readOnlyReason}</p> : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <Feedback state={state} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="userId" value={userId} />
      <Field label="Hours worked today" hint="Enter 8, 7.5 or 7:30. Save 0 to clear the entry.">
        <input
          name="hours"
          defaultValue={currentHours}
          inputMode="decimal"
          autoComplete="off"
          placeholder="8"
          className={inputClass}
        />
      </Field>
      <Submit label="Save hours" pendingLabel="Saving…" />
    </form>
  );
}

export function DayNumbersForm({
  date,
  rentalCount,
  reviewCount,
  ebikeCount,
  closerId,
  notes,
  closed,
  employees,
  readOnly,
}: {
  date: string;
  rentalCount: number | null;
  reviewCount: number | null;
  ebikeCount: number | null;
  closerId: string | null;
  notes: string | null;
  closed: boolean;
  employees: Array<{ id: string; name: string }>;
  readOnly?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveDayNumbers, {});

  if (readOnly) {
    return (
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-ink/50">Rentals</dt>
          <dd className="tabular text-lg">{closed ? "Closed" : (rentalCount ?? "—")}</dd>
        </div>
        <div>
          <dt className="text-ink/50">Review count</dt>
          <dd className="tabular text-lg">{reviewCount ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-ink/50">Ebikes out</dt>
          <dd className="tabular text-lg">{ebikeCount ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-ink/50">Notes</dt>
          <dd>{notes || "—"}</dd>
        </div>
      </dl>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Feedback state={state} />
      <input type="hidden" name="date" value={date} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Rentals today" hint="Drives the day's bonus pool.">
          <input
            name="rentalCount"
            defaultValue={rentalCount ?? ""}
            inputMode="numeric"
            placeholder="64"
            className={inputClass}
          />
        </Field>
        <Field label="Google review count" hint="The running total, not today's new ones.">
          <input
            name="reviewCount"
            defaultValue={reviewCount ?? ""}
            inputMode="numeric"
            placeholder="1929"
            className={inputClass}
          />
        </Field>
        <Field label="Ebikes out" hint="Recorded for reference only.">
          <input
            name="ebikeCount"
            defaultValue={ebikeCount ?? ""}
            inputMode="numeric"
            placeholder="58"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Who closed">
          <select name="closerId" defaultValue={closerId ?? ""} className={inputClass}>
            <option value="">—</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes" hint="Rescues, water sales, anything worth remembering.">
          <input
            name="notes"
            defaultValue={notes ?? ""}
            placeholder="Kyle 2x rescue"
            className={inputClass}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="closed" defaultChecked={closed} className="h-4 w-4" />
        Shop was closed today (no bonus pool)
      </label>

      <Submit label="Save day" pendingLabel="Saving…" />
    </form>
  );
}

export function TipForm({
  date,
  userId,
  employees,
  allowChoosingEmployee,
}: {
  date: string;
  userId: string;
  employees: Array<{ id: string; name: string }>;
  allowChoosingEmployee?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(addTip, {});

  return (
    <form action={formAction} className="space-y-3">
      <Feedback state={state} />
      <input type="hidden" name="date" value={date} />
      {allowChoosingEmployee ? null : <input type="hidden" name="userId" value={userId} />}

      <div className="grid gap-3 sm:grid-cols-4">
        {allowChoosingEmployee ? (
          <Field label="Who">
            <select name="userId" defaultValue={userId} className={inputClass}>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Amount">
          <input name="amount" inputMode="decimal" placeholder="25.00" className={inputClass} />
        </Field>
        <Field label="Type">
          <select name="kind" defaultValue="RESCUE" className={inputClass}>
            <option value="RESCUE">Rescue</option>
            <option value="WATER">Water sale</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="Note">
          <input name="note" placeholder="2 riders, Ted assisted" className={inputClass} />
        </Field>
      </div>

      <Submit label="Add tip" pendingLabel="Adding…" />
    </form>
  );
}

export function DeleteTipButton({ tipId }: { tipId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(deleteTip, {});
  const { pending } = useFormStatus();

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="tipId" value={tipId} />
      <button
        type="submit"
        disabled={pending}
        className="text-sm text-red-700 underline disabled:opacity-50"
        title={state.error ?? "Remove this tip"}
      >
        Remove
      </button>
    </form>
  );
}
