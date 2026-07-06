// lib/readiness/verticals.ts — Business-Type-aware readiness/onboarding steps.
//
// The dashboard home renders two checklists:
//   • _activation-checklist.tsx (milestone-driven — ActivationMilestone keys)
//   • _getting-started.tsx       (heuristic-driven — GettingStartedSteps keys)
//
// Historically both hardcode a commerce journey ("أضف منتجاتك", "أول طلب",
// "أول حملة"). A software company, agency, clinic, etc. should never be nagged
// to add products or extract a first order. This module owns, per-vertical:
//   1. WHICH step keys are relevant (the rest are dropped), gated by the live
//      module map so a merchant who explicitly turned a module off also loses
//      its step;
//   2. LABEL / description / CTA overrides so the surviving steps read right for
//      the vertical (e.g. "أضف منتجاتك" → "أضف خدماتك" / "ابنِ قاعدة المعرفة").
//
// Pure + data-only: no prisma, no React, safe in client and server. Backward
// compatible: the Store vertical keeps every step with today's exact labels, and
// the helpers accept a null/undefined module map (→ treat every module ON).

import type { Vertical, ModuleKey } from "@/lib/modules";
import { DEFAULT_VERTICAL } from "@/lib/modules";

// ── Step key unions (mirror the two checklist components — do NOT redefine
//    the components' own types; these are just the string literals). ──────────

/** Keys used by _activation-checklist.tsx (subset of ActivationMilestone). */
export type ActivationStepKey =
  | "signed_up"
  | "onboarding_completed"
  | "whatsapp_connected"
  | "first_ai_reply_sent"
  | "first_order_extracted"
  | "first_broadcast_sent";

/** Keys used by _getting-started.tsx (GettingStartedSteps). */
export type GettingStartedStepKey =
  | "whatsapp"
  | "aiBot"
  | "knowledge"
  | "store"
  | "campaign";

/** A per-vertical override for a single step. Any field left undefined keeps the
 *  component's own hardcoded default for that step. */
export interface StepOverride {
  title?: string;
  desc?: string;
  cta?: string;
  /** Force optional/required. undefined = keep component default. */
  optional?: boolean;
}

/**
 * Which MODULE (if any) a step depends on. When that module is OFF in the live
 * module map, the step is dropped. Steps with no module dependency (account /
 * bot / whatsapp / ai) are ALWAYS kept — we never hide the core activation path.
 */
const ACTIVATION_STEP_MODULE: Partial<Record<ActivationStepKey, ModuleKey>> = {
  first_order_extracted: "orders",
  first_broadcast_sent: "broadcasts",
};

const GETTING_STARTED_STEP_MODULE: Partial<Record<GettingStartedStepKey, ModuleKey>> = {
  // "knowledge" = add products / services / knowledge base. Kept unless BOTH
  // products and knowledge_base are off (handled specially below) — see keepGS.
  store: "products",       // "اربط متجرك" only makes sense for commerce verticals
  campaign: "broadcasts",
};

// ── Per-vertical label overrides. Only the keys that need to READ differently
//    per vertical are listed; everything else falls back to the component's own
//    Arabic default (i.e. the Store copy). ────────────────────────────────────

interface VerticalReadiness {
  activation?: Partial<Record<ActivationStepKey, StepOverride>>;
  gettingStarted?: Partial<Record<GettingStartedStepKey, StepOverride>>;
}

// Common relabels reused by several service/knowledge verticals.
const SERVICES_GS_KNOWLEDGE: StepOverride = {
  title: "أضف خدماتك",
  desc: "الخدمات، الأسعار، والأسئلة الشائعة.",
  cta: "إضافة",
};
const KB_GS_KNOWLEDGE: StepOverride = {
  title: "ابنِ قاعدة المعرفة",
  desc: "أضف المعلومات والأسئلة الشائعة ليجيب البوت بدقة.",
  cta: "إضافة",
};

