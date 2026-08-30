import { NextRequest } from "next/server";
import { readArchivedInvoice } from "../../../../lib/invoices";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^[a-f0-9]{16}$/i.test(id)) return new Response("Not found", { status: 404 });
  const result = await readArchivedInvoice(id);
  if (!result) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(result.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Tesla_${result.record.id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
