/**
 * Invoice generation — lazily materializes an Invoice row + PDF from an
 * already-completed PaymentTransaction. Deliberately decoupled from the
 * payment webhook/reconcile pipeline (lib/payments/reconcile.ts, the
 * provider webhook routes): this module only ever READS a finalized
 * PaymentTransaction, never writes to it and is never called from the
 * completion path itself. Money-critical code stays untouched.
 */

import PDFDocument from "pdfkit";
import { prisma } from "@/lib/db";

const INVOICE_ELIGIBLE_STATUSES = ["paid", "reconciled"];

/** Get-or-create the Invoice for a completed PaymentTransaction. Idempotent:
 * a second call for the same transaction returns the same row (unique
 * constraint on paymentTransactionId), never creates a duplicate. */
export async function getOrCreateInvoice(transactionId: string, userId: string) {
  const tx = await (prisma as any).paymentTransaction.findUnique({ where: { id: transactionId } });
  if (!tx || tx.userId !== userId) return null;
  if (!INVOICE_ELIGIBLE_STATUSES.includes(tx.status)) return null;

  const existing = await (prisma as any).invoice.findUnique({ where: { paymentTransactionId: transactionId } });
  if (existing) return { invoice: existing, tx };

  // Sequential human-facing number: count existing invoices + 1. A race
  // between two concurrent first-time requests for two DIFFERENT
  // transactions could in theory assign the same number; the `number`
  // unique constraint makes the loser's create throw instead of silently
  // duplicating, and it can just retry the read on a P2002.
  const count = await (prisma as any).invoice.count();
  const number = `INV-${String(count + 1).padStart(6, "0")}`;

  try {
    const invoice = await (prisma as any).invoice.create({
      data: {
        userId,
        paymentTransactionId: transactionId,
        number,
        amountUsd: tx.amountUsd,
        currency: tx.currency,
        description:
          tx.topupRequestId ? "Wallet top-up" : `Payment via ${tx.provider}`,
      },
    });
    return { invoice, tx };
  } catch (e: any) {
    if (String(e?.code || "") === "P2002") {
      const retried = await (prisma as any).invoice.findUnique({ where: { paymentTransactionId: transactionId } });
      if (retried) return { invoice: retried, tx };
    }
    throw e;
  }
}

/** Render an Invoice as a PDF buffer. Pure function over already-fetched rows. */
export async function renderInvoicePdf(
  invoice: { number: string; amountUsd: number; currency: string; description: string; issuedAt: Date },
  tx: { provider: string; providerRef: string | null; createdAt: Date },
  billTo: { name: string | null; email: string },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // English-only content: pdfkit's built-in fonts (Helvetica/Times/Courier)
    // have no Arabic glyph coverage and no bidi/shaping support, so Arabic
    // text here would render as blank boxes. A working English invoice beats
    // a broken Arabic one — the surrounding dashboard UI stays Arabic as usual.
    doc.fontSize(20).text("KEYONE", { continued: false });
    doc.fontSize(10).fillColor("#666").text("Invoice").moveDown(1.5);

    doc.fillColor("#000").fontSize(12).text(`Invoice #: ${invoice.number}`);
    doc.text(`Date: ${invoice.issuedAt.toISOString().slice(0, 10)}`);
    doc.moveDown();

    doc.fontSize(11).text(`Bill to: ${billTo.name || billTo.email}`);
    doc.text(`Email: ${billTo.email}`);
    doc.moveDown();

    doc.fontSize(11).text(`Description: ${invoice.description}`);
    doc.text(`Payment method: ${tx.provider}`);
    if (tx.providerRef) doc.text(`Reference: ${tx.providerRef}`);
    doc.text(`Payment date: ${tx.createdAt.toISOString().slice(0, 10)}`);
    doc.moveDown();

    doc.fontSize(16).text(`Total: ${invoice.amountUsd.toFixed(2)} ${invoice.currency}`, { underline: true });

    doc.moveDown(2);
    doc.fontSize(9).fillColor("#999").text("This invoice was generated automatically by KEYONE.");

    doc.end();
  });
}
