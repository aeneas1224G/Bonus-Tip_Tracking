import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminLoginForm } from "@/components/AdminLoginForm";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const session = await getSession();
  if (session?.role === "ADMIN") redirect("/admin");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Owner sign-in</h1>
          <p className="text-sm text-ink/60">Vista Trail Bikes</p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <AdminLoginForm />
        </div>
        <p className="mt-6 text-center text-sm text-ink/50">
          <Link href="/" className="underline">
            Employee PIN entry
          </Link>
        </p>
      </div>
    </div>
  );
}
