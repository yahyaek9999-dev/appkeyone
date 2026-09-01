# Domain Migration — Additional Findings

**Date:** 2026-09-01  
**Scope:** Secondary domain references discovered after initial inventory

---

## 1. Deployment Scripts

### 1.1 `deploy/release-aws.sh`

**Line 27:** Comment with default URL  
```bash
#   KEYONE_URL       (default https://w.keyone1.com)
```

**Line 34:** Hardcoded fallback  
```bash
URL="${KEYONE_URL:-https://w.keyone1.com}"
```

**Migration Risk:** **MEDIUM** - This is used in the deployment process  
**Required Action:**
1. Update default to new domain
2. Keep environment variable override for flexibility
3. Test deployment script with new URL

---

### 1.2 `deploy/release-git.sh`

**Line 37:** Health check URL  
```bash
HEALTH_URL="${HEALTH_URL:-https://app.keyone1.com/api/ready}"
```

**Migration Risk:** **MEDIUM** - Pre-deployment health verification  
**Required Action:**
1. Update to new domain (e.g., `https://wkeyone.app/api/ready`)
2. Test health endpoint on staging

---

### 1.3 `deploy/vps-docker-setup.sh`

**Line 87:** Environment setup for Docker  
```bash
NEXT_PUBLIC_SITE_URL=https://app.keyone1.com
```

**Migration Risk:** **HIGH** - This is used when spinning up new servers  
**Required Action:**
1. Update hardcoded value to new domain
2. This script is run during infrastructure provisioning—must be updated before deploying to new server
3. OR convert to use environment variable injection

---

### 1.4 `deploy/deploy.sh`

**Line 230:** Smoke test instructions  
```bash
echo -e "${CYN}Next: smoke test https://app.keyone1.com/login and /admin/metrics${RST}"
```

**Migration Risk:** **LOW** - Just a console output/reminder  
**Required Action:** Update for team convenience (not critical)

---

### 1.5 `deploy/publish-downloads.sh`

**Line 15:** Comment about downloads URL  
```bash
# NO GitHub. Serves at https://w.keyone1.com/downloads/keyone-bridge/.
```

**Migration Risk:** **MEDIUM** - Bridge downloads must be accessible  
**Required Action:**
1. Verify downloads are served at correct path on new domain
2. Update documentation/comments

---

## 2. Bridge Packaging & Installer Scripts

### 2.1 `bridge-node/packaging/linux/build-deb.sh`

**Line 22:** Maintainer email  
```bash
Maintainer: KEYONE <support@keyone1.com>
```

**Migration Risk:** **LOW** - Package metadata only  
**Required Action:** Can be updated but not critical; email will still work

---

### 2.2 `bridge-node/packaging/macos/build-pkg.sh`

**Line 106:** Build-time default  
```bash
CLOUD_API="https://w.keyone1.com"
```

**Migration Risk:** **MEDIUM** - Bridge macOS installer has hardcoded default  
**Required Action:**
1. Update installer build script
2. Repackage and redistribute bridge for macOS
3. Existing installations will need to be reconfigured or will fail to connect

---

### 2.3 `keyone-bridge/packaging/deb/build-deb.sh`

**Line 27:** Maintainer email  
```bash
Maintainer: KEYONE <ops@keyone1.com>
```

**Migration Risk:** **LOW** - Package metadata only  
**Required Action:** Can be updated but not critical

---

## 3. Database Seed Data

### 3.1 `saas/prisma/seed.ts`

**Line 151:** Admin support email initialization  
```typescript
supportEmail: process.env.SUPPORT_EMAIL || "support@keyone1.com",
```

**Line 157:** Admin account default  
```typescript
const adminEmail = process.env.ADMIN_EMAIL || "admin@keyone1.com";
```

