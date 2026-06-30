// Unified shipping provider architecture (Phase 2).
//
// One Shipment lifecycle on top of a pluggable provider layer. The "manual"
// provider is fully functional with no external account (staff enters the
// tracking number). The carrier adapters (Bosta / Aramex / Mylerz / SMSA) are
// structurally complete; their live create/track calls are credential-gated and
// return a clear "needs live account" result until real keys are configured.
//
// Never touches the WhatsApp send pipeline: notifyCustomer only stamps the order
// + appends a timeline note (delivery of the message is handled elsewhere).

import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto-util";

export const SHIPPING_PROVIDER_TYPES = ["bosta", "aramex", "mylerz", "smsa", "manual"] as const;
export type ShippingProviderType = (typeof SHIPPING_PROVIDER_TYPES)[number];

export const SHIPMENT_STATUSES = [
  "created",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "returned",
  "canceled",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  created: "تم الإنشاء",
  picked_up: "تم الاستلام",
  in_transit: "في الطريق",
  out_for_delivery: "خرج للتسليم",
  delivered: "تم التسليم",
  returned: "مُرتجع",
  canceled: "ملغي",
};

// Map carrier-specific status strings to our normalized status.
export function normalizeCarrierStatus(type: ShippingProviderType, raw: string): ShipmentStatus {
  const s = String(raw || "").toLowerCase();
  if (/deliver/.test(s)) return "delivered";
  if (/out.?for.?deliver|outfordelivery/.test(s)) return "out_for_delivery";
  if (/transit|shipped|on.?the.?way/.test(s)) return "in_transit";
  if (/picked|collect|pickup/.test(s)) return "picked_up";
  if (/return/.test(s)) return "returned";
  if (/cancel/.test(s)) return "canceled";
  return "created";
}

export interface ProviderCreds {
  apiKey?: string | null;
  apiSecret?: string | null;
  account?: string | null;
}

export function decryptProvider(p: any): ProviderCreds {
  const dec = (v: string | null | undefined) => {
    if (!v) return null;
    try {
      return decryptSecret(v);
    } catch {
      return null;
    }
  };
  return { apiKey: dec(p.apiKeyEnc), apiSecret: dec(p.apiSecretEnc), account: dec(p.accountEnc) };
}

export function encryptProviderFields(input: {
  apiKey?: string;
  apiSecret?: string;
  account?: string;
}) {
  const out: Record<string, string> = {};
  if (input.apiKey?.trim()) out.apiKeyEnc = encryptSecret(input.apiKey.trim());
  if (input.apiSecret?.trim()) out.apiSecretEnc = encryptSecret(input.apiSecret.trim());
  if (input.account?.trim()) out.accountEnc = encryptSecret(input.account.trim());
  return out;
}

export interface TestResult {
  ok: boolean;
  detail: string;
}

/** Test a provider's connection. Manual always ok; carriers need live creds. */
export async function testProviderConnection(p: any): Promise<TestResult> {
  const type = String(p.type) as ShippingProviderType;
  if (type === "manual")
    return { ok: true, detail: "المزوّد اليدوي جاهز — لا يحتاج اتصالاً خارجياً." };
  const creds = decryptProvider(p);
  if (!creds.apiKey)
    return { ok: false, detail: "لا توجد مفاتيح API — أضف بيانات الاعتماد أولاً." };
  // Live carrier auth check would go here (credential-gated). Without a real
  // account we cannot assert success, so report a clear, honest status.
  return {
    ok: false,
    detail: "تم حفظ المفاتيح — التحقق المباشر يتطلب حساب شحن فعّال لدى المزوّد.",
  };
}

export interface CreateShipmentInput {
  userId: string;
  orderId: string;
  providerId: string;
  trackingNumber?: string | null;
}

function nowEvent(status: ShipmentStatus, note?: string) {
  // timestamp is stamped by the caller (Date is injected) — keep pure here.
  return { status, note: note || SHIPMENT_STATUS_LABEL[status] || status };
}

/** Create a shipment for an order. Manual records immediately; carriers attempt
 *  remote create when creds exist, else record locally with status "created". */
