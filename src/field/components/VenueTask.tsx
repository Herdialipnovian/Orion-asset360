/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PIC relocates the roadshow to the next venue from the field (Fase 2 Event, online-only).
 * Closes the active leg and opens a new one at the picked venue with a per-leg PIC. Mirrors the
 * CMS "Relokasi ke Venue Berikutnya" flow (POST /assets/:id/deploy-venue).
 */
import React from "react";
import { ArrowLeft, Loader2, Send, WifiOff, Compass, Eraser } from "lucide-react";
import type { Asset } from "../../types";
import { fieldApi, type AuthUser } from "../fieldApi";
import { currentLeg } from "../lifecycle";
import { Toast } from "../ui";

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
    ctx.strokeStyle = "#0f1728"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); dirty.current = true;
  };
  const end = () => { if (!drawing.current) return; drawing.current = false; if (dirty.current) onChange(ref.current!.toDataURL("image/png")); };
  const clear = () => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(""); };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400">TTD (opsional)</span>
        <button type="button" onClick={clear} className="tap inline-flex items-center gap-1 rounded-lg border border-[#1e2b45] px-2 py-1 text-[11px] text-slate-300"><Eraser className="h-3.5 w-3.5" /> Hapus</button>
      </div>
      <canvas ref={ref} width={520} height={180} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} className="w-full touch-none rounded-xl border border-[#1e2b45] bg-white" style={{ height: 160 }} />
    </div>
  );
}

export default function VenueTask({
  asset,
  user,
  online,
  onBack,
  onDone
}: {
  asset: Asset;
  user: AuthUser;
  online: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const leg = currentLeg(asset);
  const [venues, setVenues] = React.useState<{ id: number; name: string; area: string | null }[]>([]);
  const [locationId, setLocationId] = React.useState("");
  const [pic, setPic] = React.useState(user.name);
  const [setupDate, setSetupDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [sig, setSig] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState<{ msg: string; tone: "info" | "error" | "success" } | null>(null);

  React.useEffect(() => {
    fieldApi.locations({ type: "Venue", client: asset.client || undefined }).then(setVenues).catch(() => setVenues([]));
  }, [asset.client]);

  async function submit() {
    if (!online) return setToast({ msg: "Butuh online untuk pindah venue.", tone: "error" });
    if (!locationId) return setToast({ msg: "Pilih venue tujuan dulu.", tone: "error" });
    setBusy(true);
    try {
      await fieldApi.deployVenue(asset.id, { locationId: Number(locationId), pic: pic.trim() || undefined, setupDate: setupDate || undefined, signatureBase64: sig || undefined });
      onDone();
    } catch (e: any) {
      setToast({ msg: e?.message || "Gagal pindah venue.", tone: "error" });
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-28 pt-3">
      <div className="flex items-center gap-3">
        <button onClick={onBack} aria-label="Kembali" className="tap flex w-12 items-center justify-center rounded-xl border border-[#1e2b45] bg-[#0f1728] text-slate-300 active:scale-95"><ArrowLeft className="h-5 w-5" /></button>
        <span className="font-mono text-sm text-slate-400">{asset.id}</span>
        {!online && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300"><WifiOff className="h-3 w-3" /> Offline</span>}
      </div>

      <header>
        <h1 className="text-xl font-bold text-white">Pindah Venue (Roadshow)</h1>
        <p className="mt-1 text-sm text-slate-400">{asset.name}</p>
        {leg && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[12px] font-bold text-amber-200">
            <Compass className="h-3.5 w-3.5" /> Sekarang: {leg.venue} (leg {leg.seq})
          </div>
        )}
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Venue tujuan</label>
          {venues.length === 0 && <p className="text-[11px] text-amber-300">Belum ada venue untuk client {asset.client || "ini"}.</p>}
          <select value={locationId} onChange={e => setLocationId(e.target.value)} className="tap w-full rounded-xl border border-[#1e2b45] bg-[#0b1220] px-3 py-3 text-sm text-white outline-none focus:border-amber-400">
            <option value="">— pilih venue —</option>
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}{v.area ? ` · ${v.area}` : ""}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">PIC di venue ini</label>
          <input value={pic} onChange={e => setPic(e.target.value)} className="w-full rounded-xl border border-[#1e2b45] bg-[#0b1220] px-3 py-3 text-sm text-white outline-none focus:border-amber-400" placeholder="PIC per-leg" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Tanggal setup</label>
          <input type="date" value={setupDate} onChange={e => setSetupDate(e.target.value)} className="w-full rounded-xl border border-[#1e2b45] bg-[#0b1220] px-3 py-3 text-sm text-white outline-none focus:border-amber-400" />
        </div>
        <SignaturePad onChange={setSig} />
      </section>

      <button onClick={submit} disabled={busy || !online} className="tap flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-base font-bold text-white active:scale-[0.98] disabled:opacity-50">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        {online ? "Pindah ke Venue Ini" : "Butuh online"}
      </button>

      {toast && <Toast msg={toast.msg} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  );
}
