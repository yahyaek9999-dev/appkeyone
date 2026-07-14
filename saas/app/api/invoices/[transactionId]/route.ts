/**
 * GET /api/invoices/[transactionId] — download the PDF invoice for one of
 * the requester's own completed PaymentTransaction rows. Owner-scoped
 * (billing permission); 404s on anything not owned by the caller or not yet
 * in a completed state — never leaks another tenant's transaction by id guess.
 */
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { getOrCreateInvoice, renderInvoicePdf } from "@/lib/invoices/generate";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { transactionId: string } },
) {
  const uid = await getUserIdForPermission("billing");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const result = await getOrCreateInvoice(params.transactionId, uid);
  if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const user = await prisma.user.findUnique({ where: { id: uid }, select: { name: true, email: true } });
  const pdf = await renderInvoicePdf(result.invoice, result.tx, {
    name: user?.name || null,
    email: user?.email || "",
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.invoice.number}.pdf"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
