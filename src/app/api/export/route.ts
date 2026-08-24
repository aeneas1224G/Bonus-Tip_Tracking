import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { csvFilename, payrollCsv } from "@/lib/csv";
import { periodByIndex, periodForDate, todayISO } from "@/lib/payPeriod";
import { loadPeriod } from "@/lib/periods";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  }

  const url = new URL(request.url);
  const raw = url.searchParams.get("p");
  const current = periodForDate(todayISO());
  const index = raw !== null && Number.isInteger(Number(raw)) ? Number(raw) : current.index;
  const bounds = periodByIndex(index);

  const { period, result, employeeNames } = await loadPeriod(bounds);

  const csv = payrollCsv({
    startDate: period.startDate,
    endDate: period.endDate,
    result,
    employeeNames,
    generatedAt: new Date(),
    status: period.status,
  });

  await recordAudit({
    actorId: admin.id,
    action: "EXPORT_CSV",
    entity: "PayPeriod",
    entityId: period.id,
    after: { startDate: period.startDate, status: period.status },
  });

  return new NextResponse(csv, {
    headers: {
      // BOM so Excel opens the file as UTF-8 without mangling anything.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(period.startDate, period.endDate)}"`,
      "Cache-Control": "no-store",
    },
  });
}
