// OLD QR connect page — REMOVED per owner request (superseded by the QR-queue
// flow; official selling now runs on Meta Cloud API). Kept as a redirect so the
// URL never shows the old unofficial QR-linking UI again.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function WhatsappPageRemoved() {
  redirect("/dashboard/qr-queue");
}
