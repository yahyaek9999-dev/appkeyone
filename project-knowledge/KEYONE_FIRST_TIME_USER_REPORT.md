# KEYONE — First-Time User Experience Report

**Date:** 2026-06-02  
**Auditor:** Claude Sonnet 4.6  
**Scenario:** Brand-new customer — signup → dashboard → connect WhatsApp → connect store → create AI → send first campaign

---

## Flow Simulation

### Step 1: Signup

**Path:** `/` (marketing site) → `/login`

**Status: ✅ WORKS**

- Marketing site clearly explains the product value proposition
- Login page is clean with email/password
- No self-service registration found — access appears to require an admin to provision accounts
- **Gap:** No visible "Sign up" / "Create account" CTA on the marketing site or login page

**Friction Points:**
- New customers cannot self-sign-up — admin must create the account
- No "Forgot password" link visible on the login page
- No Google/Social login option

---

### Step 2: First Dashboard View

**Path:** `/dashboard`

**Status: ✅ WORKS**

- Overview page loads with KPI cards (all show 0 for new user)
- KPI values: 0 conversations, 0 orders, 0 revenue — accurate for new accounts
- No empty state guidance on the overview page — just shows zero values

**Gap:** A new user sees a dashboard full of zeros with no guidance on what to do next. The overview page should have an onboarding checklist or "Getting Started" card.

---

### Step 3: Connect WhatsApp

**Path:** `/dashboard/whatsapp`

**Status: ✅ GOOD**

- Two options: QR Code or Pairing Code (8 digits)
- Instructions are clear in Arabic
- QR scanning works for WhatsApp Web
- Pairing code flow documented step-by-step

**Fixed in this session:**
- Service unreachable no longer shows npm commands

**Remaining friction:**
- The page title "ربط واتساب" is clear
- Instructions for WhatsApp steps are accurate
- **No "why should I connect?" context** — a first-time user may not understand what happens after connection

---

### Step 4: Connect Store

**Path:** `/dashboard/integrations`

**Status: ✅ GOOD**

- Platform picker (Shopify, WooCommerce, Salla, Zid, Custom)
- Wizard shows step-by-step instructions per platform
- Webhook URL + API key + secret displayed once with copy buttons

**Gap:** After integration setup, there's no "test it worked" prompt. The test button exists but users might not find it.

---

### Step 5: Create/Configure AI Bot

**Path:** `/dashboard/bot`

**Status: ✅ GOOD**

- Persona name, personality, custom prompt, working hours
- AI provider selection (KEYONE AI default — works out of box)
- Shipping notify toggle
- Humanize replies toggle

**Gap:** No guided first-run experience — the form is a settings page, not an onboarding wizard. A new user might not know where to start.

---

### Step 6: Send First Campaign

**Path:** `/dashboard/broadcasts`

**Status: ✅ WORKS**

- AI message generator available
- Audience selection: all customers or by segment
- Schedule or send now
- A/B testing available

**Gap:** With 0 customers (new account), the audience list is empty. There's no guidance that the broadcast works once customers have messaged the WhatsApp number.

---

### Step 7: Onboarding Page

**Path:** `/onboarding`

**Status: ✅ EXISTS**

- There is a dedicated `/onboarding` page
- Accessible from sidebar and post-signup flow
- Covers key setup steps

---

## Friction Points Summary

| Step | Friction | Severity | Recommendation |
|------|----------|----------|----------------|
| Signup | No self-service registration | HIGH | Add sign-up form or waitlist |
| Overview | No onboarding guidance when 0 data | HIGH | Add "Getting Started" checklist card |
| WhatsApp | No "what happens next?" context | MEDIUM | Add a brief explanation after connection |
| Integrations | Test button not prominent | MEDIUM | Move test button to wizard completion step |
| Bot | No guided setup wizard | MEDIUM | Add tooltips or first-run overlay |
| Broadcasts | Empty audience for new users | LOW | Add guidance: "your customers will appear here" |

---

## Empty States Assessment

| Page | Empty State Quality |
|------|-------------------|
| Orders | ✅ Good — explains AI extraction |
| Integrations | ✅ Good — shows platform picker |
| Broadcasts | ⚠️ Shows 0 campaigns but no setup guide |
| Customers | ⚠️ Shows empty table with no guidance |
| Sales Brain | ⚠️ Shows charts with 0 data, no context |
| Funnel | ✅ Fixed — loading state improved with retry |
| Segments | ✅ Fixed — loading state improved with retry |
| Escalations | ✅ Fixed — proper empty state with explanation |
| Inbox | ✅ Shows empty state when no conversations |

---

## Recommended Priority Fixes for Next Session

1. **Add "Getting Started" checklist** to the overview dashboard for new users (0 conversations)
2. **Self-service signup** or waitlist form on marketing site
3. **Post-WhatsApp-connection onboarding prompt** — "Your bot is live! Here's what happens next..."
4. **Empty state for Broadcasts when 0 customers** — "Connect your WhatsApp first to start receiving customers"
5. **Empty state for Customers page** — "Customers appear here after they message your WhatsApp number"
