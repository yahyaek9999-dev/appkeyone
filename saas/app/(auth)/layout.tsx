import PublicNav from "@/components/ui/public-nav";
import { AiBackground } from "@/components/ui/marketing";
import { getSiteConfig } from "@/lib/admin";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cfg = await getSiteConfig();

  return (
    <main className="ai-page flex min-h-screen items-center justify-center px-4 py-28 sm:py-32">
      <AiBackground />
      <PublicNav
        brandName={cfg.brandName || "KEYONE"}
        supportWhatsapp={cfg.supportWhatsapp}
        current="auth"
      />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </main>
  );
}
