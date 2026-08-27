"use client";

import { useState } from "react";
import { useMutate } from "@/components/ui/use-mutate";
import {
  Users, Shield, Eye, ShoppingBag, Headphones,
  Plus, Trash2, ChevronDown, Info, Crown, Copy, Check, Link2,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";

const ROLES = [
  { value: "owner",   label: "المالك",    icon: Crown,       desc: "صلاحيات كاملة — لا يمكن تغييرها",    color: "text-amber-300", badge: "bg-amber-500/15 border-amber-500/30 text-amber-300" },
  { value: "admin",   label: "مدير",     icon: Shield,      desc: "كل شيء عدا الفوترة",                  color: "text-brand-300",  badge: "bg-brand-500/15 border-brand-500/30 text-brand-300" },
  { value: "sales",   label: "مبيعات",   icon: ShoppingBag, desc: "الطلبات والعملاء والبث",               color: "text-emerald-300", badge: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" },
  { value: "support", label: "دعم",      icon: Headphones,  desc: "الواردات والتصعيدات فقط",             color: "text-sky-300",    badge: "bg-sky-500/15 border-sky-500/30 text-sky-300" },
  { value: "viewer",  label: "مشاهد",    icon: Eye,         desc: "قراءة فقط — لا يمكنه الإرسال",        color: "text-slate-300",  badge: "bg-slate-500/15 border-slate-500/30 text-slate-300" },
] as const;

type Role = (typeof ROLES)[number]["value"];

interface Member {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string; // invited | active | disabled
  invitedAt: string;
  acceptedAt: string | null;
  lastLoginAt: string | null;
}

export function TeamSettingsUi({
  ownerEmail,
  ownerName,
  initialMembers,
}: {
  ownerEmail: string;
  ownerName: string;
  initialMembers: Member[];
}) {
  const mutate = useMutate();
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Exclude<Role, "owner">>("support");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const confirm = useConfirm();

  async function invite() {
    if (!email.trim() || !email.includes("@")) {
      setMsg({ ok: false, text: "أدخل بريداً إلكترونياً صحيحاً" });
      return;
    }
    setSaving(true);
    setInviteLink(null);
    const res = await fetch("/api/settings/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), name: name.trim() || undefined, role }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok && j.member) {
      setMembers((prev) => [...prev, {
        id: j.member.id, email: j.member.email, name: j.member.name,
        role: j.member.role, status: "invited",
        invitedAt: new Date().toISOString(), acceptedAt: null, lastLoginAt: null,
      }]);
      setEmail("");
      setName("");
      setInviteLink(j.acceptUrl || null);
      setMsg({ ok: true, text: "تم إنشاء الدعوة — انسخ الرابط وأرسله للعضو ليُفعّل حسابه." });
    } else {
      setMsg({ ok: false, text: j.error || "فشل إنشاء الدعوة" });
    }
  }

  async function removeMember(id: string, label: string) {
    const ok = await confirm({
      title: `إزالة "${label}" من الفريق؟`,
      body: "سيفقد هذا العضو الوصول إلى لوحة التحكم فورًا.",
      confirmLabel: "إزالة",
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    const res = await fetch(`/api/settings/team?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setSaving(false);
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== id));
      setMsg({ ok: true, text: "تم إزالة العضو" });
    } else {
      setMsg({ ok: false, text: "تعذّر إزالة العضو" });
    }
  }

  async function changeRole(id: string, newRole: Exclude<Role, "owner">) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role: newRole } : m)));
    if (!(await mutate("/api/settings/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, role: newRole }),
    }))) return;
  }

  function copyLink() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="page-title mb-1">إدارة الفريق</h1>
        <p className="page-desc">تحكّم بمن يصل إلى لوحة التحكم وبأي صلاحيات.</p>
      </div>

      {/* How it works */}
      <div className="card p-4 border-brand-500/20 bg-brand-500/[0.05] flex items-start gap-3">
        <Info className="h-4 w-4 shrink-0 text-brand-400 mt-0.5" />
        <p className="text-sm text-brand-200/80">
          أضف عضواً بالبريد والدور، ثم أرسل له رابط الدعوة. سيختار كلمة مروره ويدخل بصلاحياته داخل مساحة عملك.
        </p>
      </div>

      {/* Roles matrix */}
      <div className="card p-5">
        <h2 className="section-title mb-4 flex items-center gap-2">
          <Shield className="h-4 w-4 text-brand-400" /> مصفوفة الصلاحيات
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="py-2 text-right font-medium text-slate-400 pr-3">الصلاحية</th>
                {ROLES.filter(r => r.value !== "owner").map(r => (
                  <th key={r.value} className="py-2 text-center text-xs font-medium text-slate-400 px-2">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {[
                { perm: "عرض الإحصائيات", roles: ["admin","sales","support","viewer"] },
                { perm: "الواردات والرسائل", roles: ["admin","sales","support"] },
                { perm: "العملاء والطلبات", roles: ["admin","sales"] },
                { perm: "البث الجماعي", roles: ["admin","sales"] },
                { perm: "التصعيدات", roles: ["admin","support"] },
                { perm: "الإعدادات والتكاملات", roles: ["admin"] },
                { perm: "إدارة الفريق", roles: ["admin"] },
                { perm: "الاشتراك والفوترة", roles: [] as string[] },
              ].map(({ perm, roles }) => (
                <tr key={perm}>
                  <td className="py-2.5 pr-3 text-slate-300 text-xs">{perm}</td>
                  {(["admin","sales","support","viewer"] as Role[]).map(r => (
                    <td key={r} className="py-2.5 text-center text-xs">
                      {roles.includes(r) ? (
                        <span className="text-brand-400">✓</span>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Current members */}
      <div className="card p-5">
        <h2 className="section-title mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-brand-400" /> أعضاء الفريق
        </h2>

        {/* Owner row (always first) */}
        <div className="flex items-center justify-between py-3 border-b border-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15 text-sm font-bold text-amber-300">
              {ownerName.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-medium text-white">{ownerName}</div>
              <div className="text-[11px] text-slate-500">{ownerEmail}</div>
            </div>
          </div>
          <RoleBadge role="owner" />
        </div>

        {/* Team members */}
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between py-3 border-b border-white/[0.05]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08] text-sm font-bold text-slate-300">
                {(m.name || m.email).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white">{m.name || m.email}</div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="truncate">{m.email}</span>
                  <StatusPill status={m.status} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <RoleSelector value={(m.role as Exclude<Role,"owner">) || "viewer"} onChange={(r) => changeRole(m.id, r)} />
              <button onClick={() => removeMember(m.id, m.name || m.email)} disabled={saving} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        {members.length === 0 && (
          <EmptyState
            icon={<Users className="h-full w-full" />}
            title="لا يوجد أعضاء بعد"
            description="أضِف أول عضو لفريقك عبر نموذج الدعوة أدناه."
            size="sm"
          />
        )}
      </div>

      {/* Invite form */}
      <div className="card p-5">
        <h2 className="section-title mb-4 flex items-center gap-2">
          <Plus className="h-4 w-4 text-brand-400" /> دعوة عضو جديد
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="الاسم (اختياري)"
            className="input sm:w-40"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            dir="ltr"
            className="input flex-1"
          />
          <RoleSelector value={role} onChange={setRole} />
          <button onClick={invite} disabled={saving || !email.trim()} className="btn-primary shrink-0">
            <Plus className="h-4 w-4" />
            {saving ? "..." : "دعوة"}
          </button>
        </div>

        {inviteLink && (
          <div className="mt-3 rounded-lg border border-brand-500/20 bg-brand-500/[0.06] p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-brand-300">
              <Link2 className="h-3.5 w-3.5" /> رابط الدعوة (صالح 7 أيام)
            </div>
            <div className="flex items-center gap-2">
              <input readOnly value={inviteLink} dir="ltr" className="input flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
              <button onClick={copyLink} className="btn-outline shrink-0 px-3">
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}

        {msg && (
          <div className={`mt-3 text-xs rounded-lg p-2.5 ${msg.ok ? "bg-brand-500/10 text-brand-300" : "bg-rose-500/10 text-rose-300"}`}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "active") {
    return <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">نشط</span>;
  }
  if (status === "disabled") {
    return <span className="rounded-full bg-slate-500/15 px-1.5 py-0.5 text-[10px] text-slate-400">معطّل</span>;
  }
  return <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">بانتظار القبول</span>;
}

function RoleBadge({ role }: { role: string }) {
  const r = ROLES.find(x => x.value === role) || ROLES[4];
  const Icon = r.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${r.badge}`}>
      <Icon className="h-3 w-3" />
      {r.label}
    </span>
  );
}

function RoleSelector({ value, onChange }: { value: Exclude<Role, "owner">; onChange: (r: Exclude<Role, "owner">) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Exclude<Role, "owner">)}
        className="appearance-none input py-2 pr-8 pl-3 text-sm cursor-pointer"
      >
        {ROLES.filter(r => r.value !== "owner").map(r => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
    </div>
  );
}
