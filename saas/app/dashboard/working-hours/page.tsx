import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import WorkingHoursUi from "./working-hours-ui";

export const dynamic = "force-dynamic";

export default async function WorkingHoursPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <WorkingHoursUi />;
}
