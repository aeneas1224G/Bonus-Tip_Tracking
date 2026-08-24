import Link from "next/link";
import type { ReactNode } from "react";

import { formatCents, formatHours } from "@/lib/money";

export function Shell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-ink/10 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            {subtitle ? <p className="text-sm text-ink/60">{subtitle}</p> : null}
          </div>
          {action}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

export function Card({
  title,
  description,
  children,
  footer,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="mb-5 overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
      {title ? (
        <div className="border-b border-ink/10 px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-ink/60">{description}</p> : null}
        </div>
      ) : null}
      <div className="px-4 py-4">{children}</div>
      {footer ? <div className="border-t border-ink/10 bg-sand/60 px-4 py-3">{footer}</div> : null}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className={emphasis ? "rounded-lg bg-trail/10 px-3 py-2" : "px-3 py-2"}>
      <dt className="text-xs uppercase tracking-wide text-ink/50">{label}</dt>
      <dd className={`tabular ${emphasis ? "text-xl font-semibold text-trail" : "text-lg font-medium"}`}>
        {value}
      </dd>
      {hint ? <p className="mt-0.5 text-xs text-ink/50">{hint}</p> : null}
    </div>
  );
}

export function Money({ cents, bold }: { cents: number; bold?: boolean }) {
  return <span className={`tabular ${bold ? "font-semibold" : ""}`}>{formatCents(cents)}</span>;
}

export function Hours({ minutes }: { minutes: number }) {
  return <span className="tabular">{formatHours(minutes)}</span>;
}

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-clay text-white hover:bg-clay/90",
    ghost: "border border-ink/20 bg-white hover:bg-sand",
    danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
  }[variant];
  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${styles} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-ink/20 bg-white px-4 py-2 text-sm font-medium transition hover:bg-sand"
    >
      {children}
    </Link>
  );
}

export function Banner({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "error" | "success";
  children: ReactNode;
}) {
  const styles = {
    info: "border-ink/15 bg-white text-ink/80",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    error: "border-red-300 bg-red-50 text-red-800",
    success: "border-emerald-300 bg-emerald-50 text-emerald-900",
  }[tone];
  return <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink/50">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-base tabular outline-none focus:border-clay focus:ring-2 focus:ring-clay/20";
