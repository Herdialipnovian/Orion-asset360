/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Action screen — capture required photo evidence, fill the gate form, and QUEUE
 * the commit to the offline outbox. Queuing is local (IndexedDB) so it always
 * succeeds instantly; the outbox worker uploads photos + PATCHes /stage when
 * online (idempotent, evidence-gated, optimistic-concurrency).
 */
import React from "react";
import { ArrowLeft, Camera, Loader2, Send, CircleDot, WifiOff } from "lucide-react";
import type { Asset } from "../../types";
import type { AuthUser } from "../fieldApi";
import { TRANSITION_VERB, EVIDENCE_SLOTS, STAGE_FULL, STAGE_LABELS } from "../lifecycle";
import { GATE, initForm, missingFields, buildDetails, type GateField } from "../gateForms";
import { enqueueCommit, type EvidenceItem } from "../outbox";
import type { Captured } from "../camera";
import { Toast } from "../ui";
import CameraCapture from "./CameraCapture";

export default function ActionScreen({
  asset,
  target,
  user,
  online,
  onBack,
  onQueued
}: {
  asset: Asset;
  target: number;
  user: AuthUser;
  online: boolean;
  onBack: () => void;
  onQueued: (offline: boolean) => void;
}) {
  const slots = EVIDENCE_SLOTS[target] || [];
  const required = slots.filter(s => !s.optional);
  const gateFields = GATE[target]?.fields || [];

  const [shots, setShots] = React.useState<Record<string, Captured>>({});
  const [form, setForm] = React.useState<Record<string, any>>(() => initForm(target, asset, user));
  const [activeSlot, setActiveSlot] = React.useState<{ slot: string; label: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState<{ msg: string; tone: "info" | "error" | "success" } | null>(null);

  const requiredPhotosDone = required.every(s => shots[s.slot]);
  const setField = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  async function commit() {
    if (!requiredPhotosDone) return setToast({ msg: "Ambil semua foto WAJIB dulu.", tone: "error" });
    const miss = missingFields(target, form);
    if (miss.length) return setToast({ msg: `Lengkapi: ${miss.join(", ")}.`, tone: "error" });
    setBusy(true);
    try {
      const evidence: EvidenceItem[] = slots
        .filter(s => shots[s.slot])
        .map(s => ({ slot: s.slot, label: s.label, blob: shots[s.slot].blob, meta: shots[s.slot].meta }));
      await enqueueCommit({
        id: crypto.randomUUID(),
        assetId: asset.id,
        assetName: asset.name,
        currentStage: asset.currentStage,
        target,
        verb: TRANSITION_VERB[target],
        evidence,
        details: buildDetails(target, asset, form),
        operator: user.name,
        baseUpdatedAt: asset.updatedAt,
        status: "pending",
        attempts: 0,
        createdAt: new Date().toISOString()
      });
      onQueued(!online);
    } catch (e: any) {
      setToast({ msg: e?.message || "Gagal menyimpan ke antrean.", tone: "error" });
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-28 pt-3">
      <div className="flex items-center gap-3">
        <button onClick={onBack} aria-label="Kembali" className="tap flex w-12 items-center justify-center rounded-xl border border-[#1e2b45] bg-[#0f1728] text-slate-300 active:scale-95">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="font-mono text-sm text-slate-400">{asset.id}</span>
        {!online && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
            <WifiOff className="h-3 w-3" /> Offline
          </span>
        )}
      </div>

      <header>
        <h1 className="text-xl font-bold text-white">{TRANSITION_VERB[target]}</h1>
        <p className="mt-1 text-sm text-slate-400">{asset.name} · Fase {asset.currentStage} → {target} ({STAGE_LABELS[target]})</p>
        <p className="text-xs text-slate-500">{STAGE_FULL[target]}</p>
      </header>

      {/* Photo evidence */}
      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Foto bukti — {required.length} wajib{slots.length > required.length ? `, ${slots.length - required.length} opsional` : ""}
        </h2>
        {slots.map(s => {
          const shot = shots[s.slot];
          return (
            <div key={s.slot} className="flex items-center gap-3 rounded-2xl border border-[#1e2b45] bg-[#0f1728] p-3">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-black/40">
                {shot ? <img src={shot.url} alt={s.label} className="h-full w-full object-cover" /> : <Camera className="h-6 w-6 text-slate-600" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-100">{s.label}</div>
                <div className="mt-1">
                  {s.optional ? (
                    <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">OPSIONAL</span>
                  ) : (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">WAJIB</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setActiveSlot({ slot: s.slot, label: s.label })}
                className="tap flex items-center gap-1.5 rounded-xl border border-[#4d8bff]/40 bg-[#4d8bff]/10 px-3 text-sm font-semibold text-[#8fb4ff] active:scale-95"
              >
                {shot ? <><CircleDot className="h-4 w-4" /> Ulangi</> : <><Camera className="h-4 w-4" /> Ambil</>}
              </button>
            </div>
          );
        })}
      </section>

      {/* Gate form */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Data {TRANSITION_VERB[target]}</h2>
        {gateFields.map(f => (
          <div key={f.k}>
            <FieldInput f={f} value={form[f.k]} onChange={v => setField(f.k, v)} />
          </div>
        ))}
      </section>

      <button
        onClick={commit}
        disabled={busy}
        className="tap flex items-center justify-center gap-2 rounded-xl bg-[#4d8bff] px-4 text-base font-bold text-white active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        {online ? `Kirim & Pindah ke Fase ${target}` : `Simpan Offline → Fase ${target}`}
      </button>

      {activeSlot && (
        <CameraCapture
          assetId={asset.id}
          operator={user.name}
          slotLabel={activeSlot.label}
          onCancel={() => setActiveSlot(null)}
          onDone={c => {
            setShots(prev => {
              const p = prev[activeSlot.slot];
              if (p) URL.revokeObjectURL(p.url);
              return { ...prev, [activeSlot.slot]: c };
            });
            setActiveSlot(null);
          }}
        />
      )}

      {toast && <Toast msg={toast.msg} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  );
}

function FieldInput({ f, value, onChange }: { f: GateField; value: any; onChange: (v: any) => void }) {
  const base = "tap w-full rounded-xl border border-[#1e2b45] bg-[#0f1728] px-3 text-base text-white outline-none placeholder:text-slate-600 focus:border-[#4d8bff]";
  if (f.type === "toggle") {
    return (
      <label className="flex items-center justify-between rounded-xl border border-[#1e2b45] bg-[#0f1728] px-4 py-3">
        <span className="text-sm text-slate-200">{f.label}</span>
        <button
          type="button"
          onClick={() => onChange(!value)}
          aria-pressed={!!value}
          className={`relative h-7 w-12 rounded-full transition ${value ? "bg-emerald-500" : "bg-slate-600"}`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${value ? "left-6" : "left-1"}`} />
        </button>
      </label>
    );
  }
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-400">
        {f.label}
        {f.req && <span className="text-rose-400"> *</span>}
      </span>
      {f.type === "select" ? (
        <select value={value ?? ""} onChange={e => onChange(e.target.value)} className={base + " h-[52px]"}>
          <option value="">— pilih —</option>
          {f.options?.map(o => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : f.type === "textarea" ? (
        <textarea value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={f.placeholder} rows={2} className={base + " py-2"} />
      ) : (
        <input
          type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          placeholder={f.placeholder}
          min={f.min}
          max={f.max}
          className={base + " h-[52px]"}
        />
      )}
    </label>
  );
}
