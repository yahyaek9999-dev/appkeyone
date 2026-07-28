"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function CopyPhoneButton({ phone }: { phone: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }
  return (
    <button
      onClick={copy}
      title="نسخ الرقم"
      className="rounded p-0.5 text-slate-500 transition hover:text-slate-200"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
