import { redirect } from "next/navigation";
import Link from "next/link";

import { PinPad } from "@/components/PinPad";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminExists } from "@/lib/setup";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // A freshly deployed instance has nobody in it; send the first visitor to setup
  // rather than to a name picker with no names on it.
  if (!(await adminExists())) redirect("/setup");

  const session = await getSession();
  if (session?.role === "ADMIN") redirect("/admin");
  if (session?.role === "EMPLOYEE") redirect("/entry");

  const employees = await db.user.findMany({
    where: { role: "EMPLOYEE", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, initials: true },
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Vista Trail Bikes</h1>
          <p className="text-sm text-ink/60">Bonus &amp; tip tracking</p>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <PinPad employees={employees} />
        </div>

        <p className="mt-6 text-center text-sm text-ink/50">
          <Link href="/admin/login" className="underline">
            Owner sign-in
          </Link>
        </p>
      </div>
    </div>
  );
}
