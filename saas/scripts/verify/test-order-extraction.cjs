// Order extraction confusion matrix test
// Properly mirrors lib/order-extractor.ts detection logic
// Run: node scripts/verify/test-order-extraction.cjs
"use strict";

// ---- Core detection functions (mirrors actual order-extractor.ts) ----
function normalizeAr(s) {
  if (!s) return "";
  return s
    .replace(/[أإآ]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[ىي]/g, "ي")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}
function arNumToWestern(s) {
  const m = {"٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9","۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9"};
  return s.replace(/[٠-٩۰-۹]/g, c => m[c] || c);
}

function detectProductName(text) {
  const m = text.match(/(?:هاخد(?:ه|ها)?|عاوز(?:ه|ها)?|عايز(?:ه|ها)?|ابعتلي|ارسلي|أرسل|ارسل|اطلب|أطلب|ابي|أبي|ابغى|أبغى|بغيت|اريد|أريد|احجز|اشتري|آخذ|اخذ|اشتراك|i want|i'll take|buy|order)\s+([؀-ۿA-Za-z0-9][؀-ۿA-Za-z0-9\s\-_/]{2,80})/i);
  if (m) {
    return m[1].replace(/(?:توصيل|على|الى|إلى|في|العنوان|عنوان|بكام|السعر|سعرها|سعره|كاش|تحويل|فيزا|مدى|cod|cash|price).*$/i, "")
      .replace(/[.,،؟?!\n].*$/, "").replace(/\s+/g, " ").trim().slice(0, 80);
  }
  return undefined;
}

function detectPrice(text) {
  const t = arNumToWestern(text);
  const m = t.match(/(\d{2,6}(?:[.,]\d{1,2})?)\s*(?:جنيه|ج\b|egp|le|ل\.م|ر\.س|ريال|sar|aed|درهم|\$|usd)/i);
  if (m) return Math.round(parseFloat(m[1].replace(",", ".")));
  const m2 = t.match(/(?:بكام|السعر|سعرها|سعره|ثمنها|ثمنه|price|cost)\D{0,8}(\d{2,6})/i);
  if (m2) return parseInt(m2[1], 10);
  return 0;
}

function detectPhone(text) {
  const t = arNumToWestern(text);
  const eg = t.match(/(?<![\d])(01[0-9]{9})(?![\d])/);
  if (eg) return eg[1];
  const intl = t.match(/(?<![\d])(\+?\d{8,15})(?![\d])/);
  if (intl) return intl[1];
  return undefined;
}

const PAYMENT_KEYWORDS = [
  ["cod", ["كاش","عند الاستلام","الدفع عند","عند الباب","cod","cash on delivery"]],
  ["instapay", ["انستاباي","instapay","انستا باي"]],
  ["vodafone_cash", ["فودافون كاش","فودافون","vodafone cash"]],
  ["bank_transfer", ["تحويل بنكي","تحويل","حوّلت","حولت","حوالة","bank","transfer"]],
  ["card", ["فيزا","ماستر","بطاقة","visa","master","card","credit"]],
];

function detectPayment(text) {
  const norm = normalizeAr(text);
  for (const [code, keys] of PAYMENT_KEYWORDS) {
    for (const k of keys) {
      if (norm.includes(normalizeAr(k))) return code;
    }
  }
  return undefined;
}

const ADDRESS_HINTS = ["العنوان","عنواني","عنوان","توصيل","شارع","حي","مدينه","مدينة","الرياض","جدة","دبي","القاهرة","الإسكندرية","address","street"];
function detectAddress(text) {
  const norm = normalizeAr(text);
  return ADDRESS_HINTS.some(h => norm.includes(normalizeAr(h))) ? text.slice(0, 100) : undefined;
}

const COLORS_FLAT = ["احمر","ازرق","اسود","ابيض","اخضر","اصفر","بني","رمادي","وردي","بنفسجي","برتقالي","كحلي","red","blue","black","white","green","yellow","gray","pink","purple"];
function detectColor(text) {
  const norm = normalizeAr(text);
  return COLORS_FLAT.find(c => norm.includes(normalizeAr(c)));
}
const SIZES_AR_KEYS = ["مقاس","سايز","مقاسه","مقاسي","حجم"];
function detectSize(text) {
  const t = arNumToWestern(text);
  const m1 = t.match(new RegExp(`(?:${SIZES_AR_KEYS.join("|")})\\s*[:\\-]?\\s*([a-zA-Z]{1,4}|\\d{1,3})`, "i"));
  if (m1) return m1[1].toUpperCase();
  const m2 = t.match(/\b(xxxl|xxl|xl|l|m|s|xs)\b/i);
  if (m2) return m2[1].toUpperCase();
  return undefined;
}

function scoreConfidence(draft) {
  let s = 0;
  if (draft.items?.length && draft.items[0]?.name) s += 30;
  if (draft.items?.[0]?.unitPrice) s += 20;
  if (draft.customerPhone) s += 20;
  if (draft.shippingAddress) s += 15;
  if (draft.paymentMethod) s += 10;
  if (draft.customerName) s += 5;
  if (draft.items?.[0]?.size || draft.items?.[0]?.color) s += 5;
  return Math.min(100, s);
}

function extractOrder(messages) {
  const recent = messages.slice(-12);
  const customerText = recent.filter(m => m.role === "user").map(m => m.content).join("\n");
  const assistantText = recent.filter(m => m.role === "assistant").map(m => m.content).join("\n");
  const fullText = `${customerText}\n${assistantText}`;

  const phone = detectPhone(customerText);
  const address = detectAddress(customerText);
  const payment = detectPayment(fullText);
  const name = detectProductName(customerText);
  const price = detectPrice(fullText);
  const size = detectSize(fullText);
  const color = detectColor(fullText);

  const items = name ? [{ name, unitPrice: price, quantity: 1, lineTotal: price, size, color }] : [];

  const draft = {
    items,
    customerPhone: phone,
    shippingAddress: address,
    paymentMethod: payment,
    customerName: undefined,
    confidence: 0,
  };
  draft.confidence = scoreConfidence(draft);
  return draft;
}

// ---- Test cases ----
const TEST_CASES = [
  // ---- NOT orders (false positive candidates) ----
  { label: "greeting_ar", isOrder: false, conversation: [
    { role: "user", content: "أهلاً" },
    { role: "assistant", content: "أهلاً بك!" },
  ]},
  { label: "greeting_en", isOrder: false, conversation: [
    { role: "user", content: "Hello, good morning!" },
    { role: "assistant", content: "Good morning! How can I help?" },
  ]},
  { label: "support_request", isOrder: false, conversation: [
    { role: "user", content: "عندي مشكلة في طلبي القديم" },
    { role: "assistant", content: "تفضل، قولي إيه المشكلة؟" },
  ]},
  { label: "complaint_1", isOrder: false, conversation: [
    { role: "user", content: "الطلب وصلني ناقص، أنا زهقت" },
    { role: "assistant", content: "آسفين جداً" },
  ]},
  { label: "complaint_angry", isOrder: false, conversation: [
    { role: "user", content: "منتجكم وحش جداً مش هشتري تاني" },
    { role: "assistant", content: "آسفين" },
  ]},
  { label: "pricing_question_1", isOrder: false, conversation: [
    { role: "user", content: "بكام التيشرت الأبيض؟" },
    { role: "assistant", content: "سعره 250 جنيه" },
  ]},
  { label: "pricing_question_2", isOrder: false, conversation: [
    { role: "user", content: "what is the price of the black jacket?" },
    { role: "assistant", content: "The black jacket is 450 EGP" },
  ]},
  { label: "shipping_question_1", isOrder: false, conversation: [
    { role: "user", content: "بتوصلوا لفين؟ والشحن بكام؟" },
    { role: "assistant", content: "بنوصل لكل مصر والشحن 50 جنيه" },
  ]},
  { label: "shipping_question_2", isOrder: false, conversation: [
    { role: "user", content: "كام يوم التوصيل للإسكندرية؟" },
    { role: "assistant", content: "3-5 أيام عمل" },
  ]},
  { label: "availability_check", isOrder: false, conversation: [
    { role: "user", content: "عندكم تيشيرتات؟" },
    { role: "assistant", content: "أيوه عندنا مجموعة كبيرة" },
    { role: "user", content: "تمام شكراً" },
  ]},
  { label: "track_existing_order", isOrder: false, conversation: [
    { role: "user", content: "عاوز أتابع طلبي رقم 12345" },
    { role: "assistant", content: "طلبك في مرحلة الشحن" },
  ]},
  { label: "general_inquiry", isOrder: false, conversation: [
    { role: "user", content: "امتى الدليفري بيجي؟" },
    { role: "assistant", content: "من الساعة 9 لـ 9" },
  ]},
  { label: "return_request", isOrder: false, conversation: [
    { role: "user", content: "عاوز ارجع المنتج اللي اشتريته امبارح" },
    { role: "assistant", content: "هنساعدك" },
  ]},
  { label: "size_question", isOrder: false, conversation: [
    { role: "user", content: "المقاس L بيساعد كام كيلو؟" },
    { role: "assistant", content: "من 70 لـ 85 كيلو" },
  ]},
  { label: "color_availability", isOrder: false, conversation: [
    { role: "user", content: "الأسود موجود في مقاس M؟" },
    { role: "assistant", content: "أيوه موجود" },
  ]},
  { label: "discount_question", isOrder: false, conversation: [
    { role: "user", content: "فيه خصم؟" },
    { role: "assistant", content: "لا مفيش خصومات دلوقتي" },
  ]},
  { label: "casual_browsing", isOrder: false, conversation: [
    { role: "user", content: "كشفت على المنتجات ومش عارف اختار" },
    { role: "assistant", content: "ممكن أساعدك تختار" },
  ]},
  { label: "complaint_delayed", isOrder: false, conversation: [
    { role: "user", content: "طلبي متأخر من 5 أيام" },
    { role: "assistant", content: "هنتابع معك" },
  ]},

  // ---- ACTUAL ORDERS (must be detected) ----
  { label: "order_full_signals", isOrder: true, conversation: [
    { role: "user", content: "عاوز اطلب تيشرت أبيض مقاس L" },
    { role: "assistant", content: "سعره 250 جنيه، الدفع إزاي؟" },
    { role: "user", content: "كاش عند الاستلام، عنواني شارع التحرير 5" },
  ]},
  { label: "order_with_phone", isOrder: true, conversation: [
    { role: "user", content: "اطلب جاكيت أسود مقاس XL بـ 450 جنيه" },
    { role: "assistant", content: "ابعت رقمك" },
    { role: "user", content: "01012345678 والدفع فودافون كاش" },
  ]},
  { label: "order_clear_intent", isOrder: true, conversation: [
    { role: "user", content: "عاوز اشتري ساعة بـ 800 جنيه" },
    { role: "assistant", content: "بيانات التوصيل؟" },
    { role: "user", content: "اسمي محمد، رقمي 01198765432، الدفع انستاباي" },
  ]},
  { label: "order_payment_keyword", isOrder: true, conversation: [
    { role: "user", content: "حولت 300 جنيه على الحساب" },
    { role: "assistant", content: "وصلنا التحويل" },
    { role: "user", content: "عنواني مدينة نصر شارع مصر والسودان" },
  ]},
  { label: "order_english", isOrder: true, conversation: [
    { role: "user", content: "I want to order the black jacket size M, 450 EGP" },
    { role: "assistant", content: "Sure! Your phone number?" },
    { role: "user", content: "+201023456789, cash on delivery please" },
  ]},
];

function runMatrix(threshold, requireProduct, requireConfirmation) {
  let tp=0, fp=0, tn=0, fn=0;
  const fails = [];
  for (const tc of TEST_CASES) {
    const draft = extractOrder(tc.conversation);
    let detected = draft.confidence >= threshold;

    if (requireProduct && (!draft.items?.length || !draft.items[0]?.name)) detected = false;

    if (requireConfirmation) {
      const lastCustomer = tc.conversation.filter(m=>m.role==="user").slice(-1)[0]?.content || "";
      const hasConf = /\b(تمام|ايوه|موافق|اوكي|ok|yes|نعم|اكيد|حاضر|ابعت|اطلب|اشتري)\b/i.test(lastCustomer);
      if (!hasConf) detected = false;
    }

    if (tc.isOrder && detected) tp++;
    else if (!tc.isOrder && detected) { fp++; fails.push({type:"FP", label:tc.label, conf:draft.confidence}); }
    else if (tc.isOrder && !detected) { fn++; fails.push({type:"FN", label:tc.label, conf:draft.confidence}); }
    else tn++;
  }
  return { tp, fp, tn, fn, fails };
}

const notOrderCount = TEST_CASES.filter(t=>!t.isOrder).length;
const orderCount = TEST_CASES.filter(t=>t.isOrder).length;

console.log(`=== ORDER EXTRACTION CONFUSION MATRIX ===`);
console.log(`Cases: ${TEST_CASES.length} (${notOrderCount} non-orders, ${orderCount} orders)\n`);

// Default settings
const d = runMatrix(50, false, false);
const fpRate = (d.fp/notOrderCount*100).toFixed(1);
const recall = (d.tp/orderCount*100).toFixed(1);
console.log(`Default (threshold=50, requireProduct=false, requireConfirmation=false):`);
console.log(`  TP=${d.tp} FP=${d.fp} TN=${d.tn} FN=${d.fn}  FP-rate=${fpRate}%  Recall=${recall}%`);
d.fails.forEach(f => console.log(`  [${f.type}] ${f.label} conf=${f.conf}`));

const TARGET = 5.0;
if (parseFloat(fpRate) > TARGET) {
  console.log(`\n❌ FAIL: FP rate ${fpRate}% > target ${TARGET}%. BLOCK DEPLOY.`);
} else {
  console.log(`\n✓ PASS: FP rate ${fpRate}% ≤ target ${TARGET}%`);
}

// With requireProduct=true
console.log(`\nrequireProduct=true, threshold=50:`);
const r2 = runMatrix(50, true, false);
console.log(`  TP=${r2.tp} FP=${r2.fp} TN=${r2.tn} FN=${r2.fn}  FP-rate=${(r2.fp/notOrderCount*100).toFixed(1)}%  Recall=${(r2.tp/orderCount*100).toFixed(1)}%`);
r2.fails.forEach(f => console.log(`  [${f.type}] ${f.label}`));

// With threshold=70
console.log(`\nthreshold=70, requireProduct=false:`);
const r3 = runMatrix(70, false, false);
console.log(`  TP=${r3.tp} FP=${r3.fp} TN=${r3.tn} FN=${r3.fn}  FP-rate=${(r3.fp/notOrderCount*100).toFixed(1)}%  Recall=${(r3.tp/orderCount*100).toFixed(1)}%`);
r3.fails.forEach(f => console.log(`  [${f.type}] ${f.label} conf=${f.conf}`));

// Show what non-orders got detected and why (for debugging)
console.log(`\n--- Non-order confidences (potential FP sources) ---`);
for (const tc of TEST_CASES.filter(t=>!t.isOrder)) {
  const draft = extractOrder(tc.conversation);
  if (draft.confidence > 0) {
    console.log(`  ${tc.label}: conf=${draft.confidence} phone=${!!draft.customerPhone} payment=${draft.paymentMethod||"none"} product=${draft.items?.[0]?.name||"none"}`);
  }
}
