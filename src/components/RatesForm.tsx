"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { saveRates } from "@/app/actions/admin";
import type { ActionState } from "@/app/actions/auth";
import { Banner, Button } from "./ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save rates"}
    </Button>
  );
}

const rateInput =
  "w-28 rounded-lg border border-ink/20 bg-white px-3 py-1.5 text-sm tabular outline-none focus:border-clay focus:ring-2 focus:ring-clay/20";

export function RatesForm({
  rentalTiers,
  reviewTiers,
}: {
  rentalTiers: Array<{ minRentals: number; bonusCents: number }>;
  reviewTiers: Array<{ minReviews: number; perReviewCents: number }>;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveRates, {});
  const dollars = (cents: number) => (cents / 100).toFixed(2);

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
      {state.success ? <Banner tone="success">{state.success}</Banner> : null}

      <div>
        <h3 className="mb-1 font-medium">Daily rental bonus</h3>
        <p className="mb-3 text-sm text-ink/60">
          The pool a day earns, based on rentals that day. The highest threshold reached wins.
          Blank a row to remove that tier.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rentalTiers.map((tier) => (
            <label key={tier.minRentals} className="flex items-center justify-between gap-3">
              <span className="tabular text-sm">{tier.minRentals}+ rentals</span>
              <span className="flex items-center gap-1">
                <span className="text-ink/50">$</span>
                <input
                  name={`rental.${tier.minRentals}`}
                  defaultValue={dollars(tier.bonusCents)}
                  inputMode="decimal"
                  className={rateInput}
                />
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-1 font-medium">Review bonus</h3>
        <p className="mb-3 text-sm text-ink/60">
          Paid per new Google review across the pay period. The rate depends on how many the period
          earned in total.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {reviewTiers.map((tier) => (
            <label key={tier.minReviews} className="flex items-center justify-between gap-3">
              <span className="tabular text-sm">
                {tier.minReviews === 0 ? "under 75" : `${tier.minReviews}+`} reviews
              </span>
              <span className="flex items-center gap-1">
                <span className="text-ink/50">$</span>
                <input
                  name={`review.${tier.minReviews}`}
                  defaultValue={dollars(tier.perReviewCents)}
                  inputMode="decimal"
                  className={rateInput}
                />
              </span>
            </label>
          ))}
        </div>
      </div>

      <Submit />
    </form>
  );
}
