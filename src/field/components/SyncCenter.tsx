/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sync Center: the outbox made visible. Shows every queued commit, its status,
 * and lets the operator force a sync or resolve conflicts/errors. Works offline
 * (queue persists); "Sync Sekarang" flushes when back online.
 */
import React from "react";
import { RefreshCw, Wifi, WifiOff, CheckCircle2, AlertTriangle, Clock, Loader2, Trash2, RotateCw, ImageIcon } from "lucide-react";
import type { CommitRecord } from "../outbox";
import { STAGE_LABELS } from "../lifecycle";
import { EmptyState } from "../ui";

function StatusChip({ s }: { s: CommitRecord["status"] }) {
  if (s === "syncing") return <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-semibold text-blue-300"><Loader2 className="h-3 w-3 animate-spin" /> menyinkron</span>;
  if (s === "conflict") return <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-300"><AlertTriangle className="h-3 w-3" /> konflik</span>;
  if (s === "error") return <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-300"><AlertTriangle className="h-3 w-3" /> gagal</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300"><Clock className="h-3 w-3" /> menunggu</span>;
}

export default function SyncCenter({
  items,
  online,
  syncing,
  onSyncNow,
  onRetry,
  onDiscard
}: {
  items: CommitRecord[];
  online: boolean;
  syncing: boolean;
  onSyncNow: () => void;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const pending = items.filter(i => i.status === "pending" || i.status === "syncing").length;

  return (
    <div className="flex flex-col gap-4 px-4 pb-28 pt-3">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Sinkronisasi</h1>
          <div className={`mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold ${online ? "text-emerald-400" : "text-amber-400"}`}>
            {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {online ? "Online" : "Offline — antrean akan terkirim saat koneksi kembali"}
          </div>
        </div>
        <button
          onClick={onSyncNow}
          disabled={!online || syncing || items.length === 0}
          className="tap flex items-center gap-2 rounded-xl border border-[#1e2b45] bg-[#0f1728] px-4 text-sm font-semibold text-slate-200 active:scale-95 disabled:opacity-40"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> Sync
        </button>
      </header>

      {items.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-9 w-9 text-emerald-500" />} title="Semua tersinkron" hint="Tidak ada perubahan yang menunggu dikirim ke server." />
      ) : (
        <>
          <div className="text-xs text-slate-500">{pending} menunggu · {items.length} total di antrean</div>
          {items.map(c => (
            <div key={c.id} className="flex flex-col gap-2 rounded-2xl border border-[#1e2b45] bg-[#0f1728] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{c.assetName}</div>
                  <div className="font-mono text-xs text-slate-400">{c.assetId}</div>
                </div>
                <StatusChip s={c.status} />
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>{c.verb}</span>
                <span className="text-slate-600">·</span>
                <span>Fase {c.currentStage} ke {c.target} ({STAGE_LABELS[c.target]})</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1"><ImageIcon className="h-3 w-3" /> {c.evidence.length} foto</span>
                {c.attempts > 0 && <span>{c.attempts}× percobaan</span>}
              </div>
              {c.lastError && (c.status === "conflict" || c.status === "error") && (
                <div className="rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-300">
                  {c.status === "conflict" ? "Aset sudah berubah di server. Silakan buang antrean ini, buka kembali aset, lalu ulangi aksinya." : c.lastError}
                </div>
              )}
              {(c.status === "conflict" || c.status === "error") && (
                <div className="flex gap-2">
                  <button onClick={() => onRetry(c.id)} disabled={!online} className="tap flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#4d8bff]/40 bg-[#4d8bff]/10 py-2.5 text-sm font-semibold text-[#8fb4ff] active:scale-95 disabled:opacity-40">
                    <RotateCw className="h-4 w-4" /> Coba lagi
                  </button>
                  <button onClick={() => onDiscard(c.id)} className="tap flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 py-2.5 text-sm font-semibold text-rose-300 active:scale-95">
                    <Trash2 className="h-4 w-4" /> Buang
                  </button>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
