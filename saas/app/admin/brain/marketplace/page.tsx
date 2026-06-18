/** /admin/brain/marketplace — Brain Marketplace (Phase 9): enable/disable/price. */
import { listMarketplace } from "@/lib/brain/marketplace";
import MarketplaceClient from "./marketplace-client";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const rows = await listMarketplace();
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">متجر الأدمغة (Brain Marketplace)</h1>
      <p className="page-desc">أدمغة القطاعات — يمكن للأدمن التفعيل/التعطيل والتسعير.</p>
      <MarketplaceClient initial={JSON.parse(JSON.stringify(rows))} />
    </div>
  );
}
