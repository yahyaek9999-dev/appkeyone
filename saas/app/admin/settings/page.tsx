import { getSiteConfig } from "@/lib/admin";
import SettingsForm from "./settings-form";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const cfg = await getSiteConfig();
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold mb-2">إعدادات الموقع</h1>
        <p className="text-slate-400">معلومات البراند وقنوات التواصل التي تظهر للعملاء.</p>
      </div>
      <SettingsForm initial={{
        brandName: cfg.brandName,
        brandTagline: cfg.brandTagline,
        supportWhatsapp: cfg.supportWhatsapp,
        supportEmail: cfg.supportEmail,
        paymentNote: cfg.paymentNote,
      }} />
    </div>
  );
}
