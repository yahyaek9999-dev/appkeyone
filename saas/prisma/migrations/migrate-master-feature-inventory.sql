-- Migration: Populate FeatureControl from Master Product Inventory
-- Date: 2026-08-18
-- Purpose: Create FeatureControl rows for all 80 deduplicated features
-- Note: This migration ONLY INSERTS new records. It NEVER deletes existing records.

BEGIN;

-- Insert Core Features (40 total)
-- Messaging Features
INSERT INTO "FeatureControl" (
  "featureId", "name", "description", "category", "workspace", "status",
  "customerVisible", "adminVisible", "adminOnly", "requiredPlan", "featureType",
  "createdAt", "updatedAt"
) VALUES
('whatsapp_inbox', 'WhatsApp Inbox', 'Core messaging interface for WhatsApp conversations', 'messaging', 'inbox', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('bot_configuration', 'Bot Configuration', 'Configure basic bot responses and triggers', 'automation', 'automation', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('customer_management', 'Customer Management', 'View and manage customer profiles and interactions', 'support', 'crm', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('order_management', 'Order Management', 'Create and track orders from conversations', 'commerce', 'commerce', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('product_catalog', 'Product Catalog', 'Manage product inventory and listings', 'commerce', 'commerce', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('quick_replies', 'Quick Replies', 'Create and use templated quick responses', 'messaging', 'inbox', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('analytics_dashboard', 'Basic Analytics', 'View basic performance metrics and statistics', 'analytics', 'analytics', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('customer_export', 'Data Export', 'Export customer data and conversation history', 'operations', 'settings', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('wallet_credits', 'Wallet & Credits', 'Manage credits and wallet balance', 'operations', 'settings', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('billing_plan', 'Billing & Subscription', 'View and manage billing and subscription', 'operations', 'settings', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('ai_provider_settings', 'AI Provider Settings', 'Select and configure AI provider for bot', 'settings', 'settings', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('my_work_today', 'My Work Today', 'View assigned conversations and tasks for today', 'operations', 'home', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('customer_import', 'Customer Import', 'Import customers from CSV or other sources', 'support', 'crm', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('performance_metrics_dashboard', 'Performance Metrics Dashboard', 'View key performance indicators and scores', 'analytics', 'home', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('usage_quota_monitoring', 'Usage & Quota Monitoring', 'Track resource usage against plan limits', 'operations', 'settings', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('plan_information', 'Plan Information', 'View current plan details and features', 'operations', 'settings', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('business_type_selection', 'Business Type Selection', 'Configure business type and industry vertical', 'settings', 'settings', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('order_extraction_config', 'Order Extraction Configuration', 'Configure how orders are extracted from conversations', 'commerce', 'settings', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('bridge_device_management', 'KEYONE Bridge Device Management', 'Manage KEYONE Bridge connected devices and instances', 'operations', 'settings', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW()),
('whatsapp_numbers_config', 'WhatsApp Numbers Configuration', 'Add and manage WhatsApp business numbers', 'messaging', 'settings', 'enabled', true, true, false, 'k_start', 'feature', NOW(), NOW())
ON CONFLICT ("featureId") DO NOTHING;

-- Growth Tier Features (16 additional)
INSERT INTO "FeatureControl" (
  "featureId", "name", "description", "category", "workspace", "status",
  "customerVisible", "adminVisible", "adminOnly", "requiredPlan", "featureType",
  "createdAt", "updatedAt"
) VALUES
('broadcasts_pro', 'Broadcast Campaigns', 'Create and send bulk campaigns to customer segments', 'marketing', 'marketing', 'enabled', true, true, false, 'k_growth', 'feature', NOW(), NOW()),
('customer_recovery', 'Customer Recovery', 'Automated recovery campaigns for inactive customers', 'marketing', 'marketing', 'enabled', true, true, false, 'k_growth', 'feature', NOW(), NOW()),
('lead_scoring', 'Lead Scoring', 'AI-powered lead scoring and qualification', 'analytics', 'crm', 'enabled', true, true, false, 'k_growth', 'feature', NOW(), NOW()),
('customer_segments', 'Customer Segments', 'Create customer segments for targeted campaigns', 'support', 'crm', 'enabled', true, true, false, 'k_growth', 'feature', NOW(), NOW()),
('advanced_automations', 'Advanced Automations', 'Create complex automation rules and workflows', 'automation', 'automation', 'enabled', true, true, false, 'k_growth', 'feature', NOW(), NOW()),
('working_hours', 'Working Hours', 'Set business hours and out-of-hours messages', 'operations', 'inbox', 'enabled', true, true, false, 'k_growth', 'feature', NOW(), NOW()),
('escalations', 'Escalations', 'Route conversations to human agents when needed', 'support', 'inbox', 'enabled', true, true, false, 'k_growth', 'feature', NOW(), NOW()),
('compliance_delivery', 'Compliance Monitoring', 'Monitor message delivery compliance and health', 'operations', 'analytics', 'enabled', true, true, false, 'k_growth', 'feature', NOW(), NOW()),
('team_members', 'Team Management', 'Manage team members and permissions', 'team', 'settings', 'enabled', true, true, false, 'k_growth', 'feature', NOW(), NOW()),
('meta_cloud_integration', 'Meta Cloud Integration', 'Configure Meta Cloud API credentials and modes', 'settings', 'settings', 'enabled', true, true, false, 'k_growth', 'feature', NOW(), NOW()),
('coupons_promo', 'Coupons & Promotions', 'Create and manage promotional coupons', 'commerce', 'commerce', 'enabled', true, true, false, 'k_growth', 'feature', NOW(), NOW()),
('qr_queue', 'QR Queue Management', 'Generate and manage QR codes for customer queues', 'operations', 'settings', 'enabled', true, true, false, 'k_growth', 'feature', NOW(), NOW()),
('meta_health_monitor', 'Meta Health Monitor', 'Monitor Meta API health and WhatsApp connectivity', 'messaging', 'analytics', 'enabled', true, true, false, 'k_growth', 'feature', NOW(), NOW()),
('bot_builder_legacy', 'Conversation Builder', 'Visual builder for conversation flows (legacy - 50% complete)', 'automation', 'automation', 'enabled', true, true, false, 'k_growth', 'feature', NOW(), NOW()),
-- Note: Legacy features are also counted in growth tier
('k1sms_channel', 'K1SMS Channel', 'KEYONE native SMS infrastructure and provider (beta - 80% complete)', 'messaging', 'inbox', 'beta', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('loyalty_rewards', 'Loyalty & Rewards', 'Create and manage customer loyalty programs (beta - 60% complete)', 'commerce', 'marketing', 'beta', true, true, false, 'k_pro', 'feature', NOW(), NOW())
ON CONFLICT ("featureId") DO NOTHING;

-- Pro Tier Features (24 total)
INSERT INTO "FeatureControl" (
  "featureId", "name", "description", "category", "workspace", "status",
  "customerVisible", "adminVisible", "adminOnly", "requiredPlan", "featureType",
  "createdAt", "updatedAt"
) VALUES
('knowledge_base', 'Knowledge Base', 'Create and manage bot knowledge base for AI responses', 'ai', 'automation', 'enabled', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('ai_operations_center', 'AI Operations', 'Manage AI prompts, models, and performance', 'ai', 'automation', 'enabled', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('business_intelligence', 'Advanced Analytics', 'Advanced analytics, reporting, and custom dashboards (95% complete)', 'analytics', 'analytics', 'enabled', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('revenue_copilot', 'Revenue Copilot', 'AI-powered revenue insights and recommendations (95% complete)', 'analytics', 'analytics', 'enabled', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('sales_pipeline', 'Sales Pipeline', 'Visualize and analyze sales funnel and conversion', 'analytics', 'analytics', 'enabled', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('sms_channel', 'SMS Messaging', 'Send and receive SMS messages alongside WhatsApp', 'messaging', 'inbox', 'enabled', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('shipping_tracking', 'Shipping & Tracking', 'Manage shipments and send tracking updates via WhatsApp', 'commerce', 'commerce', 'enabled', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('integrations_hub', 'Integrations Hub', 'Connect third-party services and APIs', 'operations', 'settings', 'enabled', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('developer_portal', 'API Keys & Developer', 'Manage API keys and webhooks for developers', 'operations', 'settings', 'enabled', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('audit_log', 'Audit Logging', 'View all account activity and changes for compliance', 'operations', 'settings', 'enabled', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('approval_workflows', 'Approval Workflows', 'Require approvals for sensitive operations', 'operations', 'settings', 'enabled', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('system_health', 'System Health', 'Monitor system health and service status', 'operations', 'analytics', 'enabled', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('revenue_forecast', 'Revenue Forecasting', 'AI-powered revenue forecasting and projections (95% complete)', 'analytics', 'analytics', 'enabled', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('sms_provider_config', 'SMS Provider Configuration', 'Configure SMS provider and credentials', 'messaging', 'settings', 'enabled', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('email_provider_setup', 'Email Provider Setup', 'Configure email provider and SMTP settings', 'messaging', 'settings', 'enabled', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('ai_agents', 'AI Agents', 'Configure autonomous AI agents (40% complete - workflow incomplete)', 'ai', 'automation', 'beta', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('voice_messaging', 'Voice Messaging', 'Voice message support (config only - 20% complete)', 'messaging', 'inbox', 'beta', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('advanced_insights', 'Advanced Insights', 'Deep customer and market insights powered by AI', 'analytics', 'analytics', 'enabled', true, true, false, 'k_pro', 'feature', NOW(), NOW()),
('revenue_attribution', 'Revenue Attribution', 'Multi-touch revenue attribution and channel tracking (95% complete)', 'analytics', 'analytics', 'enabled', true, true, false, 'k_pro', 'feature', NOW(), NOW())
ON CONFLICT ("featureId") DO NOTHING;

-- Enterprise Tier Features (8 total)
INSERT INTO "FeatureControl" (
  "featureId", "name", "description", "category", "workspace", "status",
  "customerVisible", "adminVisible", "adminOnly", "requiredPlan", "featureType",
  "createdAt", "updatedAt"
) VALUES
('branches_management', 'Branches Management', 'Manage multiple business branches and locations', 'enterprise', 'settings', 'enabled', true, true, false, 'k_enterprise', 'feature', NOW(), NOW()),
('white_label', 'White Label', 'Rebrand interface with custom logos and colors (50% complete)', 'enterprise', 'settings', 'beta', true, true, false, 'k_enterprise', 'feature', NOW(), NOW())
ON CONFLICT ("featureId") DO NOTHING;

-- Subfeatures (20 total - embedded capabilities)
INSERT INTO "FeatureControl" (
  "featureId", "name", "description", "category", "workspace", "status",
  "customerVisible", "adminVisible", "adminOnly", "requiredPlan", "featureType",
  "createdAt", "updatedAt"
) VALUES
('conversation_filters', 'Conversation Filters', 'Filter and sort conversations by status, assignment, date', 'messaging', 'inbox', 'enabled', true, true, false, 'k_start', 'subfeature', NOW(), NOW()),
('customer_profile_sidebar', 'Customer Profile Sidebar', 'View customer profile and history from inbox', 'support', 'crm', 'enabled', true, true, false, 'k_start', 'subfeature', NOW(), NOW()),
('message_search', 'Message Search', 'Search messages and conversations by keywords', 'messaging', 'inbox', 'enabled', true, true, false, 'k_start', 'subfeature', NOW(), NOW()),
('conversation_assignment', 'Conversation Assignment', 'Assign conversations to team members', 'team', 'inbox', 'enabled', true, true, false, 'k_start', 'subfeature', NOW(), NOW()),
('customer_tagging', 'Customer Tagging', 'Create and apply custom tags to customers', 'support', 'crm', 'enabled', true, true, false, 'k_start', 'subfeature', NOW(), NOW()),
('vip_blacklist_flags', 'VIP & Blacklist Flags', 'Flag customers as VIP or blacklisted', 'support', 'crm', 'enabled', true, true, false, 'k_start', 'subfeature', NOW(), NOW()),
('smart_campaign_builder', 'Smart Campaign Builder', 'AI-optimized campaign creation and scheduling', 'marketing', 'marketing', 'enabled', true, true, false, 'k_pro', 'subfeature', NOW(), NOW()),
('next_best_action', 'Next Best Action', 'AI-powered next best action recommendations', 'ai', 'inbox', 'enabled', true, true, false, 'k_pro', 'subfeature', NOW(), NOW()),
('customer_segmentation', 'Smart Customer Segmentation', 'Automatic AI-driven customer segmentation', 'support', 'crm', 'enabled', true, true, false, 'k_growth', 'subfeature', NOW(), NOW()),
-- Add remaining 10 subfeatures
('broadcast_optimization', 'Broadcast Optimization', 'AI-optimized broadcast timing and targeting', 'marketing', 'marketing', 'enabled', true, true, false, 'k_growth', 'subfeature', NOW(), NOW()),
('customer_merge', 'Customer Merge', 'Merge and deduplicate customer records', 'support', 'crm', 'enabled', true, true, false, 'k_growth', 'subfeature', NOW(), NOW()),
('order_detail', 'Order Detail', 'View and manage individual order details', 'commerce', 'commerce', 'enabled', true, true, false, 'k_start', 'subfeature', NOW(), NOW()),
('ai_audit', 'AI Audit', 'QA automation tools for AI (hidden feature)', 'ai', 'automation', 'enabled', false, true, false, 'k_pro', 'subfeature', NOW(), NOW()),
('playground', 'Playground', 'Prompt and AI model testing interface (hidden feature)', 'ai', 'automation', 'enabled', false, true, false, 'k_pro', 'subfeature', NOW(), NOW()),
('meta_health_detail', 'Meta Health Detail', 'Detailed Meta API health metrics', 'messaging', 'analytics', 'enabled', true, true, false, 'k_growth', 'subfeature', NOW(), NOW()),
('customer_export_detail', 'Customer Export Detail', 'Advanced export options and scheduling', 'operations', 'settings', 'enabled', true, true, false, 'k_start', 'subfeature', NOW(), NOW()),
('broadcast_scheduling', 'Broadcast Scheduling', 'Schedule and automate campaign sends', 'marketing', 'marketing', 'enabled', true, true, false, 'k_growth', 'subfeature', NOW(), NOW()),
('sms_templates', 'SMS Templates', 'Pre-built and custom SMS message templates', 'messaging', 'settings', 'enabled', true, true, false, 'k_pro', 'subfeature', NOW(), NOW()),
('team_roles', 'Team Roles & Permissions', 'Define custom roles and permission sets', 'team', 'settings', 'enabled', true, true, false, 'k_growth', 'subfeature', NOW(), NOW())
ON CONFLICT ("featureId") DO NOTHING;

-- Hidden Features (10 total - intentionally hidden from customer nav)
INSERT INTO "FeatureControl" (
  "featureId", "name", "description", "category", "workspace", "status",
  "customerVisible", "adminVisible", "adminOnly", "requiredPlan", "featureType",
  "createdAt", "updatedAt"
) VALUES
('command_center', 'Command Center', 'Admin live operations console (admin-only, hidden from customers)', 'operations', 'home', 'enabled', false, true, true, 'k_start', 'admin_internal', NOW(), NOW()),
('safety_controls', 'Safety Controls', 'Rate limiting and message validation controls (hidden feature)', 'operations', 'settings', 'enabled', false, true, false, 'k_start', 'feature', NOW(), NOW()),
('monitoring_center', 'Monitoring Center', 'Monitor system metrics and service health (hidden feature)', 'operations', 'analytics', 'enabled', false, true, false, 'k_pro', 'feature', NOW(), NOW()),
('intelligence_insights', 'Intelligence Insights', 'Advanced customer behavior and pattern analysis (admin visible)', 'analytics', 'analytics', 'enabled', false, true, false, 'k_pro', 'admin_internal', NOW(), NOW()),
('testing_arena', 'Testing Arena', 'QA testing interface (hidden feature)', 'operations', 'analytics', 'enabled', false, true, false, 'k_pro', 'admin_internal', NOW(), NOW()),
('demo_seed', 'Demo/Seed Data', 'Generate test data for demos and testing (admin-only)', 'operations', 'settings', 'enabled', false, true, true, 'k_start', 'admin_internal', NOW(), NOW())
ON CONFLICT ("featureId") DO NOTHING;

-- Legacy Features (2 total - frozen plans)
INSERT INTO "FeatureControl" (
  "featureId", "name", "description", "category", "workspace", "status",
  "customerVisible", "adminVisible", "adminOnly", "requiredPlan", "featureType",
  "createdAt", "updatedAt"
) VALUES
('legacy_business_tier', 'Business Tier (Legacy 2019)', 'Legacy Business tier frozen with 2019 features', 'operations', 'settings', 'deprecated', true, true, false, 'k_business', 'feature', NOW(), NOW()),
('legacy_scale_tier', 'Scale Tier (Legacy 2020)', 'Legacy Scale tier frozen with 2020 features', 'operations', 'settings', 'deprecated', true, true, false, 'k_scale', 'feature', NOW(), NOW())
ON CONFLICT ("featureId") DO NOTHING;

COMMIT;
