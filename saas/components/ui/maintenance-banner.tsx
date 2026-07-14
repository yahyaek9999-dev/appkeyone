import { AlertTriangle } from "lucide-react";

export function MaintenanceBanner({ message }: { message?: string | null }) {
  return (
    <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-200 sm:text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate">
        {message?.trim() || "الخدمة تحت الصيانة حالياً — ممكن تواجه بعض الأعطال المؤقتة."}
      </span>
    </div>
  );
}
