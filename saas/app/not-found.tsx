import Link from "next/link";
import { getSiteConfig } from "@/lib/admin";
import PublicNav from "@/components/ui/public-nav";

export const metadata = {
  title: "الصفحة غير موجودة",
};

export const dynamic = "force-dynamic";

export default async function NotFound() {
  const cfg = await getSiteConfig();

  return (
    <main className="ai-page">
      <PublicNav brandName={cfg.brandName} supportWhatsapp={cfg.supportWhatsapp} />

      <section className="flex min-h-[70vh] flex-col items-center justify-center px-4 pt-32 text-center sm:pt-36">
        <p className="text-sm font-semibold tracking-widest text-brand-300">404</p>
        <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
          الصفحة اللي بتدور عليها مش موجودة
        </h1>
        <p className="mt-4 max-w-md text-balance text-slate-400">
          يمكن الرابط اتغير أو الصفحة اتشالت. ارجع للصفحة الرئيسية أو تواصل معانا لو محتاج مساعدة.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-elevated transition hover:bg-brand-400"
          >
            الرجوع للرئيسية
          </Link>
          {cfg.supportWhatsapp ? (
            <a
              href={`https://wa.me/${cfg.supportWhatsapp.replace(/[^\d]/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
            >
              تواصل مع الدعم
            </a>
          ) : null}
        </div>
      </section>
    </main>
  );
}
