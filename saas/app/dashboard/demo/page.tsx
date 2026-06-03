import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import DemoUi from "./demo-ui";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <DemoUi />;
}
