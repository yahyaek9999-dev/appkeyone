// Testing Arena 2.1 — TA-2 Auto Fix Engine (server page).
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import FixesUi from "./fixes-ui";

export const dynamic = "force-dynamic";

export default async function ArenaFixesPage() {
  // Internal QA surface (Arena child route): ADMIN_WORKSPACE-only, no
  // paywall. A session alone must not reach it via direct URL.
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }
  return <FixesUi />;
}
