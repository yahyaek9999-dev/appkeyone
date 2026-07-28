"use client";

import { useState } from "react";
import CustomerTimeline from "./customer-timeline";

type Props = {
  chatView: React.ReactNode;
  events: Parameters<typeof CustomerTimeline>[0]["events"];
};

export default function CustomerTabs({ chatView, events }: Props) {
  const [tab, setTab] = useState<"chat" | "timeline">("chat");
  return (
    <div>
      <div className="mb-3 flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.03] p-1 w-fit">
        <button
          onClick={() => setTab("chat")}
          className={`rounded-lg px-4 py-1.5 text-xs font-medium transition ${
            tab === "chat" ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-white"
          }`}
        >
          المحادثة
        </button>
        <button
          onClick={() => setTab("timeline")}
          className={`rounded-lg px-4 py-1.5 text-xs font-medium transition ${
            tab === "timeline" ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-white"
          }`}
        >
          النشاط ({events.length})
        </button>
      </div>
      {tab === "chat" ? chatView : <CustomerTimeline events={events} />}
    </div>
  );
}
