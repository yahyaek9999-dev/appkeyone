# WKEYONE — Complete Application Inventory
**Date:** 2026-07-28  
**Scope:** Every page, route, section, component, action, dialog, form, table, filter, button, API, and permission across the entire application.  
**Format:** Structured markdown only.

---

## TABLE OF CONTENTS

1. [Navigation Architecture](#navigation-architecture)
2. [Public Website](#public-website)
3. [Authentication Pages](#authentication-pages)
4. [Onboarding](#onboarding)
5. [Merchant Dashboard](#merchant-dashboard)
   - [Home Workspace](#home-workspace)
   - [Sales Workspace](#sales-workspace)
   - [Customers Workspace](#customers-workspace)
   - [AI / Business Intelligence Workspace](#ai--business-intelligence-workspace)
   - [Growth Workspace](#growth-workspace)
   - [Operations Workspace](#operations-workspace)
   - [Data Workspace](#data-workspace)
   - [Settings Workspace](#settings-workspace)
6. [Admin Panel](#admin-panel)
   - [Admin Home & Super Center](#admin-home--super-center)
   - [Admin Finance](#admin-finance)
   - [Admin Operations](#admin-operations)
   - [Admin Support](#admin-support)
   - [Admin Technology](#admin-technology)
   - [Admin Settings](#admin-settings)
7. [Finance Portal](#finance-portal)
8. [Public Legal & Support Pages](#public-legal--support-pages)
9. [Navigation Tree](#navigation-tree)
10. [Feature Dependency Map](#feature-dependency-map)
11. [Permission Matrix](#permission-matrix)

---

## NAVIGATION ARCHITECTURE

### Merchant Dashboard — Workspace Model

The dashboard uses a two-tier navigation: a **60px icon RAIL** (workspace selector) + a **contextual panel** showing only the current workspace's destinations.

**Workspaces:**

| ID | Label (AR) | Icon | Home Route |
|----|-----------|------|-----------|
| home | الرئيسية | LayoutDashboard | /dashboard |
| sales | المبيعات | Briefcase | /dashboard/orders |
| customers | العملاء | Users | /dashboard/customers |
| ai | ذكاء الأعمال | Brain | /dashboard/bot |
| growth | النمو | Rocket | /dashboard/funnel |
| ops | العمليات | Wrench | /dashboard/integrations |
| data | البيانات | Database | /dashboard/export |
| settings | الإعدادات | Settings | /dashboard/settings |

**Nav Modes:**
- Simple mode (default): shows ~14 core destinations
- Full mode ("كل الأدوات"): shows all 40+ destinations
- Pre-activation: shows only billing/wallet/settings/plan/usage/dashboard

**Connection Mode Gating:**
- `mode: "qr"` items hidden when `metaMode === "meta"`
- `mode: "meta"` items hidden when `metaMode === "qr"`

---

## PUBLIC WEBSITE

---

### PAGE: Landing Page

| Field | Value |
|-------|-------|
| **URL** | `/` |
| **Route** | `saas/app/page.tsx` |
| **Purpose** | Primary marketing page; converts visitors to signups |
| **Auth** | None required |
| **Language** | AR (default) / EN (`?lang=en`) |

**Main Sections:**
- HeroSection — full-width video background, headline, CTA
- AnimatedStatsSection — platform statistics (animated counters)
- BentoFeatures — feature grid cards
- IntegrationsWhatsApp — WhatsApp integration showcase
- RoiSection — ROI calculator / value proposition
- How It Works — 3-step process
- TrustSection — logos, certifications
- SocialProof — testimonials
- PricingCards Preview — top 3 plans with CTA
- FaqAccordion — collapsible FAQ
- CTA Section — final conversion call
- PublicFooter

**Components:**
- `PublicNav` (brand, navigation links, support WhatsApp CTA)
- `AmbientBackdrop` (gradient decoration)
- `HeroSection`
- `AnimatedStatsSection`
- `BentoFeatures`
- `IntegrationsWhatsApp`
- `RoiSection`
- `SectionReveal` (scroll animation wrapper)
- `PricingExperience` (preview)
- `FaqAccordion`
- `PublicFooter`

**Actions:**
- Click "ابدأ مجاناً" → `/signup`
- Click "الأسعار" → `/pricing`
- Click plan CTA → `/signup?plan=SLUG&cycle=monthly`
- WhatsApp support link → `wa.me/NUMBER`
- Language toggle → `?lang=en`

**APIs:**
- DB: `prisma.plan.findMany()` (for pricing preview)
- `getSiteConfig()` (brand name, support WhatsApp, tagline)

**Navigation Path:** Direct URL / `PublicNav` links

---

### PAGE: Pricing

| Field | Value |
|-------|-------|
| **URL** | `/pricing` |
| **Route** | `saas/app/pricing/page.tsx` |
| **Purpose** | Full pricing page with plan comparison |
| **Auth** | None required |

**Main Sections:**
- Header — "أسعار شفافة" eyebrow + H1
- PricingExperience — plan cards with monthly/yearly toggle
- IndustryMatcher — industry + stage selector → recommended plan
- FeatureMatrix — full capability comparison table
- How to Subscribe — 4-step process
- Contact CTA — WhatsApp contact

**Components:**
- `PublicNav`
- `AmbientBackdrop`
- `PricingExperience` (client, monthly/yearly toggle, 6 plan cards)
- `IndustryMatcher` (client, industry selector)
- `FeatureMatrix` (full capability grid)
- `SectionReveal`
- `PublicFooter`

**Forms:**
- IndustryMatcher — select: industry type, select: growth stage → outputs recommended plan

**Buttons:**
- "اطلب الباقة" / "Get started" → `/signup?plan=SLUG&cycle=monthly|yearly`
- "تواصل مع المبيعات" (Enterprise) → `wa.me/NUMBER?text=...`
- Monthly / Yearly toggle

**Filters:**
- Monthly / Yearly billing cycle toggle
- Industry selector (IndustryMatcher)
- Stage selector: ناشئ / نامٍ / رائد

**APIs:**
- `prisma.plan.findMany()` (DB price overrides)
- `getSiteConfig()` (brand, support WhatsApp)
- Archived plans filtered out

**Navigation Path:** `PublicNav` → "الأسعار"

---

### PAGE: Features

| Field | Value |
|-------|-------|
| **URL** | `/features` |
| **Route** | `saas/app/features/page.tsx` |
| **Purpose** | Static feature listing for SEO |
| **Auth** | None required |

**Main Sections:**
- Header — H1 + description
- 7-section feature grid

**Sections (static):**
- Channels: WhatsApp (QR Web), WhatsApp Cloud API (Meta)
- Platforms: Web Dashboard, Mobile-friendly, Developer REST API
- Integrations: Shopify, WooCommerce, Custom Webhooks, REST API v1
- AI Providers: OpenAI, Anthropic, Gemini, OpenRouter, Groq, Bring-Your-Own-Key
- Languages: Arabic (MSA + dialects), English
- Industries: Furniture, Cars, Clinics, Real Estate, Restaurants, E-commerce
- Business: Smart Auto-Reply, CRM & Lead Scoring, Orders, Broadcast Campaigns, Prepaid Wallet Billing, Analytics & Reports

**Navigation Path:** `PublicFooter` → "المميزات" / direct URL

---

### PAGE: Projects / Portfolio

| Field | Value |
|-------|-------|
| **URL** | `/projects` |
| **Route** | `saas/app/projects/page.tsx` |
| **Purpose** | Public showcase/portfolio page |
| **Auth** | None required |

---

### PAGE: Support

| Field | Value |
|-------|-------|
| **URL** | `/support` |
| **Route** | `saas/app/support/page.tsx` |
| **Purpose** | Public support contact page |
| **Auth** | None required |

---

## AUTHENTICATION PAGES

---

### PAGE: Login

| Field | Value |
|-------|-------|
| **URL** | `/login` |
| **Route** | `saas/app/(auth)/login/page.tsx` |
| **Purpose** | User authentication |

**Form: Login Form**
- Field: Email (type=email, required)
- Field: Password (type=password, required)
- Button: "تسجيل الدخول"

**Actions:**
- Submit → `POST /api/auth/login` → redirect to `/dashboard` or `data.redirectTo`
- Link: "نسيت كلمة المرور؟" → `/forgot-password`
- Link: "إنشاء حساب" → `/signup`

**APIs:** `POST /api/auth/login`

---

### PAGE: Signup

| Field | Value |
|-------|-------|
| **URL** | `/signup` |
| **Route** | `saas/app/(auth)/signup/page.tsx` |
| **Purpose** | New merchant registration |

**Query Params:** `?plan=SLUG&cycle=monthly|yearly&lang=en`

**Form: Signup Form**
- Field: Full Name (required)
- Field: Email (type=email, required)
- Field: Password (min 8 characters, required)
- Button: "إنشاء حساب"

**States:**
- Approved: redirect to `/onboarding` or `/dashboard/billing?plan=...&cycle=...`
- Pending approval: shows "طلب مستلم" confirmation state

**APIs:** `POST /api/auth/signup`

---

### PAGE: Forgot Password

| Field | Value |
|-------|-------|
| **URL** | `/forgot-password` |
| **Route** | `saas/app/(auth)/forgot-password/page.tsx` |
| **Purpose** | Password reset request |

**Form: Forgot Password Form**
- Field: Email (required)
- Button: "إرسال رابط الاسترداد"

**States:** Shows "تحقق من بريدك" confirmation after submit

**APIs:** `POST /api/auth/forgot-password`

---

### PAGE: Reset Password

| Field | Value |
|-------|-------|
| **URL** | `/reset-password?token=...` |
| **Route** | `saas/app/(auth)/reset-password/page.tsx` |
| **Purpose** | Password reset (token-gated) |

**Query Params:** `?token=RESET_TOKEN` (required)

**Form: Reset Password Form**
- Field: New Password (required)
- Button: "تغيير كلمة المرور"

**Behavior:** Auto-redirects to `/login` after 1.8s on success

**APIs:** `POST /api/auth/reset-password` with `{ token, password }`

---

### PAGE: Team Invite Accept

| Field | Value |
|-------|-------|
| **URL** | `/team/accept?token=...` |
| **Route** | `saas/app/(auth)/team/accept/page.tsx` |
| **Purpose** | Team member activates their invitation |

**Query Params:** `?token=INVITE_TOKEN` (required)

**Form: Accept Invite Form**
- Field: Name (optional)
- Field: Password (required)
- Button: "قبول الدعوة"

**APIs:** `POST /api/auth/accept-invite`

---

## ONBOARDING

---

### PAGE: Onboarding Wizard

| Field | Value |
|-------|-------|
| **URL** | `/onboarding` |
| **Route** | `saas/app/onboarding/page.tsx` → `saas/app/onboarding/wizard.tsx` |
| **Purpose** | New merchant setup — 6-step wizard |
| **Auth** | Required |

**Steps:**

| Step | Title | Input |
|------|-------|-------|
| 1 | اسم المتجر أو البزنس | Text input (min 2 chars) + optional WhatsApp notify phone |
| 2 | نوع النشاط | Vertical selector grid (Store, Restaurant, Services, SaaS, Medical, Education, Consulting, Real Estate, Industry, Other) |
| 3 | نوع البزنس | Business type grid (persona packs) |
| 4 | أسلوب الرد | Tone selector (warm, professional, friendly, etc.) |
| 5 | إلصق معلومات بزنسك | Large textarea (products, prices, FAQ — optional) |
| 6 | مراجعة + إطلاق | ReviewCard showing all selections + submit |

**Actions:**
- Next / Back navigation buttons
- Step 6: "تفعيل البوت" button → POST `/api/onboarding/setup`
- On success: redirect to `/dashboard/whatsapp` after 1.2s

**APIs:** `POST /api/onboarding/setup` (seeds KB documents, quick-replies, products)

**Related Pages:** `/dashboard/knowledge`, `/dashboard/whatsapp`

---

## MERCHANT DASHBOARD

---

## HOME WORKSPACE

---

### PAGE: Dashboard Home (Overview)

| Field | Value |
|-------|-------|
| **URL** | `/dashboard` |
| **Route** | `saas/app/dashboard/page.tsx` |
| **Purpose** | Primary operational overview for merchant |
| **Permission** | `analytics` |
| **Redirects** | → `/onboarding` if no bot row |

**Main Sections:**
- Header: WhatsApp status badge + subscription badge
- "Needs Attention" alerts: pending proofs, expiring subscription, disconnected WhatsApp
- ActivationChecklist: onboarding milestones (bot setup, knowledge, first message, first order)
- InsightStrip: AI-generated 3-word business insight
- Revenue Band (commerce-only): orders count, revenue total, conversion rate
- Activity chart: 30-day message volume (in/out bars)
- Drivers panel: top conversation drivers
- Recent Orders: last 5 orders with status pills
- Recent Messages: last 5 conversations with sentiment
- Plan usage bar: messages used / limit
- Insight cards: 4 KPI tiles (customers, messages, hot leads, LLM cost savings)

**Components:**
- `ActivationChecklist`
- `InsightStrip`
- `ActivityChart`
- `DriversPanel`
- `RecentOrders`
- `RecentMessages`
- `PlanUsageBar`
- `InsightCards`

**APIs (parallel Prisma queries on server):**
- `customer.count()`, `message.count()`, `order.count()`, `order.aggregate()` (revenue)
- `customer.count({ leadScore >= 70 })` (hot leads)
- `conversation.findMany()` (recent)
- `aiLog.aggregate()` (LLM cost savings)
- `syncUserMilestones()`
- `resolveBusinessContext()` (vertical/module detection)

**Related Pages:** `/dashboard/analytics`, `/dashboard/orders`, `/dashboard/inbox`

**Navigation Path:** Home workspace → "نظرة عامة"

---

### PAGE: Analytics

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/analytics` |
| **Route** | `saas/app/dashboard/analytics/analytics-ui.tsx` |
| **Purpose** | Message, lead, AI analytics for the merchant |
| **Permission** | `analytics` |
| **Plan Gate** | `advanced_analytics` (Pro+) |

**Tabs / Sections:**
- KPI Row: total customers, messages, hot leads, LLM cost savings
- Daily message chart (SVG, inbound/outbound series)
- Intent distribution bars: buy / inquiry / complaint / support / greeting / other
- Sentiment distribution bars: positive / neutral / negative / angry
- Lead score distribution: 5 buckets (0–20, 20–40, 40–60, 60–80, 80–100)
- Top tags cloud
- Top customers ranked list (link to customer detail)
- Quick replies savings: triggers table + LLM calls saved %

**Filters:**
- Time range: 7 days / 30 days / 90 days (query param `?days=N`)

**APIs:** `GET /api/analytics?days=N`

**Navigation Path:** Home workspace → "التحليلات"

---

### PAGE: Command Center

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/command-center` |
| **Route** | `saas/app/dashboard/command-center/page.tsx` |
| **Purpose** | Unified real-time operations room |
| **Permission** | `analytics` |
| **Plan Gate** | `advanced_analytics` (Pro+) |

**Purpose:** Live KPIs, real-time alerts, operational overview in single view.

**Navigation Path:** Home workspace → "مركز القيادة"

---

## SALES WORKSPACE

---

### PAGE: Orders List

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/orders` |
| **Route** | `saas/app/dashboard/orders/page.tsx` |
| **Purpose** | All orders management |
| **Permission** | `customers` |

**Main Sections:**
- InsightStrip
- Status filter tabs (LimelightTabs)
- Revenue aggregate strip (confirmed+shipped+delivered)
- Orders table (desktop) / cards (mobile)
- Pagination: 100/page

**Tables:**

| Column | Description |
|--------|-------------|
| Customer | Avatar + name + phone |
| Product | First item name |
| Total | Order total |
| AI Confidence | % badge |
| Status | Pill badge |
| Action | Link to order detail |

**Filters (tabs):**
- all / pending / confirmed / shipped / delivered / canceled

**Actions:**
- Click row → `/dashboard/orders/:id`
- Status filter tabs

**APIs (server Prisma):**
- `order.findMany()` with status filter + pagination
- `order.aggregate()` for revenue strip

**Related Pages:** `/dashboard/orders/:id`, `/dashboard/customers`

**Navigation Path:** Sales workspace → "الطلبات"

---

### PAGE: Order Detail

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/orders/:id` |
| **Route** | `saas/app/dashboard/orders/[id]/page.tsx` |
| **Purpose** | Single order management |

**Main Sections:**
- Order card: status pill, extraction confidence %, total, payment method, shipping address, discount, AI notes
- Products list: name, size, color, quantity per item
- Timeline: event log (status changes, notes)
- Customer sidebar: name, phone, shipping address
- OrderActions component

**Components:**
- `OrderActions` (status update buttons, fulfillment, tracking link input)
- Order status pill
- AI confidence badge
- Timeline

**Actions:**
- Status update: pending → confirmed → shipped → delivered → canceled
- Add tracking number
- Link to customer profile

**APIs:**
- `GET /api/orders/:id`
- `PATCH /api/orders/:id` (status update, tracking)

---

### PAGE: Products

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/products` |
| **Route** | `saas/app/dashboard/products/page.tsx` |
| **Purpose** | Product catalog management |
| **Permission** | `settings` |
| **Module Gate** | `modules.products` |

**Main Sections:**
- Products list/grid
- Add/edit product form/dialog

**Actions:**
- Add product (dialog)
- Edit product inline
- Delete product

**APIs:** `/api/products`, `/api/products/:id`

**Navigation Path:** Sales workspace → "المنتجات"

---

### PAGE: Broadcasts Pro (QR Campaigns)

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/broadcasts-pro` |
| **Route** | `saas/app/dashboard/broadcasts-pro/page.tsx` |
| **Purpose** | Broadcast campaigns using QR/wallet credits |
| **Permission** | `broadcasts` |
| **Plan Gate** | `broadcasts` |
| **Module Gate** | `modules.broadcasts` |

**Primary nav item** (replaces `/dashboard/broadcasts` in nav)

**Navigation Path:** Sales workspace → "حملات الرصيد (QR)"

---

### PAGE: Broadcasts (Classic)

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/broadcasts` |
| **Route** | `saas/app/dashboard/broadcasts/broadcasts-ui.tsx` |
| **Purpose** | WhatsApp broadcast campaign management (classic mode) |
| **Permission** | `broadcasts` |
| **Plan Gate** | `broadcasts` |

**Note:** Removed from nav (superseded by broadcasts-pro) but still accessible by URL.

**Main Sections:**
- Campaign list with live status badges (queue/sending/paused/done/canceled)
- Progress bar per campaign
- Analytics panel (sent, delivered, failed counts)
- A/B test comparison panel

**Dialogs:**

**1. Create Campaign Dialog (Normal)**
- Field: Title
- Field: Message template (textarea)
- Field: Audience segment (select)
- Field: Coupon code (optional)
- Field: Image URL (optional)
- Field: Schedule: now vs datetime-local picker
- Field: Send mode: safe (literal) vs personalized (AI rewrite)
- Buttons: Create, Cancel

**2. Create Campaign Dialog (A/B Test Mode)**
- Toggle: Normal / A/B Test
- Two message variants (A and B)
- Split % selector

**3. AI Generator Dialog**
- Select: message type (offer/discount/back_in_stock/reminder/abandoned_cart/seasonal/upsell)
- Generate button → calls `/api/broadcasts/generate`

**4. Advanced Optimizer Dialog**
- Best send time, message length, CTAs, best segment, expected conversion
- Calls `/api/broadcasts/optimize`

**5. Edit Campaign Dialog (pre-send only)**
- Editable: title, template, coupon, image, schedule
- Locked: audience (cannot change after creation)

**6. UpgradeModal** (triggered on 403 plan limit)

**Audience Segments:**
- all / hot (70+) / warm (40–69) / buyers / no_purchase / inactive / abandoned / date_range / recovery

**Filters:**
- Status: all / sending / paused / done / canceled / queued

**Actions:**
- Create campaign (normal or A/B)
- Pause / Resume campaign
- Cancel campaign
- View analytics
- Edit pre-send campaign
- AI generate message
- AI optimize campaign

**APIs:**
- `GET /api/broadcasts` — list
- `POST /api/broadcasts` — create
- `GET/DELETE /api/broadcasts/:id` — detail / cancel
- `POST /api/broadcasts/ab` — create A/B
- `GET /api/broadcasts/ab/:groupId` — A/B results
- `POST /api/broadcasts/generate` — AI message gen
- `POST /api/broadcasts/optimize` — AI optimizer
- `GET /api/broadcasts/:id/analytics` — delivery stats

**Navigation Path:** URL-only (legacy)

---

## CUSTOMERS WORKSPACE

---

### PAGE: Customers List

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/customers` |
| **Route** | `saas/app/dashboard/customers/page.tsx` |
| **Purpose** | CRM customer roster |
| **Permission** | `customers` |

**Main Sections:**
- Search bar (name/phone)
- Customers table

**Table Columns:**
- Avatar, Name, Phone, Last Activity, Message Count, Link to detail

**Filters:**
- Search: `?q=name_or_phone`
- Archived excluded (`archivedAt: null`)

**Pagination:** 30/page, query param `?page=N`

**Actions:**
- Search customers
- Click row → `/dashboard/customers/:id`
- "استيراد العملاء" link → `/dashboard/import`
- "صندوق المحادثات" link → `/dashboard/inbox`

**APIs (server Prisma):**
- `customer.findMany()` with search + pagination

**Navigation Path:** Customers workspace → "العملاء"

---

### PAGE: Customer Detail

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/customers/:id` |
| **Route** | `saas/app/dashboard/customers/[id]/page.tsx` |
| **Purpose** | Individual customer profile + chat history |

**Main Sections:**
- Customer profile card: avatar, name, phone, message count, lead score
- ChatView: full conversation history
- Sidebar actions

**Actions:**
- MergeCustomerButton — merge duplicate customers (dialog)
- DeleteCustomerButton — soft-delete customer (confirm dialog)
- Link to inbox conversation
- Link to orders by customer

**Dialogs:**
- Merge Customer confirmation dialog
- Delete Customer confirmation dialog

---

### PAGE: Inbox

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/inbox` |
| **Route** | `saas/app/dashboard/inbox/inbox-ui.tsx` |
| **Purpose** | WhatsApp conversation management (3-column layout) |
| **Permission** | `inbox` |

**Layout (desktop):** Three columns
- Left: conversation list sidebar
- Center: message thread pane
- Right: customer details sidebar (lg+)

**Conversation List Sidebar:**
- Search bar (debounced, server-side)
- Conversation items: avatar, name, last message preview, time, unread badge, lead score dot
- Filter tabs: all / unread / hot / escalated

**Message Thread Pane:**
- Chronological message bubbles (in/out)
- Media support: image, audio/voice, video, document attachments
- AI reply suggestion button
- Send message textarea
- Emoji picker
- Attach media button
- Pause/Resume bot toggle
- @mention team members
- Internal notes tab / Customer notes tab

**Customer Details Sidebar:**
- Customer 360 slide-over drawer (full CRM profile)
- Tags
- Lead score
- Sentiment
- Intent
- Order history
- Team assignment dropdown

**Tabs (per conversation):**
- Messages tab (default)
- Internal Notes tab (team-only thread with @mentions)

**Actions:**
- Send WhatsApp message
- AI suggest reply
- Pause bot (human takeover)
- Resume bot
- Add internal note
- Assign to team member
- Open Customer 360 drawer
- Search conversations

**Dialogs:**
- Customer 360 slide-over drawer

**APIs:**
- `GET /api/inbox/conversations?q=` — list with search
- `GET /api/inbox/conversation/:id` — single conversation
- `POST /api/inbox/conversation/:id/send` — send message
- `POST /api/inbox/conversation/:id/pause` — pause bot
- `POST /api/inbox/conversation/:id/resume` — resume bot
- `GET /api/inbox/conversation/:id/suggest-reply` — AI suggestion
- `GET /api/inbox/conversation/:id/notes` — notes
- `POST /api/inbox/conversation/:id/internal-notes` — add note
- `GET /api/customers/:id/crm` — CRM data

**Realtime:** `useRealtimeSnapshot` hook via SSE + polling

**Navigation Path:** Customers workspace → "صندوق المحادثات"

---

### PAGE: Leads (Hot Leads / Lead Scoring)

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/leads` |
| **Route** | `saas/app/dashboard/leads/page.tsx` |
| **Purpose** | Ranked list of prospects by purchase likelihood |
| **Permission** | `customers` |
| **Plan Gate** | `lead_scoring` (Pro+) |
| **Module Gate** | `modules.crm` |

**Main Sections:**
- Header with icon
- Stat band: hot count (70+), warm count (40–69), total
- Mobile: card view
- Desktop: data table

**Table Columns:**
- Customer (avatar + name + phone)
- Score (0–100 progress bar + badge: hot/qualified/contacted/cold)
- Intent badge (buy/inquiry/complaint/support/greeting/other)
- Sentiment badge (positive/neutral/negative/angry)
- Last message preview
- Message count
- Open inbox link

**Actions:**
- Click "فتح المحادثة" → `/dashboard/inbox?c=CUSTOMER_ID`

**APIs (server Prisma):**
- `customer.findMany()` ordered by `leadScore` desc, take 100

**Navigation Path:** Customers workspace → "العملاء المحتملون"

---

### PAGE: Customer Import

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/import` |
| **Route** | `saas/app/dashboard/import/page.tsx` |
| **Purpose** | Bulk customer import |
| **Permission** | `customers` |

**Forms:**
- CSV/Excel file upload
- Paste phone numbers textarea
- Column mapping UI

**Actions:**
- Upload file
- Map columns (phone, name, tags)
- Preview import
- Submit import

**APIs:** `/api/customers/import`

**Navigation Path:** Customers workspace → "استيراد العملاء"

---

## AI / BUSINESS INTELLIGENCE WORKSPACE

---

### PAGE: AI Assistant (Bot Settings)

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/bot` |
| **Route** | `saas/app/dashboard/bot/page.tsx` |
| **Purpose** | Configure the AI bot personality and behavior |
| **Permission** | `settings` |

**Main Sections:**
- BotForm with prompt-lab component
- System prompt editor
- Personality settings
- Response style configuration

**APIs:**
- `GET/POST /api/bot` — load/save bot config

**Navigation Path:** AI workspace → "المساعد الذكي"

---

### PAGE: Knowledge Base

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/knowledge` |
| **Route** | `saas/app/dashboard/knowledge/knowledge-ui.tsx` |
| **Purpose** | AI training documents management |
| **Permission** | `settings` |
| **Plan Gate** | `knowledge_base` |

**Main Sections:**
- Training status panel: doc count, total chars, hit count, last updated, source breakdown
- Import bar (4 methods)
- Document cards list

**Import Methods:**
- URL scraper (enter URL → scrapes content)
- File upload: PDF / Word / TXT
- FAQ builder modal
- Product import modal

**Document Card:**
- Title, source badge (manual/url/pdf/docx/txt/faq/products/suggestion), content preview, char count, hit count, last matched, edit/delete buttons

**Dialogs:**

**1. Add Document Dialog (Manual)**
- Field: Title
- Field: Content (textarea)
- Buttons: Save, Cancel

**2. FAQ Modal**
- Multiple Q/A pair inputs
- Add another Q/A button
- Save → creates `source:"faq"` document

**3. Product Import Modal**
- Format: "name — price" per line
- Saves as ProductRows + document

**4. URL Import**
- Field: URL input
- Submit button

**5. File Upload Dialog**
- Drag-and-drop zone for PDF/Word/TXT

**Actions:**
- Add document (manual)
- Import from URL
- Import file
- Import products
- Open FAQ builder
- Edit document (inline)
- Delete document

**APIs:**
- `GET /api/knowledge` — list documents
- `GET/PUT/DELETE /api/knowledge/:id` — document CRUD
- `POST /api/knowledge/import-url` — URL scrape
- `POST /api/knowledge/import-file` — file import
- `POST /api/knowledge/import-products` — product import

**Navigation Path:** AI workspace → "المعرفة"

---

### PAGE: Knowledge Brain

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/knowledge-brain` |
| **Route** | `saas/app/dashboard/knowledge-brain/page.tsx` |
| **Purpose** | Advanced AI brain configuration and smart assistant |
| **Permission** | `settings` |
| **Plan Gate** | `smart_assistant` |

**Navigation Path:** AI workspace → "عقل المعرفة"

---

### PAGE: Sales Brain

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/sales-brain` |
| **Route** | `saas/app/dashboard/sales-brain/page.tsx` |
| **Purpose** | AI sales pipeline intelligence |
| **Permission** | `analytics` |
| **Plan Gate** | `sales_pipeline` |

**Navigation Path:** AI workspace → "عقل المبيعات"

---

### PAGE: Revenue Copilot

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/revenue-copilot` |
| **Route** | `saas/app/dashboard/revenue-copilot/page.tsx` |
| **Purpose** | AI-ranked revenue opportunities for today |
| **Permission** | `analytics` |
| **Plan Gate** | `revenue_attribution` (Pro+) |

**Main Sections:**
- Prioritized action list (AI-generated)
- Expected revenue impact per action
- Quick action buttons

**Navigation Path:** AI workspace → "مساعد الإيرادات"

---

### PAGE: Revenue Forecast

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/revenue-forecast` |
| **Route** | `saas/app/dashboard/revenue-forecast/page.tsx` |
| **Purpose** | Revenue forecasting |
| **Permission** | `analytics` |
| **Plan Gate** | `revenue_attribution` |

**Navigation Path:** AI workspace → "توقّع الإيرادات"

---

### PAGE: Business Intelligence

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/business-intelligence` |
| **Route** | `saas/app/dashboard/business-intelligence/page.tsx` |
| **Purpose** | Advanced BI reports |
| **Permission** | `analytics` |
| **Plan Gate** | `advanced_analytics` |
| **Module Gate** | `modules.reports` |

**Navigation Path:** AI workspace → "ذكاء الأعمال"

---

### PAGE: Intel (Smart Monitoring)

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/intel` |
| **Route** | `saas/app/dashboard/intel/page.tsx` |
| **Purpose** | Real-time AI-powered monitoring dashboard |
| **Permission** | `analytics` |
| **Plan Gate** | `advanced_insights` |

**Navigation Path:** AI workspace → "الرصد الذكي"

---

### PAGE: Suggestions

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/suggestions` |
| **Route** | `saas/app/dashboard/suggestions/page.tsx` |
| **Purpose** | AI improvement suggestions for the bot |
| **Permission** | `analytics` |
| **Plan Gate** | `smart_assistant` |

**Navigation Path:** AI workspace → "الاقتراحات"

---

### PAGE: Testing Arena

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/testing-arena` |
| **Route** | `saas/app/dashboard/testing-arena/page.tsx` |
| **Purpose** | AI bot testing environment |
| **Permission** | `settings` |

**Navigation Path:** AI workspace → "ساحة الاختبار"

---

### PAGE: Arena (Sub-pages)

| URL | Purpose |
|-----|---------|
| `/dashboard/arena` | Arena hub |
| `/dashboard/arena/benchmark` | Performance benchmarking |
| `/dashboard/arena/competitors` | Competitor comparison |
| `/dashboard/arena/fixes` | Issue fixes log |
| `/dashboard/arena/hallucinations` | Hallucination detection |
| `/dashboard/arena/optimize` | Prompt optimization |
| `/dashboard/arena/prompt-benchmark` | Prompt testing |
| `/dashboard/arena/quality` | Response quality scoring |
| `/dashboard/arena/simulate` | Conversation simulation |

**Note:** Consolidated in nav (same as testing-arena); pages still reachable by URL.

---

### PAGE: AI Audit

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/ai-audit` |
| **Route** | `saas/app/dashboard/ai-audit/audit-ui.tsx` |
| **Purpose** | AI setup readiness check with scored report |
| **Permission** | `settings` |

**Main Sections:**
- Header + "تشغيل التدقيق" button
- Score display: readiness score /100 (color-coded)
- Issue counts: critical / high / medium / low
- Issue cards (each with area tag, severity, title, detail, fix text, navigate-to-fix link)
- Last run timestamp

**Severity Levels:** critical (rose) / high (orange) / medium (amber) / low (sky)

**Actions:**
- Run audit → `POST /api/ai-audit/run`
- Navigate to fix → relative link per issue
- Retry on error

**APIs:**
- `GET /api/ai-audit` — last audit result
- `POST /api/ai-audit/run` — trigger new audit

**Navigation Path:** AI workspace → "تدقيق الذكاء"

---

### PAGE: Playground

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/playground` |
| **Route** | `saas/app/dashboard/playground/playground-ui.tsx` |
| **Purpose** | Test the bot as a simulated customer |
| **Permission** | `settings` |

**Layout:** Two-column (settings panel + chat window)

**Settings Panel:**
- Field: Customer name (default: "عميل تجريبي")
- Field: WhatsApp phone (default: "+201111111111")
- Button: "محادثة جديدة" (reset)
- Tip text

**Chat Window:**
- Message bubbles (user left, assistant right)
- Flagged message indicator: orange ring + "تم اكتشاف أوردر" alert
- Typing indicator (3 dots)
- Textarea input + Send button

**Actions:**
- Type and send message → `POST /api/chat`
- New conversation (reset state)

**APIs:**
- `POST /api/chat` with `{ customerId?, customerPhone?, customerName?, message }`
- Response: `{ reply, customerId, flagged }`

**Navigation Path:** AI workspace → "تجربة المحادثة"

---

### PAGE: Quick Replies

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/quick-replies` |
| **Route** | `saas/app/dashboard/quick-replies/quick-replies-ui.tsx` |
| **Purpose** | Keyword-triggered auto-reply rules |
| **Permission** | `settings` |

**Main Sections:**
- Add form (at top)
- Quick replies list

**Form: Add Quick Reply**
- Field: Triggers (comma-separated keywords)
- Field: Reply text (textarea)
- Button: Add

**List Item:**
- Trigger chips, reply text, hit count, enable/disable toggle, edit inline button, delete button

**Actions:**
- Add quick reply
- Toggle enable/disable
- Edit inline
- Delete

**APIs:**
- `GET /api/quick-replies` — list
- `POST /api/quick-replies` — create
- `PUT /api/quick-replies/:id` — update
- `DELETE /api/quick-replies/:id` — delete

**Navigation Path:** AI workspace → "الردود السريعة"

---

### PAGE: Brain (Legacy)

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/brain` |
| **Route** | `saas/app/dashboard/brain/page.tsx` |
| **Purpose** | Smart assistant brain hub (legacy; consolidated into knowledge-brain) |
| **Plan Gate** | `smart_assistant` |
| **Note** | Consolidated in nav; reachable by URL |

---

### PAGE: Agents (Hidden)

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/agents` |
| **Route** | `saas/app/dashboard/agents/page.tsx` |
| **Purpose** | AI agent system management |
| **Note** | Hidden from nav (not production-ready); reachable by URL |

---

## GROWTH WORKSPACE

---

### PAGE: Conversion Funnel

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/funnel` |
| **Route** | `saas/app/dashboard/funnel/page.tsx` |
| **Purpose** | Customer conversion funnel visualization |
| **Permission** | `analytics` |
| **Plan Gate** | `advanced_analytics` |
| **Module Gate** | `modules.crm` |

**Navigation Path:** Growth workspace → "قمع التحويل"

---

### PAGE: Segments

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/segments` |
| **Route** | `saas/app/dashboard/segments/page.tsx` |
| **Purpose** | Customer segmentation by behavior/value |
| **Permission** | `analytics` |
| **Plan Gate** | `customer_segmentation` (Pro+) |
| **Module Gate** | `modules.crm` |

**Navigation Path:** Growth workspace → "الشرائح"

---

### PAGE: Customer Recovery

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/recovery` |
| **Route** | `saas/app/dashboard/recovery/page.tsx` |
| **Purpose** | Win-back campaigns for inactive customers |
| **Permission** | `broadcasts` |
| **Plan Gate** | `smart_campaign_builder` |
| **Module Gate** | `modules.broadcasts` |

**Navigation Path:** Growth workspace → "استعادة العملاء"

---

### PAGE: Business Performance

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/business` |
| **Route** | `saas/app/dashboard/business/page.tsx` |
| **Purpose** | Business performance and advanced reporting |
| **Permission** | `analytics` |
| **Plan Gate** | `advanced_reporting` |
| **Module Gate** | `modules.reports` |

**Navigation Path:** Growth workspace → "أداء النشاط"

---

## OPERATIONS WORKSPACE

---

### PAGE: Integrations

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/integrations` |
| **Route** | `saas/app/dashboard/integrations/page.tsx` |
| **Purpose** | Third-party integration management (Shopify, WooCommerce, etc.) |
| **Permission** | `settings` |

**Navigation Path:** Operations workspace → "التكاملات"

---

### PAGE: Automations

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/automations` |
| **Route** | `saas/app/dashboard/automations/page.tsx` |
| **Purpose** | Automation rules and order-event automations |
| **Permission** | `settings` |
| **Plan Gate** | `advanced_automations` (Growth+) |

**Main Sections:**
- InsightStrip context="automations"
- AutomationBuilderUi (commerce order-event automations)
- RuleBuilderUi (if-this-then-that rules)

**Navigation Path:** Operations workspace → "الأتمتة"

---

### PAGE: Flow Builder (Hidden)

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/flow-builder` |
| **Route** | `saas/app/dashboard/flow-builder/page.tsx` |
| **Purpose** | Visual conversation flow builder |
| **Note** | Hidden from nav (not production-ready); reachable by URL |

---

### PAGE: Branches

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/branches` |
| **Route** | `saas/app/dashboard/branches/page.tsx` |
| **Purpose** | Multi-branch / location management |
| **Permission** | `settings` |
| **Plan Gate** | `multi_branch` |

**Navigation Path:** Operations workspace → "الفروع"

---

### PAGE: Approvals

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/approvals` |
| **Route** | `saas/app/dashboard/approvals/page.tsx` |
| **Purpose** | Workflow approval queue (team actions pending approval) |
| **Permission** | `team` |
| **Plan Gate** | `approval_workflows` |

**Navigation Path:** Operations workspace → "الموافقات"

---

### PAGE: WhatsApp Health (QR Mode)

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/whatsapp-health` |
| **Route** | `saas/app/dashboard/whatsapp-health/page.tsx` |
| **Purpose** | QR session health monitoring |
| **Permission** | `settings` |
| **Mode Gate** | `mode: "qr"` (hidden in Meta mode) |

**Navigation Path:** Operations workspace → "صحة جلسة واتساب"

---

### PAGE: WhatsApp (Legacy Link)

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/whatsapp` |
| **Route** | `saas/app/dashboard/whatsapp/page.tsx` |
| **Purpose** | WhatsApp QR connection (legacy; not working; superseded by QR Queue) |
| **Note** | Removed from nav; reachable by URL |

---

### PAGE: Meta Health (Meta Mode)

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/meta-health` |
| **Route** | `saas/app/dashboard/meta-health/page.tsx` |
| **Purpose** | Meta Cloud API connection status |
| **Permission** | `settings` |
| **Mode Gate** | `mode: "meta"` (hidden in QR mode) |

**Navigation Path:** Operations workspace → "صحة اتصال Meta"

---

### PAGE: Meta Center (Meta Mode)

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/meta` |
| **Route** | `saas/app/dashboard/meta/page.tsx` |
| **Purpose** | Meta Cloud API hub and billing center |
| **Permission** | `settings` |
| **Mode Gate** | `mode: "meta"` |

**Navigation Path:** Operations workspace → "مركز Meta والفوترة"

---

### PAGE: AI Operations

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/ai-operations` |
| **Route** | `saas/app/dashboard/ai-operations/page.tsx` |
| **Purpose** | AI pipeline operations management |
| **Permission** | `settings` |

**Navigation Path:** Operations workspace → "عمليات الذكاء"

---

### PAGE: QR Queue (Session Reservation)

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/qr-queue` |
| **Route** | `saas/app/dashboard/qr-queue/page.tsx` |
| **Purpose** | Reserve a WhatsApp QR session slot |
| **Permission** | `broadcasts` |

**Navigation Path:** Operations workspace → "حجز جلسات QR"

---

### PAGE: Escalations

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/escalations` |
| **Route** | `saas/app/dashboard/escalations/page.tsx` |
| **Purpose** | Human intervention tickets from angry/confused customers |
| **Permission** | `escalations` |

**Main Sections:**
- Header with icon
- Metric row: 3 cards (open / acknowledged / critical counts)
- Escalation ticket list

**Ticket List:**
- Per-ticket: summary text, severity badge, status badge, handoff state badge
- Anger/frustration score badges (shown when high)
- Confidence score badge (shown when low)
- Last customer message preview
- EscalationActions: Acknowledge / Resolve / AI draft reply / Mark human active

**Severity:** critical / high / medium / low  
**Status:** open / acknowledged / human_active / resolved  
**Handoff State:** ai_active / human_active / escalated / waiting_human

**Actions:**
- Acknowledge ticket
- Mark as human active
- Resolve ticket
- View AI draft reply

**APIs (server Prisma):**
- `escalationTicket.findMany()` (open/acknowledged/human_active)
- `escalationTicket.count()` per status/severity

**Navigation Path:** Operations workspace → "التصعيدات"

---

### PAGE: Safety

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/safety` |
| **Route** | `saas/app/dashboard/safety/page.tsx` |
| **Purpose** | AI content safety and message filtering settings |
| **Permission** | `settings` |

**Navigation Path:** Operations workspace → "الأمان"

---

### PAGE: Compliance & Delivery

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/compliance` |
| **Route** | `saas/app/dashboard/compliance/page.tsx` |
| **Purpose** | Delivery health, number quality, webhook status, approved templates |
| **Permission** | `settings` |

**Navigation Path:** Operations workspace → "الامتثال والتسليم"

---

### PAGE: Audit Log

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/audit-log` |
| **Route** | `saas/app/dashboard/audit-log/page.tsx` |
| **Purpose** | Append-only workspace activity log |
| **Permission** | `team` (owner + admin only) |

**Main Sections:**
- Filter tabs
- Log table

**Filter Tabs:**
- الكل / الصلاحيات (`team.role_changed`) / الحملات (`broadcast.created`) / التكاملات (`integration.connected`) / واتساب (`whatsapp.connected`) / الطلبات (`order.updated`)

**Table Columns:**
- Action type (colored badge), Actor, Target, Details, Timestamp, IP

**Pagination:** 100/page

**Filters:** `?action=ACTION_KEY&page=N`

**APIs (server Prisma):**
- `auditLog.findMany()` with filter + pagination

**Navigation Path:** Operations workspace → "سجل التدقيق"

---

### PAGE: Help Center

| Field | Value |
|-------|-------|
| **URL** | `/docs` |
| **Route** | `saas/app/docs/page.tsx` |
| **Purpose** | In-app documentation hub |
| **Permission** | `analytics` |

**Navigation Path:** Operations workspace → "مركز المساعدة"

---

### PAGE: System Health

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/system-health` |
| **Route** | `saas/app/dashboard/system-health/system-health-ui.tsx` |
| **Purpose** | Real-time system monitoring for the merchant's account |

**Main Sections:**
- Overall status banner (green/red)
- Subsystems grid: Database, WhatsApp, Queue, AI Provider, Worker, Redis — each with ok/degraded/down/unknown dot
- Server panel: CPU model, cores, memory used/total, heap, RSS, uptime
- Database panel: size, messages count, customers count, orders count
- WhatsApp & Queue panel: active sessions, queued, failed 24h, dead-letter
- Broadcast status panel: sending count, queued count
- Errors panel: critical 24h, warnings 24h
- AI panel (last 7d): calls, cache hits, input tokens, total tokens

**Actions:**
- Manual refresh button
- Auto-refresh toggle (30-second interval)

**API:** `GET /api/system/health`

**Navigation Path:** Via URL; also visible from admin panel

---

### PAGE: Monitoring (Legacy)

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/monitoring` |
| **Route** | `saas/app/dashboard/monitoring/page.tsx` |
| **Note** | Consolidated in nav (synonym of /intel); reachable by URL |

---

## DATA WORKSPACE

---

### PAGE: Coupons

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/coupons` |
| **Route** | `saas/app/dashboard/coupons/page.tsx` |
| **Purpose** | Coupon/discount code management |
| **Permission** | `settings` |
| **Plan Gate** | `smart_campaign_builder` |
| **Module Gate** | `modules.broadcasts` |

**Navigation Path:** Data workspace → "الكوبونات"

---

### PAGE: Data Export

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/export` |
| **Route** | `saas/app/dashboard/export/page.tsx` |
| **Purpose** | Export customers/orders/messages as CSV |
| **Permission** | `customers` |

**Forms:**
- Data type select (customers/orders/conversations)
- Date range filter
- Format select (CSV)
- Export button

**Navigation Path:** Data workspace → "تصدير البيانات"

---

### PAGE: Demo Data

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/demo` |
| **Route** | `saas/app/dashboard/demo/page.tsx` |
| **Purpose** | Seed demo/test data for the account |
| **Permission** | `settings` |

**Actions:**
- Seed demo customers
- Seed demo orders
- Seed demo conversations
- Clear demo data

**Navigation Path:** Data workspace → "بيانات تجريبية"

---

## SETTINGS WORKSPACE

---

### PAGE: Account Settings (Hub)

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/settings` |
| **Route** | `saas/app/dashboard/settings/page.tsx` |
| **Purpose** | Account hub — identity + subscription + settings links |
| **Permission** | `analytics` |

**Main Sections:**
- Identity card: avatar, name, email, subscription badge, role badge
- Personal info card: name, email, mobile
- Subscription card (owner-only): plan name, expiry, message usage meter + upgrade link
- Settings links list

**Settings Links:**
- Business Profile → `/dashboard/settings/business-profile`
- AI Provider → `/dashboard/settings/ai-provider`
- Providers (multi-provider) → `/dashboard/settings/providers`
- WhatsApp Connection Mode → `/dashboard/settings/meta-cloud`
- KEYONE Bridge (flag-gated) → `/dashboard/settings/bridge`
- Order Settings → `/dashboard/settings/orders`
- Compliance → `/dashboard/compliance`
- Team Management → `/dashboard/settings/team`

**Actions:**
- "ترقية الخطة" button → `/pricing`

**Navigation Path:** Settings workspace → "الحساب"

---

### PAGE: Business Profile

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/settings/business-profile` |
| **Route** | `saas/app/dashboard/settings/business-profile/page.tsx` |
| **Purpose** | Business type selection and module configuration |
| **Permission** | `settings` |

**Form:**
- Vertical selector (Store/Restaurant/Services/SaaS/Medical/Education/etc.)
- Module toggles: orders, products, broadcasts, crm, branches, reports
- Brand name, contact info

**Navigation Path:** Settings → Business Profile

---

### PAGE: AI Provider Settings

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/settings/ai-provider` |
| **Route** | `saas/app/dashboard/settings/ai-provider/page.tsx` |
| **Purpose** | BYOK AI provider configuration |
| **Permission** | `settings` |

**Form:**
- Provider select: keyone (default) / openai / anthropic / gemini / openrouter / groq
- Model select (per-provider defaults)
- API key input (encrypted at rest, masked after save)
- "اختبار الاتصال" button (sends ≤5 token test)

**Info panel:** Key encryption info, fallback behavior, provider compatibility

**APIs:** `GET/PUT /api/bot` (bot.aiProvider, bot.aiModel, bot.aiApiKeyEnc)

**Navigation Path:** Settings → AI Provider

---

### PAGE: Providers (Multi-Provider)

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/settings/providers` |
| **Route** | `saas/app/dashboard/settings/providers/page.tsx` |
| **Purpose** | Configure all service providers: AI, voice, images, SMS, email |
| **Permission** | `settings` |

**Sub-pages:**
- `/dashboard/settings/providers/:domain` — per-domain provider detail

**Navigation Path:** Settings → "المزوّدون"

---

### PAGE: WhatsApp Connection Mode

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/settings/meta-cloud` |
| **Route** | `saas/app/dashboard/settings/meta-cloud/page.tsx` |
| **Purpose** | Choose QR Web vs Meta Cloud API connection |
| **Permission** | `settings` |

**Form:**
- Radio: QR Code / Meta Cloud API
- Meta Cloud API fields (when selected): Phone Number ID, Access Token, Verify Token, Webhook URL

**Navigation Path:** Settings → WhatsApp Connection Mode

---

### PAGE: Order Settings

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/settings/orders` |
| **Route** | `saas/app/dashboard/settings/orders/page.tsx` |
| **Purpose** | Configure bot order collection behavior |
| **Permission** | `settings` |

**Form:**
- Required fields: name / phone / address / size / color / quantity
- Confirmation message template
- Auto-confirm toggle
- Shipping fee

**Navigation Path:** Settings → Order Settings

---

### PAGE: Team Management

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/settings/team` |
| **Route** | `saas/app/dashboard/settings/team/page.tsx` |
| **Purpose** | Invite and manage team members |
| **Permission** | `team` (owner + admin only) |

**Main Sections:**
- Owner info row
- Team members list
- Invite member form

**Team Member Row:**
- Email, name, role badge, status badge, invited date, accepted date, last login
- Change role button
- Remove member button

**Form: Invite Member**
- Field: Email
- Field: Role select (admin/sales/support/viewer)
- Button: Send Invite

**Dialogs:**
- Remove member confirmation
- Change role confirmation

**Actions:**
- Invite team member (sends invite email)
- Change member role
- Remove member
- Resend invite

**APIs:**
- `GET /api/team` — list members
- `POST /api/team/invite` — send invite
- `PUT /api/team/:id/role` — change role
- `DELETE /api/team/:id` — remove member

**Navigation Path:** Settings → Team Management

---

### PAGE: KEYONE Bridge (Flag-gated)

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/settings/bridge` |
| **Route** | `saas/app/dashboard/settings/bridge/page.tsx` |
| **Purpose** | Self-hosted bridge connector management |
| **Permission** | `settings` |
| **Flag Gate** | `bridgeEnabled()` — hidden if BRIDGE_ENABLED=false |

**Main Sections:**
- BridgeControlCenter: overview, devices list, linked numbers, primary device
- Action buttons: Download Bridge, Link Device

**Sub-pages:**
- `/dashboard/settings/bridge/download` — download instructions
- `/dashboard/settings/bridge/link` — link a new device

**Navigation Path:** Settings → KEYONE Bridge (when flag enabled)

---

### PAGE: Working Hours

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/working-hours` |
| **Route** | `saas/app/dashboard/working-hours/page.tsx` |
| **Permission** | `settings` |
| **Plan Gate** | `working_hours` |
| **Purpose** | Configure business hours for bot auto-reply behavior |

**Navigation Path:** Settings workspace → "ساعات العمل"

---

### PAGE: White Label

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/white-label` |
| **Route** | `saas/app/dashboard/white-label/page.tsx` |
| **Permission** | `settings` |
| **Purpose** | Brand customization settings |

**Navigation Path:** Settings workspace → "العلامة البيضاء"

---

### PAGE: Plan & Usage

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/usage` |
| **Route** | `saas/app/dashboard/usage/page.tsx` |
| **Purpose** | Current plan + live usage counters |

**Main Sections:**
- Plan tier badge + name + status
- WhatsApp connection mode + status
- Meta Cloud configuration state
- Usage bars: messages (used/limit + %), AI requests (used/limit + %), broadcasts (used/limit + %)
- Warning banners when >90% of any cap
- Reset date
- Upgrade button → `/pricing`

**APIs:** `getUsageSnapshot()`, `getCustomerCapState()`, `bot.findUnique()`

**Navigation Path:** Settings workspace → "الباقة"

---

### PAGE: Plan Dashboard

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/plan` |
| **Route** | `saas/app/dashboard/plan/page.tsx` |
| **Purpose** | Plan detail and upgrade panel |

**Navigation Path:** Settings workspace → "لوحة الباقة"

---

### PAGE: Billing & Subscription

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/billing` |
| **Route** | `saas/app/dashboard/billing/billing-client.tsx` |
| **Purpose** | Plan purchase and payment proof tracking |
| **Permission** | `billing` |

**Main Sections:**
- Plan selector (radio)
- Payment method selector (manual transfer / Paymob / Stripe)
- Receiving account display (radio with copy button)
- Reference input
- Receipt image upload (ImageDropzone)
- Proof tracking timeline

**Proof Tracking Timeline States:**
- submitted → received → review → approved / rejected → activated

**Rejection Flow:**
- Shows rejection reason
- Re-upload form
- Cancel pending request button

**APIs:**
- `POST /api/payments/proof` — submit proof
- `GET /api/payments/proof/:id` — check status
- `GET /api/payments/proof/:id/image` — view image
- `POST /api/payments/proof/:id/image` — upload receipt
- `DELETE /api/payments/proof/:id` — cancel pending

**Navigation Path:** Settings workspace → "الاشتراك والدفع"

---

### PAGE: Wallet & Balance

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/wallet` |
| **Route** | `saas/app/dashboard/wallet/wallet-client.tsx` |
| **Purpose** | Prepaid wallet for Meta conversation credits |
| **Permission** | `billing` |

**Tabs / Sections:**

**1. TopupCard**
- Field: Amount (USD)
- Field: Payment method (manual transfer / Paymob / Stripe online buttons)
- Receiving account display
- Optional note field
- "طلب شحن" submit button
- Recent topup requests list (status badges)

**2. CalculatorCard**
- Field: Country select
- Field: Conversation category select (marketing/utility/authentication/service)
- Field: Conversation count
- Estimate button → shows Meta pricing estimate

**3. LedgerCard**
- Table: date, transaction type, amount, balance after, reason/note
- Pagination

**APIs:**
- `POST /api/wallet/topup` — manual request
- `POST /api/wallet/topup/checkout` — Paymob/Stripe checkout
- `GET /api/wallet/calculator?country=&category=&count=` — pricing estimate
- `GET /api/wallet/ledger?page=N` — paginated transactions
- `GET /api/payments/providers` — available payment methods

**Navigation Path:** Settings workspace → "المحفظة والرصيد"

---

### PAGE: Developer Center

| Field | Value |
|-------|-------|
| **URL** | `/dashboard/developer` |
| **Route** | `saas/app/dashboard/developer/page.tsx` |
| **Purpose** | API keys, usage metrics, rate limits, REST API docs |
| **Permission** | `settings` |
| **Plan Gate** | `api_access` (Scale+) |

**Main Sections (when allowed):**
- API keys list + generate new key
- Usage metrics: requests, errors, rate limit status
- Rate limit display
- Links to docs and SDK

**Sub-pages:**
- `/dashboard/developer/docs` — full API documentation
- `/dashboard/developer/sdk` — SDK libraries

**Actions:**
- Generate API key
- Revoke API key
- Copy API key

**APIs:** `/api/developer/*`

**Navigation Path:** Settings workspace → "مركز المطوّرين"

---

## ADMIN PANEL

**Auth:** Admin role only (enforced by `app/admin/layout.tsx`)

---

## ADMIN HOME & SUPER CENTER

---

### PAGE: Admin Home (Daily Check)

| Field | Value |
|-------|-------|
| **URL** | `/admin` |
| **Route** | `saas/app/admin/page.tsx` |
| **Purpose** | Decision-first daily check for the operator |

**Main Sections:**
- "فحص اليوم" header
- Action list (urgent-first ordered)
- Mini stats strip

**Action Types (when present):**
- Pending payment proofs → link to `/admin/payment-reviews`
- Disconnected WhatsApp (subscribed merchants) → link to `/admin/whatsapp`
- Open incidents → link to `/admin/incidents`
- Expired subscriptions → link to `/admin/users`
- Expiring subscriptions (3-day window) → link to `/admin/users`
- Pending pending-approval users → link to `/admin/users`

**Mini Stats:**
- MRR (USD), Active subscriptions, Total users, Total messages

**APIs (server Prisma):**
- `subscription.findMany()` (active, with plan)
- `subscription.count()` (pending, expired, expiring-soon)
- `user.count()`
- `message.count()`
- `paymentProof.count()` (pending/under_review)
- `bot.count()` (disconnected active users)
- `incident.count()` (open/assigned)

---

### PAGE: Admin Super Center

| Field | Value |
|-------|-------|
| **URL** | `/admin/super-center` |
| **Route** | `saas/app/admin/super-center/page.tsx` |
| **Purpose** | Unified admin hub — money + ops vitals + link grid to all admin sections |

**Main Sections:**
- KPI strip: platform wallet balance, topup revenue (30d), Meta profit (30d), paid payments, active tenants, live QR lanes, pending topups
- Hub card grid (18 cards linking to all major admin tools)

**Navigation Path:** Admin nav → "المركز الموحّد"

---

## ADMIN FINANCE

---

### PAGE: Payment Reviews

| Field | Value |
|-------|-------|
| **URL** | `/admin/payment-reviews` |
| **Route** | `saas/app/admin/payment-reviews/page.tsx` |
| **Purpose** | Review queue for manual payment proofs |

**Main Sections:**
- Summary tiles: pending / under review / approved / rejected counts
- FinancePaymentsClient — queue table + approved table

**Queue Table:**
- Proof ID, User, Amount, Method, Status, Submitted date, Receipt image preview
- Actions per row: Approve (with wallet topup), Reject (with reason input), Mark Under Review

**Dialogs:**
- Approve dialog: confirm amount, plan slug, billing cycle
- Reject dialog: reason text input
- Receipt image viewer (lightbox)

**Actions:**
- Approve proof → charges wallet + activates subscription
- Reject proof → notifies user with reason
- Mark under review
- View receipt image

**APIs:**
- `prisma.paymentProof.findMany()` (pending/under_review queue)
- `getProofStats()`, `listApprovedProofs()`
- Action APIs from `FinancePaymentsClient`

**Navigation Path:** Admin → المالية → "مراجعة المدفوعات"

---

### PAGE: Admin Analytics (Revenue & Profit)

| Field | Value |
|-------|-------|
| **URL** | `/admin/analytics` |
| **Route** | `saas/app/admin/analytics/page.tsx` |
| **Purpose** | Revenue, profit, cost-per-unit analytics for the platform |

**Main Sections:**
- Time range filter: 7 / 30 / 90 days
- Revenue KPIs: topup revenue, paid payment volume, platform wallet balance
- Profit KPIs: Meta charged, cost, profit, margin %
- Cost/unit: cost per customer, per message, per conversation, unbilled debt
- Payments by provider table (Paymob / Stripe / manual)
- Meta category breakdown table (marketing/utility/authentication/service)
- QR queue tile: utilization %, no-show rate, avg wait, lanes

**APIs:**
- `getWalletPlatformStats({ days })`
- `getPaymentStats({ days })`
- `getQueueAnalytics({ days })`

**Navigation Path:** Admin → المالية → "تحليلات الإيرادات"

---

### PAGE: Admin Wallet & Meta Billing

| Field | Value |
|-------|-------|
| **URL** | `/admin/wallet` |
| **Route** | `saas/app/admin/wallet/page.tsx` |
| **Purpose** | Platform-wide wallet management, Meta billing per tenant |

**Main Sections:**
- Platform wallet balance
- Per-tenant wallet table: user, balance, last topup, Meta spend
- Manual topup / adjust balance (admin action)

**Navigation Path:** Admin → المالية → "المحفظة وفوترة Meta"

---

### PAGE: Admin Payments & Gateways

| Field | Value |
|-------|-------|
| **URL** | `/admin/payments` |
| **Route** | `saas/app/admin/payments/page.tsx` |
| **Purpose** | Payment gateway overview and settlement |

**Navigation Path:** Admin → المالية → "المدفوعات والبوابات"

---

### PAGE: Upgrade Requests

| Field | Value |
|-------|-------|
| **URL** | `/admin/upgrade-requests` |
| **Route** | `saas/app/admin/upgrade-requests/page.tsx` |
| **Purpose** | Users requesting plan upgrades |

**Navigation Path:** Admin → المالية → "طلبات الترقية"

---

### PAGE: Broadcast Credits (QR)

| Field | Value |
|-------|-------|
| **URL** | `/admin/broadcast-credits` |
| **Route** | `saas/app/admin/broadcast-credits/page.tsx` |
| **Purpose** | Manage QR broadcast credit balances per merchant |

**Navigation Path:** Admin → المالية → "رصيد الحملات (QR)"

---

### PAGE: Executive Reports

| Field | Value |
|-------|-------|
| **URL** | `/admin/reports` |
| **Route** | `saas/app/admin/reports/page.tsx` |
| **Purpose** | Daily/weekly/monthly revenue and usage reports |

**Navigation Path:** Admin → المالية → "التقارير التنفيذية"

---

## ADMIN OPERATIONS

---

### PAGE: Operations Center

| Field | Value |
|-------|-------|
| **URL** | `/admin/operations-center` |
| **Route** | `saas/app/admin/operations-center/page.tsx` |
| **Purpose** | Single-screen platform ops hub: revenue, pending payments, obligations, incidents, staff |

**Navigation Path:** Admin → العمليات → "مركز العمليات"

---

### PAGE: Users & Subscriptions

| Field | Value |
|-------|-------|
| **URL** | `/admin/users` |
| **Route** | `saas/app/admin/users/page.tsx` |
| **Purpose** | Full merchant account management |

**Main Sections:**
- UsersUi client component
- User list table

**Table Columns:**
- User (email, name, phone), Role, Approval status, Suspended badge, Subscription (plan, status, expiry, msgs used/limit, cycle), Actions

**Actions per row:**
- Activate / suspend account
- Change subscription plan
- Extend expiry
- Set approval status
- View/reset bot

**Dialogs:**
- Activate account (plan + cycle select, set expiry)
- Suspend account (reason input)
- Change plan dialog

**Filters:**
- Search by email/name
- Filter by subscription status

**APIs (server Prisma):**
- `user.findMany()` with subscriptions
- `plan.findMany()` (active only)
- Client: action APIs via UsersUi

**Navigation Path:** Admin → العمليات → "العملاء والاشتراكات"

---

### PAGE: Admin Orders

| Field | Value |
|-------|-------|
| **URL** | `/admin/orders` |
| **Route** | `saas/app/admin/orders/page.tsx` |
| **Purpose** | Platform-wide order management |

**Navigation Path:** Admin → العمليات → "إدارة الطلبات"

---

### PAGE: Admin Incidents

| Field | Value |
|-------|-------|
| **URL** | `/admin/incidents` |
| **Route** | `saas/app/admin/incidents/page.tsx` |
| **Purpose** | Platform incident tracking and resolution |

**Navigation Path:** Admin → العمليات → "الحوادث"

---

### PAGE: Admin QR Queue

| Field | Value |
|-------|-------|
| **URL** | `/admin/qr-queue` |
| **Route** | `saas/app/admin/qr-queue/page.tsx` |
| **Purpose** | Manage QR session reservation queue — bookings, lanes, no-shows |

**Navigation Path:** Admin → العمليات → "طابور جلسات QR"

---

### PAGE: Admin Meta Platform

| Field | Value |
|-------|-------|
| **URL** | `/admin/meta` |
| **Route** | `saas/app/admin/meta/page.tsx` |
| **Purpose** | Meta Cloud API platform-level management |

**Navigation Path:** Admin → العمليات → "منصة Meta"

---

### PAGE: Admin Customers (Platform)

| Field | Value |
|-------|-------|
| **URL** | `/admin/customers` |
| **Route** | `saas/app/admin/customers/page.tsx` |
| **Purpose** | Platform-wide end-customer (end-user) overview |

**Navigation Path:** Admin → العمليات → "عملاء المنصة"

---

### PAGE: Admin Businesses

| Field | Value |
|-------|-------|
| **URL** | `/admin/businesses` |
| **Route** | `saas/app/admin/businesses/page.tsx` |
| **Purpose** | Business/merchant entity management |

**Navigation Path:** Admin → العمليات → "الأعمال"

---

### PAGE: Usage Statistics

| Field | Value |
|-------|-------|
| **URL** | `/admin/usage-stats` |
| **Route** | `saas/app/admin/usage-stats/page.tsx` |
| **Purpose** | Platform usage patterns and volume analytics |

**Navigation Path:** Admin → العمليات → "إحصائيات الاستخدام"

---

### PAGE: Customer Cap

| Field | Value |
|-------|-------|
| **URL** | `/admin/customer-cap` |
| **Route** | `saas/app/admin/customer-cap/page.tsx` |
| **Purpose** | Set per-merchant customer count limits |

**Navigation Path:** Admin → العمليات → "حدّ العملاء"

---

### PAGE: Admin Import

| Field | Value |
|-------|-------|
| **URL** | `/admin/import` |
| **Route** | `saas/app/admin/import/page.tsx` |
| **Purpose** | Bulk customer import for a specific merchant |

**Navigation Path:** Admin → العمليات → "استيراد العملاء"

---

### PAGE: Shipping Companies

| Field | Value |
|-------|-------|
| **URL** | `/admin/shipping` |
| **Route** | `saas/app/admin/shipping/page.tsx` |
| **Purpose** | Configure supported shipping carriers |

**Navigation Path:** Admin → العمليات → "شركات الشحن"

---

## ADMIN SUPPORT

---

### PAGE: WhatsApp Status (Admin)

| Field | Value |
|-------|-------|
| **URL** | `/admin/whatsapp` |
| **Route** | `saas/app/admin/whatsapp/page.tsx` |
| **Purpose** | WhatsApp connection status for all merchants |

**Main Sections:**
- Search form (email/name)
- Merchants table
- Pagination (50/page)

**Table Columns:**
- Merchant (name/email), WhatsApp status badge, Phone number, Connection mode (qr/meta), Actions

**Actions per row:**
- ResendQrButton — resend fresh QR to merchant
- DisconnectWaButton — force disconnect

**Filters:** Search `?q=email_or_name&page=N`

**APIs (server Prisma):**
- `user.findMany()` with `bot` include

**Navigation Path:** Admin → الدعم → "حالة واتساب"

---

### PAGE: Staff Management

| Field | Value |
|-------|-------|
| **URL** | `/admin/staff` |
| **Route** | `saas/app/admin/staff/page.tsx` |
| **Purpose** | Admin staff accounts, departments, workload management |

**Navigation Path:** Admin → الدعم → "إدارة الطاقم"

---

### PAGE: Internal Knowledge Base

| Field | Value |
|-------|-------|
| **URL** | `/admin/internal-kb` |
| **Route** | `saas/app/admin/internal-kb/page.tsx` |
| **Purpose** | Staff-facing problem/cause/solution knowledge base |

**Navigation Path:** Admin → الدعم → "المعرفة الداخلية"

---

### PAGE: Activation Funnel

| Field | Value |
|-------|-------|
| **URL** | `/admin/activation` |
| **Route** | `saas/app/admin/activation/page.tsx` |
| **Purpose** | Merchant activation funnel tracking |

**Navigation Path:** Admin → التسويق → "قُمع التفعيل"

---

## ADMIN TECHNOLOGY

---

### PAGE: System Health (Admin)

| Field | Value |
|-------|-------|
| **URL** | `/admin/system-health` |
| **Route** | `saas/app/admin/system-health/page.tsx` |
| **Purpose** | Platform-wide system monitoring |

**Navigation Path:** Admin → التقنية → "صحة النظام"

---

### PAGE: Metrics & Usage

| Field | Value |
|-------|-------|
| **URL** | `/admin/metrics` |
| **Route** | `saas/app/admin/metrics/page.tsx` |
| **Purpose** | Platform performance metrics |

**Navigation Path:** Admin → التقنية → "المقاييس والاستخدام"

---

### PAGE: Tenant Costs

| Field | Value |
|-------|-------|
| **URL** | `/admin/tenant-costs` |
| **Route** | `saas/app/admin/tenant-costs/page.tsx` |
| **Purpose** | AI consumption and operational cost per merchant |

**Navigation Path:** Admin → التقنية → "التكلفة والأداء لكل تاجر"

---

### PAGE: AI Logs

| Field | Value |
|-------|-------|
| **URL** | `/admin/ai-logs` |
| **Route** | `saas/app/admin/ai-logs/page.tsx` |
| **Purpose** | AI call log across all merchants |

**Navigation Path:** Admin → التقنية → "سجل الذكاء الاصطناعي"

---

### PAGE: AI Control Center

| Field | Value |
|-------|-------|
| **URL** | `/admin/ai-control` |
| **Route** | `saas/app/admin/ai-control/page.tsx` |
| **Purpose** | Platform AI safety controls and circuit breakers |

**Navigation Path:** Admin → التقنية → "مركز التحكم بالذكاء"

---

### PAGE: Embeddings & Indexing

| Field | Value |
|-------|-------|
| **URL** | `/admin/embeddings` |
| **Route** | `saas/app/admin/embeddings/page.tsx` |
| **Purpose** | Vector embedding management and re-indexing |

**Navigation Path:** Admin → التقنية → "التضمين والفهرسة"

---

### PAGE: Knowledge Brain (Admin)

| Field | Value |
|-------|-------|
| **URL** | `/admin/knowledge-brain` |
| **Route** | `saas/app/admin/knowledge-brain/page.tsx` |
| **Purpose** | Platform-wide knowledge brain oversight |

**Navigation Path:** Admin → التقنية → "العقل المعرفي"

---

### PAGE: Admin Brain Hub

| Field | Value |
|-------|-------|
| **URL** | `/admin/brain` |
| **Route** | `saas/app/admin/brain/page.tsx` |
| **Purpose** | Brain memory, classifications, dialects, segments, brain credits |

**Sub-pages:**
- `/admin/brain/global` — anonymized cross-tenant learned patterns
- `/admin/brain/marketplace` — enable/disable/price sector brains

**Navigation Path:** Admin → التقنية → "مركز الدماغ"

---

### PAGE: Agents Center (Admin)

| Field | Value |
|-------|-------|
| **URL** | `/admin/agents` |
| **Route** | `saas/app/admin/agents/page.tsx` |
| **Purpose** | AI agent executions, decisions, and actions log |

**Navigation Path:** Admin → التقنية → "مركز الوكلاء"

---

### PAGE: API Keys (Admin)

| Field | Value |
|-------|-------|
| **URL** | `/admin/api-keys` |
| **Route** | `saas/app/admin/api-keys/page.tsx` |
| **Purpose** | Issue and manage developer API keys platform-wide |

**Navigation Path:** Admin → التقنية → "مفاتيح API"

---

### PAGE: Integrations & Keys (Admin)

| Field | Value |
|-------|-------|
| **URL** | `/admin/integrations` |
| **Route** | `saas/app/admin/integrations/page.tsx` |
| **Purpose** | Platform-level integration credentials |

**Navigation Path:** Admin → التقنية → "التكاملات والمفاتيح"

---

### PAGE: Protection Logs

| Field | Value |
|-------|-------|
| **URL** | `/admin/protection-logs` |
| **Route** | `saas/app/admin/protection-logs/page.tsx` |
| **Purpose** | Security/abuse protection event log |

**Navigation Path:** Admin → التقنية → "سجل الحماية"

---

### PAGE: Admin Audit Log

| Field | Value |
|-------|-------|
| **URL** | `/admin/audit-log` |
| **Route** | `saas/app/admin/audit-log/page.tsx` |
| **Purpose** | Cross-tenant activity audit log |

**Navigation Path:** Admin → التقنية → "سجل النشاط — كل التجّار"

---

### PAGE: Feature Flags

| Field | Value |
|-------|-------|
| **URL** | `/admin/feature-flags` |
| **Route** | `saas/app/admin/feature-flags/page.tsx` |
| **Purpose** | System-level feature flag management (on/off toggles) |

**Navigation Path:** Admin → التقنية → "مفاتيح النظام"

---

## ADMIN SETTINGS

---

### PAGE: Admin Settings (Site Config)

| Field | Value |
|-------|-------|
| **URL** | `/admin/settings` |
| **Route** | `saas/app/admin/settings/page.tsx` |
| **Purpose** | Site-wide configuration: brand name, tagline, support WhatsApp, support email, logo |

**Navigation Path:** Admin → الإعدادات → "إعدادات الموقع"

---

### PAGE: Plans & Limits

| Field | Value |
|-------|-------|
| **URL** | `/admin/plans` |
| **Route** | `saas/app/admin/plans/page.tsx` |
| **Purpose** | Edit plan limits, feature flags, and pricing |

**Main Sections:**
- Plans list (from DB + catalog drift check)
- Price drift alert (when DB price ≠ catalog)
- Missing from DB alert

**PlansUi per plan:**
- Slug, name (AR/EN), description, monthly price, yearly price, status (active/archived)
- Limits: monthlyMsgs, aiRequestsMonthly, broadcastsMonthly, whatsappSessions
- Access levels: metaAccess, analyticsAccess
- Queue priority, rate limit per minute
- Feature flags JSON editor

**Actions:**
- Edit plan limits inline
- Archive plan
- Save changes

**Navigation Path:** Admin → الإعدادات → "الباقات والحدود"

---

### PAGE: Payment Methods (Admin)

| Field | Value |
|-------|-------|
| **URL** | `/admin/payment-methods` |
| **Route** | `saas/app/admin/payment-methods/page.tsx` |
| **Purpose** | Configure available payment methods (manual/Paymob/Stripe) |

**Navigation Path:** Admin → الإعدادات → "طرق الدفع"

---

### PAGE: Payment Accounts (Admin)

| Field | Value |
|-------|-------|
| **URL** | `/admin/payment-accounts` |
| **Route** | `saas/app/admin/payment-accounts/page.tsx` |
| **Purpose** | Bank accounts and receiving accounts for staff |

**Navigation Path:** Admin → الإعدادات → "حسابات الاستلام"

---

### PAGE: Memberships Matrix

| Field | Value |
|-------|-------|
| **URL** | `/admin/memberships` |
| **Route** | `saas/app/admin/memberships/page.tsx` |
| **Purpose** | Full capability comparison matrix across all plans |

**Navigation Path:** Admin → الإعدادات → "مصفوفة الباقات"

---

### PAGE: Membership Audit

| Field | Value |
|-------|-------|
| **URL** | `/admin/membership-audit` |
| **Route** | `saas/app/admin/membership-audit/page.tsx` |
| **Purpose** | Verify plan gating coverage across pages and APIs |

**Navigation Path:** Admin → الإعدادات → "تدقيق عزل الباقات"

---

### PAGE: White Label (Admin)

| Field | Value |
|-------|-------|
| **URL** | `/admin/white-label` |
| **Route** | `saas/app/admin/white-label/page.tsx` |
| **Purpose** | White-label branding settings and color themes per tenant |

**Navigation Path:** Admin → الإعدادات → "العلامة البيضاء"

---

## FINANCE PORTAL

---

### PAGE: Finance Home

| Field | Value |
|-------|-------|
| **URL** | `/finance` |
| **Route** | `saas/app/finance/page.tsx` |
| **Purpose** | Finance team portal — payment review and settlement |
| **Auth** | Admin/Finance role |

---

### PAGE: Finance Payments

| Field | Value |
|-------|-------|
| **URL** | `/finance/payments` |
| **Route** | `saas/app/finance/payments/page.tsx` |
| **Purpose** | Finance team payment operations (receipt image review + approval) |
| **Component** | `FinancePaymentsClient` (shared with `/admin/payment-reviews`) |

**Main Sections:**
- Pending/under-review queue table
- Receipt image viewer
- Approve / Reject / Mark Under Review actions
- Approved proofs history table

---

## PUBLIC LEGAL & SUPPORT PAGES

---

### PAGE: Privacy Policy

| Field | Value |
|-------|-------|
| **URL** | `/privacy` |
| **Route** | `saas/app/privacy/page.tsx` |
| **Purpose** | Privacy policy (static) |

---

### PAGE: Terms of Service

| Field | Value |
|-------|-------|
| **URL** | `/terms` |
| **Route** | `saas/app/terms/page.tsx` |
| **Purpose** | Terms of service (static) |

---

## NAVIGATION TREE

```
/                           ← Landing
/pricing                    ← Pricing
/features                   ← Features
/projects                   ← Projects/Portfolio
/support                    ← Support
/privacy                    ← Privacy Policy
/terms                      ← Terms of Service
/docs                       ← Help Center (also in dashboard ops)

/login                      ← Login
/signup                     ← Signup
/forgot-password            ← Forgot Password
/reset-password             ← Reset Password (token)
/team/accept                ← Team Invite Accept (token)

/onboarding                 ← Onboarding Wizard (6 steps)

/dashboard                  ← Overview (HOME workspace)
  /analytics                ← Analytics (HOME workspace)
  /command-center           ← Command Center (HOME workspace)

  /orders                   ← Orders List (SALES workspace)
    /[id]                   ← Order Detail
  /products                 ← Products (SALES workspace)
  /broadcasts-pro           ← QR Campaigns (SALES workspace) [primary]
  /broadcasts               ← Classic Broadcasts [URL-only, legacy]

  /customers                ← Customers List (CUSTOMERS workspace)
    /[id]                   ← Customer Detail
    /import                 ← Customer Import (legacy route)
  /inbox                    ← Inbox (CUSTOMERS workspace)
  /leads                    ← Hot Leads (CUSTOMERS workspace)
  /import                   ← Customer Import (CUSTOMERS workspace)

  /bot                      ← AI Assistant (AI workspace)
  /knowledge                ← Knowledge Base (AI workspace)
  /knowledge-brain          ← Knowledge Brain (AI workspace)
  /sales-brain              ← Sales Brain (AI workspace)
  /revenue-copilot          ← Revenue Copilot (AI workspace)
  /revenue-forecast         ← Revenue Forecast (AI workspace)
  /business-intelligence    ← Business Intelligence (AI workspace)
  /intel                    ← Smart Monitoring (AI workspace)
  /suggestions              ← AI Suggestions (AI workspace)
  /testing-arena            ← Testing Arena (AI workspace)
  /ai-audit                 ← AI Audit (AI workspace)
  /playground               ← Conversation Playground (AI workspace)
  /quick-replies            ← Quick Replies (AI workspace)
  /arena                    ← Arena hub [URL-only, consolidated]
    /benchmark
    /competitors
    /fixes
    /hallucinations
    /optimize
    /prompt-benchmark
    /quality
    /simulate
  /brain                    ← Brain [URL-only, consolidated]
  /revenue-pro              ← Revenue Pro [URL-only, consolidated]
  /agents                   ← Agents [URL-only, not production-ready]

  /funnel                   ← Conversion Funnel (GROWTH workspace)
  /segments                 ← Customer Segments (GROWTH workspace)
  /recovery                 ← Customer Recovery (GROWTH workspace)
  /business                 ← Business Performance (GROWTH workspace)

  /integrations             ← Integrations (OPS workspace)
  /automations              ← Automations (OPS workspace)
  /branches                 ← Branches (OPS workspace)
  /approvals                ← Approvals (OPS workspace)
  /whatsapp-health          ← WA Session Health [QR mode only] (OPS workspace)
  /meta-health              ← Meta Connection Health [Meta mode only] (OPS workspace)
  /meta                     ← Meta Center [Meta mode only] (OPS workspace)
  /ai-operations            ← AI Operations (OPS workspace)
  /qr-queue                 ← QR Session Reservation (OPS workspace)
  /escalations              ← Escalations (OPS workspace)
  /safety                   ← Safety (OPS workspace)
  /compliance               ← Compliance & Delivery (OPS workspace)
  /audit-log                ← Workspace Audit Log (OPS workspace)
  /system-health            ← System Health
  /monitoring               ← Monitoring [URL-only, synonym of intel]
  /whatsapp                 ← WA Link [URL-only, not working]
  /flow-builder             ← Flow Builder [URL-only, not ready]

  /coupons                  ← Coupons (DATA workspace)
  /export                   ← Data Export (DATA workspace)
  /demo                     ← Demo Data (DATA workspace)

  /settings                 ← Account Hub (SETTINGS workspace)
    /business-profile       ← Business Profile
    /ai-provider            ← AI Provider
    /providers              ← Providers
      /[domain]             ← Provider domain detail
    /meta-cloud             ← WhatsApp Connection Mode
    /bridge                 ← KEYONE Bridge (flag-gated)
      /download             ← Bridge Download
      /link                 ← Bridge Link Device
    /orders                 ← Order Settings
    /team                   ← Team Management
  /working-hours            ← Working Hours (SETTINGS workspace)
  /white-label              ← White Label (SETTINGS workspace)
  /usage                    ← Plan Usage (SETTINGS workspace)
  /plan                     ← Plan Dashboard (SETTINGS workspace)
  /billing                  ← Billing & Subscription (SETTINGS workspace)
  /wallet                   ← Wallet & Balance (SETTINGS workspace)
  /developer                ← Developer Center (SETTINGS workspace)
    /docs                   ← API Docs
    /sdk                    ← SDK Libraries

/admin                      ← Admin Daily Check
  /super-center             ← Unified Admin Hub

  /payment-reviews          ← Payment Review Queue   [FINANCE]
  /upgrade-requests         ← Upgrade Requests       [FINANCE]
  /wallet                   ← Wallet & Meta Billing  [FINANCE]
  /payments                 ← Payments & Gateways    [FINANCE]
  /analytics                ← Revenue Analytics      [FINANCE]
  /broadcast-credits        ← Broadcast Credits      [FINANCE]
  /reports                  ← Executive Reports      [FINANCE]

  /operations-center        ← Operations Hub         [OPS]
  /meta                     ← Meta Platform          [OPS]
  /users                    ← Users & Subscriptions  [OPS]
  /orders                   ← Orders (admin)         [OPS]
  /incidents                ← Incidents              [OPS]
  /qr-queue                 ← QR Queue               [OPS]
  /customers                ← Platform Customers     [OPS]
  /businesses               ← Businesses             [OPS]
  /usage-stats              ← Usage Statistics       [OPS]
  /customer-cap             ← Customer Cap           [OPS]
  /import                   ← Customer Import        [OPS]
  /shipping                 ← Shipping               [OPS]

  /whatsapp                 ← WhatsApp Status        [SUPPORT]
  /staff                    ← Staff Management       [SUPPORT]
  /internal-kb              ← Internal KB            [SUPPORT]
  /activation               ← Activation Funnel      [MARKETING]

  /system-health            ← System Health          [TECH]
  /metrics                  ← Metrics & Usage        [TECH]
  /tenant-costs             ← Tenant Costs           [TECH]
  /ai-logs                  ← AI Logs                [TECH]
  /ai-control               ← AI Control Center      [TECH]
  /embeddings               ← Embeddings             [TECH]
  /knowledge-brain          ← Knowledge Brain        [TECH]
  /brain                    ← Brain Hub              [TECH]
    /global                 ← Global Brain           [TECH]
    /marketplace            ← Brain Marketplace      [TECH]
  /agents                   ← Agents Center          [TECH]
  /api-keys                 ← API Keys               [TECH]
  /integrations             ← Integrations           [TECH]
  /protection-logs          ← Protection Logs        [TECH]
  /audit-log                ← Cross-tenant Audit Log [TECH]
  /feature-flags            ← Feature Flags          [TECH]

  /settings                 ← Site Config            [SETTINGS]
  /plans                    ← Plans & Limits         [SETTINGS]
  /white-label              ← White Label            [SETTINGS]
  /payment-methods          ← Payment Methods        [SETTINGS]
  /payment-accounts         ← Payment Accounts       [SETTINGS]
  /memberships              ← Memberships Matrix     [SETTINGS]
  /membership-audit         ← Membership Audit       [SETTINGS]

/finance                    ← Finance Portal
  /payments                 ← Finance Payments

/privacy                    ← Privacy Policy
/terms                      ← Terms of Service
```

---

## FEATURE DEPENDENCY MAP

### Plan Capabilities → Pages

| Capability Key | Pages Requiring It |
|---------------|-------------------|
| `advanced_analytics` | /dashboard/analytics, /dashboard/command-center, /dashboard/business-intelligence, /dashboard/funnel |
| `broadcasts` | /dashboard/broadcasts, /dashboard/broadcasts-pro |
| `lead_scoring` | /dashboard/leads |
| `knowledge_base` | /dashboard/knowledge |
| `smart_assistant` | /dashboard/knowledge-brain, /dashboard/brain, /dashboard/suggestions |
| `sales_pipeline` | /dashboard/sales-brain |
| `revenue_attribution` | /dashboard/revenue-copilot, /dashboard/revenue-forecast |
| `advanced_insights` | /dashboard/intel |
| `customer_segmentation` | /dashboard/segments |
| `smart_campaign_builder` | /dashboard/recovery, /dashboard/coupons |
| `advanced_reporting` | /dashboard/business |
| `advanced_automations` | /dashboard/automations |
| `multi_branch` | /dashboard/branches |
| `approval_workflows` | /dashboard/approvals |
| `api_access` | /dashboard/developer |
| `working_hours` | /dashboard/working-hours |

### Module Toggles → Nav/Pages

| Module Key | Pages Affected |
|-----------|---------------|
| `products` | /dashboard/products |
| `orders` | /dashboard/orders |
| `broadcasts` | /dashboard/broadcasts-pro, /dashboard/broadcasts, /dashboard/recovery, /dashboard/coupons |
| `crm` | /dashboard/leads, /dashboard/segments, /dashboard/funnel |
| `branches` | /dashboard/branches |
| `reports` | /dashboard/business-intelligence, /dashboard/business |

### Connection Mode → Pages

| Mode | Visible Pages |
|------|--------------|
| QR mode | /dashboard/whatsapp-health |
| Meta mode | /dashboard/meta-health, /dashboard/meta |

### Feature Flags → Pages

| Flag | Page |
|------|------|
| `BRIDGE_ENABLED` | /dashboard/settings/bridge |

---

## PERMISSION MATRIX

### Merchant RBAC Roles

| Role | Description |
|------|-------------|
| owner | Full access to all pages; only owner sees billing |
| admin | Most pages except super-admin actions |
| sales | customers, inbox, orders, broadcasts |
| support | inbox, customers (read) |
| viewer | analytics, dashboard (read-only) |

### Permission Keys → Pages

| Permission | Pages |
|-----------|-------|
| `analytics` | /dashboard, /dashboard/analytics, /dashboard/command-center, /dashboard/settings, /dashboard/usage, /dashboard/plan, /dashboard/funnel, /dashboard/segments (+ others via workspace nav) |
| `customers` | /dashboard/customers, /dashboard/customers/:id, /dashboard/orders, /dashboard/leads, /dashboard/import, /dashboard/export |
| `inbox` | /dashboard/inbox |
| `settings` | /dashboard/bot, /dashboard/knowledge, /dashboard/knowledge-brain, /dashboard/settings/* (all sub-pages), /dashboard/products, /dashboard/integrations, /dashboard/automations, /dashboard/branches, /dashboard/ai-audit, /dashboard/playground, /dashboard/quick-replies, /dashboard/safety, /dashboard/compliance, /dashboard/ai-operations, /dashboard/working-hours, /dashboard/white-label, /dashboard/developer |
| `broadcasts` | /dashboard/broadcasts, /dashboard/broadcasts-pro, /dashboard/recovery, /dashboard/qr-queue |
| `team` | /dashboard/settings/team, /dashboard/approvals, /dashboard/audit-log |
| `billing` | /dashboard/billing, /dashboard/wallet |
| `escalations` | /dashboard/escalations |

### Role × Permission Matrix

| Permission | owner | admin | sales | support | viewer |
|-----------|-------|-------|-------|---------|--------|
| analytics | ✓ | ✓ | ✓ | ✓ | ✓ |
| customers | ✓ | ✓ | ✓ | ✗ | ✗ |
| inbox | ✓ | ✓ | ✓ | ✓ | ✗ |
| settings | ✓ | ✓ | ✗ | ✗ | ✗ |
| broadcasts | ✓ | ✓ | ✓ | ✗ | ✗ |
| team | ✓ | ✓ | ✗ | ✗ | ✗ |
| billing | ✓ (owner only) | ✗ | ✗ | ✗ | ✗ |
| escalations | ✓ | ✓ | ✓ | ✓ | ✗ |

### Pre-activation Nav Restriction

When subscription is not active, all nav hides except:
- /dashboard
- /dashboard/billing
- /dashboard/wallet
- /dashboard/plan
- /dashboard/usage
- /dashboard/settings

### Admin Panel

- Accessible to `role: "admin"` users only (enforced by `app/admin/layout.tsx`)
- Finance portal (`/finance/*`) accessible to admin/finance staff

---

*End of WKEYONE Application Inventory — 2026-07-28*
