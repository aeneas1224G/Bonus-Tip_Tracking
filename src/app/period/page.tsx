import { redirect } from "next/navigation";

import { logout } from "@/app/actions/auth";
import { DayTable, PayoutTable, PeriodWarnings, PoolSummary } from "@/components/PeriodSheet";
import { Banner, Button, LinkButton, Shell } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { periodByIndex, periodForDate, periodLabel, todayISO } from "@/lib/payPeriod";
import { loadPeriod } from "@/lib/periods";

export const dynamic = "force-dynamic";

/** The whole-period view. Everyone signed in can see it, by the owner's choice. */
export default async function PeriodPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const params = await searchParams;
  const current = periodForDate(todayISO());
  const index = params.p !== undefined && Number.isInteger(Number(params.p))
    ? Number(params.p)
    : current.index;
  const bounds = periodByIndex(index);

  const { period, result, employeeNames } = await loadPeriod(bounds);
  const locked = period.status === "LOCKED";

  return (
    <Shell
      title={`Pay period ${periodLabel(bounds)}`}
      subtitle={locked ? "Locked — final" : "Open — provisional"}
      action={
        <div className="flex gap-2">
          <LinkButton href={`/period?p=${index - 1}`}>← Previous</LinkButton>
          {index < current.index ? (
            <LinkButton href={`/period?p=${index + 1}`}>Next →</LinkButton>
          ) : null}
          <LinkButton href={session.role === "ADMIN" ? "/admin" : "/entry"}>
            {session.role === "ADMIN" ? "Admin" : "My entry"}
          </LinkButton>
          <form action={logout}>
            <Button variant="ghost" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      }
    >
      {locked ? (
        <Banner tone="info">
          Locked{period.lockedAt ? ` on ${period.lockedAt.toISOString().slice(0, 10)}` : ""}. These
          totals are what went to payroll.
        </Banner>
      ) : null}

      <PeriodWarnings warnings={result.warnings} />
      <PoolSummary result={result} />
      <PayoutTable result={result} names={employeeNames} locked={locked} />
      <DayTable result={result} />
    </Shell>
  );
}
