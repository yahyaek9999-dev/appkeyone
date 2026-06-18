/**
 * Developer API Documentation Center — standalone, comprehensive REST + webhook
 * reference for the public `/api/v1` surface (and the inbound/outbound webhook
 * contracts). Plan-gated on `api_access` (k_scale+), mirroring the Developer
 * Center page. Pure static content: no data fetch, no mutation, never touches
 * the WhatsApp send pipeline.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import { BookOpen, ArrowRight, KeyRound, Webhook, Terminal } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DeveloperDocsPage() {
  const g = await pageGate("api_access");
  if (!g.uid) redirect("/login");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          title="مركز توثيق المطوّرين"
          description="توثيق كامل لواجهات KEYONE البرمجية (REST API) والويب هوك. متاح ضمن باقات الأعمال الأعلى."
          recommendedTier={g.recommendedTier}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1 flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-brand-300" /> مركز توثيق المطوّرين
          </h1>
          <p className="page-desc">
            مرجع كامل لواجهة KEYONE البرمجية العامة (REST API v1) والويب هوك — مع أمثلة جاهزة بـ cURL.
          </p>
        </div>
        <Link href="/dashboard/developer" className="btn-secondary inline-flex items-center gap-2 text-sm">
          <KeyRound className="h-4 w-4" /> إدارة مفاتيح API <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Quick start */}
      <Card title="البدء السريع" icon={<Terminal className="h-4 w-4 text-brand-300" />}>
        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-300">
          <li>أنشئ مفتاح API من <Link href="/dashboard/developer" className="text-brand-300 underline">مركز المطوّرين</Link> (يظهر المفتاح مرة واحدة فقط — احفظه بأمان).</li>
          <li>أرسل المفتاح في ترويسة <Mono>Authorization: Bearer …</Mono> مع كل طلب عبر HTTPS.</li>
          <li>ابدأ بـ <Mono>GET /api/v1/me</Mono> للتحقق من المصادقة والباقة.</li>
        </ol>
      </Card>

      {/* Base URL + Auth */}
      <Card title="عنوان الأساس والمصادقة">
        <Field label="Base URL">
          <Code>https://&lt;your-keyone-domain&gt;</Code>
        </Field>
        <Field label="المصادقة (Authorization)">
          <p className="text-slate-400 text-sm mb-1">استخدم رأس <Mono>Authorization</Mono> بصيغة Bearer، أو بديلًا رأس <Mono>x-api-key</Mono>:</p>
          <Code>{`curl https://<your-keyone-domain>/api/v1/me \\
  -H "Authorization: Bearer ko_live_xxxxxxxxxxxxxxxxxxxx"`}</Code>
        </Field>
      </Card>

      {/* Endpoints */}
      <Card title="نقاط النهاية (Endpoints)">
        <Endpoint
          method="GET"
          path="/api/v1/me"
          scope="read"
          desc="يعيد هوية الحساب (userId) والباقة الحالية والصلاحيات وحد المعدّل."
          curl={`curl https://<your-keyone-domain>/api/v1/me \\
  -H "Authorization: Bearer ko_live_…"`}
          response={`{
  "userId": "clx...",
  "plan": { "slug": "k_scale", "name": "...", "tier": "max" },
  "scopes": ["read", "customers:read"],
  "rateLimitPerMin": 60
}`}
        />
        <Endpoint
          method="GET"
          path="/api/v1/customers?limit=50&cursor=<id>"
          scope="customers:read"
          desc="قائمة عملائك بترقيم بالمؤشر (cursor). الحد الأقصى limit = 100 (الافتراضي 50)."
          curl={`curl "https://<your-keyone-domain>/api/v1/customers?limit=50" \\
  -H "Authorization: Bearer ko_live_…"`}
          response={`{
  "data": [
    { "id": "...", "name": "...", "phone": "+20...", "createdAt": "...", "leadScore": 0 }
  ],
  "pagination": { "limit": 50, "nextCursor": "...", "hasMore": true }
}`}
        />
      </Card>

      {/* Pagination */}
      <Card title="الترقيم بالمؤشر (Cursor Pagination)">
        <p className="text-sm text-slate-400">
          مرّر <Mono>nextCursor</Mono> من الاستجابة السابقة في معامل <Mono>cursor</Mono> لجلب الصفحة التالية. عندما يصبح
          <Mono> hasMore=false</Mono> تكون قد وصلت إلى نهاية القائمة.
        </p>
      </Card>

      {/* Rate limits */}
      <Card title="حدود المعدّل (Rate Limits)">
        <p className="text-sm text-slate-400">
          لكل مفتاح حدّ خاص (طلبات/دقيقة) يظهر في مركز المطوّرين. عند تجاوز الحد تُعاد الحالة <Mono>429</Mono> مع رأس
          <Mono> Retry-After</Mono>، وتتضمّن كل استجابة رأس <Mono>X-RateLimit-Limit</Mono>.
        </p>
      </Card>

      {/* Errors */}
      <Card title="رموز الأخطاء">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              <ErrRow code="401" label="مفتاح مفقود أو غير صالح" />
              <ErrRow code="402" label="باقتك لا تتضمّن وصول API — قم بالترقية" />
              <ErrRow code="403" label="المفتاح لا يملك الصلاحية (Scope) المطلوبة" />
              <ErrRow code="429" label="تجاوزت حد المعدّل — انتظر ثم أعد المحاولة" />
            </tbody>
          </table>
        </div>
      </Card>

      {/* Webhooks */}
      <Card title="الويب هوك (Webhooks)" icon={<Webhook className="h-4 w-4 text-brand-300" />}>
        <Field label="الصادر العام (مواصفة)">
          <p className="text-slate-400 text-sm mb-1">صيغة الحمولة التي ترسلها KEYONE إلى نقطة الاستقبال عند وقوع حدث:</p>
          <Code>{`POST https://your-server.example/webhook
Content-Type: application/json
X-KEYONE-Signature: sha256=<hmac>

{
  "id": "evt_...",
  "type": "customer.created",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "data": { "id": "...", "name": "...", "phone": "+20...", "leadScore": 0 }
}`}</Code>
          <p className="text-slate-500 text-xs mt-1">
            تحقّق من التوقيع بحساب HMAC-SHA256 للجسم الخام بالسر المشترك، وقارنه بترويسة <Mono>X-KEYONE-Signature</Mono>،
            ثم أعِد <Mono>2xx</Mono> خلال ثوانٍ لتأكيد الاستلام.
          </p>
        </Field>
      </Card>
    </div>
  );
}

