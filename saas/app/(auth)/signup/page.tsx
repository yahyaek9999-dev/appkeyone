import { getAuthContext } from "@/lib/auth";
import { redirect } from "next/navigation";
import SignupUi from "./signup-ui";

export default async function SignupPage() {
  const ctx = await getAuthContext();
  if (ctx) redirect("/dashboard");
  return <SignupUi />;
}
