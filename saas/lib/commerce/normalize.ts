import { extractPhone } from "@/lib/phone";

export type NormalizedCommerceCustomer = {
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

export type NormalizedCommerceItem = {
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  size: string | null;
  color: string | null;
};

export type NormalizedCommerceOrder = {
  eventType: string;
  platform: string;
  externalOrderId: string;
  externalOrderName: string | null;
  status: string;
  fulfillmentStatus: string;
  customer: NormalizedCommerceCustomer;
  items: NormalizedCommerceItem[];
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  currency: string;
  paymentMethod: string | null;
  trackingCode: string | null;
  raw: Record<string, unknown>;
};

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function money(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const n = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(n)) return Math.round(n);
  }
  return 0;
}

function qty(value: unknown): number {
  const n = Number(value || 1);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(999, Math.round(n));
}

function first<T>(...values: T[]): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function normalizeStatus(eventType: string, rawStatus: unknown): string {
  const s = String(rawStatus || "").toLowerCase();
  if (eventType === "order.cancelled" || s.includes("cancel")) return "canceled";
  if (eventType === "order.shipped" || s.includes("shipped") || s.includes("fulfilled")) return "shipped";
  if (eventType === "order.delivered" || s.includes("delivered") || s.includes("completed")) return "delivered";
  if (s.includes("confirm") || s.includes("processing") || s.includes("paid")) return "confirmed";
  return "pending";
}

function normalizeFulfillment(eventType: string, rawStatus: unknown): string {
  const s = String(rawStatus || "").toLowerCase();
  if (eventType === "order.shipped" || eventType === "order.delivered" || s.includes("fulfilled") || s.includes("shipped")) return "fulfilled";
  if (s.includes("partial")) return "partial";
  return "unfulfilled";
}

function normalizeAddress(payload: any): string | null {
  const shipping = payload?.shipping || payload?.shipping_address || payload?.customer?.shipping || {};
  const billing = payload?.billing || payload?.billing_address || payload?.customer?.billing || {};
  const direct = str(payload?.shippingAddress || payload?.address || payload?.customer?.address);
  if (direct) return direct.slice(0, 500);
  const parts = [
    shipping.address_1 || shipping.address1 || billing.address_1 || billing.address1,
    shipping.address_2 || shipping.address2 || billing.address_2 || billing.address2,
    shipping.city || billing.city,
    shipping.state || shipping.province || billing.state || billing.province,
    shipping.country || billing.country,
  ].map(str).filter(Boolean);
  return parts.length ? parts.join(", ").slice(0, 500) : null;
}

function normalizeCustomer(payload: any): NormalizedCommerceCustomer {
  const customer = payload?.customer || {};
  const billing = payload?.billing || payload?.billing_address || customer?.billing || {};
  const shipping = payload?.shipping || payload?.shipping_address || customer?.shipping || {};
  const firstName = str(first(customer.first_name, customer.firstName, billing.first_name, shipping.first_name));
  const lastName = str(first(customer.last_name, customer.lastName, billing.last_name, shipping.last_name));
  const name = str(first(customer.name, payload.customerName, billing.name, shipping.name, [firstName, lastName].filter(Boolean).join(" ")));
  const phoneRaw = str(first(customer.phone, payload.customerPhone, billing.phone, shipping.phone));
  return {
    name: name ? name.slice(0, 100) : null,
    phone: extractPhone(phoneRaw) || phoneRaw,
    email: str(first(customer.email, payload.customerEmail, billing.email))?.slice(0, 160) || null,
    address: normalizeAddress(payload),
  };
}

function normalizeItems(payload: any): NormalizedCommerceItem[] {
  const rawItems = payload?.items || payload?.line_items || payload?.products || payload?.order?.items || [];
  if (!Array.isArray(rawItems)) return [];
  return rawItems.slice(0, 100).map((item: any) => {
    const quantity = qty(item.quantity || item.qty);
    const unitPrice = money(first(item.unitPrice, item.unit_price, item.price, item.total && quantity ? Number(item.total) / quantity : 0));
    const lineTotal = money(first(item.lineTotal, item.line_total, item.total, unitPrice * quantity));
    return {
      name: str(first(item.name, item.title, item.product_name, item.sku))?.slice(0, 160) || "Item",
      sku: str(item.sku)?.slice(0, 80) || null,
      quantity,
      unitPrice,
      lineTotal,
      size: str(first(item.size, item.variant?.size, item.meta?.size))?.slice(0, 50) || null,
      color: str(first(item.color, item.variant?.color, item.meta?.color))?.slice(0, 50) || null,
    };
  });
}

export function normalizeCommerceOrder(args: {
  eventType: string;
  platform: string;
  payload: any;
}): NormalizedCommerceOrder | null {
  const source = args.payload?.order || args.payload;
  if (!source || typeof source !== "object") return null;

  const externalOrderId = str(first(source.id, source.order_id, source.orderId, source.number, source.name));
  if (!externalOrderId) return null;

  const items = normalizeItems(source);
  const subtotal = money(first(source.subtotal, source.subtotal_price, source.total_line_items_price, items.reduce((sum, item) => sum + item.lineTotal, 0)));
  const shipping = money(first(source.shipping, source.shipping_total, source.total_shipping_price_set?.shop_money?.amount));
  const discount = money(first(source.discount, source.discount_total, source.total_discounts));
  const total = money(first(source.total, source.total_price, source.total_amount, subtotal + shipping - discount));

  return {
    eventType: args.eventType,
    platform: args.platform || "custom",
    externalOrderId: externalOrderId.slice(0, 160),
    externalOrderName: str(first(source.name, source.number, source.order_number))?.slice(0, 160) || null,
    status: normalizeStatus(args.eventType, first(source.status, source.financial_status, source.fulfillment_status)),
    fulfillmentStatus: normalizeFulfillment(args.eventType, first(source.fulfillmentStatus, source.fulfillment_status, source.status)),
    customer: normalizeCustomer(source),
    items,
    subtotal,
    shipping,
    discount,
    total,
    currency: str(first(source.currency, source.currency_code))?.slice(0, 10) || "EGP",
    paymentMethod: str(first(source.paymentMethod, source.payment_method, source.gateway, source.payment_gateway_names?.[0]))?.slice(0, 60) || null,
    trackingCode: str(first(source.trackingCode, source.tracking_code, source.tracking_number, source.fulfillments?.[0]?.tracking_number))?.slice(0, 100) || null,
    raw: source,
  };
}
