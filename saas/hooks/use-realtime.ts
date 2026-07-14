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
    commerceIntegrations?: number;
    commerceFailedEvents?: number;
    escalationActive?: number;
    escalationCritical?: number;
    outgoingQueued?: number;
    outgoingScheduled?: number;
    outgoingSending?: number;
    outgoingFailed24h?: number;
    outgoingStaleQueued?: number;
    outgoingOldestQueuedAgeSec?: number;
  };
  queue?: {
    queued: number;
    scheduled: number;
    sending: number;
    sent24h: number;
    failed24h: number;
    oldestQueuedAgeSec: number;
    staleQueued: number;
  };
  latest: {
    messageAt: string | null;
    broadcastAt: string | null;
    orderAt: string | null;
    commerceEventAt?: string | null;
    commerceNotificationAt?: string | null;
    safetyAt: string | null;
    escalationAt?: string | null;
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
  onChange?: (
    snapshot: RealtimeSnapshot,
    previous: RealtimeSnapshot | null,
  ) => void;
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
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let currentEs: EventSource | null = null;
    // Exponential backoff for SSE reconnect attempts, capped at 60s, so a
    // dropped stream doesn't strand the page on 20-30s polling for the rest
    // of the session — it keeps retrying SSE in the background and switches
    // back to "live" the moment the stream comes back.
    let reconnectDelayMs = 5000;
    const MAX_RECONNECT_DELAY_MS = 60000;
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
        setState((prev) => (prev === "live" ? "live" : "fallback"));
      } catch {
        setState((prev) => (prev === "live" ? "live" : "offline"));
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

    function stopFallback() {
      if (fallbackTimer) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    }

    function scheduleReconnect() {
      if (closed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!closed) connect();
      }, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
    }

    // EventSource is intentionally lightweight: one stream per page, 5s server tick.
    // If a proxy/browser blocks SSE, or a drop happens mid-session, we fall back to
    // slow polling immediately while retrying the stream itself in the background.
    function connect() {
      try {
        const es = new EventSource(url);
        currentEs = es;
        es.onopen = () => {
          if (closed) return;
          reconnectDelayMs = 5000; // reset backoff on a successful connection
          stopFallback();
          setState("live");
        };
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
          if (currentEs === es) currentEs = null;
          startFallback();
          scheduleReconnect();
        };
      } catch {
        startFallback();
        scheduleReconnect();
      }
    }

    setState("connecting");
    connect();

    return () => {
      closed = true;
      currentEs?.close();
      stopFallback();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [activeCustomerId, fallbackMs]);

  return { state, snapshot };
}
