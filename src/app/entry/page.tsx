import Link from "next/link";
import { redirect } from "next/navigation";

import { logout } from "@/app/actions/auth";
import { DayNumbersForm, DeleteTipButton, HoursForm, TipForm } from "@/components/EntryForms";
import { Banner, Button, Card, LinkButton, Money, Shell, Stat } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, formatHours, minutesToHours } from "@/lib/money";
import { parseISODate, periodForDate, periodLabel, shortDateLabel, todayISO, weekdayLabel } from "@/lib/payPeriod";
import { ensureDay, loadPeriod } from "@/lib/periods";

export const dynamic = "force-dynamic";

export default async function EntryPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role === "ADMIN") redirect("/admin");

  const today = todayISO();
  await ensureDay(today);

  const [day, employees] = await Promise.all([
    db.dayRecord.findUnique({
      where: { date: parseISODate(today) },
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

  const bounds = periodForDate(today);
  const { result } = await loadPeriod(bounds);

  const myEntry = day?.entries.find((entry) => entry.userId === session.id);
  const myTips = day?.tips.filter((tip) => tip.userId === session.id) ?? [];
  const myPayout = result.employees.find((employee) => employee.userId === session.id);
  const locked = day?.payPeriod.status === "LOCKED";

  return (
    <Shell
      title={`Hi, ${session.name}`}
      subtitle={`${weekdayLabel(today)} ${shortDateLabel(today)} · Pay period ${periodLabel(bounds)}`}
      action={
        <div className="flex gap-2">
          <LinkButton href="/period">Period sheet</LinkButton>
          <form action={logout}>
            <Button variant="ghost" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      }
    >
      {locked ? (
        <Banner tone="warn">
          This pay period is locked and has gone to payroll. Nothing can be changed until the owner
          unlocks it.
        </Banner>
      ) : null}

      <Card title="Your hours today">
        <HoursForm
          date={today}
          userId={session.id}
          currentHours={myEntry ? formatHours(myEntry.minutes) : ""}
          readOnly={locked}
          readOnlyReason={locked ? "Pay period locked." : undefined}
        />
      </Card>

      <Card
        title="Today's shop numbers"
        description="Shared by everyone. Whoever gets here first fills them in; anyone can correct them until the day closes."
      >
        <DayNumbersForm
          date={today}
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

      <Card
        title="Your cash tips today"
        description="Water sales, rescues — these are paid entirely to you and never split with anyone."
      >
        {myTips.length > 0 ? (
          <ul className="mb-4 divide-y divide-ink/10">
            {myTips.map((tip) => (
              <li key={tip.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <Money cents={tip.amountCents} bold /> · {tip.kind.toLowerCase()}
                  {tip.note ? <span className="text-ink/60"> — {tip.note}</span> : null}
                </span>
                {locked ? null : <DeleteTipButton tipId={tip.id} />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-ink/60">No cash tips logged today.</p>
        )}
        {locked ? null : <TipForm date={today} userId={session.id} employees={employees} />}
      </Card>

      <Card
        title="Your pay period so far"
        description={
          locked
            ? "Final — this is what went to payroll."
            : "An estimate. It moves as more hours and rentals are entered, and settles when the period is locked."
        }
      >
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Hours logged"
            value={myPayout ? minutesToHours(myPayout.minutes).toFixed(2) : "0.00"}
          />
          <Stat label="Tip share" value={formatCents(myPayout?.tipShareCents ?? 0)} />
          <Stat label="Review bonus" value={formatCents(myPayout?.reviewShareCents ?? 0)} />
          <Stat
            label={locked ? "Final payout" : "Estimated payout"}
            value={formatCents(myPayout?.totalCents ?? 0)}
            emphasis
          />
        </dl>
        <p className="mt-4 text-sm text-ink/60">
          Pool so far <Money cents={result.tipPoolCents} /> across{" "}
          {minutesToHours(result.totalMinutes).toFixed(2)} hours ={" "}
          <Money cents={result.tipRatePerHourCents} />/hr.{" "}
          <Link href="/period" className="underline">
            See the full sheet
          </Link>
          .
        </p>
      </Card>
    </Shell>
  );
}
