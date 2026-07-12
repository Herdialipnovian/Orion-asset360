/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Field notifications list (dark). Tap a notification to mark it read + open its asset.
 */
import React from "react";
import { ArrowLeft, Bell, CheckCheck, Wrench, ClipboardCheck } from "lucide-react";
import type { NotifItem } from "../fieldApi";
import { EmptyState } from "../ui";

const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)}m lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)}j lalu`;
  return `${Math.floor(s / 86400)}h lalu`;
};

export default function Notifications({
  items,
  onBack,
  onRead,
  onReadAll,
  onOpen
}: {
  items: NotifItem[];
  onBack: () => void;
  onRead: (id: number) => void;
  onReadAll: () => void;
  onOpen: (assetId: string) => void;
}) {
  const anyUnread = items.some(n => !n.read);
  return (
    <div className="flex flex-col gap-4 px-4 pb-28 pt-3">
      <div className="flex items-center gap-3">
        <button onClick={onBack} aria-label="Kembali" className="tap flex w-12 items-center justify-center rounded-xl border border-[#1e2b45] bg-[#0f1728] text-slate-300 active:scale-95">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex items-center gap-2 text-lg font-bold text-white"><Bell className="h-5 w-5" /> Notifikasi</h1>
        {anyUnread && (
          <button onClick={onReadAll} className="tap ml-auto inline-flex items-center gap-1 rounded-lg border border-[#1e2b45] px-2.5 py-1.5 text-[11px] font-bold text-[#8fb4ff]">
            <CheckCheck className="h-3.5 w-3.5" /> Semua dibaca
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<Bell className="h-8 w-8" />} title="Belum ada notifikasi" hint="Notifikasi tugas dan progres pemasangan akan muncul di sini." />
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map(n => {
            const Icon = n.type === "install_assigned" ? Wrench : ClipboardCheck;
            return (
              <li key={n.id}>
                <button
                  onClick={() => {
                    if (!n.read) onRead(n.id);
                    if (n.assetId) onOpen(n.assetId);
                  }}
                  className={`tap flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left active:scale-[0.99] ${n.read ? "border-[#1e2b45] bg-[#0f1728]/60 opacity-70" : "border-[#4d8bff]/40 bg-[#4d8bff]/10"}`}
                >
                  <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${n.read ? "bg-slate-700/40 text-slate-400" : "bg-[#4d8bff]/20 text-[#8fb4ff]"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-white">{n.title}</span>
                      {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />}
                    </span>
                    {n.body && <span className="block text-xs text-slate-400">{n.body}</span>}
                    <span className="block text-[10px] text-slate-500">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
