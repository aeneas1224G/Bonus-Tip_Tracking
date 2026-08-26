import Link from "next/link";
import { redirect } from "next/navigation";

import { logout } from "@/app/actions/auth";
import { LockControls } from "@/components/AdminControls";
import { PayoutTable, PeriodWarnings, PoolSummary } from "@/components/PeriodSheet";
import { Banner, Button, Card, LinkButton, Shell } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { periodByIndex, periodForDate, periodLabel, shortDateLabel, todayISO, weekdayLabel } from "@/lib/payPeriod";
import { loadPeriod } from "@/lib/periods";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  if (session.role !== "ADMIN") redirect("/entry");

  const params = await searchParams;
  const current = periodForDate(todayISO());
  const index =
    params.p !== undefined && Number.isInteger(Number(params.p)) ? Number(params.p) : current.index;
  const bounds = periodByIndex(index);

  const { period, result, employeeNames } = await loadPeriod(bounds);
  const locked = period.status === "LOCKED";
  const totalCents = result.employees.reduce((sum, employee) => sum + employee.totalCents, 0);

  return (
    <Shell
      title={`Pay period ${periodLabel(bounds)}`}
      subtitle={locked ? "Locked — final" : "Open — provisional"}
      action={
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/admin/employees">Employees</LinkButton>
          <LinkButton href="/admin/settings">Bonus rates</LinkButton>
          <form action={logout}>
            <Button variant="ghost" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <LinkButton href={`/admin?p=${index - 1}`}>← Previous period</LinkButton>
        {index < current.index ? (
          <LinkButton href={`/admin?p=${index + 1}`}>Next period →</LinkButton>
        ) : null}
        <a
          href={`/api/export?p=${index}`}
          className="rounded-lg bg-clay px-4 py-2 text-sm font-medium text-white transition hover:bg-clay/90"
        >
          Download payroll CSV
        </a>
      </div>

      <PeriodWarnings warnings={result.warnings} />

      <Card title="Payroll" description="Lock the period once every day is entered and correct.">
        <LockControls startDate={bounds.startDate} locked={locked} totalCents={totalCents} />
      </Card>

      <PoolSummary result={result} />
      <PayoutTable result={result} names={employeeNames} locked={locked} />

      <Card
        title="Day by day"
        description="Each day's pool goes to that day's crew, so the rate moves with how busy the day was. Click any date to edit it."
      >
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="border-b border-ink/15 text-left text-xs uppercase tracking-wide text-ink/50">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 text-right font-medium">Rentals</th>
                <th className="py-2 pr-3 text-right font-medium">Pool</th>
                <th className="py-2 pr-3 text-right font-medium">Hours</th>
                <th className="py-2 pr-3 text-right font-medium">Rate/hr</th>
                <th className="py-2 text-right font-medium">Staff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {result.days.map((day) => (
                <tr key={day.date} className={day.closed ? "text-ink/40" : undefined}>
                  <td className="py-2 pr-3">
                    <Link href={`/admin/day?date=${day.date}`} className="underline">
                      <span className="text-ink/50">{weekdayLabel(day.date)}</span>{" "}
                      {shortDateLabel(day.date)}
                    </Link>
                  </td>
                  <td className="tabular py-2 pr-3 text-right">
                    {day.closed ? "closed" : (day.rentalCount ?? "—")}
                  </td>
                  <td className="tabular py-2 pr-3 text-right">
                    ${(day.poolCents / 100).toFixed(2)}
                  </td>
                  <td className="tabular py-2 pr-3 text-right">
                    {(day.minutes / 60).toFixed(2)}
                  </td>
                  <td className="tabular py-2 pr-3 text-right">
                    {day.ratePerHourCents > 0 ? `$${(day.ratePerHourCents / 100).toFixed(2)}` : "—"}
                  </td>
                  <td className="tabular py-2 text-right">{day.staffCount || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Banner tone="info">
        Everything here is derived from the entries — nothing is stored as a total. Change a day and
        every number above recalculates. Locking freezes the result and pins the rates.
      </Banner>
    </Shell>
  );
}
