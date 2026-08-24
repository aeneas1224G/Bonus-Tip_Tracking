import "server-only";

import { headers } from "next/headers";

import { db } from "./db";

export type AuditAction =
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "SHIFT_CREATE"
  | "SHIFT_UPDATE"
  | "SHIFT_DELETE"
  | "DAY_UPDATE"
  | "TIP_CREATE"
  | "TIP_UPDATE"
  | "TIP_DELETE"
  | "EMPLOYEE_CREATE"
  | "EMPLOYEE_UPDATE"
  | "EMPLOYEE_DEACTIVATE"
  | "PIN_RESET"
  | "RATES_UPDATE"
  | "PERIOD_LOCK"
  | "PERIOD_UNLOCK"
  | "EXPORT_CSV";

/**
 * Every write that can move a dollar goes through here. The log is
 * append-only — nothing in the app deletes or edits an AuditLog row.
 */
export async function recordAudit(input: {
  actorId?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  let ip: string | null = null;
  try {
    const headerList = await headers();
    ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    // Called outside a request context (seed script) — no IP to record.
  }

  await db.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      before: (input.before ?? undefined) as never,
      after: (input.after ?? undefined) as never,
      ip,
    },
  });
}
