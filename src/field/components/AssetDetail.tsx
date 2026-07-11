/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
import { ArrowLeft, ChevronRight, MapPin, History, Lock, Camera, CloudUpload, AlertTriangle, Wrench } from "lucide-react";
import type { Asset, ActivityLog } from "../../types";
import type { AuthUser } from "../fieldApi";
import type { CommitRecord } from "../outbox";
import { Users } from "lucide-react";
import { eligibleActions, handoffActions, myInstallTask, canAssignInstall, STAGE_FULL, STAGE_LABELS } from "../lifecycle";
import { StageBadge, ROLE_SHORT } from "../ui";

function Field({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-sm text-slate-100">{value}</span>
    </div>
  );
}

const rupiah = (n?: number) => (n != null ? "Rp " + new Intl.NumberFormat("id-ID").format(n) : undefined);

export default function AssetDetail({
  asset,
  user,
  activity,
  pending,
  onBack,
  onAction,
  onInstallTask,
  onAssign,
  onOpenSync
}: {
  asset: Asset;
  user: AuthUser;
  activity: ActivityLog[];
  pending?: CommitRecord;
  onBack: () => void;
  onAction: (target: number) => void;
  onInstallTask: () => void;
  onAssign: () => void;
  onOpenSync: () => void;
}) {
  const actions = eligibleActions(asset.currentStage, user.role);
  const handoffs = handoffActions(asset.currentStage, user.role);
  const installTask = myInstallTask(asset, user.id);
  const canAssign = canAssignInstall(asset, user) && !(asset.stageDetails as any)?.deployment?.fullyInstalled;
  const logs = React.useMemo(
    () => activity.filter(l => l.assetId === asset.id).slice(0, 8),
    [activity, asset.id]
  );

  return (
    <div className="flex flex-col gap-4 px-4 pb-28 pt-3">
      <div className="flex items-center gap-3">
        <button onClick={onBack} aria-label="Kembali" className="tap flex w-12 items-center justify-center rounded-xl border border-[#1e2b45] bg-[#0f1728] text-slate-300 active:scale-95">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="font-mono text-sm text-slate-400">{asset.id}</span>
      </div>

      {/* Identity */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#1e2b45] bg-[#0f1728] p-4">
        <div>
          <h1 className="text-xl font-bold text-white">{asset.name}</h1>
          <p className="text-sm text-slate-400">{asset.client}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StageBadge stage={asset.currentStage} />
          <span className="rounded-full bg-slate-700/40 px-2 py-0.5 text-[11px] text-slate-300">{asset.category}</span>
          {asset.quantity > 1 && <span className="rounded-full bg-slate-700/40 px-2 py-0.5 text-[11px] text-slate-300">Qty {asset.quantity}</span>}
        </div>
        <div className="text-xs text-slate-400">{STAGE_FULL[asset.currentStage]}</div>
        {asset.currentLocation && (
          <div className="flex items-start gap-1.5 text-xs text-slate-400">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
            <span>{asset.currentLocation}</span>
          </div>
        )}
      </div>

      {/* Physical attributes */}
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[#1e2b45] bg-[#0f1728] p-4">
        <Field label="Merk" value={asset.specs?.brand} />
        <Field label="Type / Material" value={asset.type} />
        <Field label="Warna" value={asset.warna} />
        <Field label="Serial Number" value={asset.serialNumber} />
        <Field label="Fisik" value={asset.fisik} />
        <Field label="Tgl Beli" value={asset.tglBeli} />
        <Field label="Harga" value={rupiah(asset.financials?.purchaseCost)} />
        <Field label="Qty" value={asset.quantity} />
      </div>

      {/* Actions */}
      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Aksi Lapangan</h2>
        {canAssign && (
          <button
            onClick={onAssign}
            className="tap flex w-full items-center gap-3 rounded-2xl border border-[#4d8bff]/40 bg-[#4d8bff]/10 px-4 py-3 text-left transition active:scale-[0.99]"
          >
            <Users className="h-5 w-5 shrink-0 text-[#8fb4ff]" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-white">Atur Penugasan Pemasangan</div>
              <div className="text-xs text-slate-400">Bagi qty ke Merchandiser (PIC)</div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-[#8fb4ff]" />
          </button>
        )}
        {installTask && !pending && (
          <button
            onClick={onInstallTask}
            className="tap flex w-full items-center gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-left transition active:scale-[0.99]"
          >
            <Wrench className="h-5 w-5 shrink-0 text-emerald-300" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-white">Selesaikan Pemasangan Saya</div>
              <div className="text-xs text-slate-400">Jatah kamu {installTask.qty} unit · foto before/after + TTD BAST</div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-emerald-300" />
          </button>
        )}
        {pending ? (
          <div className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 ${pending.status === "conflict" || pending.status === "error" ? "border-rose-500/30 bg-rose-500/[0.07]" : "border-amber-500/30 bg-amber-500/[0.07]"}`}>
            <div className="flex items-start gap-3">
              {pending.status === "conflict" || pending.status === "error" ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" /> : <CloudUpload className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />}
              <div className="text-sm text-slate-200">
                <div className="font-semibold text-white">
                  {pending.status === "conflict" ? "Konflik sinkronisasi" : pending.status === "error" ? "Gagal sinkron" : "Menunggu sinkron"} → Fase {pending.target} ({STAGE_LABELS[pending.target]})
                </div>
                <p className="text-xs text-slate-400">
                  {pending.status === "conflict"
                    ? "Aset berubah di server. Selesaikan di Sinkronisasi lalu ulangi."
                    : pending.status === "error"
                    ? "Ada masalah saat mengirim. Cek Sinkronisasi."
                    : "Aksi lain terkunci sampai perubahan ini terkirim ke server."}
                </p>
              </div>
            </div>
            <button onClick={onOpenSync} className="tap flex items-center justify-center gap-2 rounded-xl border border-[#1e2b45] bg-[#0f1728] py-2.5 text-sm font-semibold text-slate-200 active:scale-95">
              <CloudUpload className="h-4 w-4" /> Lihat Sinkronisasi
            </button>
          </div>
        ) : actions.length === 0 && handoffs.length === 0 ? (
          !installTask && !canAssign && (
            <div className="rounded-xl border border-[#1e2b45] bg-[#0f1728] px-4 py-3 text-sm text-slate-400">
              Tidak ada aksi lapangan untuk aset di fase ini{user.role !== "Admin" ? ` bagi role ${ROLE_SHORT[user.role]}` : ""}.
            </div>
          )
        ) : (
          <>
            {actions.map(act => (
              <button
                key={act.target}
                onClick={() => onAction(act.target)}
                className="tap flex w-full items-center gap-3 rounded-2xl border border-[#4d8bff]/40 bg-[#4d8bff]/10 px-4 py-3 text-left transition active:scale-[0.99]"
              >
                <Camera className="h-5 w-5 shrink-0 text-[#8fb4ff]" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white">{act.verb}</div>
                  <div className="text-xs text-slate-400">
                    {act.requiredSlots.length} foto wajib · Fase {asset.currentStage} → {act.target}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-[#8fb4ff]" />
              </button>
            ))}
            {handoffs.map(h => (
              <div key={h.target} className="flex w-full items-center gap-3 rounded-2xl border border-[#1e2b45] bg-[#0f1728]/60 px-4 py-3 text-left opacity-70">
                <Lock className="h-5 w-5 shrink-0 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-300">{h.verb}</div>
                  <div className="text-xs text-slate-500">Perlu role: {h.roles.map(r => ROLE_SHORT[r] || r).join(" / ")}</div>
                </div>
              </div>
            ))}
          </>
        )}
      </section>

      {/* History */}
      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          <History className="h-4 w-4" /> Riwayat
        </h2>
        {logs.length === 0 ? (
          <div className="rounded-xl border border-[#1e2b45] bg-[#0f1728] px-4 py-3 text-sm text-slate-500">Belum ada aktivitas tercatat.</div>
        ) : (
          <ol className="flex flex-col gap-2">
            {logs.map(l => (
              <li key={l.id} className="rounded-xl border border-[#1e2b45] bg-[#0f1728] px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <StageBadge stage={l.stage} size="sm" />
                  <span className="text-[11px] text-slate-500">{new Date(l.timestamp).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-200">{l.action}</p>
                <p className="text-[11px] text-slate-500">oleh {l.operator}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
