// lib/business-context.ts — resolve a tenant's Business Type + module map.
//
// One server-side read that every adaptive surface consults (sidebar, dashboard
// home, readiness, AI recommendations). Fail-safe: on any error it returns the
// Store vertical with all modules ON, so a DB hiccup never blanks the UI.

import { prisma } from "@/lib/db";
import { resolveVertical, moduleMap, DEFAULT_VERTICAL, type Vertical, type ModuleKey } from "@/lib/modules";

export interface BusinessContext {
  vertical: Vertical;
  /** moduleKey -> enabled (already merged: vertical defaults + explicit overrides). */
  modules: Record<ModuleKey, boolean>;
  /** raw stored values, for the settings editor. */
  businessTypeRaw: string | null;
  enabledModulesRaw: string | null;
}

const ALL_ON = (): Record<ModuleKey, boolean> => moduleMap(DEFAULT_VERTICAL, null);

/** Resolve the business context for a tenant (owner userId). Never throws. */
export async function resolveBusinessContext(userId: string): Promise<BusinessContext> {
  if (!userId) return { vertical: DEFAULT_VERTICAL, modules: ALL_ON(), businessTypeRaw: null, enabledModulesRaw: null };
  let bp: { businessType: string | null; enabledModules: string | null } | null = null;
  try {
    bp = await (prisma as any).businessProfile.findUnique({
      where: { userId },
      select: { businessType: true, enabledModules: true },
    });
  } catch {
    bp = null;
  }
  const vertical = resolveVertical(bp?.businessType);
  return {
    vertical,
    modules: moduleMap(vertical, bp?.enabledModules ?? null),
    businessTypeRaw: bp?.businessType ?? null,
    enabledModulesRaw: bp?.enabledModules ?? null,
  };
}

/** Convenience: just the vertical (defaults to Store). */
export function getBusinessType(raw?: string | null): Vertical {
  return resolveVertical(raw);
}
