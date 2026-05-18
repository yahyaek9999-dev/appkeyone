// Voice transcription + image vision adapters.
// Uses OpenAI-compatible APIs if configured. Otherwise returns graceful placeholders
// so the chat flow never breaks even without paid keys.

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const WHISPER_URL = process.env.WHISPER_API_URL || "https://api.openai.com/v1/audio/transcriptions";
const VISION_URL = process.env.VISION_API_URL || "https://api.openai.com/v1/chat/completions";
const VISION_MODEL = process.env.VISION_MODEL || "gpt-4o-mini";

export async function transcribeAudio(base64: string, mimetype = "audio/ogg"): Promise<string> {
  if (!OPENAI_KEY) {
    return "[رسالة صوتية — لم يتم تفعيل خدمة التفريغ بعد]";
  }
  try {
    const buf = Buffer.from(base64, "base64");
    const ext = mimetype.includes("ogg") ? "ogg" : mimetype.includes("mp4") ? "m4a" : "wav";
    const blob = new Blob([buf], { type: mimetype });
    const fd = new FormData();
    fd.append("file", blob, `audio.${ext}`);
    fd.append("model", "whisper-1");
    fd.append("language", "ar");
    const res = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: fd,
    });
    if (!res.ok) {
      console.error("[whisper] failed", res.status, await res.text().catch(() => ""));
      return "[تعذر تفريغ الرسالة الصوتية]";
    }
    const data = await res.json();
    return data.text || "[رسالة صوتية فارغة]";
  } catch (e: any) {
    console.error("[whisper] error", e);
    return "[تعذر معالجة الرسالة الصوتية]";
  }
}

export async function describeImage(base64: string, mimetype = "image/jpeg", caption = ""): Promise<string> {
  if (!OPENAI_KEY) {
    return caption ? `[صورة مع تعليق: ${caption}]` : "[صورة - لم يتم تفعيل خدمة الرؤية]";
  }
  try {
    const dataUrl = `data:${mimetype};base64,${base64}`;
    const res = await fetch(VISION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "صف هذه الصورة بدقة باللغة العربية في 2-3 جمل قصيرة. ركز على المحتوى المهم (مثلاً: إيصال تحويل، منتج، إلخ). إذا كانت إيصال دفع/تحويل اذكر المبلغ والوقت والاسم إن وُجد." +
                  (caption ? `\nتعليق العميل: ${caption}` : ""),
              },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 300,
      }),
    });
    if (!res.ok) {
      console.error("[vision] failed", res.status);
      return caption ? `[صورة: ${caption}]` : "[صورة]";
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
    return text || "[صورة]";
  } catch (e: any) {
    console.error("[vision] error", e);
    return "[تعذر معالجة الصورة]";
  }
}
