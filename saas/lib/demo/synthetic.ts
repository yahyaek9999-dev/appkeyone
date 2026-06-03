// Demo mode — in-memory synthetic data (never writes to DB, never sends).
//
// Provides a realistic sample of customers, conversations, messages, orders,
// and intelligence signals so a new merchant can experience the full UX before
// connecting WhatsApp. All IDs are prefixed "demo_" so nothing can accidentally
// interact with real records. Pure read-only — no side effects.

export interface DemoCustomer {
  id: string;
  name: string;
  phone: string;
  leadScore: number;
  lastIntent: string;
  lastSentiment: string;
  botPaused: boolean;
  lastMessage: string;
  lastRole: string;
  lastAt: string;
  msgCount: number;
}

export interface DemoMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface DemoConversation {
  customer: DemoCustomer;
  messages: DemoMessage[];
}

export interface DemoOrder {
  id: string;
  customerName: string;
  total: number;
  status: string;
  items: string;
  createdAt: string;
}

const NOW = new Date();
const ago = (mins: number) => new Date(NOW.getTime() - mins * 60000).toISOString();

export const DEMO_CUSTOMERS: DemoCustomer[] = [
  {
    id: "demo_c1",
    name: "سارة محمد",
    phone: "+201012345678",
    leadScore: 85,
    lastIntent: "buy",
    lastSentiment: "positive",
    botPaused: false,
    lastMessage: "تمام ابعتلي التفاصيل على الرقم ده",
    lastRole: "user",
    lastAt: ago(5),
    msgCount: 12,
  },
  {
    id: "demo_c2",
    name: "أحمد علي",
    phone: "+201098765432",
    leadScore: 62,
    lastIntent: "inquiry",
    lastSentiment: "neutral",
    botPaused: false,
    lastMessage: "إيه السعر التيشيرت القطن؟",
    lastRole: "user",
    lastAt: ago(23),
    msgCount: 5,
  },
  {
    id: "demo_c3",
    name: "نورا حسن",
    phone: "+201155443322",
    leadScore: 91,
    lastIntent: "buy",
    lastSentiment: "positive",
    botPaused: false,
    lastMessage: "مبسوطة جداً من الطلب الأول، هجيب تاني",
    lastRole: "user",
    lastAt: ago(47),
    msgCount: 18,
  },
  {
    id: "demo_c4",
    name: "خالد عمر",
    phone: "+201233445566",
    leadScore: 40,
    lastIntent: "complaint",
    lastSentiment: "negative",
    botPaused: true,
    lastMessage: "الطلب بطّل من 3 أيام ومش جاي",
    lastRole: "user",
    lastAt: ago(120),
    msgCount: 9,
  },
  {
    id: "demo_c5",
    name: "منى إبراهيم",
    phone: "+201099887766",
    leadScore: 55,
    lastIntent: "inquiry",
    lastSentiment: "neutral",
    botPaused: false,
    lastMessage: "عندكم مقاس XL ولا لأ؟",
    lastRole: "user",
    lastAt: ago(200),
    msgCount: 3,
  },
];

const CONV_MSGS: Record<string, DemoMessage[]> = {
  demo_c1: [
    { id: "dm_1_1", role: "user", content: "أهلاً، شايفة إعلانكم — عندكم فستان أبيض؟", createdAt: ago(30) },
    { id: "dm_1_2", role: "assistant", content: "أهلاً سارة! عندنا فستان أبيض قطن مقاسات S/M/L بسعر 450 جنيه. تحبي أبعتلك صور؟", createdAt: ago(29) },
    { id: "dm_1_3", role: "user", content: "آه ابعتي صور وقوليلي الأسعار", createdAt: ago(25) },
    { id: "dm_1_4", role: "assistant", content: "تفضلي! 🌸 الفستان الأبيض القطن 450 ج · الكتان 580 ج · الساتان 720 ج. التوصيل 3-5 أيام.", createdAt: ago(24) },
    { id: "dm_1_5", role: "user", content: "الأبيض القطن تمام، عايزة مقاس M", createdAt: ago(10) },
    { id: "dm_1_6", role: "assistant", content: "ممتاز! مقاس M متاح ✅. عشان أكمّل الطلب محتاجة: الاسم الكامل، عنوان التوصيل، ورقم تليفون للمندوب.", createdAt: ago(9) },
    { id: "dm_1_7", role: "user", content: "تمام ابعتلي التفاصيل على الرقم ده", createdAt: ago(5) },
  ],
  demo_c2: [
    { id: "dm_2_1", role: "user", content: "إيه السعر التيشيرت القطن؟", createdAt: ago(23) },
    { id: "dm_2_2", role: "assistant", content: "أهلاً أحمد! تيشيرت القطن عندنا بـ 180 ج للسادة و220 ج للمطبوع. أي لون/مقاس بتدور عليه؟", createdAt: ago(22) },
  ],
  demo_c3: [
    { id: "dm_3_1", role: "user", content: "وصل الطلب وتمام جداً!", createdAt: ago(100) },
    { id: "dm_3_2", role: "assistant", content: "يسعدنا ده نورا! 🙏 لو حابة ترجعي مرة تانية عندنا كوبون خصم 15% LOYAL15 صالح شهر.", createdAt: ago(99) },
    { id: "dm_3_3", role: "user", content: "مبسوطة جداً من الطلب الأول، هجيب تاني", createdAt: ago(47) },
  ],
  demo_c4: [
    { id: "dm_4_1", role: "user", content: "الطلب بطّل من 3 أيام ومش جاي", createdAt: ago(180) },
    { id: "dm_4_2", role: "assistant", content: "أسف جداً يا خالد على التأخير! بتابع دلوقتي مع فريق التوصيل وهرد عليك في أقرب وقت.", createdAt: ago(179) },
    { id: "dm_4_3", role: "user", content: "الطلب بطّل من 3 أيام ومش جاي", createdAt: ago(120) },
  ],
  demo_c5: [
    { id: "dm_5_1", role: "user", content: "عندكم مقاس XL ولا لأ؟", createdAt: ago(200) },
    { id: "dm_5_2", role: "assistant", content: "أهلاً منى! عندنا مقاسات S حتى XL في معظم المنتجات. اي منتج بالتحديد؟", createdAt: ago(199) },
  ],
};

