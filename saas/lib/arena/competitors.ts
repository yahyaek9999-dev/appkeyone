// Testing Arena 2.0 — competitor benchmark framework.
//
// A factual capability matrix comparing KEYONE against major players. KEYONE's
// column reflects capabilities actually shipped in this product; competitor
// columns are reference capability data. The framework computes a coverage
// score and a strengths/gaps split — it does not claim live competitive testing.
export interface Capability {
  key: string;
  label: string;
  keyone: boolean;
  intercom: boolean;
  zendesk: boolean;
  manychat: boolean;
  respondio: boolean;
}

export const CAPABILITIES: Capability[] = [
  {
    key: "whatsapp_native",
    label: "واتساب أصلي (QR + Cloud)",
    keyone: true,
    intercom: false,
    zendesk: true,
    manychat: true,
    respondio: true,
  },
  {
    key: "ai_assistant",
    label: "مساعد ذكي للردود",
    keyone: true,
    intercom: true,
    zendesk: true,
    manychat: true,
    respondio: true,
  },
  {
    key: "knowledge_brain",
    label: "عقل معرفة + بحث دلالي",
    keyone: true,
    intercom: true,
    zendesk: true,
    manychat: false,
    respondio: false,
  },
  {
    key: "knowledge_graph",
    label: "مخطط معرفة (Graph)",
    keyone: true,
    intercom: false,
    zendesk: false,
    manychat: false,
    respondio: false,
  },
  {
    key: "conflict_detection",
    label: "كشف تعارض المعرفة",
    keyone: true,
    intercom: false,
    zendesk: false,
    manychat: false,
    respondio: false,
  },
  {
    key: "ai_auditor",
    label: "مدقّق إعداد ذكاء آلي",
    keyone: true,
    intercom: false,
    zendesk: false,
    manychat: false,
    respondio: false,
  },
  {
    key: "testing_arena",
    label: "ساحة اختبار سيناريوهات",
    keyone: true,
    intercom: false,
    zendesk: false,
    manychat: false,
    respondio: false,
  },
  {
    key: "broadcasts",
    label: "حملات بث واسعة",
    keyone: true,
    intercom: true,
    zendesk: false,
    manychat: true,
    respondio: true,
  },
  {
    key: "wallet_billing",
    label: "محفظة رصيد + فوترة",
    keyone: true,
    intercom: true,
    zendesk: true,
    manychat: true,
    respondio: true,
  },
  {
    key: "qr_booking",
    label: "حجوزات/مواعيد QR",
    keyone: true,
    intercom: false,
    zendesk: false,
    manychat: false,
    respondio: false,
  },
  {
    key: "shipping",
    label: "شحن + شركات نقل",
    keyone: true,
    intercom: false,
    zendesk: false,
    manychat: false,
    respondio: true,
  },
  {
    key: "revenue_ai",
    label: "ذكاء إيرادات (churn/فرص)",
    keyone: true,
    intercom: true,
    zendesk: true,
    manychat: false,
    respondio: false,
  },
  {
    key: "smart_monitoring",
    label: "رصد ذكي + تنبيهات",
    keyone: true,
    intercom: true,
    zendesk: true,
    manychat: false,
    respondio: true,
  },
  {
    key: "embedding_providers",
    label: "مزوّدو تضمين متعددون + تجاوز",
    keyone: true,
    intercom: false,
    zendesk: false,
    manychat: false,
    respondio: false,
  },
];

const COMPETITORS = ["intercom", "zendesk", "manychat", "respondio"] as const;

export function competitorBenchmark() {
  const total = CAPABILITIES.length;
  const keyoneHas = CAPABILITIES.filter((c) => c.keyone).length;
  const coverageScore = Math.round((keyoneHas / total) * 100);

  const perCompetitor = COMPETITORS.map((c) => {
    const has = CAPABILITIES.filter((cap) => (cap as any)[c]).length;
    return { competitor: c, coverage: Math.round((has / total) * 100), has };
  });

  // Strengths: KEYONE has it AND at least one competitor lacks it.
  const strengths = CAPABILITIES.filter(
    (c) => c.keyone && COMPETITORS.some((k) => !(c as any)[k]),
  ).map((c) => c.label);
  // Gaps: KEYONE lacks it (none currently, but framework supports it).
  const gaps = CAPABILITIES.filter((c) => !c.keyone).map((c) => c.label);

  return {
    total,
    keyoneHas,
    coverageScore,
    perCompetitor,
    strengths,
    gaps,
    capabilities: CAPABILITIES,
  };
}
