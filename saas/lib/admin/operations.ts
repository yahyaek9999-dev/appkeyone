/** lib/admin/operations.ts — Production Operations Center aggregation (Phase 13). */
import { getExecutiveStats } from "./executive";
import { getIncidentStats } from "@/lib/incidents/engine";
import { getStaffStats } from "@/lib/staff/staff";
import { getProofStats } from "@/lib/payments-ops/proofs";

export async function getOperationsCenter() {
  const [exec, incidents, staff, proofs] = await Promise.all([
    getExecutiveStats().catch(() => null),
    getIncidentStats().catch(() => null),
    getStaffStats().catch(() => null),
    getProofStats().catch(() => null),
  ]);
  return { exec, incidents, staff, proofs };
}
