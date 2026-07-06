"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * ProductTour — a lightweight guided onboarding tour (UI only, no API/model).
 * Spotlight overlay + tooltip with progress, next/prev, skip, and "resume later".
 * Completion is tracked in localStorage (keyone_tour_<id>). Steps target real
 * elements by CSS selector; missing targets are skipped automatically.
 */
export type TourStep = { selector: string; title: string; body: string };

const PAD = 8;

export default function ProductTour({ id, steps }: { id: string; steps: TourStep[] }) {
  const key = `keyone_tour_${id}`;
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  // Start the tour once, for first-time users only.
  useEffect(() => {
    try { if (localStorage.getItem(key)) return; } catch { return; }
    const t = setTimeout(() => setOpen(true), 1300); // let the page transition settle so step 1 isn't skipped
    return () => clearTimeout(t);
  }, [key]);

  const locate = useCallback((i: number): boolean => {
    const step = steps[i];
    if (!step) return false;
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (!el) return false;
    const r0 = el.getBoundingClientRect();
    if (r0.width === 0 || r0.height === 0) return false; // hidden / collapsed
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    return true;
  }, [steps]);

  // When open or step changes, locate the target (skipping missing ones).
  useEffect(() => {
    if (!open) return;
    let i = idx, found = false;
    while (i < steps.length) { if (locate(i)) { found = true; break; } i++; }
    if (!found) { finish(); return; }
    if (i !== idx) setIdx(i);
    const onMove = () => locate(i);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    const ticker = setInterval(onMove, 400);
    return () => { window.removeEventListener("resize", onMove); window.removeEventListener("scroll", onMove, true); clearInterval(ticker); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idx]);

  function persistDone() { try { localStorage.setItem(key, "1"); } catch {} }
  function finish() { persistDone(); setOpen(false); }
  function skip() { persistDone(); setOpen(false); }
  function later() { setOpen(false); } // resume next visit (not marked done)
  function next() { if (idx + 1 >= steps.length) finish(); else setIdx(idx + 1); }
  function prev() { if (idx > 0) setIdx(idx - 1); }

  if (!open || !rect) return null;
  const step = steps[idx];
  const spaceBelow = typeof window !== "undefined" ? window.innerHeight - (rect.top + rect.height) : 0;
  const below = spaceBelow > 220;
  const tipTop = below ? rect.top + rect.height + PAD + 6 : Math.max(12, rect.top - 200);
  const tipLeft = Math.min(Math.max(12, rect.left), (typeof window !== "undefined" ? window.innerWidth : 1200) - 340);

  return (
    <div className="fixed inset-0 z-[200]" dir="rtl" aria-live="polite">
      {/* spotlight: highlighted target cut out of a dimmed backdrop */}
      <div
        className="pointer-events-none absolute rounded-xl ring-2 ring-brand-400 transition-all duration-300"
        style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: "0 0 0 9999px rgba(2,6,23,0.72)" }}
      />
      {/* tooltip */}
      <div className="absolute w-[320px] max-w-[92vw] rounded-2xl border border-white/10 bg-canvas-deep/95 p-4 shadow-2xl backdrop-blur" style={{ top: tipTop, left: tipLeft }}>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">خطوة {idx + 1} من {steps.length}</span>
          <button onClick={later} className="text-slate-500 hover:text-slate-300 text-sm" aria-label="لاحقًا">✕</button>
        </div>
        <h3 className="text-sm font-bold text-white mb-1">{step.title}</h3>
        <p className="text-xs leading-relaxed text-slate-300">{step.body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button onClick={skip} className="text-[11px] text-slate-500 hover:text-slate-300">تخطّي الجولة</button>
          <div className="flex items-center gap-1.5">
            {idx > 0 && <button onClick={prev} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10">السابق</button>}
            <button onClick={next} className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-400">{idx + 1 >= steps.length ? "تمّ ✓" : "التالي"}</button>
          </div>
        </div>
        {/* progress dots */}
        <div className="mt-2 flex justify-center gap-1">
          {steps.map((_, i) => <span key={i} className={"h-1.5 rounded-full transition-all " + (i === idx ? "w-4 bg-brand-400" : "w-1.5 bg-white/15")} />)}
        </div>
      </div>
    </div>
  );
}
