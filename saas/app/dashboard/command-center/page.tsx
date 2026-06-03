import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import CommandCenterUi from "./command-center-ui";

export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <CommandCenterUi />;
}
