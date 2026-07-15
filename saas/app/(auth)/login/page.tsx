import { getAuthContext } from "@/lib/auth";
import { redirect } from "next/navigation";
import LoginUi from "./login-ui";

export default async function LoginPage() {
  const ctx = await getAuthContext();
  if (ctx) {
    const role = (ctx.user as any).role;
    redirect(role === "admin" ? "/admin" : role === "finance" ? "/finance/payments" : "/dashboard");
  }
  return <LoginUi />;
}
