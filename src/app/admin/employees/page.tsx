import { redirect } from "next/navigation";

import { AddEmployeeForm, ResetPinForm, ToggleActiveButton, UnlockButton } from "@/components/EmployeeAdmin";
import { Banner, Card, LinkButton, Shell } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  if (session.role !== "ADMIN") redirect("/entry");

  const employees = await db.user.findMany({
    where: { role: "EMPLOYEE" },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      initials: true,
      active: true,
      lockedUntil: true,
      _count: { select: { shiftEntries: true } },
    },
  });

  const now = new Date();

  return (
    <Shell
      title="Employees"
      subtitle="Who can sign in, and their PINs"
      action={<LinkButton href="/admin">Back to period</LinkButton>}
    >
      <Banner tone="info">
        PINs are stored hashed — they cannot be read back, only replaced. Five wrong attempts locks
        an account for 15 minutes; you can unlock it here straight away.
      </Banner>

      <Card title="Add someone">
        <AddEmployeeForm />
      </Card>

      <Card title="Roster">
        <ul className="divide-y divide-ink/10">
          {employees.map((employee) => {
            const locked = employee.lockedUntil && employee.lockedUntil > now;
            return (
              <li key={employee.id} className="py-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {employee.name}
                      {employee.initials ? (
                        <span className="ml-2 text-sm text-ink/50">{employee.initials}</span>
                      ) : null}
                      {!employee.active ? (
                        <span className="ml-2 rounded bg-ink/10 px-2 py-0.5 text-xs">inactive</span>
                      ) : null}
                      {locked ? (
                        <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                          locked out
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-ink/50">
                      {employee._count.shiftEntries} shift
                      {employee._count.shiftEntries === 1 ? "" : "s"} logged
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {locked ? <UnlockButton userId={employee.id} /> : null}
                    <ToggleActiveButton
                      userId={employee.id}
                      active={employee.active}
                      name={employee.name}
                    />
                  </div>
                </div>
                {employee.active ? <ResetPinForm userId={employee.id} name={employee.name} /> : null}
              </li>
            );
          })}
          {employees.length === 0 ? (
            <li className="py-6 text-center text-ink/50">Nobody on the roster yet.</li>
          ) : null}
        </ul>
      </Card>
    </Shell>
  );
}
