import { prisma } from "@/lib/db";
import { COMMERCE_EVENTS, type CommercePlatform } from "./types";
import { createApiKey, createWebhookSecret, maskApiKey } from "./security";

const DEFAULT_WHATSAPP_TEMPLATE =
  "أهلاً {customerName}، تم استلام طلبك {orderName}. الإجمالي {total} {currency}. شكراً لاختيارك {shop}.";
const DEFAULT_EMAIL_SUBJECT = "تحديث طلبك {orderName}";
const DEFAULT_EMAIL_TEMPLATE =
  '<div dir="rtl"><h2>مرحباً {customerName}</h2><p>تم تحديث طلبك {orderName}.</p><p>الإجمالي: {total} {currency}</p></div>';

export async function createCommerceIntegration(args: {
  userId: string;
  name: string;
  platform: CommercePlatform | string;
}) {
  const apiKey = createApiKey();
  const webhookSecret = createWebhookSecret();

  const integration = await (prisma as any).commerceIntegration.create({
    data: {
      userId: args.userId,
      name: args.name.trim().slice(0, 80) || "Website integration",
      platform: args.platform || "custom",
      apiKeyHash: apiKey.hash,
      apiKeyPrefix: apiKey.prefix,
      webhookSecretEnc: webhookSecret.encrypted,
    },
  });

  await seedDefaultAutomations(args.userId, integration.id);

  return {
    integration,
    credentials: {
      apiKey: apiKey.raw,
      apiKeyMask: maskApiKey(apiKey.prefix),
      webhookSecret: webhookSecret.raw,
    },
  };
}

export async function rotateCommerceIntegrationSecrets(args: {
  userId: string;
  integrationId: string;
}) {
  const existing = await (prisma as any).commerceIntegration.findFirst({
    where: { id: args.integrationId, userId: args.userId },
    select: { id: true },
  });
  if (!existing) return null;

  const apiKey = createApiKey();
  const webhookSecret = createWebhookSecret();
  const integration = await (prisma as any).commerceIntegration.update({
    where: { id: args.integrationId },
    data: {
      apiKeyHash: apiKey.hash,
      apiKeyPrefix: apiKey.prefix,
      webhookSecretEnc: webhookSecret.encrypted,
    },
  });

  return {
    integration,
    credentials: {
      apiKey: apiKey.raw,
      apiKeyMask: maskApiKey(apiKey.prefix),
      webhookSecret: webhookSecret.raw,
    },
  };
}

export async function seedDefaultAutomations(
  userId: string,
  integrationId: string | null = null,
) {
  const rows = [
    {
      eventType: "order.created",
      channel: "dashboard",
      enabled: true,
      template: "Order received",
    },
    {
      eventType: "order.created",
      channel: "whatsapp",
      enabled: false,
      template: DEFAULT_WHATSAPP_TEMPLATE,
    },
    {
      eventType: "order.confirmed",
      channel: "whatsapp",
      enabled: false,
      template: "✅ تم تأكيد طلبك {orderName}. هنبدأ تجهيزه حالاً.",
    },
    {
      eventType: "order.preparing",
      channel: "whatsapp",
      enabled: false,
      template: "🛠️ طلبك {orderName} قيد التجهيز الآن.",
    },
    {
      eventType: "order.shipped",
      channel: "whatsapp",
      enabled: false,
      template: "📦 طلبك {orderName} خرج للشحن. رقم التتبع: {tracking}.",
    },
    {
      eventType: "order.out_for_delivery",
      channel: "whatsapp",
      enabled: false,
      template:
        "🚚 طلبك {orderName} خرج للتسليم اليوم. رقم التتبع: {tracking}.",
    },
    {
      eventType: "order.delivered",
      channel: "whatsapp",
      enabled: false,
      template: "تم تسليم طلبك {orderName}. سعداء بثقتك في {shop}.",
    },
    {
      eventType: "payment.failed",
      channel: "whatsapp",
      enabled: false,
      template: "حدثت مشكلة في دفع طلبك {orderName}. يمكنك الرد هنا للمساعدة.",
    },
    {
      eventType: "order.created",
      channel: "email",
      enabled: false,
      subject: DEFAULT_EMAIL_SUBJECT,
      template: DEFAULT_EMAIL_TEMPLATE,
    },
    {
      eventType: "order.shipped",
      channel: "email",
      enabled: false,
      subject: "تم شحن طلبك {orderName}",
      template: DEFAULT_EMAIL_TEMPLATE,
    },
    {
      eventType: "order.delivered",
      channel: "email",
      enabled: false,
      subject: "تم تسليم طلبك {orderName}",
      template: DEFAULT_EMAIL_TEMPLATE,
    },
  ];

  for (const row of rows) {
    if (!COMMERCE_EVENTS.includes(row.eventType as any)) continue;
    await (prisma as any).commerceAutomation
      .upsert({
        where: {
          userId_integrationId_eventType_channel_language: {
            userId,
            integrationId,
            eventType: row.eventType,
            channel: row.channel,
            language: "ar",
          },
        },
        create: {
          userId,
          integrationId,
          eventType: row.eventType,
          channel: row.channel,
          enabled: row.enabled,
          subject: row.subject || "",
          template: row.template,
          language: "ar",
        },
        update: {},
      })
      .catch(() => {});
  }
}

export function publicIntegration(row: any, origin?: string) {
  const baseUrl = (origin || process.env.NEXT_PUBLIC_APP_URL || "").replace(
    /\/$/,
    "",
  );
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    enabled: row.enabled,
    apiKeyMask: maskApiKey(row.apiKeyPrefix || ""),
    webhookUrl: baseUrl
      ? `${baseUrl}/api/commerce/webhooks`
      : "/api/commerce/webhooks",
    nativeWebhookUrl: baseUrl
      ? `${baseUrl}/api/commerce/webhooks?integrationId=${row.id}`
      : `/api/commerce/webhooks?integrationId=${row.id}`,
    setupMode: row.setupMode || "api_key",
    storeUrl: row.storeUrl || null,
    connectionStatus: row.connectionStatus || "untested",
    lastSyncStatus: row.lastSyncStatus || null,
    lastSyncAt: row.lastSyncAt || null,
    lastSyncError: row.lastSyncError || null,
    lastTestAt: row.lastTestAt,
    lastEventAt: row.lastEventAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
