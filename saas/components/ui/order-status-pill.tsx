/**
 * KEYONE Tier-1 — OrderStatusPill
 * Source: reference-extracts/tier1/orders/OrderStatusPill.tsx
 * Adapted: Arabic labels matching KEYONE order lifecycle.
 */
import * as React from "react";
import {
  Clock,
  CheckCircle2,
  Truck,
  PackageCheck,
  XCircle,
  RefreshCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "packed"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "returned"
  | "canceled"
  | "cancelled"
  | "refunded";

const STATUS_MAP: Record<
  OrderStatus,
  { label: string; icon: React.ReactNode; classes: string }
> = {
  pending: {
    label: "قيد المراجعة",
    icon: <Clock className="size-3" />,
    classes: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
  },
  confirmed: {
    label: "مؤكَّد",
    icon: <CheckCircle2 className="size-3" />,
    classes: "bg-sky-500/10 text-sky-300 ring-sky-500/20",
  },
  preparing: {
    label: "قيد التجهيز",
    icon: <Clock className="size-3" />,
    classes: "bg-blue-500/10 text-blue-300 ring-blue-500/20",
  },
  packed: {
    label: "تم التغليف",
    icon: <PackageCheck className="size-3" />,
    classes: "bg-indigo-500/10 text-indigo-300 ring-indigo-500/20",
  },
  shipped: {
    label: "تم الشحن",
    icon: <Truck className="size-3" />,
    classes: "bg-gold-500/10 text-gold-300 ring-gold-500/20",
  },
  out_for_delivery: {
    label: "خارج للتسليم",
    icon: <Truck className="size-3" />,
    classes: "bg-orange-500/10 text-orange-300 ring-orange-500/20",
  },
  delivered: {
    label: "تم التسليم",
    icon: <PackageCheck className="size-3" />,
    classes: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
  },
  returned: {
    label: "مرتجع",
    icon: <RefreshCcw className="size-3" />,
    classes: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
  },
  canceled: {
    label: "ملغي",
    icon: <XCircle className="size-3" />,
    classes: "bg-slate-500/10 text-slate-300 ring-slate-500/20",
  },
  cancelled: {
    label: "ملغي",
    icon: <XCircle className="size-3" />,
    classes: "bg-slate-500/10 text-slate-300 ring-slate-500/20",
  },
  refunded: {
    label: "تم الاسترداد",
    icon: <RefreshCcw className="size-3" />,
    classes: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
  },
};

export interface OrderStatusPillProps {
  status: OrderStatus;
  size?: "sm" | "md";
  className?: string;
}

export function OrderStatusPill({
  status,
  size = "sm",
  className,
}: OrderStatusPillProps) {
  const meta = STATUS_MAP[status] || STATUS_MAP.pending;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        meta.classes,
        className,
      )}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}
