// Testing Arena 2.0 — scenario QA + competitor benchmark (server page).
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import ArenaUi from "./arena-ui";

export const dynamic = "force-dynamic";

// Internal QA surface: listed only in ADMIN_WORKSPACE, never in the customer
// nav. A session alone is not enough — require platform admin so direct-URL
// access can't reach the competitor benchmark tooling.
export default async function ArenaProPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }
  return <ArenaUi />;
}
