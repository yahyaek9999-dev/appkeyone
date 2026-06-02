import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import ProductsUi from "./products-ui";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  return <ProductsUi />;
}