/* ── presentational helpers (static, server-rendered) ───────────────────────── */
function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h2 className="font-bold text-lg flex items-center gap-2 mb-4">{icon}{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-semibold text-white mb-1">{label}</h3>
      {children}
    </section>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="font-mono bg-white/5 px-1 rounded text-xs">{children}</code>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs font-mono text-slate-200 whitespace-pre" dir="ltr">
      {children}
    </pre>
  );
}

function Endpoint({ method, path, scope, desc, curl, response }: {
  method: string; path: string; scope: string; desc: string; curl: string; response: string;
}) {
  return (
    <section className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="rounded bg-emerald-500/15 text-emerald-300 text-xs font-bold px-2 py-0.5 font-mono">{method}</span>
        <code className="font-mono text-xs text-white break-all" dir="ltr">{path}</code>
        <span className="rounded bg-white/5 text-slate-400 text-[10px] px-1.5 py-0.5 font-mono">scope: {scope}</span>
      </div>
      <p className="text-slate-400 text-xs mt-2">{desc}</p>
      <div className="text-[11px] text-slate-500 mt-2">مثال الطلب:</div>
      <Code>{curl}</Code>
      <div className="text-[11px] text-slate-500 mt-2">مثال الاستجابة:</div>
      <Code>{response}</Code>
    </section>
  );
}

function ErrRow({ code, label }: { code: string; label: string }) {
  return (
    <tr className="border-t border-white/5">
      <td className="p-1.5 font-mono font-bold text-rose-300 w-12">{code}</td>
      <td className="p-1.5 text-slate-400">{label}</td>
    </tr>
  );
}
