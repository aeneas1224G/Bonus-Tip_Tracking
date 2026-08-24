import { redirect } from "next/navigation";

import { DayNumbersForm, DeleteTipButton, HoursForm, TipForm } from "@/components/EntryForms";
import { Banner, Card, LinkButton, Money, Shell } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatHours } from "@/lib/money";
import {
  parseISODate,
  periodForDate,
  shortDateLabel,
  todayISO,
  weekdayLabel,
} from "@/lib/payPeriod";
import { ensureDay } from "@/lib/periods";

export const dynamic = "force-dynamic";

/** Owner-only editor for any single day in an open period. */
export default async function AdminDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  if (session.role !== "ADMIN") redirect("/entry");

  const params = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : todayISO();

  await ensureDay(date);

  const [day, employees] = await Promise.all([
    db.dayRecord.findUnique({
      where: { date: parseISODate(date) },
      include: {
        entries: { include: { user: { select: { id: true, name: true } } } },
        tips: { include: { user: { select: { id: true, name: true } } } },
        payPeriod: true,
      },
    }),
    db.user.findMany({
      where: { role: "EMPLOYEE", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const locked = day?.payPeriod.status === "LOCKED";
  const bounds = periodForDate(date);
  const minutesByUser = new Map(day?.entries.map((entry) => [entry.userId, entry.minutes]) ?? []);

  // Anyone who has an entry or a tip on this day, even if since deactivated,
  // so historical days stay editable and readable.
  const historical = new Map(employees.map((employee) => [employee.id, employee.name]));
  for (const entry of day?.entries ?? []) historical.set(entry.user.id, entry.user.name);
  for (const tip of day?.tips ?? []) historical.set(tip.user.id, tip.user.name);
  const roster = [...historical.entries()].map(([id, name]) => ({ id, name }));
  roster.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Shell
      title={`${weekdayLabel(date)} ${shortDateLabel(date)}`}
      subtitle="Owner edit — every change is written to the audit log"
      action={<LinkButton href={`/admin?p=${bounds.index}`}>Back to period</LinkButton>}
    >
      {locked ? (
        <Banner tone="warn">
          This day sits in a locked pay period. Unlock the period before editing.
        </Banner>
      ) : null}

      <Card title="Shop numbers">
        <DayNumbersForm
          date={date}
          rentalCount={day?.rentalCount ?? null}
          reviewCount={day?.reviewCount ?? null}
          ebikeCount={day?.ebikeCount ?? null}
          closerId={day?.closerId ?? null}
          notes={day?.notes ?? null}
          closed={day?.closed ?? false}
          employees={employees}
          readOnly={locked}
        />
      </Card>

      <Card title="Hours" description="Set an employee to 0 to remove their entry for this day.">
        <div className="grid gap-5 sm:grid-cols-2">
          {roster.map((employee) => (
            <div key={employee.id} className="rounded-lg border border-ink/10 p-3">
              <p className="mb-2 font-medium">{employee.name}</p>
              <HoursForm
                date={date}
                userId={employee.id}
                currentHours={
                  minutesByUser.has(employee.id) ? formatHours(minutesByUser.get(employee.id)!) : ""
                }
                readOnly={locked}
                readOnlyReason={locked ? "Period locked." : undefined}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card title="Cash tips" description="Paid entirely to the named employee.">
        {day && day.tips.length > 0 ? (
          <ul className="mb-4 divide-y divide-ink/10">
            {day.tips.map((tip) => (
              <li key={tip.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <strong>{tip.user.name}</strong> · <Money cents={tip.amountCents} /> ·{" "}
                  {tip.kind.toLowerCase()}
                  {tip.note ? <span className="text-ink/60"> — {tip.note}</span> : null}
                </span>
                {locked ? null : <DeleteTipButton tipId={tip.id} />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-ink/60">No cash tips on this day.</p>
        )}
        {locked || roster.length === 0 ? null : (
          <TipForm
            date={date}
            userId={roster[0].id}
            employees={roster}
            allowChoosingEmployee
          />
        )}
      </Card>
    </Shell>
  );
}
