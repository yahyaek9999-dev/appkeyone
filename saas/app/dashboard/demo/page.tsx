import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import DemoUi from "./demo-ui";

export const dynamic = "force-dynamic";

// Internal surface: listed only in ADMIN_WORKSPACE and carries no upgrade
// paywall, so a session alone must not reach it. Require platform admin.
export default async function DemoPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }
  return <DemoUi />;
}
