"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Inline suspend / reactivate toggle for the admin businesses table.
 *
 * Calls the existing POST/DELETE /api/admin/users/:id/suspend endpoint and
 * refreshes the server component on success. Keeps the businesses page a
 * pure server component except for this single interactive control.
 */
export function SuspendButton({ userId, suspended, role }: { userId: string; suspended: boolean; role: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (role === "admin") return null;

  function toggle() {
    if (suspended) {
      // Reactivate
      start(async () => {
        await fetch(`/api/admin/users/${userId}/suspend`, { method: "DELETE" });
        router.refresh();
      });
    } else {
      const reason = prompt("سبب التعليق (اختياري):") || "manual_admin_action";
      if (reason === null) return;
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
