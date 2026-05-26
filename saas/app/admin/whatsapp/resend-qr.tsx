"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function ResendQrButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function handleResend() {
    if (!confirm("إعادة إرسال QR code لهذا التاجر؟")) return;
    start(async () => {
      const res = await fetch(`/api/admin/whatsapp/resend-qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) router.refresh();
      else alert("فشل إعادة إرسال QR");
    });
  }

  return (
    <button
      onClick={handleResend}
      disabled={pending}
      className="px-2 py-1 rounded bg-brand-500/15 text-brand-200 text-xs hover:bg-brand-500/25 border border-brand-500/30 disabled:opacity-50"
    >
      {pending ? "..." : "إعادة QR"}
    </button>
  );
}
