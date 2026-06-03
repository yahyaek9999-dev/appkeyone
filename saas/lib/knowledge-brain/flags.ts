// AI Knowledge Brain — per-tenant gating flag.
//
// The feature is a paid add-on, OFF by default, and admin-gated per tenant via
// a boolean column on the User row (schema owned by the orchestrator). We read
// it through this one helper so callers never touch the column shape directly —
// if the column hasn't been migrated yet the `as any` keeps tsc + runtime happy
// (undefined -> falsy -> disabled), which is the safe default for a paid gate.

import { prisma } from "@/lib/db";

/** True only when the tenant (owner User) has the Knowledge Brain add-on enabled. */
export async function knowledgeBrainEnabled(uid: string): Promise<boolean> {
  // Defense-in-depth: if the column hasn't been migrated yet, Prisma throws a
  // PrismaClientValidationError ("Unknown field") rather than returning a falsy
  // value. We catch ANY error and fail closed (disabled) — a paid gate must
  // never 500 the page or default to "on" when the schema is mid-migration.
  try {
    const u = await prisma.user.findUnique({
      where: { id: uid },
      select: { knowledgeBrainEnabled: true } as any,
    });
    return !!(u as any)?.knowledgeBrainEnabled;
  } catch {
    return false;
  }
}
