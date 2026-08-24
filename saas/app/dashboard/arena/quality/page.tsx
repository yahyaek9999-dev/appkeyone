// Testing Arena 2.1 — TA-4 Conversation Quality Benchmark (server page).
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import QualityUi from "./quality-ui";

export const dynamic = "force-dynamic";

export default async function QualityPage() {
  // Internal QA surface (Arena child route): ADMIN_WORKSPACE-only, no
  // paywall. A session alone must not reach it via direct URL.
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }
  return <QualityUi />;
}
