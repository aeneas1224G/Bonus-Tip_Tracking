import Link from "next/link";
import { redirect } from "next/navigation";

import { SetupForm } from "@/components/SetupForm";
import { Banner } from "@/components/ui";
import { adminExists, setupTokenConfigured } from "@/lib/setup";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  // Once there is an owner this page is finished forever. There is no reset
  // path through it — a forgotten password is a database job, deliberately.
  if (await adminExists()) redirect("/admin/login");

  const tokenReady = setupTokenConfigured();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Set up Vista Trail Bikes</h1>
          <p className="text-sm text-ink/60">
            One time only — create the owner account for this app.
          </p>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          {tokenReady ? (
            <SetupForm />
          ) : (
            <Banner tone="warn">
              <p className="mb-2 font-medium">SETUP_TOKEN is not set.</p>
              <p>
                Add an environment variable called <code>SETUP_TOKEN</code> in your hosting
                dashboard — any random string of 8 characters or more — then redeploy and
                reload this page. It stops anyone else claiming this app before you do.
              </p>
            </Banner>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-ink/50">
          Already set up?{" "}
          <Link href="/admin/login" className="underline">
            Owner sign-in
          </Link>
        </p>
      </div>
    </div>
  );
}
