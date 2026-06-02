import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import CouponsUi from "./coupons-ui";

export const dynamic = "force-dynamic";

export default async function CouponsPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <CouponsUi />;
}
