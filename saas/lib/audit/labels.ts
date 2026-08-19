/** Shared display labels/colors for AuditLog.action, used by both the
 * per-workspace viewer (dashboard/audit-log) and the cross-tenant admin
 * viewer (admin/audit-log). Kept in one place so the two never drift. */

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "team.member_invited": "دعوة عضو",
  "team.role_changed": "تغيير صلاحية",
  "team.member_removed": "إزالة عضو",
  "order.updated": "تعديل طلب",
  "order.deleted": "حذف طلب",
  "broadcast.created": "إنشاء حملة",
  "integration.connected": "ربط تكامل",
  "integration.deleted": "حذف تكامل",
  "integration.key_rotated": "تدوير مفتاح",
  "settings.ai_provider_changed": "تغيير مزود الذكاء",
  "settings.meta_cloud_changed": "تغيير Meta Cloud",
  "settings.meta_cloud_verified": "تحقّق اتصال Meta",
  "settings.bot_updated": "تعديل إعدادات البوت",
  "whatsapp.connected": "ربط واتساب",
  "whatsapp.disconnected": "فصل واتساب",
  "safety.kill_switch_cleared": "إلغاء مفتاح الإيقاف",
  "admin.subscription_changed": "تغيير اشتراك",
  "admin.settings_changed": "تغيير إعدادات المنصّة",
  "admin.plan_changed": "تعديل باقة",
  "admin.plan_archived": "أرشفة باقة",
  "admin.plan_restored": "استعادة باقة",
  "admin.payment_account_changed": "تغيير حساب استلام",
  "admin.payment_method_changed": "تغيير طريقة دفع",
  "admin.payment_approved": "اعتماد دفعة",
  "admin.payment_rejected": "رفض دفعة",
  "admin.payment_refunded": "استرداد دفعة",
  "admin.feature.update": "تعديل ميزة",
  "admin.job.run": "تشغيل مهمة",
  "release.create": "إنشاء إصدار",
  "release.update": "تعديل إصدار",
  "release.delete": "حذف إصدار",
};

export function auditBadgeColor(action: string): string {
  if (action.startsWith("team.")) return "bg-gold-500/15 text-gold-300";
  if (action.startsWith("whatsapp.")) return "bg-emerald-500/15 text-emerald-300";
  if (action.startsWith("broadcast.")) return "bg-amber-500/15 text-amber-300";
  if (action.startsWith("integration.")) return "bg-sky-500/15 text-sky-300";
  if (action.startsWith("safety.")) return "bg-rose-500/15 text-rose-300";
  // Money + plan lifecycle actions — highest-sensitivity, distinct color.
  if (action.includes("plan") || action.includes("payment") || action.includes("subscription")) return "bg-purple-500/15 text-purple-300";
  if (action.startsWith("settings.") || action.startsWith("admin.")) return "bg-sky-500/15 text-sky-300";
  return "bg-slate-500/15 text-slate-300";
}
