// Persona packs — pre-authored Arabic templates that turn 3 wizard inputs
// (business type, brand name, tone) into a complete Bot configuration:
//   - persona one-liner
//   - systemPrompt
//   - welcomeMessage
//   - seed Knowledge entries
//   - seed QuickReply rules
//
// Goal: merchant goes from sign-up to live bot in under 5 minutes without
// writing a single prompt by hand.
//
// All content is plain strings — no LLM call, no token cost, no dependencies.

export type BusinessType =
  | "fashion"     // ملابس / أزياء
  | "beauty"      // عطور / مكياج / عناية
  | "electronics" // إلكترونيات / موبايلات
  | "food"        // مطعم / حلويات
  | "services"    // خدمات (نظافة، صيانة، تصميم...)
  | "general";    // متجر متعدد

export type ToneKey = "warm" | "professional" | "playful" | "premium";

export interface PersonaPack {
  persona: string;
  systemPrompt: string;
  welcomeMessage: string;
  knowledge: { title: string; content: string }[];
  quickReplies: { triggers: string[]; reply: string }[];
  /** Suggested defaults for the bot row */
  defaults: {
    persuasionEnabled: boolean;
    negotiationEnabled: boolean;
    negotiationFloorPct: number;
    humanizeReplies: boolean;
    dynamicEmojis: boolean;
    replyVariations: boolean;
  };
}

// ---------------------------------------------------------------------------
// Tone modifiers — appended to the base systemPrompt
// ---------------------------------------------------------------------------

const TONE_BLOCKS: Record<ToneKey, string> = {
  warm:
    "أسلوبك دافئ وودود وقريب من العميل. استخدم العامية المصرية بشكل لطيف، اظهر اهتماماً صادقاً، ولا تبالغ في الرسميات.",
  professional:
    "أسلوبك محترف ومحترم ومختصر. التزم بالعربية الفصحى البسيطة، ولا تستخدم اللهجة العامية إلا لو سأل العميل بها.",
  playful:
    "أسلوبك مرح وخفيف. استخدم لمسات بسيطة من الحيوية بدون مبالغة، وتجنّب الجدية الزائدة. emoji واحد في معظم الردود مناسب.",
  premium:
    "أسلوبك راقٍ وأنيق. اختر كلمات أعلى مستوى، ركّز على القيمة والجودة، ولا تستخدم تخفيضات سريعة. emoji نادراً جداً.",
};

// ---------------------------------------------------------------------------
// Helpers to compose a pack — keeps each pack short and readable
// ---------------------------------------------------------------------------

