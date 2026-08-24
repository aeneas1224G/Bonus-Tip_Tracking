import { redirect } from "next/navigation";

import { RatesForm } from "@/components/RatesForm";
import { Banner, Card, LinkButton, Shell } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERIOD_ANCHOR } from "@/lib/payPeriod";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  if (session.role !== "ADMIN") redirect("/entry");

  const schedule = await db.rateSchedule.findFirst({
    where: { isCurrent: true },
    include: {
      rentalTiers: { orderBy: { minRentals: "asc" } },
      reviewTiers: { orderBy: { minReviews: "asc" } },
    },
  });

  const versions = await db.rateSchedule.count();

  if (!schedule) {
    return (
      <Shell title="Bonus rates" action={<LinkButton href="/admin">Back to period</LinkButton>}>
        <Banner tone="error">
          No rate schedule exists yet. Run <code>npm run db:seed</code> to install the 2026 ladders.
        </Banner>
      </Shell>
    );
  }

  return (
    <Shell
      title="Bonus rates"
      subtitle={`${schedule.label} · version ${versions} of ${versions}`}
      action={<LinkButton href="/admin">Back to period</LinkButton>}
    >
      <Banner tone="info">
        Saving creates a new version rather than overwriting the old one. Any pay period you have
        already locked keeps the rates it was paid at, so history never shifts underneath you.
      </Banner>

      <Card>
        <RatesForm
          rentalTiers={schedule.rentalTiers.map((tier) => ({
            minRentals: tier.minRentals,
            bonusCents: tier.bonusCents,
          }))}
          reviewTiers={schedule.reviewTiers.map((tier) => ({
            minReviews: tier.minReviews,
            perReviewCents: tier.perReviewCents,
          }))}
        />
      </Card>

      <Card title="Pay period schedule">
        <p className="text-sm text-ink/70">
          Two weeks, Monday through Sunday, anchored on {PERIOD_ANCHOR} — the first period in your
          spreadsheet. Every period since lines up with it automatically.
        </p>
      </Card>
    </Shell>
  );
}
