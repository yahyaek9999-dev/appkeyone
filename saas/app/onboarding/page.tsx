import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AiBackground } from "@/components/ui/marketing";
import OnboardingWizard from "./wizard";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div dir="rtl" className="ai-page min-h-screen text-slate-100">
      <AiBackground />
      <div className="relative z-10 mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <OnboardingWizard userName={user.name || user.email} />
      </div>
    </div>
  );
}
