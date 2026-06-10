type TemplateVars = Record<string, string | number | null | undefined>;

export function renderCommerceTemplate(template: string, vars: TemplateVars): string {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const value = vars[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Same as renderCommerceTemplate but HTML-escapes every interpolated value.
 * Use this for the EMAIL channel: order/customer fields originate from external
 * webhook payloads and must not inject markup into the HTML email body.
 */
export function renderCommerceTemplateHtml(template: string, vars: TemplateVars): string {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const value = vars[key];
    return value === null || value === undefined ? "" : escapeHtml(String(value));
  });
}

export function commerceTemplateVars(args: {
  shopName?: string | null;
  order?: any;
  customer?: any;
  eventType?: string;
  trackingCode?: string | null;
}) {
  const order = args.order || {};
  const customer = args.customer || {};
  return {
    shop: args.shopName || "متجرك",
    eventType: args.eventType || "",
    orderId: order.id || "",
    orderName: order.externalOrderName || order.externalOrderId || order.id || "",
    customerName: order.customerName || customer.name || "عميلنا العزيز",
    customerPhone: order.customerPhone || customer.phone || "",
    total: order.total || 0,
    subtotal: order.subtotal || 0,
    shipping: order.shipping || 0,
    discount: order.discount || 0,
    currency: order.currency || "EGP",
    status: order.status || "pending",
    paymentMethod: order.paymentMethod || "",
    tracking: args.trackingCode || "",
  };
}
