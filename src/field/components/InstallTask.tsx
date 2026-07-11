/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Merchandiser reports install progress for THEIR portion (Fase 6). Pick how many
 * units are done now (1..sisa), capture fresh before/after, optionally sign the BAST,
 * then QUEUE it to the offline outbox (works offline; syncs later, idempotent).
 */
import React from "react";
import { ArrowLeft, Camera, Loader2, Send, CircleDot, WifiOff, Eraser, Minus, Plus } from "lucide-react";
import type { Asset } from "../../types";
import type { AuthUser } from "../fieldApi";
import type { Captured } from "../camera";
import { enqueueCommit, type EvidenceItem } from "../outbox";
import { Toast } from "../ui";
import CameraCapture from "./CameraCapture";

const SLOTS = [
  { slot: "before", label: "Foto BEFORE (sebelum dipasang)" },
  { slot: "after", label: "Foto AFTER (terpasang)" }
];

function SignaturePad({ onChange }: { onChange: (v: string) => void }) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const drawing = React.useRef(false);
  const dirty = React.useRef(false);
  const pos = (e: React.PointerEvent) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    const ctx = ref.current!.getContext("2d")!;
    ctx.strokeStyle = "#0f1728";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    dirty.current = true;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) onChange(ref.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
    onChange("");
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400">TTD BAST <span className="text-slate-500">(opsional)</span></span>
        <button type="button" onClick={clear} className="tap inline-flex items-center gap-1 rounded-lg border border-[#1e2b45] px-2 py-1 text-[11px] text-slate-300">
          <Eraser className="h-3.5 w-3.5" /> Hapus
        </button>
      </div>
      <canvas ref={ref} width={520} height={180} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} className="w-full touch-none rounded-xl border border-[#1e2b45] bg-white" style={{ height: 160 }} />
    </div>
  );
}

export default function InstallTask({
  asset,
  task,
  user,
  online,
  onBack,
  onQueued
}: {
  asset: Asset;
  task: { qty: number; doneQty: number; remaining: number };
  user: AuthUser;
  online: boolean;
  onBack: () => void;
  onQueued: (offline: boolean) => void;
}) {
  const [n, setN] = React.useState(task.remaining);
  const [shots, setShots] = React.useState<Record<string, Captured>>({});
  const [sig, setSig] = React.useState("");
  const [activeSlot, setActiveSlot] = React.useState<{ slot: string; label: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState<{ msg: string; tone: "info" | "error" | "success" } | null>(null);

  const clamp = (v: number) => Math.max(1, Math.min(task.remaining, v));
  const photosDone = SLOTS.every(s => shots[s.slot]);

  async function submit() {
    if (!photosDone) return setToast({ msg: "Ambil foto BEFORE & AFTER dulu.", tone: "error" });
    setBusy(true);
    try {
      const evidence: EvidenceItem[] = SLOTS.map(s => ({ slot: s.slot, label: s.label, blob: shots[s.slot].blob, meta: shots[s.slot].meta }));
      await enqueueCommit({
        id: crypto.randomUUID(),
        assetId: asset.id,
        assetName: asset.name,
        currentStage: asset.currentStage,
        target: 6,
        verb: `Pasang ${n} unit`,
        evidence,
        details: {},
        operator: user.name,
        baseUpdatedAt: asset.updatedAt,
        status: "pending",
        attempts: 0,
        createdAt: new Date().toISOString(),
        kind: "install",
        doneQty: n,
        signature: sig || undefined
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
        <h1 className="text-xl font-bold text-white">Lapor Pemasangan</h1>
        <p className="mt-1 text-sm text-slate-400">{asset.name}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[12px] font-bold">
          <span className="rounded-full bg-slate-700/50 px-2.5 py-1 text-slate-200">Jatah {task.qty}</span>
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-300">Sudah {task.doneQty}</span>
          <span className="rounded-full bg-[#4d8bff]/15 px-2.5 py-1 text-[#8fb4ff]">Sisa {task.remaining}</span>
        </div>
      </header>

      {/* How many now */}
      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Dipasang sekarang</h2>
        <div className="flex items-center gap-3">
          <button onClick={() => setN(v => clamp(v - 1))} disabled={n <= 1} className="tap grid h-12 w-12 place-items-center rounded-xl border border-[#1e2b45] bg-[#0f1728] text-slate-200 active:scale-95 disabled:opacity-40">
            <Minus className="h-5 w-5" />
          </button>
          <input
            type="number"
            value={n}
            min={1}
            max={task.remaining}
            onChange={e => setN(clamp(parseInt(e.target.value || "1", 10)))}
            className="h-12 w-24 rounded-xl border border-[#1e2b45] bg-[#0f1728] text-center text-2xl font-extrabold text-white outline-none focus:border-[#4d8bff]"
          />
          <button onClick={() => setN(v => clamp(v + 1))} disabled={n >= task.remaining} className="tap grid h-12 w-12 place-items-center rounded-xl border border-[#1e2b45] bg-[#0f1728] text-slate-200 active:scale-95 disabled:opacity-40">
            <Plus className="h-5 w-5" />
          </button>
          <span className="text-sm text-slate-400">dari {task.remaining} unit sisa</span>
        </div>
      </section>

      {/* Photos */}
      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Foto bukti — 2 wajib</h2>
        {SLOTS.map(s => {
          const shot = shots[s.slot];
          return (
            <div key={s.slot} className="flex items-center gap-3 rounded-2xl border border-[#1e2b45] bg-[#0f1728] p-3">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-black/40">
                {shot ? <img src={shot.url} alt={s.label} className="h-full w-full object-cover" /> : <Camera className="h-6 w-6 text-slate-600" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-100">{s.label}</div>
                <div className="mt-1"><span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">WAJIB</span></div>
              </div>
              <button onClick={() => setActiveSlot(s)} className="tap flex items-center gap-1.5 rounded-xl border border-[#4d8bff]/40 bg-[#4d8bff]/10 px-3 text-sm font-semibold text-[#8fb4ff] active:scale-95">
                {shot ? <><CircleDot className="h-4 w-4" /> Ulangi</> : <><Camera className="h-4 w-4" /> Ambil</>}
              </button>
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-2">
        <SignaturePad onChange={setSig} />
      </section>

      <button
        onClick={submit}
        disabled={busy}
        className="tap flex items-center justify-center gap-2 rounded-xl bg-[#4d8bff] px-4 text-base font-bold text-white active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        {online ? `Kirim Laporan (${n} unit)` : `Simpan Offline (${n} unit)`}
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
