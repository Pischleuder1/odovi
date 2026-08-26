import { NextResponse } from "next/server";
import { getReadinessReport } from "../../../lib/readiness";

export const dynamic = "force-dynamic";

/** Product readiness: required local services plus non-blocking operational status. */
export async function GET() {
  const report = await getReadinessReport();
  return NextResponse.json(report, {
    status: report.status === "not_ready" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
