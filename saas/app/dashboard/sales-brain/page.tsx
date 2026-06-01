import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import SalesBrainUi from "./sales-brain-ui";

export const dynamic = "force-dynamic";

export default async function SalesBrainPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <SalesBrainUi />;
}