const VERTICAL_READINESS: Partial<Record<Vertical, VerticalReadiness>> = {
  // Store / Manufacturing / Other → no overrides → identical to today.
  Restaurant: {
    gettingStarted: {
      knowledge: { title: "أضف قائمة الطعام", desc: "الأصناف، الأسعار، والإضافات.", cta: "إضافة" },
    },
  },
  Agency: {
    activation: {
      onboarding_completed: { title: "إعداد المساعد", desc: "حدّد اسم وكالتك وأسلوب الرد." },
    },
    gettingStarted: {
      knowledge: { title: "أضف خدماتك", desc: "الباقات، الأسعار، ونماذج الأعمال.", cta: "إضافة" },
    },
  },
  Software: {
    activation: {
      onboarding_completed: { title: "إعداد المساعد", desc: "حدّد اسم منتجك وأسلوب الرد." },
    },
    gettingStarted: { knowledge: KB_GS_KNOWLEDGE },
  },
  Medical: {
    activation: {
      onboarding_completed: { title: "إعداد المساعد", desc: "حدّد اسم العيادة وأسلوب الرد." },
    },
    gettingStarted: {
      knowledge: { title: "أضف خدماتك وأطبّاءك", desc: "الخدمات، الأطبّاء، ومواعيد العمل.", cta: "إضافة" },
    },
  },
  Education: {
    gettingStarted: {
      knowledge: { title: "أضف دوراتك", desc: "الدورات، الأسعار، والأسئلة الشائعة.", cta: "إضافة" },
    },
  },
  Services: {
    activation: {
      onboarding_completed: { title: "إعداد المساعد", desc: "حدّد اسم نشاطك وأسلوب الرد." },
    },
    gettingStarted: { knowledge: SERVICES_GS_KNOWLEDGE },
  },
  RealEstate: {
    gettingStarted: {
      knowledge: { title: "أضف عقاراتك", desc: "الوحدات، الأسعار، والمواصفات.", cta: "إضافة" },
    },
  },
};

// ── Module-map helper: undefined/null map means "all modules ON" (back-compat).
function isOn(modules: Partial<Record<ModuleKey, boolean>> | null | undefined, m: ModuleKey): boolean {
  if (!modules) return true;
  return modules[m] !== false;
}

/**
 * Keep-decision + override for a single ACTIVATION step.
 * Returns null when the step should be dropped for this vertical/module map.
 */
export function activationStep(
  key: ActivationStepKey,
  vertical: Vertical = DEFAULT_VERTICAL,
  modules?: Partial<Record<ModuleKey, boolean>> | null,
): { keep: boolean; override?: StepOverride } {
  const dep = ACTIVATION_STEP_MODULE[key];
  const keep = dep ? isOn(modules, dep) : true;
  const override = VERTICAL_READINESS[vertical]?.activation?.[key];
  return { keep, override };
}

/**
 * Keep-decision + override for a single GETTING-STARTED step.
 * Returns keep=false when the step should be dropped for this vertical/module map.
 */
export function gettingStartedStep(
  key: GettingStartedStepKey,
  vertical: Vertical = DEFAULT_VERTICAL,
  modules?: Partial<Record<ModuleKey, boolean>> | null,
): { keep: boolean; override?: StepOverride } {
  let keep = true;
  if (key === "knowledge") {
    // The "add products/services/knowledge" step survives if EITHER products OR
    // knowledge_base is on — pure-service verticals keep it via knowledge_base.
    keep = isOn(modules, "products") || isOn(modules, "knowledge_base");
  } else {
    const dep = GETTING_STARTED_STEP_MODULE[key];
    keep = dep ? isOn(modules, dep) : true;
  }
  const override = VERTICAL_READINESS[vertical]?.gettingStarted?.[key];
  return { keep, override };
}

/**
 * Generic filter+relabel over an ARRAY of steps keyed by `key`. Each surviving
 * step gets the vertical's overrides shallow-merged on top of its original
 * fields. Used by both checklist components so filtering logic lives in one
 * place. `kind` selects which registry (activation vs getting-started) applies.
 */
export function verticalSteps<T extends { key: string; optional?: boolean }>(
  steps: readonly T[],
  kind: "activation" | "gettingStarted",
  vertical: Vertical = DEFAULT_VERTICAL,
  modules?: Partial<Record<ModuleKey, boolean>> | null,
): T[] {
  const out: T[] = [];
  for (const step of steps) {
    const decision =
      kind === "activation"
        ? activationStep(step.key as ActivationStepKey, vertical, modules)
        : gettingStartedStep(step.key as GettingStartedStepKey, vertical, modules);
    if (!decision.keep) continue;
    if (decision.override) {
      out.push({ ...step, ...pruneUndefined(decision.override) } as T);
    } else {
      out.push(step);
    }
  }
  return out;
}

/** Drop undefined keys so a `{ title: undefined }` override never blanks a field. */
function pruneUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k in o) {
    const v = (o as any)[k];
    if (v !== undefined) (out as any)[k] = v;
  }
  return out;
}