export async function createShipment(
  input: CreateShipmentInput,
  at: Date,
): Promise<{ ok: boolean; shipmentId?: string; detail: string }> {
  const order = await (prisma as any).order.findFirst({
    where: { id: input.orderId, userId: input.userId },
    select: { id: true },
  });
  if (!order) return { ok: false, detail: "الطلب غير موجود" };
  const provider = await (prisma as any).shippingProvider.findUnique({
    where: { id: input.providerId },
  });
  if (!provider || !provider.enabled) return { ok: false, detail: "مزوّد الشحن غير متاح" };

  let trackingNumber = input.trackingNumber?.trim() || null;
  const type = String(provider.type) as ShippingProviderType;

  if (type !== "manual") {
    const creds = decryptProvider(provider);
    if (creds.apiKey) {
      // Live carrier create-shipment would run here and return a tracking number.
      // Credential-gated: without a live account we fall back to local record.
    }
  }

  const timeline = [{ ...nowEvent("created"), at: at.toISOString() }];
  const shipment = await (prisma as any).shipment.create({
    data: {
      userId: input.userId,
      orderId: input.orderId,
      providerId: provider.id,
      providerType: provider.type,
      trackingNumber,
      status: "created",
      timelineJson: JSON.stringify(timeline),
      lastSyncAt: at,
    },
  });

  // Mirror onto the order so the existing order views show tracking.
  await (prisma as any).order
    .update({
      where: { id: input.orderId },
      data: {
        trackingCode: trackingNumber,
        courierName: provider.name,
        shippingStatus: "preparing",
      },
    })
    .catch(() => {});

  return { ok: true, shipmentId: shipment.id, detail: "تم إنشاء الشحنة" };
}

/** Append a status event to a shipment's timeline + mirror onto the order.
 *  Ownership is enforced at the data layer (userId in the where) — never trust
 *  the id alone, even though the route also pre-checks. */
export async function updateShipmentStatus(
  shipmentId: string,
  userId: string,
  status: ShipmentStatus,
  at: Date,
  note?: string,
): Promise<{ ok: boolean; detail: string }> {
  const s = await (prisma as any).shipment.findFirst({ where: { id: shipmentId, userId } });
  if (!s) return { ok: false, detail: "الشحنة غير موجودة" };
  let timeline: any[] = [];
  try {
    timeline = JSON.parse(s.timelineJson || "[]");
  } catch {
    timeline = [];
  }
  timeline.push({ ...nowEvent(status, note), at: at.toISOString() });
  await (prisma as any).shipment.update({
    where: { id: shipmentId },
    data: { status, timelineJson: JSON.stringify(timeline).slice(0, 8000), lastSyncAt: at },
  });

  // Mirror lifecycle onto the order.
  const orderData: any = {};
  if (status === "out_for_delivery") {
    orderData.deliveryStatus = "out_for_delivery";
    orderData.shippingStatus = "shipped";
  } else if (status === "delivered") {
    orderData.deliveryStatus = "delivered";
    orderData.status = "delivered";
    orderData.shippingStatus = "shipped";
  } else if (status === "in_transit" || status === "picked_up") {
    orderData.shippingStatus = "shipped";
  }
  if (Object.keys(orderData).length)
    await (prisma as any).order
      .update({ where: { id: s.orderId }, data: orderData })
      .catch(() => {});

  return { ok: true, detail: "تم تحديث الحالة" };
}

/** Sync a shipment from the carrier (credential-gated). Manual = no-op. */
export async function syncShipment(
  shipmentId: string,
  userId: string,
  at: Date,
): Promise<{ ok: boolean; status?: string; detail: string }> {
  const s = await (prisma as any).shipment.findFirst({
    where: { id: shipmentId, userId },
    include: { provider: true },
  });
  if (!s) return { ok: false, detail: "الشحنة غير موجودة" };
  if (s.providerType === "manual" || !s.provider)
    return { ok: true, status: s.status, detail: "مزوّد يدوي — حدّث الحالة يدوياً." };
  const creds = decryptProvider(s.provider);
  if (!creds.apiKey || !s.trackingNumber)
    return { ok: false, detail: "يلزم مفاتيح المزوّد ورقم تتبع للمزامنة المباشرة." };
  // Live carrier tracking fetch would run here and call updateShipmentStatus().
  await (prisma as any).shipment
    .update({ where: { id: shipmentId }, data: { lastSyncAt: at } })
    .catch(() => {});
  return { ok: false, detail: "المزامنة المباشرة تتطلب حساب شحن فعّال لدى المزوّد." };
}

/** Stamp the customer-notified marker on the order (does NOT send WA itself). */
export async function notifyCustomerOfShipment(
  shipmentId: string,
  userId: string,
  at: Date,
): Promise<{ ok: boolean }> {
  const s = await (prisma as any).shipment.findFirst({ where: { id: shipmentId, userId } });
  if (!s) return { ok: false };
  await (prisma as any).order
    .update({
      where: { id: s.orderId },
      data: { lastCustomerNotifiedAt: at, lastNotifiedStatus: s.status },
    })
    .catch(() => {});
  return { ok: true };
}
