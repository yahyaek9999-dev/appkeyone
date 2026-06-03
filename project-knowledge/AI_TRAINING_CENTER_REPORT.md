# KEYONE — AI Training Center Report

**Date:** 2026-06-03
**Epic:** B — AI Training Center
**Status:** ✅ Implemented (additive only — no schema changes, no send-pipeline touches)

---

## Background / Gap

Per project-knowledge docs, the AI Training Center was listed as a gap. After reading the actual
codebase, it was much more complete than documented:

| Feature | Documented Status | Actual Status |
|---------|------------------|---------------|
| PDF import | Documented as gap | ✅ Already complete (`pdf-parse` installed) |
| DOCX import | Documented as gap | ✅ Already complete (`mammoth` installed) |
| URL import | Documented as gap | ✅ Already complete (`cheerio` installed) |
| TXT import | Documented as gap | ❌ Not supported — route rejected `.txt` |
| FAQ Builder | Documented as gap | ❌ Not implemented |
| Product catalog import | Documented as gap | ❌ Not implemented |
| Source badges / telemetry | Documented as gap | ❌ Not shown — only char count |
| Training status panel | Documented as gap | ❌ Not shown |

---

## What Was Already Complete (No Changes Needed)

- `lib/knowledge-import.ts` — `parsePdf()`, `parseDocx()`, `crawlUrl()` fully working
- `app/api/knowledge/import-file/route.ts` — PDF + DOCX already working
- `app/api/knowledge/import-url/route.ts` — URL crawl already working
- `app/api/knowledge/route.ts` — CRUD already working
- `lib/kb-cache.ts` — semantic retrieval working, `hitCount`/`lastMatchedAt` tracked in schema

---

## Changes Implemented

### B2 — TXT Upload Support

**Edited:** `app/api/knowledge/import-file/route.ts`

- Added `.txt` / `text/plain` branch: decodes buffer as UTF-8, caps at 60,000 chars
- Error messages in Arabic ("الملف فارغ")
- Updated error message for unsupported types to mention TXT
- File picker `accept` in `knowledge-ui.tsx` updated to include `.txt,text/plain`

### B3 — Training Status + Sources Panel

**Edited:** `app/dashboard/knowledge/knowledge-ui.tsx`

New "حالة التدريب" panel at the top of the Knowledge page showing:
- Total document count with "نشط" badge
- 4 stat boxes: source count, total chars, usage hits, last-updated (relative time)
- Source breakdown chips (manual/url/pdf/docx/txt/faq/products/suggestion)

Each document card now shows:
- **Source badge** (colored by type: PDF=rose, Word=brand-green, URL=blue, FAQ=amber, etc.)
- **Hit count** ("استُخدم N مرة") from existing `Document.hitCount` field
- **Last used** (relative time) from existing `Document.lastMatchedAt` field

**No schema changes** — `hitCount` and `lastMatchedAt` already existed on `Document`.

### B4 — FAQ Builder

**Edited:** `app/api/knowledge/route.ts` — `source` field now accepts `"manual" | "faq" | "products"` (Zod enum, whitelisted)

**Edited:** `app/dashboard/knowledge/knowledge-ui.tsx` — FAQ Builder modal:
- Collects Q/A pairs with add/remove controls
- Formats as `"س: …\nج: …"` pairs
- Saves as a single `Document` with `source: "faq"`
- Shown with amber FAQ badge in the document list

### B5 — Product Catalog Import

**New file:** `app/api/knowledge/import-products/route.ts`

Reuses the existing `importKnowledge()` parser from `lib/knowledge-importer.ts` (the same
parser the onboarding wizard already uses). Accepts pasted "name — price" lines and:
1. Creates `Product` rows (catalog, capped at 200 products per import)
2. Stores a `Document` with `source: "products"` for AI retrieval (bot can answer price Qs)

**Edited:** `app/dashboard/knowledge/knowledge-ui.tsx` — Product Import modal with example format display.

### Knowledge Page Header

**Edited:** `app/dashboard/knowledge/page.tsx`

- Page title changed to "مركز تدريب الذكاء الاصطناعي"
- `prisma.document.findMany` now selects `hitCount`, `lastMatchedAt`, `sourceUrl` for telemetry display

---

## Plan Matrix (after implementation)

| Source type | Import path | File picker | Route |
|-------------|-------------|-------------|-------|
| Text (manual) | Modal editor | N/A | `POST /api/knowledge` |
| URL crawl | URL input | N/A | `POST /api/knowledge/import-url` |
| PDF | File picker | `.pdf` | `POST /api/knowledge/import-file` |
| DOCX (Word) | File picker | `.docx` | `POST /api/knowledge/import-file` |
| TXT *(new)* | File picker | `.txt` | `POST /api/knowledge/import-file` |
| FAQ *(new)* | FAQ Builder modal | N/A | `POST /api/knowledge` (source=faq) |
| Products *(new)* | Product Import modal | N/A | `POST /api/knowledge/import-products` |

---

## Before / After

### Before
- Knowledge page title: "قاعدة المعرفة"
- Only PDF and DOCX accepted (TXT rejected)
- No source badges — all docs looked identical
- No usage telemetry shown
- No FAQ workflow — user had to write Q/A in a textarea manually
- No product import — text had to be pasted manually or done during onboarding only

### After
- Page title: "مركز تدريب الذكاء الاصطناعي"
- Training status panel shows at a glance: source count, chars, usage hits, last-updated
- Per-document source badges (PDF=rose, Word=green, URL=blue, FAQ=amber, products=purple, etc.)
- Per-document telemetry: "استُخدم N مرة" and relative last-used time
- TXT files accepted
- FAQ Builder: structured Q/A pairs → saved as knowledge source
- Product import: "name — price" lines → creates both Product rows and a knowledge document

---

## Files Changed

| File | Change |
|------|--------|
| `app/api/knowledge/import-file/route.ts` | Added TXT support |
| `app/api/knowledge/route.ts` | `source` param (whitelisted enum) |
| `app/api/knowledge/import-products/route.ts` | NEW — product catalog import |
| `app/dashboard/knowledge/knowledge-ui.tsx` | Full rewrite — training panel, source badges, telemetry, FAQ modal, product modal |
| `app/dashboard/knowledge/page.tsx` | New title, select hitCount/lastMatchedAt |

## Not Changed (intentionally preserved)

- `lib/knowledge-import.ts` — parsers untouched
- `lib/kb-cache.ts` — retrieval logic untouched
- `lib/knowledge-importer.ts` — text parser untouched
- All send pipeline, queue, billing, analytics files — zero touches
- Prisma schema — zero changes

---

## Verification

- `npx tsc --noEmit` → 0 errors
- `npm run build` → build passes
- `npm run verify:all` → regression suite passes
- Manual: upload TXT → appears in list with TXT badge; open FAQ Builder → add Q/A → saved with FAQ badge; open Product Import → paste list → Product rows created + knowledge doc added
