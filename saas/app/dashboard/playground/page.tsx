import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import Playground from "./playground-ui";

export const dynamic = "force-dynamic";

// Internal QA surface: listed only in ADMIN_WORKSPACE, never in the customer
// nav. The dashboard layout establishes a session but not platform-admin, so
// guard here — otherwise direct-URL access reaches it with any login.
export default async function PlaygroundPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }
  return (
    <div>
      <h1 className="page-title mb-1">تجربة المحادثة</h1>
      <p className="page-desc mb-6">
        محاكاة محادثة عميل. اختر رقماً تجريبياً وجرّب الردود التلقائية كأنك العميل.
      </p>
      <Playground />
    </div>
  );
}
