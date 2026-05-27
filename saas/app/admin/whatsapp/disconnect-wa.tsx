"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function DisconnectWaButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function handleDisconnect() {
    if (!confirm("فصل اتصال واتساب لهذا التاجر؟")) return;
    start(async () => {
      const res = await fetch(`/api/admin/whatsapp/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) router.refresh();
      else alert("فشل الفصل");
    });
  }

  return (
    <button
      onClick={handleDisconnect}
      disabled={pending}
      className="px-2 py-1 rounded bg-rose-500/15 text-rose-200 text-xs hover:bg-rose-500/25 border border-rose-500/30 disabled:opacity-50"
    >
      {pending ? "..." : "فصل"}
    </button>
  );
}
