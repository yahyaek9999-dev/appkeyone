import type { Metadata } from "next";
import "./globals.css";
import SmoothScroll from "@/components/smooth-scroll";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://k1wb.app.keyone1.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "KEYONE — منصة بوت واتساب احترافي للأعمال",
    template: "%s | KEYONE",
  },
  description:
    "حل احترافي لأتمتة المحادثات على واتساب: ردود فورية على عملاءك 24/7، إدارة طلبات تلقائية، تكامل مع متجرك، تقارير تفصيلية. مصمم للشركات الجادة.",
  keywords: [
    "بوت واتساب",
    "واتساب مصر",
    "أتمتة المبيعات",
    "خدمة عملاء آلية",
    "WhatsApp Business",
    "متجر إلكتروني",
    "ChatBot Arabic",
    "KEYONE",
  ],
  authors: [{ name: "KEYONE" }],
  openGraph: {
    type: "website",
    locale: "ar_EG",
    url: SITE_URL,
    siteName: "KEYONE",
    title: "KEYONE — منصة بوت واتساب احترافي للأعمال",
    description: "ردود فورية على عملاءك 24/7، طلبات تلقائية، وتقارير تفصيلية.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "KEYONE WhatsApp Bot Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "KEYONE — منصة بوت واتساب احترافي",
    description: "أتمتة الردود والمبيعات على واتساب لأعمالك.",
    images: ["/og-image.png"],
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  alternates: { canonical: SITE_URL },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#0b1220" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "KEYONE",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              description:
                "منصة بوت واتساب احترافي بالذكاء الاصطناعي للشركات والمتاجر.",
              offers: {
                "@type": "AggregateOffer",
                priceCurrency: "USD",
                lowPrice: "29",
                highPrice: "299",
              },
            }),
          }}
        />
      </head>
      <body><SmoothScroll>{children}</SmoothScroll></body>
    </html>
  );
}
