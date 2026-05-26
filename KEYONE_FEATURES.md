# KEYONE Features

## Core Platform

### WhatsApp Bot
- QR code and pairing code connection
- Multi-session WhatsApp management
- Connection health monitoring and auto-reconnect
- Anti-flood pacing and rate limiting
- Safety engine with kill-switch protection

### AI Engine
- Multi-provider support (KEYONE, OpenAI, Gemini, Claude, Groq, OpenRouter)
- Smart context-aware replies
- Sales intelligence and negotiation
- Emotion detection and escalation
- Reply variation and humanization
- Response caching (24h exact-match)
- Multi-language support (Arabic-first)

### Knowledge Base
- Document import (manual, URL, PDF, DOCX)
- Smart retrieval and ranking
- Auto-suggestions from unanswered questions
- Semantic matching
- Priority scoring
- Hit count tracking

### Orders Management
- Auto-extraction from WhatsApp conversations
- Manual order creation
- Order status tracking (pending → confirmed → shipped → delivered)
- Payment method detection
- Tracking code and URL support
- AI confidence scoring
- Order timeline and history
- Commerce integration sync

### Customer Management
- Auto-capture from WhatsApp inbound
- Lead scoring (0-100)
- Intent detection (buy, inquiry, complaint, support)
- Sentiment tracking
- Follow-up automation
- Cart abandonment detection
- Tags and notes
- Retention and loyalty scoring
- Churn risk prediction

## Commerce Integrations

### Supported Platforms
- **Shopify**: Webhook-based order sync
- **WooCommerce**: REST API + webhook integration
- **Salla**: OAuth2 + webhook (Saudi market)
- **Zid**: OAuth2 + webhook (Saudi market)
- **Custom**: Generic webhook/API integration

### Integration Features
- Connect wizard with platform-specific instructions
- Test connection with synthetic order
- Sync now for manual reconciliation
- Key rotation and reconnection
- Enable/disable toggle
- Connection health status
- Webhook event log
- Automation rules per event type

### Commerce Automation
- Order created → WhatsApp notification
- Order confirmed → Customer update
- Order shipped → Tracking notification
- Order delivered → Delivery confirmation
- Payment failed → Customer alert
- Email notifications (SMTP, Resend, Brevo)

## Broadcast System
- Targeted campaigns (all, hot, warm customers)
- Safe exact mode (literal message)
- AI personalization mode (per-customer rewording)
- Rate-limited gradual sending
- Campaign status tracking (queued → sending → done)
- Cancel in-flight campaigns
- Per-customer opt-out support

## Safety & Anti-Ban

### Protection Layers
- Warmup stage progression (day1 → mature)
- Daily/hourly rate limits
- Kill-switch on failure spikes
- Cooldown on risk threshold
- Outbound/inbound ratio monitoring
- Spam and abuse detection
- Storm detection (reconnect cycles)
- Rollout blackout hours

### Trust System
- Per-contact trust scoring (0-100)
- Engagement scoring
- First inbound detection
- Historical customer activation
- Ban/unban management

## Dashboard

### Merchant Dashboard
- Real-time overview with KPIs
- Analytics and trends
- Inbox and conversation view
- Customer profiles with chat history
- Order management
- Broadcast campaigns
- Quick replies
- Working hours configuration
- Knowledge base management
- Bot settings and persona
- WhatsApp connection management
- Safety dashboard
- Usage and billing
- Commerce integration management
- Sales intelligence
- Lead tracking
- Escalations management
- AI playground

### Admin Dashboard
- Platform overview with MRR tracking
- Customer and subscription management
- Real-time businesses view
- Plan configuration and limits
- System metrics and provider usage
- Customer list with search
- Orders management
- AI logs
- Protection/safety logs
- Usage statistics
- WhatsApp connection status
- Site settings (brand, support contacts)
- Runtime diagnostics

## Subscription & Billing

### Plan Management
- Tier-based plans (Starter, Pro, Business, Enterprise)
- Monthly and yearly billing cycles
- Usage counters with auto-reset
- Feature flags per plan
- Overage enforcement
- Admin-manual renewals

### Usage Tracking
- Per-user message counters
- AI request tracking
- Broadcast counters
- Monthly rollover on calendar month
- Usage ledger with idempotency
- Daily usage snapshots

## Intelligence Features

### Sales Engine
- Lead scoring (buying intent probability)
- Negotiation with configurable floor pricing
- Persuasion (urgency/scarcity hints)
- Purchase probability prediction
- Hesitation detection
- Conversion scoring
- Cart abandonment recovery

### Memory Engine
- Rolling conversation summaries
- Structured fact extraction
- Customer preferences tracking
- Sentiment history
- Memory confidence scoring
- Automated stale data pruning

### Follow-up System
- Smart nudges based on conversation context
- Configurable timing and frequency
- Anti-spam per-customer cap
- Quiet hours support
- Revenue impact tracking
- Conversion attribution

### Daily Report
- Automated WhatsApp summary
- Previous day's orders, customers, leads
- Configurable delivery time
- Arabic formatting
- Heuristic-only (no LLM cost)

## Technical Features

### Security
- API key + HMAC webhook verification
- Session management
- Rate limiting per endpoint
- Abuse detection
- Encrypted secrets at rest
- Admin access control

### Reliability
- Message retry with backoff/jitter
- Stuck message recovery (30-min timeout)
- Connection keep-alive with drift detection
- Deferred writes for DB pressure reduction
- Graceful WhatsApp service degradation

### Observability
- Metric events (llm_call, cache_hit, etc.)
- Provider usage tracking
- Daily usage snapshots
- Safety event audit trail
- Runtime diagnostics endpoint
