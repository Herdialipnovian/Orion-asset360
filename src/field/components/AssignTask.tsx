/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PIC assigns / re-assigns install portions from the field (online-only). Rows of
 * Merchandiser + qty; rows that already have progress are locked. Total must be
 * <= asset qty (under-assignment allowed = assign in batches).
 */
import React from "react";
import { ArrowLeft, Loader2, Send, Trash2, Plus, WifiOff } from "lucide-react";
import type { Asset } from "../../types";
import { fieldApi, type AuthUser } from "../fieldApi";
import { Toast } from "../ui";

type Row = { merchandiserId: number | ""; merchandiser: string; qty: number; doneQty: number };

export default function AssignTask({
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
  const qty = asset.quantity || 0;
  const existing = ((asset.stageDetails as any)?.deployment?.assignments || []) as any[];
  const [dir, setDir] = React.useState<{ id: number; name: string }[]>([]);
  const [rows, setRows] = React.useState<Row[]>(
    existing.length
      ? existing.map(a => ({ merchandiserId: a.merchandiserId, merchandiser: a.merchandiser, qty: Number(a.qty), doneQty: Number(a.doneQty ?? (a.status === "done" ? a.qty : 0)) || 0 }))
      : [{ merchandiserId: "", merchandiser: "", qty: qty || 1, doneQty: 0 }]
  );
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState<{ msg: string; tone: "info" | "error" | "success" } | null>(null);

  React.useEffect(() => {
    fieldApi.usersDirectory("Merchandiser", asset.client || undefined).then(d => setDir(d.map(x => ({ id: x.id, name: x.name })))).catch(() => setDir([]));
  }, [asset.client]);

  const total = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const sisa = qty - total;
  const chosen = new Set(rows.map(r => String(r.merchandiserId)).filter(Boolean));

  async function submit() {
    if (!online) return setToast({ msg: "Perlu koneksi internet untuk menugaskan.", tone: "error" });
    for (const r of rows) {
      if (!r.merchandiserId) return setToast({ msg: "Silakan pilih Merchandiser pada setiap baris.", tone: "error" });
      if (!(Number(r.qty) > 0)) return setToast({ msg: "Jumlah unit harus lebih dari 0.", tone: "error" });
      if (Number(r.qty) < r.doneQty) return setToast({ msg: `Jumlah tidak boleh kurang dari yang sudah dikerjakan (${r.doneQty}).`, tone: "error" });
    }
    if (total > qty) return setToast({ msg: `Total ${total} melebihi jumlah unit aset (${qty}).`, tone: "error" });
    setBusy(true);
    try {
      await fieldApi.assignInstall(asset.id, { assignments: rows.map(r => ({ merchandiserId: Number(r.merchandiserId), qty: Number(r.qty) })), baseUpdatedAt: asset.updatedAt });
      onDone();
    } catch (e: any) {
      setToast({ msg: e?.status === 409 ? "Data aset telah berubah di server. Silakan muat ulang lalu coba lagi." : e?.message || "Gagal menyimpan penugasan.", tone: "error" });
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
        {!online && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300"><WifiOff className="h-3 w-3" /> Offline</span>}
      </div>

      <header>
        <h1 className="text-xl font-bold text-white">Tugaskan Pemasangan</h1>
        <p className="mt-1 text-sm text-slate-400">{asset.name} · {qty} unit</p>
      </header>

      <section className="flex flex-col gap-2">
        {dir.length === 0 && <p className="text-[11px] text-amber-300">Belum ada Merchandiser untuk client {asset.client || "ini"}.</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2 rounded-2xl border border-[#1e2b45] bg-[#0f1728] p-2.5">
            <div className="min-w-0 flex-1">
              <select
                value={r.merchandiserId || ""}
                disabled={r.doneQty > 0}
                onChange={e => {
                  const mid = e.target.value;
                  const m = dir.find(x => String(x.id) === mid);
                  setRows(rows.map((x, idx) => (idx === i ? { ...x, merchandiserId: mid ? Number(mid) : "", merchandiser: m ? m.name : "" } : x)));
                }}
                className="tap w-full rounded-xl border border-[#1e2b45] bg-[#0b1220] px-3 py-2.5 text-sm text-white outline-none focus:border-[#4d8bff] disabled:opacity-60"
              >
                <option value="">— pilih Merchandiser —</option>
                {dir.map(m => (
                  <option key={m.id} value={m.id} disabled={chosen.has(String(m.id)) && String(r.merchandiserId) !== String(m.id)}>{m.name}</option>
                ))}
              </select>
              {r.doneQty > 0 && <span className="mt-0.5 block text-[10px] font-semibold text-emerald-400">sudah dipasang {r.doneQty}/{r.qty}</span>}
            </div>
            <input
              type="number"
              min={Math.max(1, r.doneQty)}
              value={r.qty}
              onChange={e => setRows(rows.map((x, idx) => (idx === i ? { ...x, qty: parseInt(e.target.value || "0", 10) } : x)))}
              className="h-11 w-16 rounded-xl border border-[#1e2b45] bg-[#0b1220] text-center text-lg font-bold text-white outline-none focus:border-[#4d8bff]"
            />
            <button
              onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
              disabled={rows.length <= 1 || r.doneQty > 0}
              className="tap grid h-11 w-11 place-items-center rounded-xl text-rose-400 active:scale-95 disabled:opacity-30"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <button onClick={() => setRows([...rows, { merchandiserId: "", merchandiser: "", qty: Math.max(1, sisa), doneQty: 0 }])} className="tap inline-flex items-center gap-1 text-sm font-bold text-[#8fb4ff]">
            <Plus className="h-4 w-4" /> Tambah Merchandiser
          </button>
          <span className={`text-[12px] font-semibold ${total > qty ? "text-rose-400" : sisa === 0 ? "text-emerald-400" : "text-amber-300"}`}>
            {total}/{qty}{total > qty ? " (berlebih)" : sisa > 0 ? ` · sisa ${sisa}` : ""}
          </span>
        </div>
      </section>

      <button onClick={submit} disabled={busy || !online} className="tap flex items-center justify-center gap-2 rounded-xl bg-[#4d8bff] px-4 text-base font-bold text-white active:scale-[0.98] disabled:opacity-50">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        {online ? "Simpan Penugasan" : "Perlu Koneksi"}
      </button>

      {toast && <Toast msg={toast.msg} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  );
}
