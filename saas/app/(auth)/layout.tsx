import PublicNav from "@/components/ui/public-nav";
import { getSiteConfig } from "@/lib/admin";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cfg = await getSiteConfig();

  return (
    <main className="ai-page flex min-h-screen items-center justify-center px-4 py-28 sm:py-32">
      <div className="pointer-events-none fixed inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,rgba(104,114,212,0.05),transparent_58%)]" />
      </div>
      <PublicNav
        brandName={cfg.brandName || "KEYONE"}
        supportWhatsapp={cfg.supportWhatsapp}
        current="auth"
      />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </main>
  );
}
