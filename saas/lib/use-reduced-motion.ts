"use client";
import { useState, useEffect } from "react";

const MQ = "(prefers-reduced-motion: reduce)";

export function useReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(MQ).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(MQ);
    const handler = () => setPrefers(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return prefers;
}
