"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * Inline suspend / reactivate toggle for the admin businesses table.
 *
 * Calls the existing POST/DELETE /api/admin/users/:id/suspend endpoint and
 * refreshes the server component on success. Keeps the businesses page a
 * pure server component except for this single interactive control.
 */
export function SuspendButton({ userId, suspended, role }: { userId: string; suspended: boolean; role: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  if (role === "admin") return null;

  async function toggle() {
    if (suspended) {
      const ok = await confirm({ title: "إعادة تفعيل هذا الحساب؟", confirmLabel: "إعادة تفعيل" });
      if (!ok) return;
      start(async () => {
        await fetch(`/api/admin/users/${userId}/suspend`, { method: "DELETE" });
        router.refresh();
      });
    } else {
      const ok = await confirm({
        title: "تعليق هذا الحساب؟",
        body: "سيفقد التاجر الوصول فوراً حتى تعيد تفعيله.",
        confirmLabel: "تعليق",
        danger: true,
      });
      if (!ok) return;
      const reason = prompt("سبب التعليق (اختياري):") || "manual_admin_action";
      start(async () => {
        await fetch(`/api/admin/users/${userId}/suspend`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        router.refresh();
      });
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={`px-2 py-1 rounded text-[10px] font-bold disabled:opacity-50 ${
        suspended
          ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
          : "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
      }`}
    >
      {pending ? "..." : suspended ? "إعادة تفعيل" : "تعليق"}
    </button>
  );
}
