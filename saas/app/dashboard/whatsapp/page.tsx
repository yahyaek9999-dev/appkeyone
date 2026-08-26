// OLD QR connect page — REMOVED per owner request (superseded by the QR-queue
// flow; official selling now runs on Meta Cloud API). Kept as a redirect so the
// URL never shows the old unofficial QR-linking UI again.
//
// The redirect used to point at /dashboard/qr-queue, which calls requireAdmin()
// and bounces every customer back to /dashboard. Seven customer-facing entry
// points still link here — the dashboard health banner, activation step 1, the
// getting-started card, the product tour and the help drawer — so the single
// most prominent CTA in the product ("اربط واتساب") was a dead end that returned
// the customer to the page they started on. It now lands on the destination
// that IS the customer's WhatsApp connection product: KEYONE Bridge. That page
// is pageGate("whatsapp_bridge") + <LockedFeature>, so a tier that hasn't bought
// it sees the upgrade path instead of a silent bounce.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function WhatsappPageRemoved() {
  redirect("/dashboard/settings/bridge");
}
