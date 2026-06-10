// Voice transcription + image vision adapters.
// Uses OpenAI-compatible APIs if configured. Otherwise returns graceful placeholders
// so the conversation flow never breaks — the AI will see the placeholder and reply naturally.

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const WHISPER_URL = process.env.WHISPER_API_URL || "https://api.openai.com/v1/audio/transcriptions";
const VISION_URL = process.env.VISION_API_URL || "https://api.openai.com/v1/chat/completions";
const VISION_MODEL = process.env.VISION_MODEL || "gpt-4o-mini";
const MEDIA_TIMEOUT_MS = Math.max(5_000, Number(process.env.MEDIA_AI_TIMEOUT_MS || 20_000));
const MAX_AUDIO_BYTES = Math.max(128_000, Number(process.env.MAX_AUDIO_BYTES || 8 * 1024 * 1024));
const MAX_IMAGE_BYTES = Math.max(128_000, Number(process.env.MAX_IMAGE_BYTES || 5 * 1024 * 1024));

const DEFAULT_VISION_PROMPT =
  "قم بتحليل هذه الصورة باللغة العربية. صِف المحتوى بدقة في 2-4 جمل قصيرة. حدد نوع الصورة: منتج، لقطة شاشة، قائمة طعام، مستند، فاتورة، إيصال تحويل بنكي، صورة شخصية، أو أخرى. إذا كانت فاتورة أو إيصال: اذكر المبلغ والتاريخ والجهة. إذا كانت قائمة طعام: اذكر الأصناف والأسعار. إذا كانت صورة منتج: صِف المنتج واللون والتفاصيل.";

function timeoutSignal(ms = MEDIA_TIMEOUT_MS): AbortSignal | undefined {
  try {
    return AbortSignal.timeout(ms);
  } catch {
    return undefined;
  }
}

export async function transcribeAudio(
  base64: string,
  mimetype = "audio/ogg",
  opts: { userId?: string; language?: string } = {},
): Promise<string> {
  // Universal Providers (additive): if the tenant configured speech providers
  // (Whisper/Groq/Deepgram/AssemblyAI/custom), transcribe via the vault with
  // failover first. Tenants with none fall through to the platform Whisper path.
  if (opts.userId) {
    try {
      const { loadEnabledResolved } = await import("@/lib/integrations/vault");
      const vault = await loadEnabledResolved(opts.userId, "speech");
      if (vault.length > 0) {
        const { transcribeWithFailover } = await import("@/lib/integrations/speech");
        const r = await transcribeWithFailover(opts.userId, { base64, mimetype, language: opts.language });
        if (r.ok && r.result.text) return r.result.text;
        // disabled / all failed → fall through to platform Whisper below
      }
    } catch {
      /* never break the conversation flow */
    }
  }
  if (!OPENAI_KEY) {
    return "[العميل أرسل رسالة صوتية]";
  }
  try {
    const buf = Buffer.from(base64, "base64");
    if (buf.length > MAX_AUDIO_BYTES) return "[العميل أرسل رسالة صوتية طويلة]";
    const ext = mimetype.includes("ogg") ? "ogg"
      : mimetype.includes("mp4") ? "m4a"
      : mimetype.includes("mpeg") ? "mp3"
      : mimetype.includes("mp3") ? "mp3"
      : mimetype.includes("wav") ? "wav"
      : mimetype.includes("webm") ? "webm"
      : "ogg";
    const blob = new Blob([buf], { type: mimetype });
    const fd = new FormData();
    fd.append("file", blob, `audio.${ext}`);
    fd.append("model", "whisper-1");
    const res = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: fd,
      signal: timeoutSignal(),
    });
    if (!res.ok) {
      console.error("[whisper] failed", res.status, await res.text().catch(() => ""));
      return "[العميل أرسل رسالة صوتية — تعذر التفريغ]";
    }
    const data = await res.json();
    return data.text || "[العميل أرسل رسالة صوتية فارغة]";
  } catch (e: any) {
    console.error("[whisper] error", e);
    return "[العميل أرسل رسالة صوتية — تعذرت المعالجة]";
  }
}

export async function describeImage(
  base64: string,
  mimetype = "image/jpeg",
  caption = "",
  opts: { userId?: string } = {},
): Promise<string> {
  // Universal Providers (additive): per-tenant image-analysis providers
  // (OpenAI/Gemini/Claude/OpenRouter/custom) with failover, when configured.
  if (opts.userId) {
    try {
      const { loadEnabledResolved } = await import("@/lib/integrations/vault");
      const vault = (await loadEnabledResolved(opts.userId, "image")).filter((p) =>
        (p.descriptor.capabilities || []).includes("analyze"),
      );
      if (vault.length > 0) {
        const { analyzeImageWithFailover } = await import("@/lib/integrations/image");
        const prompt = caption ? `${DEFAULT_VISION_PROMPT}\nتعليق العميل على الصورة: ${caption}` : DEFAULT_VISION_PROMPT;
        const r = await analyzeImageWithFailover(opts.userId, { base64, mimetype, prompt });
        if (r.ok && r.result.text) return r.result.text;
        // disabled / all failed → fall through to platform vision below
      }
    } catch {
      /* never break the conversation flow */
    }
  }
  if (!OPENAI_KEY) {
    return caption || "[العميل أرسل صورة]";
  }
  try {
    const imageBytes = Buffer.byteLength(base64, "base64");
    if (imageBytes > MAX_IMAGE_BYTES) {
      return caption || "[العميل أرسل صورة — تعذرت المعالجة لكبر حجمها]";
    }
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
                  "قم بتحليل هذه الصورة باللغة العربية. صِف المحتوى بدقة في 2-4 جمل قصيرة. حدد نوع الصورة: منتج، لقطة شاشة، قائمة طعام، مستند، فاتورة، إيصال تحويل بنكي، صورة شخصية، أو أخرى. " +
                  "إذا كانت فاتورة أو إيصال تحويل: اذكر المبلغ والتاريخ والجهة إن وُجدت. " +
                  "إذا كانت قائمة طعام: اذكر الأصناف والأسعار إن ظهرت. " +
                  "إذا كانت لقطة شاشة: صِف ما تظهره. " +
                  "إذا كانت صورة منتج: صِف المنتج واللون والتفاصيل. " +
                  (caption ? `\nتعليق العميل على الصورة: ${caption}` : ""),
              },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 300,
      }),
      signal: timeoutSignal(),
    });
    if (!res.ok) {
      console.error("[vision] failed", res.status);
      return caption || "[العميل أرسل صورة]";
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
    return text || caption || "[العميل أرسل صورة]";
  } catch (e: any) {
    console.error("[vision] error", e);
    return caption || "[العميل أرسل صورة — تعذر تحليلها]";
  }
}
