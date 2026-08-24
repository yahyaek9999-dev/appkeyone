// Testing Arena 2.1 — TA-5 Hallucination Detection Engine (server page).
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import HallucinationsUi from "./hallucinations-ui";

export const dynamic = "force-dynamic";

export default async function HallucinationsPage() {
  // Internal QA surface (Arena child route): ADMIN_WORKSPACE-only, no
  // paywall. A session alone must not reach it via direct URL.
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }
  return <HallucinationsUi />;
}
