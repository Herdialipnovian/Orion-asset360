/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Small shared UI atoms for the field PWA (badges, brand mark, states).
 */
import React from "react";
import { STAGE_LABELS, STAGE_TONE } from "./lifecycle";

const TONE: Record<string, { bg: string; text: string; dot: string; ring: string }> = {
  slate: { bg: "bg-slate-500/15", text: "text-slate-300", dot: "bg-slate-400", ring: "ring-slate-400/30" },
  violet: { bg: "bg-violet-500/15", text: "text-violet-300", dot: "bg-violet-400", ring: "ring-violet-400/30" },
  sky: { bg: "bg-sky-500/15", text: "text-sky-300", dot: "bg-sky-400", ring: "ring-sky-400/30" },
  amber: { bg: "bg-amber-500/15", text: "text-amber-300", dot: "bg-amber-400", ring: "ring-amber-400/30" },
  emerald: { bg: "bg-emerald-500/15", text: "text-emerald-300", dot: "bg-emerald-400", ring: "ring-emerald-400/30" },
  blue: { bg: "bg-blue-500/15", text: "text-blue-300", dot: "bg-blue-400", ring: "ring-blue-400/30" },
  orange: { bg: "bg-orange-500/15", text: "text-orange-300", dot: "bg-orange-400", ring: "ring-orange-400/30" },
  rose: { bg: "bg-rose-500/15", text: "text-rose-300", dot: "bg-rose-400", ring: "ring-rose-400/30" },
  zinc: { bg: "bg-zinc-500/15", text: "text-zinc-300", dot: "bg-zinc-400", ring: "ring-zinc-400/30" }
};

export function StageBadge({ stage, size = "md" }: { stage: number; size?: "sm" | "md" }) {
  const tone = TONE[STAGE_TONE[stage] || "slate"];
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${tone.bg} ${tone.text} ${pad}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      <span className="font-mono">F{stage}</span>
      <span>{STAGE_LABELS[stage] || `Fase ${stage}`}</span>
    </span>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-7 w-7 rounded-full bg-[#ffcd00] shadow-[0_0_0_4px_rgba(255,205,0,0.12)]" />
      <div className="leading-none">
        <div className="font-black tracking-[0.12em] text-white">ORIGIN</div>
        {!compact && <div className="text-[8.5px] tracking-wide text-slate-400 text-right">Asset360 · Field</div>}
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-slate-600 border-t-[#4d8bff]" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-8 py-14 text-center">
      {icon && <div className="mb-1 text-slate-500">{icon}</div>}
      <div className="font-semibold text-slate-200">{title}</div>
      {hint && <div className="max-w-[42ch] text-sm text-slate-500">{hint}</div>}
    </div>
  );
}

export function Toast({ msg, tone = "info", onDone }: { msg: string; tone?: "info" | "error" | "success"; onDone?: () => void }) {
  React.useEffect(() => {
    const t = setTimeout(() => onDone?.(), 3200);
    return () => clearTimeout(t);
  }, [msg, onDone]);
  const c =
    tone === "error"
      ? "bg-rose-500/15 text-rose-200 ring-rose-400/30"
      : tone === "success"
      ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
      : "bg-slate-700/60 text-slate-100 ring-slate-500/30";
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div className={`pointer-events-auto max-w-sm rounded-xl px-4 py-3 text-sm font-medium shadow-xl ring-1 backdrop-blur ${c}`}>{msg}</div>
    </div>
  );
}

export const ROLE_SHORT: Record<string, string> = {
  "Admin": "Admin",
  "Logistik": "Logistik",
  "PIC": "PIC",
  "Merchandiser": "Merchandiser"
};
