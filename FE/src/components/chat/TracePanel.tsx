"use client";

import { Icon, type IconName } from "@/components/ui/Icon";
import type { TraceEvent } from "@/lib/types";

const ICONS: Record<TraceEvent["kind"], IconName> = {
  guard: "shield-check", select: "books", thought: "bulb", query: "database",
  retry: "rotate-right", retrieval: "search", info: "info",
};

function processName(e: TraceEvent) {
  if (e.kind === "guard" && /flagged/i.test(e.title)) return "Checking request safety";
  if (e.kind === "query" && e.data?.ok === false) return "Retrying the data request";
  return ({
    guard: "Checking request safety",
    select: "Selecting relevant knowledge",
    thought: "Understanding your request",
    query: "Fetching data",
    retry: "Retrying safely",
    retrieval: "Searching relevant sources",
    info: "Preparing your answer",
  } satisfies Record<TraceEvent["kind"], string>)[e.kind] ?? "Working on your request";
}

function Entry({ e, live = false }: { e: TraceEvent; live?: boolean }) {
  return (
    <li className="rise flex items-center gap-2.5 text-[12px] leading-snug font-medium text-ink">
      <Icon name={ICONS[e.kind] ?? "info"} size={14} className="shrink-0 text-mute" />
      <span>
        {processName(e)}
        {live && <span className="typing-dots ml-0.5" aria-hidden><span>.</span><span>.</span><span>.</span></span>}
      </span>
    </li>
  );
}

/** Show concise progress stages without exposing internal reasoning or retrieved content. */
export function TracePanel({ events, live = false }: { events: TraceEvent[]; live?: boolean }) {
  const stages = events.filter((event, index) => index === 0 || processName(event) !== processName(events[index - 1]));
  const visible = live ? stages.slice(-1) : stages;
  return (
    <ol className="space-y-2" aria-label="Agent activity">
      {visible.map((e, i) => <Entry key={`${e.ts}-${i}`} e={e} live={live && i === visible.length - 1} />)}
      {!visible.length && live && <li className="text-[12px] text-mute">Preparing your answer<span className="typing-dots ml-0.5" aria-hidden><span>.</span><span>.</span><span>.</span></span></li>}
    </ol>
  );
}
