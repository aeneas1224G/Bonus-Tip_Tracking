import { formatCents, minutesToHours } from "./money";
import { periodLabel, shortDateLabel } from "./payPeriod";
import type { CalcResult } from "./calc";

/** RFC 4180 escaping — quote anything containing a comma, quote or newline. */
function cell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function row(values: Array<string | number>): string {
  return values.map(cell).join(",");
}

/**
 * The payroll export. One row per employee with the numbers to key into Gusto.
 *
 * Dollar columns are written as bare decimals (924.45) rather than "$924.45"
 * so a spreadsheet or an import tool reads them as numbers, not text.
 */
export function payrollCsv(input: {
  startDate: string;
  endDate: string;
  result: CalcResult;
  employeeNames: Map<string, string>;
  generatedAt: Date;
  status: "OPEN" | "LOCKED";
}): string {
  const { result, employeeNames } = input;
  const dollars = (cents: number) => (cents / 100).toFixed(2);

  const lines: string[] = [];

  lines.push(row(["Vista Trail Bikes — Bonus & Tip Payroll Export"]));
  lines.push(row(["Pay period", periodLabel(input)]));
  lines.push(row(["Status", input.status === "LOCKED" ? "Locked (final)" : "Open (provisional)"]));
  lines.push(row(["Generated", input.generatedAt.toISOString()]));
  lines.push("");

  lines.push(
    row([
      "Employee",
      "Hours",
      "Tip Share",
      "Review Bonus",
      "Individual Tips",
      "Total Bonus",
    ]),
  );

  for (const employee of result.employees) {
    lines.push(
      row([
        employeeNames.get(employee.userId) ?? employee.userId,
        minutesToHours(employee.minutes).toFixed(2),
        dollars(employee.tipShareCents),
        dollars(employee.reviewShareCents),
        dollars(employee.individualTipCents),
        dollars(employee.totalCents),
      ]),
    );
  }

  const sum = (pick: (e: CalcResult["employees"][number]) => number) =>
    result.employees.reduce((total, employee) => total + pick(employee), 0);

  lines.push(
    row([
      "TOTAL",
      minutesToHours(result.totalMinutes).toFixed(2),
      dollars(sum((e) => e.tipShareCents)),
      dollars(sum((e) => e.reviewShareCents)),
      dollars(sum((e) => e.individualTipCents)),
      dollars(sum((e) => e.totalCents)),
    ]),
  );

  lines.push("");
  lines.push(row(["How these numbers were reached"]));
  lines.push(row(["Daily bonus pool", dollars(result.tipPoolCents)]));
  lines.push(row(["New reviews in period", result.reviewsInPeriod]));
  lines.push(row(["Rate per review", dollars(result.reviewRateCents)]));
  lines.push(row(["Review bonus pool", dollars(result.reviewPoolCents)]));
  lines.push(row(["Total hours", minutesToHours(result.totalMinutes).toFixed(2)]));
  lines.push(row(["Average tip rate per hour", dollars(result.averageTipRatePerHourCents)]));
  lines.push(row(["Review rate per hour", dollars(result.reviewRatePerHourCents)]));
  lines.push(
    row([
      "Note",
      "Each day's bonus pool is split among only the people who worked that day, by their hours. " +
        "The average above is a headline figure; no single day paid exactly that rate. " +
        "The review bonus is a period figure and is split across all period hours.",
    ]),
  );

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push(row(["Warnings"]));
    for (const warning of result.warnings) lines.push(row([warning.message]));
  }

  lines.push("");
  lines.push(row(["Day", "Rentals", "Pool", "Hours", "Staff", "Rate/hr"]));
  for (const day of result.days) {
    lines.push(
      row([
        shortDateLabel(day.date),
        day.closed ? "closed" : (day.rentalCount ?? ""),
        dollars(day.poolCents),
        minutesToHours(day.minutes).toFixed(2),
        day.staffCount,
        dollars(day.ratePerHourCents),
      ]),
    );
  }

  // Per-person, per-day, so the owner can audit any single cell.
  lines.push("");
  lines.push(row(["Day", "Employee", "Hours", "Share of that day's pool"]));
  for (const day of result.days) {
    for (const share of day.shares) {
      lines.push(
        row([
          shortDateLabel(day.date),
          employeeNames.get(share.userId) ?? share.userId,
          minutesToHours(share.minutes).toFixed(2),
          dollars(share.shareCents),
        ]),
      );
    }
  }

  return lines.join("\r\n");
}

export function csvFilename(startDate: string, endDate: string): string {
  return `vtb-bonus-${startDate}-to-${endDate}.csv`;
}

export { formatCents };