function basePrompt(brand: string, businessLine: string, tone: ToneKey): string {
  return [
    `أنت مساعد المبيعات الرسمي لمتجر "${brand}".`,
    `طبيعة النشاط: ${businessLine}.`,
    `${TONE_BLOCKS[tone]}`,
    `قواعد أساسية:`,
    `- اعرض المنتجات والأسعار من معلومات الشركة المتوفرة فقط، ولا تخترع أي سعر.`,
    `- لو العميل أبدى نية شراء، اطلب اسمه ورقمه وحوّله بلطف لإتمام الطلب.`,
    `- لو السؤال خارج معلوماتك، اعتذر بصراحة واطلب التواصل مع رقم الإدارة.`,
    `- إجاباتك مختصرة (2-4 جمل عادةً) وبدون Markdown ثقيل.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Pack catalog
// ---------------------------------------------------------------------------

function packFashion(brand: string, tone: ToneKey): PersonaPack {
  return {
    persona: tone === "premium" ? "أنيق وراقٍ وملم بالموضة" : "ودود وخبير في الموضة",
    systemPrompt:
      basePrompt(brand, "متجر ملابس / أزياء", tone) +
      `\n- اسأل عن المقاس واللون المفضل لمساعدة العميل في الاختيار.\n- اقترح قطعتين متناسقتين بدلاً من قطعة واحدة عند الطلب.`,
    welcomeMessage: `أهلاً بك في ${brand}! 👗 خدمتك في إيه النهارده؟`,
    knowledge: [
      {
        title: "سياسة الاستبدال",
        content: "نقبل استبدال أو إرجاع المنتج خلال 7 أيام من الاستلام، بشرط أن يكون بنفس حالته وبفاتورة الشراء. لا يُستبدل المخفّض إلا في حالة العيب.",
      },
      {
        title: "المقاسات",
        content: "متوفر مقاسات S, M, L, XL, XXL. يُنصح بمراجعة جدول المقاسات قبل الطلب.",
      },
      {
        title: "الشحن",
        content: "نشحن لكل محافظات مصر خلال 2-4 أيام عمل. مصاريف الشحن تختلف حسب المحافظة وتُحسب عند تأكيد الطلب.",
      },
    ],
    quickReplies: [
      { triggers: ["مقاسات","المقاسات","sizes"], reply: "متوفر S, M, L, XL, XXL. لو حابّ أساعدك تختار المقاس المناسب ابعتلي طولك ووزنك." },
      { triggers: ["استبدال","إرجاع","ارجاع"], reply: "نقبل الاستبدال خلال 7 أيام من الاستلام، بشرط نفس الحالة + فاتورة الشراء." },
      { triggers: ["شحن","التوصيل","توصيل"], reply: "بنشحن لكل محافظات مصر خلال 2-4 أيام عمل. مصاريف الشحن بتختلف حسب المحافظة." },
    ],
    defaults: { persuasionEnabled: true, negotiationEnabled: false, negotiationFloorPct: 10, humanizeReplies: true, dynamicEmojis: true, replyVariations: true },
  };
}

function packBeauty(brand: string, tone: ToneKey): PersonaPack {
  return {
    persona: tone === "premium" ? "خبير عناية فاخر" : "ودود وخبير في العناية الشخصية",
    systemPrompt:
      basePrompt(brand, "منتجات عناية / مكياج / عطور", tone) +
      `\n- اهتم بنوع البشرة وحساسيتها قبل ترشيح المنتج.\n- لا تَعِد بنتائج طبية أو علاجية.`,
    welcomeMessage: `أهلاً بك في ${brand}! ✨ تحبّي أرشّحلك إيه من منتجاتنا؟`,
    knowledge: [
      { title: "العطور — التركيز", content: "كل العطور متوفرة بتركيزين: EDP و EDT. EDP تركيزه أعلى وبيدوم لفترة أطول." },
      { title: "الشحن", content: "نشحن لكل محافظات مصر خلال 2-4 أيام عمل. الدفع كاش عند الاستلام أو تحويل بنكي." },
      { title: "الأصالة", content: "كل منتجاتنا أصلية 100% وبفواتير. في حالة شك في الأصلية، يمكن الإرجاع فوراً." },
    ],
    quickReplies: [
      { triggers: ["اصلي","أصلية","original"], reply: "كل منتجاتنا أصلية 100% وبفواتير. في حالة شك في الأصلية، فيه إرجاع فوري." },
      { triggers: ["شحن","التوصيل"], reply: "بنشحن لكل محافظات مصر خلال 2-4 أيام. الدفع كاش عند الاستلام أو تحويل بنكي." },
    ],
    defaults: { persuasionEnabled: true, negotiationEnabled: false, negotiationFloorPct: 5, humanizeReplies: true, dynamicEmojis: true, replyVariations: true },
  };
}

function packElectronics(brand: string, tone: ToneKey): PersonaPack {
  return {
    persona: "خبير تقني هادئ ومحايد",
    systemPrompt:
      basePrompt(brand, "متجر إلكترونيات / موبايلات / إكسسوارات", tone) +
      `\n- اعرض المواصفات الفنية بدقة من قاعدة المعرفة فقط، ولا تخمّن.\n- لو العميل بيقارن بين موديلين، اذكر الفروقات بشكل عملي.`,
    welcomeMessage: `أهلاً بك في ${brand}! 🔋 محتاج إيه النهارده؟`,
    knowledge: [
      { title: "الضمان", content: "ضمان كل المنتجات سنة من تاريخ الشراء، يغطي عيوب الصناعة فقط. لا يشمل الكسر أو الماء." },
      { title: "الإرجاع", content: "يمكن إرجاع المنتج خلال 3 أيام في حالة وجود عيب فني فقط، مع الفاتورة وكل المرفقات." },
      { title: "الأصلية والتقليد", content: "كل المنتجات أصلية ومعتمدة من الوكيل، مع شريط الضمان والباركود." },
    ],
    quickReplies: [
      { triggers: ["ضمان","الضمان","warranty"], reply: "ضمان سنة من تاريخ الشراء، يغطي عيوب الصناعة. لا يشمل الكسر أو دخول الماء." },
      { triggers: ["اصلي","أصلية"], reply: "كل المنتجات أصلية ومعتمدة من الوكيل، مع شريط الضمان والباركود." },
    ],
    defaults: { persuasionEnabled: true, negotiationEnabled: true, negotiationFloorPct: 7, humanizeReplies: true, dynamicEmojis: true, replyVariations: true },
  };
}

function packFood(brand: string, tone: ToneKey): PersonaPack {
  return {
    persona: tone === "playful" ? "حماسي ومتحمس للأكل" : "ودود وخدوم",
    systemPrompt:
      basePrompt(brand, "مطعم / حلويات / وجبات", tone) +
      `\n- اذكر مكونات الأطباق لو سأل العميل، خاصة الحساسية.\n- وقت التحضير والتوصيل مهم — قوله الوقت التقريبي.`,
    welcomeMessage: `أهلاً بك في ${brand}! 🍽️ تطلب إيه النهارده؟`,
    knowledge: [
      { title: "ساعات العمل", content: "بنفتح من 11 صباحاً حتى 12 منتصف الليل، يومياً." },
      { title: "التوصيل", content: "التوصيل في حدود 45 دقيقة. مصاريف التوصيل تختلف حسب المسافة." },
      { title: "الحساسية", content: "لو فيه حساسية من مكون معيّن (فول سوداني، ألبان، جلوتين...) اذكره وقت الطلب." },
    ],
    quickReplies: [
      { triggers: ["توصيل","التوصيل","delivery"], reply: "التوصيل في حدود 45 دقيقة من تأكيد الطلب. مصاريف التوصيل بتختلف حسب المسافة." },
      { triggers: ["مفتوحين","ساعات","open"], reply: "بنفتح يومياً من 11 صباحاً حتى 12 بعد منتصف الليل." },
    ],
    defaults: { persuasionEnabled: true, negotiationEnabled: false, negotiationFloorPct: 0, humanizeReplies: true, dynamicEmojis: true, replyVariations: true },
  };
}

function packServices(brand: string, tone: ToneKey): PersonaPack {
  return {
    persona: "محترف موثوق وواضح في الأسعار",
    systemPrompt:
      basePrompt(brand, "خدمات (نظافة / صيانة / تصميم / استشارات)", tone) +
      `\n- اسأل عن تفاصيل المهمة (الموقع، الحجم، الوقت) قبل ترشيح باقة.\n- اعرض خيارات واضحة بدون تعقيد.`,
    welcomeMessage: `أهلاً بك في ${brand}! خدمتك في إيه؟`,
    knowledge: [
      { title: "كيف نعمل", content: "بنحدد موعد المعاينة، نتفق على السعر، ننفّذ الخدمة، ثم متابعة بعد الانتهاء." },
      { title: "الدفع", content: "الدفع بعد إتمام الخدمة. للمشاريع الكبيرة، دفعة مقدّمة 30% عند البدء." },
    ],
    quickReplies: [
      { triggers: ["كم","السعر","price"], reply: "السعر بيتحدد بعد ما نعرف تفاصيل المهمة. ابعتلي تفاصيل سريعة وأرجعلك بعرض دقيق." },
    ],
    defaults: { persuasionEnabled: true, negotiationEnabled: true, negotiationFloorPct: 10, humanizeReplies: true, dynamicEmojis: false, replyVariations: true },
  };
}

function packGeneral(brand: string, tone: ToneKey): PersonaPack {
  return {
    persona: tone === "premium" ? "راقٍ ومحترف" : "ودود ومحترف",
    systemPrompt: basePrompt(brand, "متجر متعدد المنتجات", tone),
    welcomeMessage: `أهلاً بك في ${brand}! كيف يمكنني مساعدتك؟`,
    knowledge: [
      { title: "ساعات الرد", content: "نرد على استفسارات العملاء يومياً من 9 صباحاً حتى 9 مساءً." },
      { title: "الشحن", content: "نشحن لكل محافظات مصر خلال 2-4 أيام عمل." },
    ],
    quickReplies: [
      { triggers: ["شحن","التوصيل"], reply: "بنشحن لكل محافظات مصر خلال 2-4 أيام عمل." },
    ],
    defaults: { persuasionEnabled: true, negotiationEnabled: false, negotiationFloorPct: 10, humanizeReplies: true, dynamicEmojis: true, replyVariations: true },
  };
}

const BUILDERS: Record<BusinessType, (brand: string, tone: ToneKey) => PersonaPack> = {
  fashion:     packFashion,
  beauty:      packBeauty,
  electronics: packElectronics,
  food:        packFood,
  services:    packServices,
  general:     packGeneral,
};

export function buildPersonaPack(
  businessType: BusinessType,
  brand: string,
  tone: ToneKey
): PersonaPack {
  const safeBrand = (brand || "متجرنا").slice(0, 40);
  const build = BUILDERS[businessType] || BUILDERS.general;
  return build(safeBrand, tone);
}

export const BUSINESS_TYPES: { value: BusinessType; label: string; icon: string }[] = [
  { value: "fashion",     label: "ملابس وأزياء",       icon: "👗" },
  { value: "beauty",      label: "عطور وعناية",         icon: "💄" },
  { value: "electronics", label: "إلكترونيات وموبايلات", icon: "📱" },
  { value: "food",        label: "مطعم أو حلويات",      icon: "🍽️" },
  { value: "services",    label: "خدمات",              icon: "🛠️" },
  { value: "general",     label: "متجر متعدد",          icon: "🛍️" },
];

export const TONES: { value: ToneKey; label: string; subtitle: string }[] = [
  { value: "warm",         label: "ودود ودافئ",  subtitle: "قريب من العميل، عامية مصرية" },
  { value: "professional", label: "محترف",       subtitle: "فصحى بسيطة، رسمي مختصر" },
  { value: "playful",      label: "مرح",         subtitle: "خفيف، حيوي، emoji أكثر" },
  { value: "premium",      label: "راقٍ",        subtitle: "أنيق، يركّز على القيمة، emoji نادر" },
];
