"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveState } from "@/components/ui/live-badge";

export type RealtimeSnapshot = {
  ts: string;
  seq: string;
  userId: string;
  totals: {
    conversations: number;
    messages: number;
    broadcastsActive: number;
    ordersOpen: number;
    alerts24h: number;
  };
  latest: {
    messageAt: string | null;
    broadcastAt: string | null;
    orderAt: string | null;
    safetyAt: string | null;
  };
  activeConversation?: {
    customerId: string;
    messageCount: number;
    lastMessageAt: string | null;
    botPaused: boolean;
  } | null;
  whatsapp: {
    status: string;
    phone: string | null;
    mode: string;
    metaConfigured: boolean;
  } | null;
};

export function useRealtimeSnapshot({
  activeCustomerId,
  onChange,
  fallbackMs = 30000,
}: {
  activeCustomerId?: string | null;
  onChange?: (snapshot: RealtimeSnapshot, previous: RealtimeSnapshot | null) => void;
  fallbackMs?: number;
}) {
  const [state, setState] = useState<LiveState>("connecting");
  const [snapshot, setSnapshot] = useState<RealtimeSnapshot | null>(null);
  const latestRef = useRef<RealtimeSnapshot | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let closed = false;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    const url = activeCustomerId
      ? `/api/realtime/stream?customerId=${encodeURIComponent(activeCustomerId)}`
      : "/api/realtime/stream";

    async function fallbackTick() {
      try {
        const res = await fetch(url, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const next = (await res.json()) as RealtimeSnapshot;
        apply(next);
        setState("fallback");
      } catch {
        setState("offline");
      }
    }

    function apply(next: RealtimeSnapshot) {
      const prev = latestRef.current;
      latestRef.current = next;
      setSnapshot(next);
      if (!prev || prev.seq !== next.seq) {
        onChangeRef.current?.(next, prev);
      }
    }

    function startFallback() {
      if (fallbackTimer) return;
      fallbackTick();
      fallbackTimer = setInterval(fallbackTick, fallbackMs);
    }

    setState("connecting");

    // EventSource is intentionally lightweight: one stream per page, 5s server tick.
    // If a proxy/browser blocks SSE, we fall back to slow polling automatically.
    try {
      const es = new EventSource(url);
      es.onopen = () => { if (!closed) setState("live"); };
      es.onmessage = (ev) => {
        if (closed) return;
        try {
          const next = JSON.parse(ev.data) as RealtimeSnapshot;
          apply(next);
          setState("live");
        } catch {
          // Ignore malformed frames; the next server tick will repair state.
        }
      };
      es.onerror = () => {
        if (closed) return;
        es.close();
        startFallback();
      };
      return () => {
        closed = true;
        es.close();
        if (fallbackTimer) clearInterval(fallbackTimer);
      };
    } catch {
      startFallback();
      return () => {
        closed = true;
        if (fallbackTimer) clearInterval(fallbackTimer);
      };
    }
  }, [activeCustomerId, fallbackMs]);

  return { state, snapshot };
}