**Migration Risk:** **MEDIUM** - Only affects new database seeding  
**Required Action:**
1. Update defaults (or leave as is if they're meant to be overridden by env vars)
2. Does NOT affect existing production database
3. Update for any new staging/test deployments

---

### 3.2 `saas/prisma/seed-keyone.ts`

**Lines 217, 225:** Seed data content in Arabic  
```typescript
- العميل بيدخل على الموقع keyone1.com ويسجل، أو يقدر يكلمنا مباشرة على واتساب الإدارة.
- ووجّهه يكلم رقم الواتساب الرسمي لتفعيل الاشتراك ودفع الاشتراك أو يدخل صفحة الأسعار في الموقع keyone1.com/pricing.
```

**Migration Risk:** **MEDIUM** - This is onboarding/help text  
**Required Action:**
1. Update domain references in seed data
2. Also update any help text/documentation that gets seeded
3. May need translation review for Arabic content

---

## 4. Application Code References

### 4.1 `saas/lib/providers/openrouter.ts`

**Line 58:** HTTP Referer header for LLM API  
```typescript
"HTTP-Referer": process.env.PUBLIC_BASE_URL || "https://app.keyone1.com",
```

**Migration Risk:** **MEDIUM** - OpenRouter may have URL-based rate limiting  
**Required Action:**
1. Verify environment variable is set correctly
2. If OpenRouter has allowlist, add new domain before migration
3. Update fallback value

---

## 5. Email Templates & Support

### 5.1 Domain in Support Email

**Location:** `saas/prisma/seed.ts:151`  
**Value:** `support@keyone1.com`

**Migration Risk:** **MEDIUM** - May need email routing update  
**Required Action:**
1. Determine if email address needs to change with domain
2. If using `@keyone1.com`, verify email forwarding still works
3. Consider adding `@wkeyone.app` email address if appropriate

---

## 6. Test & Documentation References

### 6.1 Test Email Address in Seed

**File:** `saas/prisma/seed.ts`  
**Purpose:** Test/admin account initialization  
**Current:** `admin@keyone1.com`

**Migration Risk:** **LOW** - Only affects test/seed scenarios  
**Required Action:**
1. Can be left as-is or updated
2. Does not affect production
3. Update if consistency matters for new deployments

---

## 7. Bridge Node Defaults (Critical)

### 7.1 Hard-Coded Bridge Defaults

**File:** `bridge-node/keyone-wa-bridge.js`  
**Lines:** 20-21, 58-59

These are THE MOST CRITICAL because bridge instances worldwide will use these defaults if environment variables are not set.

**Current Defaults:**
```javascript
const CLOUD_API = process.env.KEYONE_CLOUD_API || "https://w.keyone1.com";
const CLOUD_WS = process.env.KEYONE_CLOUD_WS || "wss://w.keyone1.com/bridge";
```

**Migration Risk:** **CRITICAL**

**Action Plan:**
1. **BEFORE migration:** Update these defaults to new domain
2. **Rebuild bridge image** with new defaults
3. **Existing bridge instances:** Will break unless:
   - Environment variables are explicitly set, OR
   - Docker image is updated, OR
   - Manual configuration is applied
4. **Communication needed:** All customers running self-hosted bridges must update their configuration

---

## 8. Summary of Missing Items from Initial Inventory

| Category | Item | File | Line | Risk | Action |
|----------|------|------|------|------|--------|
| Deployment | AWS release script default | `deploy/release-aws.sh` | 34 | MEDIUM | Update default |
| Deployment | Git release health check | `deploy/release-git.sh` | 37 | MEDIUM | Update URL |
| Deployment | VPS Docker setup | `deploy/vps-docker-setup.sh` | 87 | HIGH | Update for provisioning |
| Deployment | Deploy smoke test instruction | `deploy/deploy.sh` | 230 | LOW | Update reminder |
| Deployment | Downloads URL reference | `deploy/publish-downloads.sh` | 15 | MEDIUM | Verify path works |
| Bridge | macOS installer build script | `bridge-node/packaging/macos/build-pkg.sh` | 106 | MEDIUM | Rebuild installer |
| Bridge | Linux DEB maintainer | `bridge-node/packaging/linux/build-deb.sh` | 22 | LOW | Update metadata |
| Bridge | DEB maintainer alt | `keyone-bridge/packaging/deb/build-deb.sh` | 27 | LOW | Update metadata |
| Database | Seed support email | `saas/prisma/seed.ts` | 151, 157 | MEDIUM | Update defaults |
| Database | Seed help text (Arabic) | `saas/prisma/seed-keyone.ts` | 217, 225 | MEDIUM | Update content |
| API | OpenRouter referer | `saas/lib/providers/openrouter.ts` | 58 | MEDIUM | Update fallback |

---

## 9. Recommended Migration Order

Given the additional findings, the migration should follow this sequence:

### Phase 3A: Pre-Migration Preparation
1. Update deployment scripts (`release-aws.sh`, `release-git.sh`, `vps-docker-setup.sh`)
2. Update bridge defaults in `keyone-wa-bridge.js`
3. Rebuild bridge Docker image with new defaults
4. Update bridge installer scripts (macOS, Linux)
5. Update database seed values
6. Update deployment help text

### Phase 3B: Infrastructure
1. Update Caddy configuration (`deploy/Caddyfile`)
2. Obtain SSL certificate for new domain (automatic via Let's Encrypt)
3. DNS records (A, AAAA pointing to same IP)
4. Test domain resolution and HTTPS

### Phase 3C: External Services
1. Update Meta Cloud API webhook URL in Meta Business Dashboard
2. Add new domain to Clerk allowed callbacks (before removing old)
3. Update Sentry project configuration
4. Update TestMail test namespace if needed
5. Update Datadog host tags/filters

### Phase 3D: Traffic Cutover
1. Update `NEXT_PUBLIC_SITE_URL` in production .env
2. Restart app container
3. Monitor error rates, webhooks, bridge connectivity
4. Gradually migrate traffic (if load balancing in place)
5. Update robots.txt if not already dynamic

### Phase 3E: Post-Migration
1. Verify all integrations working
2. Update customer-facing documentation
3. Plan redirect from old domain (if needed)
4. Decommission old domain (after adequate redirect period)

---

## 10. Coordination Requirements

The following teams/systems need coordination:

| System | Change | Timing | Owner |
|--------|--------|--------|-------|
| Caddy (reverse proxy) | Domain update + SSL cert | Pre-cutover | DevOps |
| Meta Business Dashboard | Webhook URL | Pre-cutover | Ops/Admin |
| Clerk Dashboard | Allowed domains | Pre-cutover | Security/Ops |
| Bridge Deployments | Environment variables | Before/during cutover | DevOps + Customer Support |
| GitHub Actions | Deploy script updates | Before next release | DevOps |
| Database Seeding | Seed value updates | Optional | DevOps |
| Documentation | User guides, APIs | Post-cutover | Product/Eng |
| Customer Communication | Domain change announcement | Pre-cutover | Product/Support |

---

**Note:** These additional findings should be integrated into the main `DOMAIN_MIGRATION_INVENTORY.md` before PHASE 2 review.
