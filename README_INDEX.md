# KEYONE — Documentation Index

> **Live:** `https://w.keyone1.com` — `app.keyone1.com` does not resolve; do not use it anywhere (confirmed dead, see [project-knowledge/PROJECT_CONTEXT.md](project-knowledge/PROJECT_CONTEXT.md)). For the current deploy command, deployed-commit check, and infra facts, see [project-knowledge/DEPLOYMENT_RULES.md](project-knowledge/DEPLOYMENT_RULES.md) — not the table below, which describes the retired Windows-VPS workflow.

## 📋 Master Document (Start Here)

| Document | Location | Description |
|----------|----------|-------------|
| **Master State Export** | [`project-knowledge/KEYONE_MASTER_STATE_EXPORT.md`](project-knowledge/KEYONE_MASTER_STATE_EXPORT.md) | Complete platform overview, feature inventory, architecture, production status, gaps, and launch readiness |

## 🏗️ Architecture & Reference

| Document | Location | Description |
|----------|----------|-------------|
| Feature Overview | [`project-knowledge/KEYONE_FEATURES.md`](project-knowledge/KEYONE_FEATURES.md) | Comprehensive feature list |
| Product Overview | [`project-knowledge/KEYONE_FULL_PRODUCT_OVERVIEW.md`](project-knowledge/KEYONE_FULL_PRODUCT_OVERVIEW.md) | Full product description, target market, user journey |
| Pricing Plans | [`PRICING_PLANS.md`](PRICING_PLANS.md) | Plan tiers and pricing |
| Deploy Runbook | [`deploy/RUNBOOK.md`](deploy/RUNBOOK.md) | Production operations guide |

## 🚀 Deployment

Current: `deploy/release-aws.sh [commit-ish]` deploys to the AWS production box. Full contract in [project-knowledge/DEPLOYMENT_RULES.md](project-knowledge/DEPLOYMENT_RULES.md).

The files below (`deploy.sh`, `deploy/deploy.ps1`, `deploy/deploy-safe.ps1`, `deploy/health-check.ps1`, `deploy/build.sh`, `deploy/release.sh`, `deploy/rollback-release.sh`) target the **retired** Windows VPS — do not run them.

| File | Purpose |
|------|---------|
| [`deploy/release-aws.sh`](deploy/release-aws.sh) | Current production deploy (AWS) |
| [`deploy/publish-wwebjs.sh`](deploy/publish-wwebjs.sh) | Publish a new Bridge customer-daemon release |
| [`deploy/Caddyfile`](deploy/Caddyfile) | Caddy v2 reverse proxy config |
| [`deploy/env.saas.example`](deploy/env.saas.example) | SaaS environment variable template |

## 📁 Repository Structure

| Document | Location | Description |
|----------|----------|-------------|
| Repo Cleanup Report | [`project-knowledge/KEYONE_REPO_CLEANUP_REPORT.md`](project-knowledge/KEYONE_REPO_CLEANUP_REPORT.md) | What was cleaned up and why |
| Repo Structure Guide | [`project-knowledge/KEYONE_REPO_STRUCTURE.md`](project-knowledge/KEYONE_REPO_STRUCTURE.md) | Folder tree, critical files, onboarding notes |

## 📦 Deliverable Reports

| Report | Date | Description |
|--------|------|-------------|
| [Growth Suite Phase 1](keyone-growth-suite-report.md) | 2026-06-02 | Catalog, coupons, shipping, digest, team inbox |
| [AI Sales OS](project-knowledge/archive/keyone-ai-sales-suite-report.md) | 2026-06-01 | Funnel, segmentation, forecast, broadcast AI |
| [Customer 360](project-knowledge/archive/keyone-customer-360-report.md) | 2026-06-01 | CRM profile, timeline, admin controls |

## 🗄️ Archived Docs

Older reference documentation has been moved to [`project-knowledge/archive/`](project-knowledge/archive/) including:
- Architecture overviews (pre-master-export)
- Deployment guides (pre-master-export)
- Flow diagrams
- API maps, cron job maps, database maps
- Audit reports (security, performance, anti-ban, scaling)
- AI agent prompts for development workflows
- Testing checklists and regression risk docs

These are preserved for reference but superseded by the Master State Export.
