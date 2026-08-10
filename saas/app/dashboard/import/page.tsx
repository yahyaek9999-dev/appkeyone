/**
 * One-Time QR Import — owner dashboard (Phase 3).
 *
 * Lets a tenant import their EXISTING WhatsApp contacts + recent chat history
 * ONCE into permanent CRM records + AI memory. It runs inside a booked QR slot,
 * shows live progress, then CLOSES FOREVER (one-time). All interactivity +
 * polling lives in the client; this server shell only gates access.
 *
 * Owner-only: gated by the "customers" permission.
 */
import { redirect } from "next/navigation";
import { getUserForPermission } from "@/lib/auth";
import ImportClient from "./import-client";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const user = await getUserForPermission("customers");
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">استيراد العملاء</h1>
        <p className="page-desc">
          استورد جهات اتصالك ومحادثاتك السابقة على واتساب مرة واحدة إلى سجلات عملاء دائمة وذاكرة المساعد.
          هذه عملية <b className="text-white">لمرة واحدة فقط</b> — بعد اكتمالها تُغلق نهائيًا.
        </p>
      </div>
      <ImportClient />
    </div>
  );
}
