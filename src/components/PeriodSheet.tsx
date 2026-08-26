import { Banner, Card, Money, Stat } from "./ui";
import type { CalcResult } from "@/lib/calc";
import { formatCents, minutesToHours } from "@/lib/money";
import { shortDateLabel, weekdayLabel } from "@/lib/payPeriod";

export function PeriodWarnings({ warnings }: { warnings: CalcResult["warnings"] }) {
  if (warnings.length === 0) return null;
  return (
    <Banner tone="warn">
      <p className="mb-1 font-medium">
        {warnings.length} thing{warnings.length === 1 ? "" : "s"} to look at before payroll
      </p>
      <ul className="list-disc space-y-0.5 pl-5">
        {warnings.map((warning, index) => (
          <li key={`${warning.code}-${warning.date ?? index}`}>{warning.message}</li>
        ))}
      </ul>
    </Banner>
  );
}

export function PoolSummary({ result }: { result: CalcResult }) {
  return (
    <Card title="How the pools were built">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Daily bonus pool"
          value={formatCents(result.tipPoolCents)}
          hint="Sum of every open day's tier"
        />
        <Stat
          label="Review bonus pool"
          value={formatCents(result.reviewPoolCents)}
          hint={`${result.reviewsInPeriod} new × ${formatCents(result.reviewRateCents)}`}
        />
        <Stat
          label="Total hours"
          value={minutesToHours(result.totalMinutes).toFixed(2)}
          hint="Across the whole period"
        />
        <Stat
          label="Combined pool"
          value={formatCents(result.totalPoolCents)}
          hint={`averages ${formatCents(
            result.averageTipRatePerHourCents + result.reviewRatePerHourCents,
          )}/hr`}
          emphasis
        />
      </dl>
    </Card>
  );
}

export function PayoutTable({
  result,
  names,
  locked,
}: {
  result: CalcResult;
  names: Map<string, string>;
  locked: boolean;
}) {
  const sum = (pick: (e: CalcResult["employees"][number]) => number) =>
    result.employees.reduce((total, employee) => total + pick(employee), 0);

  return (
    <Card
      title={locked ? "Final payout" : "Payout so far"}
      description={
        locked
          ? "Locked. These are the numbers that went to Gusto."
          : "Provisional. Changes as hours and rentals come in."
      }
    >
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-ink/15 text-left text-xs uppercase tracking-wide text-ink/50">
              <th className="py-2 pr-3 font-medium">Employee</th>
              <th className="py-2 pr-3 text-right font-medium">Hours</th>
              <th className="py-2 pr-3 text-right font-medium">Tip share</th>
              <th className="py-2 pr-3 text-right font-medium">Review bonus</th>
              <th className="py-2 pr-3 text-right font-medium">Cash tips</th>
              <th className="py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {result.employees.map((employee) => (
              <tr key={employee.userId}>
                <td className="py-2 pr-3 font-medium">
                  {names.get(employee.userId) ?? employee.userId}
                </td>
                <td className="tabular py-2 pr-3 text-right">
                  {minutesToHours(employee.minutes).toFixed(2)}
                </td>
                <td className="py-2 pr-3 text-right">
                  <Money cents={employee.tipShareCents} />
                </td>
                <td className="py-2 pr-3 text-right">
                  <Money cents={employee.reviewShareCents} />
                </td>
                <td className="py-2 pr-3 text-right">
                  <Money cents={employee.individualTipCents} />
                </td>
                <td className="py-2 text-right">
                  <Money cents={employee.totalCents} bold />
                </td>
              </tr>
            ))}
            {result.employees.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-ink/50">
                  No hours logged in this period yet.
                </td>
              </tr>
            ) : null}
          </tbody>
          {result.employees.length > 0 ? (
            <tfoot>
              <tr className="border-t-2 border-ink/20 font-semibold">
                <td className="py-2 pr-3">Total</td>
                <td className="tabular py-2 pr-3 text-right">
                  {minutesToHours(result.totalMinutes).toFixed(2)}
                </td>
                <td className="py-2 pr-3 text-right">
                  <Money cents={sum((e) => e.tipShareCents)} />
                </td>
                <td className="py-2 pr-3 text-right">
                  <Money cents={sum((e) => e.reviewShareCents)} />
                </td>
                <td className="py-2 pr-3 text-right">
                  <Money cents={sum((e) => e.individualTipCents)} />
                </td>
                <td className="py-2 text-right">
                  <Money cents={sum((e) => e.totalCents)} bold />
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </Card>
  );
}

export function DayTable({ result }: { result: CalcResult }) {
  return (
    <Card
      title="Day by day"
      description="Each day's pool is split among only the people who worked that day, so the rate per hour moves with how busy the day was."
    >
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="border-b border-ink/15 text-left text-xs uppercase tracking-wide text-ink/50">
              <th className="py-2 pr-3 font-medium">Date</th>
              <th className="py-2 pr-3 text-right font-medium">Rentals</th>
              <th className="py-2 pr-3 text-right font-medium">Pool</th>
              <th className="py-2 pr-3 text-right font-medium">Hours</th>
              <th className="py-2 pr-3 text-right font-medium">Rate/hr</th>
              <th className="py-2 text-right font-medium">Who worked</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {result.days.map((day) => (
              <tr key={day.date} className={day.closed ? "text-ink/40" : undefined}>
                <td className="py-2 pr-3">
                  <span className="text-ink/50">{weekdayLabel(day.date)}</span>{" "}
                  {shortDateLabel(day.date)}
                </td>
                <td className="tabular py-2 pr-3 text-right">
                  {day.closed ? "closed" : (day.rentalCount ?? "—")}
                </td>
                <td className="py-2 pr-3 text-right">
                  <Money cents={day.poolCents} />
                </td>
                <td className="tabular py-2 pr-3 text-right">
                  {minutesToHours(day.minutes).toFixed(2)}
                </td>
                <td className="py-2 pr-3 text-right">
                  {day.ratePerHourCents > 0 ? <Money cents={day.ratePerHourCents} /> : "—"}
                </td>
                <td className="py-2 text-right text-xs text-ink/60">
                  {day.staffCount || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
