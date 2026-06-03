import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import BusinessIntelligenceUi from "./business-intelligence-ui";

export const dynamic = "force-dynamic";

export default async function BusinessIntelligencePage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <BusinessIntelligenceUi />;
}
