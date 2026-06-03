import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import BusinessUi from "./business-ui";

export const dynamic = "force-dynamic";

export default async function BusinessPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <BusinessUi />;
}
