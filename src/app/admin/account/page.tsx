import { redirect } from "next/navigation";

import { PasswordForm, UsernameForm } from "@/components/AccountForm";
import { Banner, Card, LinkButton, Shell } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  if (session.role !== "ADMIN") redirect("/entry");

  const admin = await db.user.findUnique({
    where: { id: session.id },
    select: { username: true },
  });

  return (
    <Shell
      title="Your account"
      subtitle="How you sign in as the owner"
      action={<LinkButton href="/admin">Back to period</LinkButton>}
    >
      <Card
        title="Sign-in name"
        description="Only you use this. Employees sign in by tapping their name and entering a PIN."
      >
        <p className="mb-4 text-sm text-ink/60">
          Currently{" "}
          <span className="tabular rounded border border-ink/15 bg-sand px-1.5 py-0.5 font-medium">
            {admin?.username ?? "—"}
          </span>
        </p>
        <UsernameForm current={admin?.username ?? ""} />
      </Card>

      <Card
        title="Password"
        description="Changing it signs nothing out — you stay signed in here."
      >
        <PasswordForm />
      </Card>

      <Banner tone="warn">
        <p className="mb-1 font-medium">There is no reset link, on purpose</p>
        <p>
          A reset link on a payroll app is a way in for anyone who reaches your email.
          The cost is that a lost password means editing the database by hand, so keep
          this one in a password manager.
        </p>
      </Banner>
    </Shell>
  );
}
