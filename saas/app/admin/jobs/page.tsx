// /admin/jobs — Jobs / Cron Center.
//
// Shows the REAL background-job registry (lib/admin/jobs-registry.ts, sourced
// from the production systemd timers) with real schedule + a real manual
// "Run now" trigger. Per-run history is not persisted by the current cron
// design, so this page is honest about that rather than inventing executions.
import { CRON_JOBS } from "@/lib/admin/jobs-registry";
import JobsCenter from "./jobs-center";

export const dynamic = "force-dynamic";

export default function AdminJobsPage() {
  const minutely = CRON_JOBS.filter((j) => j.cadence === "minutely");
  const hourly = CRON_JOBS.filter((j) => j.cadence === "hourly");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title mb-1">المهام المجدولة</h1>
        <p className="page-desc">
          {CRON_JOBS.length} مهمة خلفية حقيقية تُدار عبر مؤقّتات systemd. شغّل أي مهمة الآن يدوياً — تسلك نفس مسار
          التشغيل المجدول تماماً.
        </p>
      </div>
      <JobsCenter minutely={minutely} hourly={hourly} />
    </div>
  );
}
