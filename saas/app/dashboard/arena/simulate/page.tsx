// Testing Arena 2.1 — multi-turn conversation simulator (server page).
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import SimulateUi from "./simulate-ui";

export const dynamic = "force-dynamic";

export default async function ArenaSimulatePage() {
  // Internal QA surface (Arena child route): ADMIN_WORKSPACE-only, no
  // paywall. A session alone must not reach it via direct URL.
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }
  return <SimulateUi />;
}
