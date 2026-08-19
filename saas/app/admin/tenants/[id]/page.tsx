// /admin/tenants/[id] — Tenant 360.
// Unified real-data view of one tenant (workspace owner). Admin-only (enforced
// by app/admin/layout.tsx). 404s cleanly when the tenant does not exist.
import { notFound } from "next/navigation";
import { loadTenant360 } from "./loader";
import Tenant360View from "./tenant-360";

export const dynamic = "force-dynamic";

export default async function TenantDetailPage({ params }: { params: { id: string } }) {
  const data = await loadTenant360(params.id);
  if (!data) notFound();
  return <Tenant360View data={data} />;
}
