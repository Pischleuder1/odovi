import { NextRequest, NextResponse } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { buildMonthReport } from "@odovi/core";

import { validateSession } from "../../../../../lib/auth/session";
import { loadMonthReportData } from "../../../../../lib/exports/data";
import {
  renderDutyMonthCsv,
  renderDutyMonthPdf,
  type DutyExportLabels,
} from "../../../../../lib/exports/duty";
import { isValidMonthParam } from "../../../../../lib/exports/params";

export const dynamic = "force-dynamic";

async function labels(): Promise<DutyExportLabels> {
  const [t, locale] = await Promise.all([
    getTranslations("reports"),
    getLocale(),
  ]);

  return {
    locale,
    title: t("duty.title"),
    subtitle: t("duty.month"),
    driveCount: t("duty.driveCount"),
    distance: t("duty.distance"),
    rate: t("duty.rate"),
    reimbursement: t("duty.reimbursement"),
    date: t("table.date"),
    time: t("table.time"),
    route: t("table.route"),
    customerPurpose: t("table.customerPurpose"),
    km: t("table.km"),
    amount: t("table.reimbursement"),
    incomplete: t("duty.incomplete"),
    generated: t("duty.generated"),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ month: string }> },
) {
  const t = await getTranslations("exports");

  const user = await validateSession();
  if (!user) {
    return NextResponse.json({ error: t("errors.notAuthenticated") }, { status: 401 });
  }

  const { month } = await params;
  if (!isValidMonthParam(month)) {
    return NextResponse.json({ error: t("errors.invalidMonth") }, { status: 400 });
  }

  const format = request.nextUrl.searchParams.get("format");
  if (format !== "csv" && format !== "pdf") {
    return NextResponse.json({ error: t("errors.invalidFormat") }, { status: 400 });
  }

  const data = await loadMonthReportData(month, ["business"]);
  const report = buildMonthReport(data.drives, month, data.meta, ["business"]);
  const dutyLabels = await labels();
  const filename = `odovi-dienstfahrten-${month}.${format}`;

  if (format === "csv") {
    const csv = renderDutyMonthCsv(report, data.drives, dutyLabels);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const pdf = await renderDutyMonthPdf(report, data.drives, dutyLabels);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