export function getDemoConversation(customerId: string): DemoConversation | null {
  const customer = DEMO_CUSTOMERS.find((c) => c.id === customerId);
  if (!customer) return null;
  return {
    customer,
    messages: CONV_MSGS[customerId] || [],
  };
}

export const DEMO_ORDERS: DemoOrder[] = [
  { id: "demo_o1", customerName: "سارة محمد", total: 450, status: "confirmed", items: "فستان أبيض قطن M", createdAt: ago(60) },
  { id: "demo_o2", customerName: "نورا حسن", total: 720, status: "delivered", items: "فستان ساتان L", createdAt: ago(3 * 24 * 60) },
  { id: "demo_o3", customerName: "خالد عمر", total: 360, status: "pending", items: "تيشيرت ×2", createdAt: ago(4 * 24 * 60) },
];

// Synthetic NBA for each demo customer (mirrors NbaResult shape).
export const DEMO_NBA: Record<string, {
  action: string; title: string; reason: string; confidence: number;
  suggestedMessage: string; valueTier: string; churnRisk: number;
}> = {
  demo_c1: {
    action: "close_now",
    title: "جاهز للشراء — اقفل الصفقة",
    reason: "احتمال تحويل 85% وتردد منخفض — اطلب تأكيد الطلب مباشرة.",
    confidence: 89,
    suggestedMessage: "أهلاً سارة، تمام! كل حاجة جاهزة 🙌. ابعتيلي الاسم والعنوان ورقم التواصل وأنا أأكد طلبك دلوقتي.",
    valueTier: "gold",
    churnRisk: 10,
  },
  demo_c2: {
    action: "answer_fast",
    title: "بينتظر ردك الآن",
    reason: "سؤال سعر واضح بدون رد — السرعة دلوقتي بتفرق.",
    confidence: 72,
    suggestedMessage: "أهلاً أحمد، التيشيرت القطن بـ 180 ج. تحب أبعتلك الألوان المتاحة؟",
    valueTier: "lead",
    churnRisk: 35,
  },
  demo_c3: {
    action: "upsell",
    title: "اشترت مؤخراً — فرصة بيع مكمّل",
    reason: "عميلة نشطة راضية — اقتراح منتج مكمّل واحد يرفع قيمة الطلب.",
    confidence: 64,
    suggestedMessage: "أهلاً نورا! شكراً على ثقتك 🙏. عندي حاجة بتكمّل الفستان اللي اشتريته — تحبي أبعتلك تفاصيلها؟",
    valueTier: "platinum",
    churnRisk: 8,
  },
  demo_c4: {
    action: "escalate",
    title: "العميل متضايق — يحتاج تدخل بشري",
    reason: "إشارات إحباط عالية ونبرة سلبية — تدخّل سريع يحمي العلاقة.",
    confidence: 92,
    suggestedMessage: "أهلاً خالد، أسف جداً على التأخير. هتابع مع فريق التوصيل دلوقتي وأرجعلك بالتحديث خلال ساعة — ممكن تديني رقم الطلب؟",
    valueTier: "silver",
    churnRisk: 78,
  },
  demo_c5: {
    action: "nudge_followup",
    title: "كانت مهتمة ثم سكتت — تابِعيها",
    reason: "سألت عن مقاس XL وسكتت — متابعة لطيفة دلوقتي.",
    confidence: 52,
    suggestedMessage: "أهلاً منى! بس أتابع معاكي — المقاس XL متاح في أغلب المنتجات، محتاجة مساعدة في الاختيار؟",
    valueTier: "bronze",
    churnRisk: 45,
  },
};

export const DEMO_STATS = {
  totalCustomers: DEMO_CUSTOMERS.length,
  totalMessages: DEMO_CUSTOMERS.reduce((s, c) => s + c.msgCount, 0),
  hotLeads: DEMO_CUSTOMERS.filter((c) => c.leadScore >= 70).length,
  totalRevenue: DEMO_ORDERS.reduce((s, o) => s + o.total, 0),
  pipelineValue: 12400,
};
