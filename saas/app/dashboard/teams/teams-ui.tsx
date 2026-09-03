"use client";

/**
 * Teams management screen.
 *
 * Left: the workspace's teams. Right: the selected team's policy + roster.
 * The policy editor is the whole point — `conversationScope` and
 * `allowedNumberIds` had no UI at all before this, which is why multi_team was
 * sold but not usable. Every control here maps to a column the inbox actually
 * reads (see lib/teams/scope.ts).
 */

import { useCallback, useEffect, useState } from "react";
import {
  UsersRound, Plus, Loader2, Trash2, Shield, Phone, UserPlus, UserMinus, Save, Users,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";

type Scope = "own_only" | "team" | "all";

interface Member {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  conversationScope: string;
  allowedNumberIds: string;
}

interface Team {
  id: string;
  name: string;
  description: string;
  conversationScope: Scope;
  allowedNumberIds: string[];
  members: Member[];
}

interface WaNumber { id: string; displayName: string; phone: string }

const SCOPE_LABEL: Record<Scope, string> = {
  own_only: "محادثاته فقط",
  team: "محادثات الفريق",
  all: "كل محادثات المساحة",
};

const SCOPE_HELP: Record<Scope, string> = {
  own_only: "يرى العضو المحادثات المسندة إليه شخصيًا فقط.",
  team: "يرى العضو كل محادثة مسندة إلى أي عضو في نفس الفريق — ولا يرى فرقًا أخرى.",
  all: "يرى العضو كل محادثات مساحة العمل بلا عزل.",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "مشرف", sales: "مبيعات", support: "دعم", viewer: "مشاهدة",
};

export default function TeamsUi() {
  const { success, error, info } = useToast();
  const confirm = useConfirm();

  const [teams, setTeams] = useState<Team[]>([]);
  const [unassigned, setUnassigned] = useState<Member[]>([]);
  const [numbers, setNumbers] = useState<WaNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [draft, setDraft] = useState<{ name: string; description: string; scope: Scope; numbers: string[] } | null>(null);
  const [addingMember, setAddingMember] = useState("");

  const load = useCallback(async (keepId?: string | null) => {
    setLoading(true);
    try {
      const r = await fetch("/api/teams", { cache: "no-store" });
      const j = await r.json();
      const list: Team[] = j.teams || [];
      setTeams(list);
      setUnassigned(j.unassigned || []);
      setNumbers(j.numbers || []);
      setPending(Boolean(j.pending));
      setSelectedId((prev) => {
        const want = keepId ?? prev;
        return list.some((t) => t.id === want) ? want! : list[0]?.id ?? null;
      });
    } catch {
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selected = teams.find((t) => t.id === selectedId) || null;

  // Reset the editor whenever the selection changes to a different team.
  useEffect(() => {
    if (!selected) { setDraft(null); return; }
    setDraft({
      name: selected.name,
      description: selected.description,
      scope: selected.conversationScope,
      numbers: selected.allowedNumberIds,
    });
    setAddingMember("");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createTeam() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      });
      const j = await r.json();
      if (r.ok) {
        setNewName(""); setNewDesc("");
        success("تم إنشاء الفريق");
        load(j.team?.id);
      } else if (r.status === 503 || j.pending) {
        info("الوحدة جاهزة بالكود — تحتاج تفعيل قاعدة البيانات على الخادم.");
      } else {
        error(j.error || "تعذّر الإنشاء");
      }
    } finally {
      setCreating(false);
    }
  }

  async function saveTeam() {
    if (!selected || !draft) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/teams/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim(),
          conversationScope: draft.scope,
          allowedNumberIds: draft.numbers,
        }),
      });
      const j = await r.json();
      if (r.ok) { success("تم حفظ إعدادات الفريق"); load(selected.id); }
      else error(j.error || "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function removeTeam() {
    if (!selected) return;
    const ok = await confirm({
      title: "حذف الفريق",
      body: `حذف فريق "${selected.name}"؟ الأعضاء لن يُحذفوا — سيعودون بلا فريق وبأضيق نطاق (محادثاتهم فقط).`,
      confirmLabel: "حذف", cancelLabel: "إلغاء", danger: true,
    });
    if (!ok) return;
    const r = await fetch(`/api/teams/${selected.id}`, { method: "DELETE" });
    if (r.ok) { success("تم حذف الفريق"); load(null); }
    else error("تعذّر الحذف");
  }

  async function assignMember(memberId: string) {
    if (!selected || !memberId) return;
    const r = await fetch(`/api/teams/${selected.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    });
    if (r.ok) { success("تمت إضافة العضو للفريق"); setAddingMember(""); load(selected.id); }
    else error("تعذّرت الإضافة");
  }

  async function unassignMember(m: Member) {
    if (!selected) return;
    const ok = await confirm({
      title: "إخراج العضو",
      body: `إخراج "${m.name || m.email}" من الفريق؟ يبقى عضوًا في مساحة العمل، لكن نطاقه يعود إلى محادثاته فقط.`,
      confirmLabel: "إخراج", cancelLabel: "إلغاء", danger: true,
    });
    if (!ok) return;
    const r = await fetch(`/api/teams/${selected.id}/members?memberId=${encodeURIComponent(m.id)}`, { method: "DELETE" });
    if (r.ok) { success("تم إخراج العضو"); load(selected.id); }
    else error("تعذّر الإخراج");
  }

  async function setMemberOverride(m: Member, scope: string) {
    if (!selected) return;
    const r = await fetch(`/api/teams/${selected.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: m.id, conversationScope: scope }),
    });
    if (r.ok) { success(scope ? "تم ضبط نطاق العضو" : "عاد العضو إلى نطاق الفريق"); load(selected.id); }
    else error("تعذّر الضبط");
  }

  const inp = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none";
  const dirty = !!(selected && draft && (
    draft.name !== selected.name ||
    draft.description !== selected.description ||
    draft.scope !== selected.conversationScope ||
    draft.numbers.join(",") !== selected.allowedNumberIds.join(",")
  ));

  return (
    <div className="space-y-6 p-1">
      <div className="border-b border-white/[0.05] pb-5">
        <h1 className="page-title">الفرق والصلاحيات</h1>
        <p className="page-desc mt-1">
          قسّم موظفيك إلى فرق، وحدّد لكل فريق نطاق المحادثات التي يراها وأرقام واتساب المسموح له بها.
        </p>
      </div>

      {pending && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          الوحدة منشورة بالكود. لتفعيل الحفظ، شغّل ترحيل قاعدة البيانات على الخادم (جدول جديد فقط — لا يمسّ بياناتك).
        </div>
      )}

      <div className="card p-5">
        <h3 className="section-title mb-3 flex items-center gap-2"><Plus className="h-4 w-4" /> فريق جديد</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="اسم الفريق *" className={inp} />
          <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="وصف مختصر" className={inp} />
        </div>
        <div className="mt-3">
          <button onClick={createTeam} disabled={creating || !newName.trim()} className="btn-primary inline-flex items-center gap-2">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            إنشاء الفريق
          </button>
        </div>
      </div>

      {loading && <div className="card p-8 text-center text-slate-400">جارٍ التحميل...</div>}

      {!loading && teams.length === 0 && (
        <EmptyState
            variant="page"
            icon={<UsersRound className="h-full w-full" />}
            title="كل الموظفين بيشوفوا كل حاجة"
            description="من غير فرق، أي موظف تضيفه يقدر يفتح كل المحادثات وكل الأرقام. الفريق بيحصر كل مجموعة في نطاقها — محادثاتها وأرقامها هي بس."
            hint="لو عندك أكتر من فرع أو أكتر من رقم واتساب، ده أول إعداد تعمله قبل ما تدعو حد."
            steps={[
              { title: "أنشئ الفريق", body: "اسم يعبّر عن الفرع أو التخصص." },
              { title: "اربط أرقامه", body: "الفريق يرى محادثات أرقامه فقط." },
              { title: "ادعُ الموظفين", body: "كل موظف يبدأ داخل نطاقه مباشرةً." },
            ]}
          />
      )}

      {!loading && teams.length > 0 && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
          {/* ── team list ─────────────────────────────────────────────── */}
          <div className="space-y-2">
            {teams.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full rounded-xl border px-4 py-3 text-right transition ${
                  t.id === selectedId
                    ? "border-brand-500/50 bg-brand-500/10"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white">{t.name}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                    <Users className="h-3.5 w-3.5" />{t.members.length}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-400">{SCOPE_LABEL[t.conversationScope]}</div>
              </button>
            ))}
          </div>

          {/* ── team details ──────────────────────────────────────────── */}
          {selected && draft && (
            <div className="space-y-5">
              <div className="card p-5">
                <h3 className="section-title mb-3 flex items-center gap-2"><Shield className="h-4 w-4" /> إعدادات الفريق</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="اسم الفريق" className={inp} />
                  <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="وصف" className={inp} />
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-slate-300">نطاق المحادثات</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(["own_only", "team", "all"] as Scope[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setDraft({ ...draft, scope: s })}
                        className={`rounded-lg border px-3 py-2 text-sm transition ${
                          draft.scope === s ? "border-brand-500/60 bg-brand-500/15 text-white" : "border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/[0.05]"
                        }`}
                      >
                        {SCOPE_LABEL[s]}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">{SCOPE_HELP[draft.scope]}</p>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    <Phone className="mb-0.5 inline h-3.5 w-3.5" /> أرقام واتساب المسموح بها
                  </label>
                  {numbers.length === 0 ? (
                    <p className="text-xs text-slate-500">لا توجد أرقام مسجّلة في مساحة العمل — الفريق سيرى كل الأرقام.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {numbers.map((n) => {
                          const on = draft.numbers.includes(n.id);
                          return (
                            <button
                              key={n.id}
                              onClick={() => setDraft({
                                ...draft,
                                numbers: on ? draft.numbers.filter((x) => x !== n.id) : [...draft.numbers, n.id],
                              })}
                              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                                on ? "border-brand-500/60 bg-brand-500/15 text-white" : "border-white/10 bg-white/[0.02] text-slate-400 hover:bg-white/[0.05]"
                              }`}
                            >
                              {n.displayName || n.phone || n.id}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        {draft.numbers.length === 0 ? "لم تُحدَّد أرقام — الفريق يرى كل الأرقام." : `الفريق مقيّد بـ ${draft.numbers.length} رقم.`}
                      </p>
                    </>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button onClick={saveTeam} disabled={saving || !dirty || !draft.name.trim()} className="btn-primary inline-flex items-center gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    حفظ التغييرات
                  </button>
                  <button onClick={removeTeam} className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10">
                    <Trash2 className="h-4 w-4" /> حذف الفريق
                  </button>
                </div>
              </div>

              {/* ── roster ──────────────────────────────────────────── */}
              <div className="card p-5">
                <h3 className="section-title mb-3 flex items-center gap-2"><Users className="h-4 w-4" /> أعضاء الفريق</h3>

                {selected.members.length === 0 && (
                  <p className="mb-3 text-sm text-slate-400">لا يوجد أعضاء في هذا الفريق بعد.</p>
                )}

                <div className="space-y-2">
                  {selected.members.map((m) => (
                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">{m.name || m.email}</div>
                        <div className="truncate text-xs text-slate-400">
                          {m.email} · {ROLE_LABEL[m.role] || m.role}
                          {m.status !== "active" && <span className="text-amber-300"> · بانتظار القبول</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={m.conversationScope || ""}
                          onChange={(e) => setMemberOverride(m, e.target.value)}
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-200 focus:border-brand-500 focus:outline-none"
                          aria-label="نطاق العضو"
                        >
                          <option value="">حسب الفريق ({SCOPE_LABEL[selected.conversationScope]})</option>
                          <option value="own_only">{SCOPE_LABEL.own_only}</option>
                          <option value="team">{SCOPE_LABEL.team}</option>
                          <option value="all">{SCOPE_LABEL.all}</option>
                        </select>
                        <button onClick={() => unassignMember(m)} className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-300" aria-label="إخراج من الفريق">
                          <UserMinus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 border-t border-white/[0.05] pt-4">
                  {unassigned.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      كل أعضاء مساحة العمل مُسندون إلى فرق. أضِف أعضاء جددًا من <a className="text-brand-300 underline" href="/dashboard/settings/team">إعدادات الفريق</a>.
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={addingMember} onChange={(e) => setAddingMember(e.target.value)} className={`${inp} max-w-xs`} aria-label="عضو بلا فريق">
                        <option value="">اختر عضوًا بلا فريق…</option>
                        {unassigned.map((m) => (
                          <option key={m.id} value={m.id}>{m.name || m.email} — {ROLE_LABEL[m.role] || m.role}</option>
                        ))}
                      </select>
                      <button onClick={() => assignMember(addingMember)} disabled={!addingMember} className="btn-primary inline-flex items-center gap-2">
                        <UserPlus className="h-4 w-4" /> إضافة للفريق
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
