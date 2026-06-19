import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const plans = [
  {
    slug: "starter",
    name: "البداية",
    nameEn: "Starter",
    priceUsd: 29,
    yearlyUsd: 290,
    monthlyMsgs: 2000,
    description: "للأعمال الصغيرة والمشاريع الناشئة",
    features: JSON.stringify([
      "2,000 رسالة شهرياً",
      "ربط رقم واتساب واحد",
      "ذاكرة محادثة لكل عميل",
      "إشعارات الطلبات تلقائياً",
      "قاعدة معرفة (5 مستندات)",
      "دعم فني عبر البريد",
    ]),
    sortOrder: 1,
  },
  {
    slug: "pro",
    name: "احترافي",
    nameEn: "Pro",
    priceUsd: 79,
    yearlyUsd: 790,
    monthlyMsgs: 10000,
    description: "للأعمال المتوسطة وأصحاب المتاجر الإلكترونية",
    features: JSON.stringify([
      "10,000 رسالة شهرياً",
      "كل ميزات الباقة السابقة",
      "ربط رقمين واتساب",
      "قاعدة معرفة غير محدودة",
      "فهم الصور والمستندات",
      "تحليلات متقدمة",
      "دعم فني واتساب",
    ]),
    popular: true,
    highlight: "الأكثر طلباً",
    sortOrder: 2,
  },
  {
    slug: "business",
    name: "الأعمال",
    nameEn: "Business",
    priceUsd: 149,
    yearlyUsd: 1490,
    monthlyMsgs: 30000,
    description: "للشركات والعلامات التجارية الكبرى",
    features: JSON.stringify([
      "30,000 رسالة شهرياً",
      "كل ميزات الاحترافي",
      "ربط 3 أرقام واتساب",
      "تخصيص شخصية البوت بالكامل",
      "تحليلات وتقارير PDF",
      "API للمطورين",
      "أولوية في الدعم الفني",
    ]),
    sortOrder: 3,
  },
  {
    slug: "enterprise",
    name: "المؤسسات",
    nameEn: "Enterprise",
    priceUsd: 299,
    yearlyUsd: 2990,
    monthlyMsgs: 100000,
    description: "حلول مخصصة بدون حدود",
    features: JSON.stringify([
      "100,000+ رسالة شهرياً",
      "كل ميزات الأعمال",
      "أرقام واتساب غير محدودة",
      "نموذج AI مخصص لنشاطك",
      "تكاملات مخصصة (ERP/CRM)",
      "SLA 99.9% + خادم مخصص",
      "مدير حساب شخصي",
      "تدريب الفريق",
    ]),
    sortOrder: 4,
  },
  // ---- Issue #12: refreshed membership tiers (Pro / Max / Companies) ----
  // Additional tiers requested by the merchant brief. We keep the original
  // four plans for any existing subscriptions; new sign-ups can pick from
  // the refreshed names. All tier gating is data-driven via monthlyMsgs +
  // features JSON — no app code needs to change.
  {
    slug: "max",
    name: "ماكس",
    nameEn: "Max",
    priceUsd: 199,
    yearlyUsd: 1990,
    monthlyMsgs: 50000,
    description: "للمتاجر والعلامات التي تحتاج طاقة أكبر وتحكماً كاملاً",
    features: JSON.stringify([
      "50,000 رسالة شهرياً",
      "ربط 4 أرقام واتساب",
      "معالجة متقدمة للصور والمستندات والأوامر",
      "أتمتة المتابعات والتقارير اليومية",
      "تحليلات مبيعات متعمقة",
      "أولوية معالجة الرسائل",
      "دعم فني سريع",
    ]),
    sortOrder: 5,
  },
  {
    slug: "companies",
    name: "للشركات",
    nameEn: "Companies",
    priceUsd: 499,
    yearlyUsd: 4990,
    monthlyMsgs: 200000,
    description: "حل متكامل للشركات الكبرى مع تخصيص كامل ومدير حساب",
    features: JSON.stringify([
      "200,000 رسالة شهرياً",
      "أرقام واتساب غير محدودة",
      "تخصيص شامل لشخصية البوت لكل قسم",
      "تكاملات API + Webhooks مخصصة",
      "SLA 99.95% مع تنبيهات فورية",
      "مدير حساب مخصص + جلسات تدريب",
      "تقارير تنفيذية أسبوعية",
      "حوكمة وامتثال لسياسات الشركة",
    ]),
    sortOrder: 6,
  },
];

async function main() {
  // ---- Plans ----
  // These are LEGACY plan slugs from a previous version. The current KEYONE model
  // is the canonical k_* catalog (seeded by prisma/seed-plans.ts). We keep these
  // rows for back-compat but seed them ARCHIVED so they never appear in any
  // customer/admin business flow.
  for (const p of plans) {
    const data = { ...p, status: "archived" };
    await prisma.plan.upsert({
      where: { slug: p.slug },
      update: data,
      create: data,
    });
  }
  console.log("✓ Seeded legacy plans (archived):", plans.map((p) => p.slug).join(", "));

  // ---- Site config singleton ----
  await prisma.siteConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      brandName: "KEYONE",
      brandTagline: "أتمتة واتساب — ردود فورية، مبيعات أعلى، عملاء أسعد",
      supportWhatsapp: process.env.SUPPORT_WHATSAPP || "+201000000000",
      supportEmail: process.env.SUPPORT_EMAIL || "support@keyone1.com",
    },
  });
  console.log("✓ Site config ready");

  // ---- Admin user ----
  const adminEmail = process.env.ADMIN_EMAIL || "admin@keyone1.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMe!2026";
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Admin",
        phone: process.env.SUPPORT_WHATSAPP || "+201000000000",
        passwordHash: await bcrypt.hash(adminPassword, 10),
        role: "admin",
        approvalStatus: "approved",
        bot: { create: { notifyPhone: process.env.SUPPORT_WHATSAPP || "+201000000000" } },
      },
    });
    console.log(`✓ Admin user created: ${admin.email} / ${adminPassword}`);
  } else if (existingAdmin.role !== "admin") {
    await prisma.user.update({ where: { id: existingAdmin.id }, data: { role: "admin" } });
    console.log(`✓ Promoted ${adminEmail} to admin`);
  } else {
    console.log(`✓ Admin already exists: ${adminEmail}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
