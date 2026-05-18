# ذكاء — SaaS بوت واتساب ذكي

منصة عربية لبيع اشتراكات بوت واتساب مدعوم بالـ AI.

## المعمارية

```
[Next.js SaaS] ──> [mse_ai_api (FastAPI/ChatGPT)] 
       │
       ├─> [Prisma + SQLite/Postgres] (users, conversations, knowledge)
       │
       └─> [Baileys microservice] (Phase 2 — WhatsApp send/receive/voice/image)
```

## التشغيل المحلي

```bash
# 1. شغل الـ LLM API الأول (في مجلد الـ root)
cd ..
.venv/bin/python -c "import uvicorn; from main import app; uvicorn.run(app, host='127.0.0.1', port=7788)"

# 2. شغل الـ SaaS
cd saas
npm install
npx prisma db push
npx tsx prisma/seed.ts
npm run dev
```

افتح: <http://localhost:3000>

## المميزات الحالية (Phase 1)

- ✅ Landing page عربي RTL احترافي
- ✅ Auth (signup/login) بـ JWT cookies
- ✅ Dashboard (نظرة عامة + إحصائيات)
- ✅ إعدادات البوت (اسم, شخصية, system prompt, كلمات تنبيه)
- ✅ قاعدة المعرفة (CRUD مستندات)
- ✅ قائمة العملاء + ذاكرة منفصلة لكل عميل
- ✅ Playground لتجربة البوت
- ✅ كشف الأوردر/التحويل تلقائياً + إشعار للتاجر
- ✅ خطط اشتراك (تجربة 14 يوم تلقائية)

## Phase 2 (قادم)

- [ ] Baileys microservice على بورت 3001
- [ ] QR code للربط
- [ ] webhook لاستقبال رسائل واتساب
- [ ] Whisper API للصوت
- [ ] Vision API للصور

## Phase 3 (قادم)

- [ ] Paymob integration
- [ ] Webhooks للدفع
- [ ] إدارة الترقيات والإلغاءات

## ملفات مهمة

- `prisma/schema.prisma` — DB schema
- `lib/llm.ts` — System prompt builder + LLM client
- `lib/notify.ts` — Merchant notifications
- `app/api/chat/route.ts` — العقل: ذاكرة + RAG + كشف الأوردر
- `app/page.tsx` — Landing
- `app/dashboard/*` — لوحة التحكم
