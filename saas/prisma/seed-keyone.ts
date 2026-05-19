import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "yahyaemad999@gmail.com" },
  });
  if (!user) throw new Error("user not found");
  console.log("user:", user.id);

  // Update bot config
  await prisma.bot.update({
    where: { userId: user.id },
    data: {
      name: "كي وان - مساعد المبيعات",
      persona: "professional",
      welcomeMessage:
        "أهلاً بحضرتك في KEYONE 👋\nإحنا شركة برمجيات بنبني حلول تقنية متكاملة (Backend, AI, تطبيقات موبايل، مواقع، Cyber Security، تصميم).\nقولي بتفكر في إيه أو محتاج تطور إيه، وأنا هساعدك توصل لأفضل حل 💡",
      systemPrompt: `أنت مساعد المبيعات الرسمي لشركة KEYONE (كي وان) - شركة برمجيات مصرية متخصصة في حلول البرمجة والذكاء الاصطناعي والأمن السيبراني والتصميم.

=== مهمتك الأساسية ===
1. افهم احتياج العميل بدقة قبل ما تعرض أي حل. اسأل أسئلة ذكية ومحددة.
2. اقنع العميل إن KEYONE قادرة تنفذ طلبه - بناءً على معرفتك بخدماتنا وفريقنا ومشاريعنا السابقة.
3. اربط مشكلة العميل بحل عملي من خبراتنا.
4. اطلب بيانات التواصل (واتساب + اسم) في أقرب فرصة مناسبة عشان فريقنا يتواصل معاه.
5. لما العميل يقتنع، اطلب تأكيد الطلب أو حدد الخطوة الجاية.

=== أسلوبك ===
- عربي مصري طبيعي (مش فصحى متكلفة).
- محترف وودود.
- ردود قصيرة (2-4 جمل عادةً)، إلا لو سؤال تقني محتاج تفصيل.
- لا تخترع أسعار أو مواعيد. لو العميل سأل سعر محدد، قول إن فريق المبيعات هيرجعله بعرض دقيق حسب المتطلبات.
- لا تدّعي خدمة مش في معرفتك. لو الطلب خارج نطاقنا، قول بصراحة واقترح حل بديل.

=== خطوات الإقناع ===
1. اسأل: 'طبيعة المشروع؟' / 'شركة قائمة ولا ستارت أب؟' / 'الجمهور المستهدف؟'.
2. اعرض مشروع شبيه عملناه كـ social proof.
3. اشرح القيمة (المشكلة اللي بنحلها) مش الـ features.
4. حدد خطوة جاية واضحة: 'تحب نحدد ميتنج؟' أو 'ابعتلي تفاصيل أكتر وهرجعلك بعرض'.`,
      orderKeywords:
        "اوردر,طلب,حولت,تحويل,موافق,ابدأ,يلا نمشي,ابعتلي عرض,محتاج عرض,عايز اشتري,تمام نمشي,ابعت تفاصيل,سعر نهائي,نتعاقد,دفعت,حولتلكم,بعت تحويل,ابعت كونتراكت,حدد ميتنج",
      notifyPhone: "+201111111111",
    },
  });
  console.log("✓ bot config updated");

  // Wipe old docs and insert fresh ones
  await prisma.document.deleteMany({ where: { userId: user.id } });

  const docs: { title: string; content: string }[] = [
    {
      title: "نبذة عن KEYONE",
      content: `KEYONE (كي وان) شركة برمجيات مصرية - شعارنا "Code. Automate. Intelligent. Impact."
الموقع الرسمي: KEYONE1.COM

تخصصنا:
- بناء حلول برمجية متكاملة (Backend + Frontend + Mobile)
- أنظمة ذكاء اصطناعي متقدمة (LLMs, RAG, AI Agents)
- اختبار اختراق وأمن سيبراني
- تصميم UI/UX وهوية بصرية
- أتمتة العمليات (Workflow Automation, n8n)
- تكامل أنظمة الدفع وإدارة المخزون والحجوزات

هدفنا: نبسّط التحدي التقني للشركات والستارت أبس ونوصلهم لمنتج شغال على أرض الواقع بأقل وقت وتكلفة.`,
    },
    {
      title: "خدمات Backend & APIs",
      content: `بنبني RESTful APIs و real-time systems احترافية.

التكنولوجيز اللي بنشتغل بيها:
- Languages: JavaScript, TypeScript, C++, Python
- Frameworks: Node.js, NestJS, Express, FastAPI
- Real-time: WebSockets, Socket.IO, GraphQL
- Databases: PostgreSQL, MongoDB, Firebase, Redis
- ORMs: Mongoose, TypeORM, Prisma
- DevOps: Docker, Render, Vercel, Cloudinary
- Auth: JWT, RBAC, OAuth
- Architecture: Clean Architecture, MVC, Microservices

أمثلة على ما نقدمه:
- E-commerce APIs كاملة (Stripe, JWT, PDF invoices)
- Booking systems (فنادق، عيادات، خدمات)
- Inventory management (مع Barcode + WebSocket alerts)
- Real-time chat platforms
- Payment integrations (Stripe, Paymob, إلخ)`,
    },
    {
      title: "خدمات الذكاء الاصطناعي",
      content: `قسم AI عندنا متخصص في حلول الجيل الجديد من LLMs وأنظمة الذكاء الاصطناعي.

الخبرات:
- LLM Engineering & Fine-tuning (LoRA, PEFT)
- RAG Architecture & Prompt Routing
- AI Agents & Workflow Automation (n8n)
- Hugging Face Transformers
- PyTorch, Scikit-learn, Transfer Learning
- Vector Databases (pgvector, Supabase)
- Model Deployment & API Integration
- Python, FastAPI, Docker, Streamlit

أمثلة على مشاريع عملناها:
1. PaLI-Gemma 3B-2B4 Finetuning for VQA - حقق 79.35% دقة على EvalAI VQA leaderboard (Rank #47)، نشرناه كـ REST API ودمجناه مع Flutter app.
2. GymIQ - AI Gym Intelligence Backend: Multi-tenant gym management API مع RAG chatbot و AI nutrition coach (FastAPI + Supabase + Groq Llama 3 + Cohere embeddings).
3. AI Agents with RAG (n8n) - autonomous agents لـ مساعد مطعم وتأهيل عملاء (intent classification + routing + real-world tools).
4. Quran Yufid Platform - منصة تعلم قرآن مدعومة بالـ AI مع نظام دفع وتسجيلات صوتية.

بنبني شات بوتس ذكية لخدمة العملاء، أتمتة المبيعات، تحليل بيانات، أنظمة توصية، ومنصات تعليمية AI-powered.`,
    },
    {
      title: "خدمات Cyber Security",
      content: `قسم الأمن السيبراني عندنا بيقدم Penetration Testing وتقييم ثغرات.

الخدمات:
- Web App Security Testing
- Network Security Assessment
- Vulnerability Assessment & Reporting
- API Penetration Testing
- Mobile App Security
- Bug Bounty Hunting

الأدوات والشهادات:
- Linux, Wireshark, Python scripting
- Reporting tools احترافية
- شهادات: CCNA Security, eJPT, eWPT, CAP (API Pentest)
- خبرة من Bootcamps: We Innovate, Depi, CyberTalent, ZINAD IT, EFE Egypt with IBM SkillBuild

كل تقييم بيتسلم بتقرير تقني مفصّل + ملخص للإدارة + خطوات إصلاح واضحة.`,
    },
    {
      title: "خدمات التصميم والـ Marketing",
      content: `قسم التصميم والـ Marketing مسؤول عن الهوية البصرية والمحتوى وحملات الإعلان.

الخدمات:
- Graphic Design (Photoshop, Illustrator, Canva)
- UI/UX Design (Figma)
- Branding & Visual Identity
- Wireframing & Prototyping
- Social Media Marketing
- Paid Ads (Meta, Google)
- Content Strategy
- SEO Basics & Analytics
- AI-Powered Content Creation
- Workflow Automation

بنعمل: لوجو، هوية بصرية كاملة، تصميم مواقع وتطبيقات، إدارة حملات إعلانية، إنتاج محتوى بصري وصوتي مدعوم بـ AI، وتقارير أداء بـ insights عملية.`,
    },
    {
      title: "مشاريع سابقة (Portfolio)",
      content: `أبرز المشاريع اللي نفذناها:

1. E-commerce API
نظام تجارة إلكترونية كامل مع Stripe payments و JWT authentication و توليد فواتير PDF تلقائي. بنية scalable ومناسبة لشركات بأي حجم.

2. ChatHub (Real-Time Chat)
منصة شات لحظية بـ Socket.IO، تدعم جروبات، attachments، استبيانات، وتحليلات.

3. Inventory System
نظام إدارة مخزون real-time مع تتبع بـ Barcode، تنبيهات WebSocket، وتقارير تلقائية.

4. Booking System (Hotel)
نظام حجز فنادق مع reviews وتوصيات وتخزين سحابي.

5. Quran Yufid Platform
منصة تعلم قرآن بـ AI مع نظام دفع وتسجيلات صوتية.

6. PaLI-Gemma 3B Finetuning for VQA
نموذج Vision-QA متقدم - Rank #47 على EvalAI VQA leaderboard، 79.35% accuracy.

7. GymIQ
AI Gym Backend: chatbot RAG + nutrition coach + multi-tenant.

8. IoT Water Level Controller (Graduation Project Grade A+)
نظام IoT لمراقبة مستويات المياه بدشبورد Live.

9. AI Agents with RAG (n8n)
Autonomous agents لمطعم ومبيعات - intent classification + tool calling.

كل مشروع منهم بدأ من فهم احتياج العميل وانتهى بمنتج شغال في الـ production.`,
    },
    {
      title: "الفريق والـ Expertise",
      content: `فريق KEYONE من مهندسين وخبراء متخصصين:

- Backend Engineers (Node.js, NestJS, FastAPI) - بناء أنظمة scalable.
- AI Engineers (LLMs, RAG, Agents, Fine-tuning) - حلول ذكاء اصطناعي إنتاجية.
- Penetration Testers & Bug Hunters (eJPT, eWPT, CCNA Security) - أمن سيبراني.
- UI/UX Designers (Figma, Adobe Suite) - تجربة مستخدم احترافية.
- Marketing & AI Solutions (Meta Ads, Google Ads, AI content) - وصول وتسويق فعال.

كل عضو في الفريق عنده شهادات وخبرة عملية موثقة (Bootcamps دولية، Internships، مشاريع تخرج بدرجات A و A+).
الفريق بيشتغل بمنهجية Agile مع reporting أسبوعي للعميل وتسليم تدريجي.`,
    },
    {
      title: "منتج جاهز: خدمة بوت واتساب للأعمال (WhatsApp AI Bot)",
      content: `KEYONE عندنا منتج SaaS جاهز للاشتراك المباشر اسمه "بوت واتساب الذكي" للشركات والمتاجر.

ما هو؟
- منصة تربط رقم واتساب نشاطك ببوت ذكي يرد على عملاءك تلقائياً 24/7.
- يفهم العربي المصري والفصحى ويرد بأسلوب طبيعي.
- يتنبه للطلبات وأرقام التحويلات ويبعتلك إشعار فوري.
- يقرأ من قاعدة المعرفة بتاعتك (أسعارك، خدماتك، سياساتك).
- لوحة تحكم بتقارير وتحليلات وعدد رسائل واستهلاك.

الباقات (شهرية بالدولار):
1. الباقة الأساسية (Starter): $29/شهر — 2,000 رسالة، رقم واتساب واحد، دعم بالإيميل.
2. الباقة الاحترافية (Pro): $79/شهر — 10,000 رسالة، رقمين، تحليلات متقدمة، دعم أولوية. **الأشهر مبيعاً**.
3. الباقة المتقدمة (Business): $149/شهر — 30,000 رسالة، 5 أرقام، تكاملات API، دعم 24/7.
4. باقة المؤسسات (Enterprise): $299/شهر — رسائل غير محدودة، أرقام غير محدودة، مدير حساب، SLA مخصص.

طرق الدفع المتاحة:
- فودافون كاش
- إنستاباي
- تحويل بنكي محلي
- فيزا/ماستركارد

الاشتراك والتفعيل:
- العميل بيدخل على الموقع keyone1.com ويسجل، أو يقدر يكلمنا مباشرة على واتساب الإدارة.
- بعد تأكيد الدفع بنفعّل الاشتراك خلال دقائق وبنرسل بيانات الدخول.
- التفعيل أو الترقية في أي وقت، والإلغاء بدون التزام طويل.

التعليمات لما العميل يسأل عن السعر:
- اعرض الباقات اللي فوق باختصار.
- اقترح الباقة الأنسب حسب حجم نشاط العميل (لو محل صغير = Starter، متجر = Pro، شركة كبيرة = Business/Enterprise).
- اطلب اسمه ورقمه واسأل عن حجم رسائل واتساب الشهري التقريبي عشان نرشّحله الأنسب.
- ووجّهه يكلم رقم الواتساب الرسمي لتفعيل الاشتراك ودفع الاشتراك أو يدخل صفحة الأسعار في الموقع keyone1.com/pricing.`,
    },
    {
      title: "إجراءات التسعير والتعاقد",
      content: `طريقة تعاملنا مع العملاء:

1. مكالمة استكشافية مجانية (15-30 دقيقة) لفهم المتطلبات.
2. عرض فني وتقني مفصّل خلال 1-3 أيام عمل.
3. عقد رسمي يحدد الـ Scope والـ Milestones وطرق الدفع.
4. عربون 30-50% للبدء، والباقي على دفعات حسب المراحل.
5. متابعة وتسليم تدريجي + جلسات review أسبوعية.
6. ضمان وصيانة لمدة محددة بعد التسليم.

ملاحظة مهمة:
الأسعار بتتحدد حسب نطاق المشروع وتعقيده. لا نقدم أسعار جاهزة من غير ما نفهم المتطلبات الأول.
لو العميل عايز سعر تقريبي، نقدر نديله Range بعد ما يشرحلنا الفكرة.

طرق التواصل:
- الموقع: KEYONE1.COM
- واتساب: من خلال نفس الرقم اللي بيكلم البوت ده
- الإيميل: عبر الموقع`,
    },
  ];

  for (const d of docs) {
    await prisma.document.create({ data: { userId: user.id, ...d } });
    console.log("✓ added:", d.title);
  }

  console.log(`\n✅ Done. ${docs.length} knowledge documents added for KEYONE.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
