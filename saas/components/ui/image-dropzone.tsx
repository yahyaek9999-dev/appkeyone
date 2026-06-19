"use client";
import { useRef, useState } from "react";

/**
 * Premium drag-&-drop image dropzone (UI only — no new route/API).
 * Drag-over highlight, click-to-browse, instant preview, replace, delete,
 * type/size validation. The selected File is handed to the parent via onFile;
 * upload + progress are owned by the parent's submit.
 */
export default function ImageDropzone({
  onFile,
  maxMB = 8,
  hint = "اسحب صورة الإيصال هنا أو اضغط للاختيار",
  compact = false,
}: {
  onFile: (file: File | null) => void;
  maxMB?: number;
  hint?: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [over, setOver] = useState(false);
  const [err, setErr] = useState("");

  function accept(file: File | null | undefined) {
    setErr("");
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("الملف يجب أن يكون صورة (JPG/PNG/WebP)."); return; }
    if (file.size > maxMB * 1024 * 1024) { setErr(`حجم الصورة يجب أن يكون أقل من ${maxMB} ميجابايت.`); return; }
    setPreview(URL.createObjectURL(file));
    setName(file.name);
    onFile(file);
  }
  function clear() { setPreview(""); setName(""); setErr(""); onFile(null); if (inputRef.current) inputRef.current.value = ""; }

  if (preview) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
        <div className="flex items-center gap-3">
          <img src={preview} alt="معاينة الإيصال" className={`rounded-lg border border-white/10 object-cover ${compact ? "h-16 w-16" : "h-20 w-20"}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-sm text-emerald-300"><span>✓</span><span className="truncate">{name || "تم اختيار الصورة"}</span></div>
            <div className="mt-1.5 flex gap-2">
              <button type="button" onClick={() => inputRef.current?.click()} className="rounded bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20">استبدال</button>
              <button type="button" onClick={clear} className="rounded bg-rose-500/10 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/20">حذف</button>
            </div>
          </div>
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => accept(e.target.files?.[0])} />
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); accept(e.dataTransfer.files?.[0]); }}
        className={`w-full rounded-xl border-2 border-dashed ${over ? "border-brand-400 bg-brand-500/10" : "border-white/15 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.05]"} ${compact ? "py-4" : "py-7"} px-4 text-center transition-colors`}
      >
        <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-lg">⬆️</div>
        <div className="text-sm text-slate-300">{hint}</div>
        <div className="mt-0.5 text-xs text-slate-500">PNG · JPG · WebP — حتى {maxMB}MB</div>
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => accept(e.target.files?.[0])} />
      {err && <p className="mt-1.5 text-xs text-rose-300">{err}</p>}
    </div>
  );
}
