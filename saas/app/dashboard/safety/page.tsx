import { requireUser } from "@/lib/auth";
import SafetyDashboard from "./safety-ui";

export const dynamic = "force-dynamic";

export default async function SafetyPage() {
  await requireUser();
  return <SafetyDashboard />;
}
