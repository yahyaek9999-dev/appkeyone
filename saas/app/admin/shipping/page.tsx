import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import ShippingProviders from "./shipping-providers";

export const dynamic = "force-dynamic";

export default async function AdminShippingPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">شركات الشحن</h1>
        <p className="text-slate-400">
          أضف مزوّدي الشحن، فعّلهم، أدخل مفاتيح الـ API، واختبر الاتصال. المزوّد "اليدوي" يعمل بدون
          حساب خارجي.
        </p>
      </div>
      <ShippingProviders />
    </div>
  );
}
