import { chargeSessions } from "@odovi/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { deleteArchivedInvoices, type TeslaInvoiceRecord } from "../../../../lib/invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DELETE = 100;

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { ids?: unknown };
    if (!Array.isArray(body.ids)) {
      return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
    }

    const ids = [...new Set(body.ids)]
      .filter((id): id is string => typeof id === "string" && /^[a-f0-9]{16}$/i.test(id))
      .slice(0, MAX_DELETE);

    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "no_ids" }, { status: 400 });
    }

    const result = await deleteArchivedInvoices(ids);
    if (result.deleted.length === 0) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const affectedSessionIds = [...new Set(
      result.deleted
        .filter((invoice) => invoice.match.confidence === "matched")
        .map((invoice) => invoice.match.chargeSessionId)
        .filter((id): id is number => id != null),
    )];

    const reconciliationErrors: number[] = [];
    for (const sessionId of affectedSessionIds) {
      try {
        await reconcileInvoiceCost(sessionId, result.remaining);
      } catch (error) {
        reconciliationErrors.push(sessionId);
        console.error(`[invoice-delete] failed to reconcile charge session ${sessionId}`, error);
      }
    }

    return NextResponse.json({
      ok: true,
      deleted: result.deleted.map((invoice) => invoice.id),
      missingFiles: result.missingFiles,
      reconciliationErrors,
    });
  } catch (error) {
    console.error("[invoice-delete] delete failed", error);
    return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  }
}

async function reconcileInvoiceCost(sessionId: number, remaining: TeslaInvoiceRecord[]): Promise<void> {
  const replacement = remaining.find(
    (invoice) =>
      invoice.match.confidence === "matched" &&
      invoice.match.chargeSessionId === sessionId &&
      invoice.amount != null,
  );

  await db
    .update(chargeSessions)
    .set(
      replacement
        ? {
            cost: replacement.amount!.toFixed(2),
            currency: replacement.currency ?? "EUR",
            costSource: "invoice",
            updatedAt: new Date(),
          }
        : {
            cost: null,
            currency: null,
            costSource: null,
            updatedAt: new Date(),
          },
    )
    .where(and(eq(chargeSessions.id, sessionId), eq(chargeSessions.costSource, "invoice")));
}
