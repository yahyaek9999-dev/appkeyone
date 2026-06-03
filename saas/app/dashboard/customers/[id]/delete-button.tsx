"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

export default function DeleteCustomerButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const { error } = useToast();
  const confirm = useConfirm();

  async function handleDelete() {
    if (!(await confirm({ title: "حذف العميل", body: "سيتم حذف المحادثة وكل الرسائل المرتبطة به نهائياً.", confirmLabel: "حذف", cancelLabel: "إلغاء", danger: true }))) {
      return;
    }
    setDeleting(true);
    try {
      const r = await fetch(`/api/customers/${customerId}`, { method: "DELETE" });
      if (r.ok) {
        router.push("/dashboard/customers");
      } else {
        const j = await r.json().catch(() => ({}));
        error(j.error || "فشل الحذف");
      }
    } catch {
      error("فشل الاتصال بالخادم");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="inline-flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 disabled:opacity-50 transition"
      title="حذف العميل"
    >
      <Trash2 className="w-4 h-4" />
      {deleting ? "جارٍ الحذف..." : "حذف"}
    </button>
  );
}
