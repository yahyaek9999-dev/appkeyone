/**
 * Admin — API keys oversight.
 *
 * Lists every tenant's API keys, surfaces abuse-detection flags, and lets an
 * admin revoke any key. Admin-gated by the /admin layout (which redirects
 * non-admins). All data is served by /api/admin/api-keys (also requireAdmin).
 */
import { KeyRound } from "lucide-react";
import AdminApiKeysClient from "./admin-api-keys-client";

export const dynamic = "force-dynamic";

export default function AdminApiKeysPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1 flex items-center gap-2">
            <KeyRound className="h-6 w-6 text-brand-300" /> مفاتيح API
          </h1>
          <p className="page-desc">
            كل مفاتيح API عبر التجّار، مع كشف إساءة الاستخدام وإمكانية إلغاء أي مفتاح فورًا.
          </p>
        </div>
      </div>

      <AdminApiKeysClient />
    </div>
  );
}
