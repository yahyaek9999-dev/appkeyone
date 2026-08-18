/**
 * PHASE 3 — NORMALIZE REGISTRY
 *
 * Merge the existing 61 features with the 13 hidden features.
 * Support feature hierarchy.
 * Output normalized registry with parent/child relationships.
 */

import { promises as fs } from "fs";

interface Feature {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  type: "feature" | "subfeature" | "admin_internal";
  category: string;
  parentFeature?: string;
  capability: string;
  requiredPlan: "start" | "growth" | "pro" | "enterprise";
  routes: string[];
  apiFamilies: string[];
  status: "implemented" | "beta" | "coming_soon" | "disabled" | "deprecated";
  implemented: boolean;
  customerVisible: boolean;
  adminVisible: boolean;
  discoverable: boolean;
  notes?: string;
}

async function main() {
  console.log("\n" + "═".repeat(70));
  console.log("PHASE 3 — NORMALIZE REGISTRY WITH HIERARCHY");
  console.log("═".repeat(70) + "\n");

  // Load existing registry
  const existingPath = "/Users/yahyaemad/Desktop/appkeyone/project-knowledge/master-feature-registry.json";
  const existingData = JSON.parse(await fs.readFile(existingPath, "utf-8"));

  const features: Feature[] = [];
  
  // Add existing 61 features
  for (const feat of existingData) {
    features.push({
      ...feat,
      type: "feature",
      discoverable: feat.routes && feat.routes.length > 0,
    });
  }

  console.log(`✓ Loaded ${features.length} existing features`);

  // Define the 13 hidden features with parent relationships
  const hiddenFeatures: Feature[] = [
    {
      id: "HIDDEN-001",
      key: "message_templates",
      nameEn: "Message Templates",
      nameAr: "قوالب الرسائل",
      type: "subfeature",
      category: "conversations",
      parentFeature: "FEAT-003",
      capability: "inbox",
      requiredPlan: "start",
      routes: [],
      apiFamilies: [],
      status: "implemented",
      implemented: true,
      customerVisible: true,
      adminVisible: true,
      discoverable: false,
      notes: "Embedded in Inbox and Automations",
    },
    {
      id: "HIDDEN-002",
      key: "message_routing",
      nameEn: "Message Routing",
      nameAr: "توجيه الرسائل",
      type: "subfeature",
      category: "conversations",
      parentFeature: "FEAT-048",
      capability: "team",
      requiredPlan: "pro",
      routes: [],
      apiFamilies: [],
      status: "implemented",
      implemented: true,
      customerVisible: true,
      adminVisible: true,
      discoverable: false,
      notes: "Embedded in Team Settings and Inbox",
    },
    {
      id: "HIDDEN-003",
      key: "employee_access_control",
      nameEn: "Employee Access Control",
      nameAr: "التحكم في وصول الموظفين",
      type: "subfeature",
      category: "settings",
      parentFeature: "FEAT-048",
      capability: "team",
      requiredPlan: "pro",
      routes: [],
      apiFamilies: [],
      status: "implemented",
      implemented: true,
      customerVisible: true,
      adminVisible: true,
      discoverable: false,
      notes: "Permissions and roles in Team Settings",
    },
    {
      id: "HIDDEN-004",
      key: "multi_whatsapp",
      nameEn: "Multi WhatsApp Support",
      nameAr: "دعم WhatsApp المتعدد",
      type: "subfeature",
      category: "conversations",
      parentFeature: "FEAT-049",
      capability: "multi_whatsapp",
      requiredPlan: "enterprise",
      routes: [],
      apiFamilies: [],
      status: "implemented",
      implemented: true,
      customerVisible: true,
      adminVisible: true,
      discoverable: false,
      notes: "Multiple WhatsApp accounts in Numbers Settings",
    },
    {
      id: "HIDDEN-005",
      key: "campaign_scheduling",
      nameEn: "Campaign Scheduling",
      nameAr: "جدولة الحملات",
      type: "subfeature",
      category: "marketing",
      parentFeature: "FEAT-016",
      capability: "broadcasts",
      requiredPlan: "growth",
      routes: [],
      apiFamilies: [],
      status: "implemented",
      implemented: true,
      customerVisible: true,
      adminVisible: true,
      discoverable: false,
      notes: "Schedule broadcasts in future",
    },
    {
      id: "HIDDEN-006",
      key: "sla_management",
      nameEn: "SLA Management",
      nameAr: "إدارة اتفاقيات مستويات الخدمة",
      type: "subfeature",
      category: "conversations",
      parentFeature: "FEAT-004",
      capability: "escalations",
      requiredPlan: "pro",
      routes: [],
      apiFamilies: [],
      status: "implemented",
      implemented: true,
      customerVisible: true,
      adminVisible: true,
      discoverable: false,
      notes: "SLA tracking in Escalations",
    },
    {
      id: "HIDDEN-007",
      key: "advanced_segmentation",
      nameEn: "Advanced Segmentation",
      nameAr: "تقسيم العملاء المتقدم",
      type: "subfeature",
      category: "customers",
      parentFeature: "FEAT-010",
      capability: "segmentation",
      requiredPlan: "pro",
      routes: [],
      apiFamilies: [],
      status: "implemented",
      implemented: true,
      customerVisible: true,
      adminVisible: true,
      discoverable: false,
      notes: "Advanced targeting rules",
    },
    {
      id: "HIDDEN-008",
      key: "sms_templates",
      nameEn: "SMS Templates",
      nameAr: "قوالب SMS",
      type: "subfeature",
      category: "marketing",
      parentFeature: "FEAT-018",
      capability: "sms",
      requiredPlan: "pro",
      routes: ["/dashboard/sms/templates"],
      apiFamilies: [],
      status: "implemented",
      implemented: true,
      customerVisible: true,
      adminVisible: true,
      discoverable: false,
      notes: "SMS templates in Settings",
    },
    {
      id: "HIDDEN-009",
      key: "sms_providers",
      nameEn: "SMS Providers",
      nameAr: "موفرو خدمات SMS",
      type: "subfeature",
      category: "marketing",
      parentFeature: "FEAT-018",
      capability: "sms",
      requiredPlan: "pro",
      routes: ["/dashboard/sms/providers"],
      apiFamilies: [],
      status: "implemented",
      implemented: true,
      customerVisible: true,
      adminVisible: true,
      discoverable: false,
      notes: "SMS provider configuration",
    },
    {
      id: "HIDDEN-010",
      key: "loyalty_and_rewards",
      nameEn: "Loyalty & Rewards",
      nameAr: "البرنامج ومكافآت الولاء",
      type: "subfeature",
      category: "sales",
      parentFeature: "FEAT-014",
      capability: "coupons",
      requiredPlan: "pro",
      routes: [],
      apiFamilies: [],
      status: "implemented",
      implemented: true,
      customerVisible: true,
      adminVisible: true,
      discoverable: false,
      notes: "Loyalty system in Coupons",
    },
    {
      id: "HIDDEN-011",
      key: "message_export",
      nameEn: "Message Export",
      nameAr: "تصدير الرسائل",
      type: "subfeature",
      category: "conversations",
      parentFeature: "FEAT-003",
      capability: "inbox",
      requiredPlan: "start",
      routes: [],
      apiFamilies: [],
      status: "implemented",
      implemented: true,
      customerVisible: true,
      adminVisible: true,
      discoverable: false,
      notes: "Export conversations",
    },
    {
      id: "HIDDEN-012",
      key: "broadcast_analytics",
      nameEn: "Broadcast Analytics",
      nameAr: "تحليلات الحملات",
      type: "subfeature",
      category: "marketing",
      parentFeature: "FEAT-016",
      capability: "broadcasts",
      requiredPlan: "growth",
      routes: [],
      apiFamilies: [],
      status: "implemented",
      implemented: true,
      customerVisible: true,
      adminVisible: true,
      discoverable: false,
      notes: "Analytics in Broadcasts",
    },
    {
      id: "HIDDEN-013",
      key: "customer_import_templates",
      nameEn: "Customer Import Templates",
      nameAr: "قوالب استيراد العملاء",
      type: "subfeature",
      category: "customers",
      parentFeature: "FEAT-011",
      capability: "customer_management",
      requiredPlan: "start",
      routes: [],
      apiFamilies: [],
      status: "implemented",
      implemented: true,
      customerVisible: true,
      adminVisible: true,
      discoverable: false,
      notes: "Import templates for bulk upload",
    },
  ];

  features.push(...hiddenFeatures);
  console.log(`✓ Added ${hiddenFeatures.length} hidden features`);

  // Add admin/internal features
  const adminFeatures: Feature[] = [
    {
      id: "ADMIN-001",
      key: "system_health",
      nameEn: "System Health",
      nameAr: "صحة النظام",
      type: "admin_internal",
      category: "admin",
      capability: "system_health",
      requiredPlan: "enterprise",
      routes: ["/dashboard/system-health"],
      apiFamilies: ["/api/health/*", "/api/monitoring/*"],
      status: "implemented",
      implemented: true,
      customerVisible: false,
      adminVisible: true,
      discoverable: true,
    },
    {
      id: "ADMIN-002",
      key: "audit_log",
      nameEn: "Audit Log",
      nameAr: "سجل التدقيق",
      type: "admin_internal",
      category: "settings",
      capability: "audit_log",
      requiredPlan: "pro",
      routes: ["/dashboard/audit-log"],
      apiFamilies: ["/api/audit-log/*"],
      status: "implemented",
      implemented: true,
      customerVisible: true,
      adminVisible: true,
      discoverable: true,
    },
    {
      id: "ADMIN-003",
      key: "white_label",
      nameEn: "White Label",
      nameAr: "الملصق الأبيض",
      type: "admin_internal",
      category: "settings",
      capability: "white_label",
      requiredPlan: "enterprise",
      routes: ["/dashboard/white-label"],
      apiFamilies: ["/api/white-label/*"],
      status: "implemented",
      implemented: true,
      customerVisible: false,
      adminVisible: true,
      discoverable: true,
    },
  ];

  features.push(...adminFeatures);
  console.log(`✓ Added ${adminFeatures.length} admin/internal features`);

  // Sort by ID
  features.sort((a, b) => a.id.localeCompare(b.id));

  // Write normalized registry
  const outputPath = "/Users/yahyaemad/Desktop/appkeyone/project-knowledge/master-feature-registry-v2.json";
  await fs.writeFile(outputPath, JSON.stringify(features, null, 2));

  console.log(`\n✓ Normalized registry written to: master-feature-registry-v2.json`);
  console.log(`\nSummary:`);
  console.log(`  Total features: ${features.length}`);
  console.log(`  Core features: ${features.filter(f => f.type === "feature").length}`);
  console.log(`  Sub-features: ${features.filter(f => f.type === "subfeature").length}`);
  console.log(`  Admin/internal: ${features.filter(f => f.type === "admin_internal").length}`);
  console.log(`  Implemented: ${features.filter(f => f.implemented).length}`);
  console.log(`  Discoverable: ${features.filter(f => f.discoverable).length}`);
  console.log(`  Hidden: ${features.filter(f => !f.discoverable && f.type !== "admin_internal").length}`);
}

main().catch(console.error);
