/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Aset Internal — custodian-centric management for Origin operational assets (peruntukan=Internal).
 * "Siapa pegang apa": serah-terima ke karyawan, stock-opname berkala, tarik kembali ke gudang.
 * No shipping/transit/venue/toko — that's the Deployment lifecycle (separate menu).
 */
import React from "react";
import { Boxes, UserCheck, Home, ClipboardCheck, Undo2, X, Loader2, AlertTriangle, Lock, Search, Eraser, Building } from "lucide-react";
import { api, type AuthUser, type Employee } from "../api";
import type { Asset } from "../types";

const isHeld = (a: Asset) => a.currentStage === 6 && !!(a.stageDetails as any)?.deployment?.custodianName;
const custodianOf = (a: Asset) => (a.stageDetails as any)?.deployment || {};

function SignaturePad({ onChange }: { onChange: (v: string) => void }) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const drawing = React.useRef(false);
  const dirty = React.useRef(false);
  React.useEffect(() => { const c = ref.current; if (c) { c.width = c.offsetWidth || 440; c.height = 140; } }, []);
  const at = (e: React.PointerEvent) => { const c = ref.current!; const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: React.PointerEvent) => { drawing.current = true; const ctx = ref.current!.getContext("2d")!; ctx.strokeStyle = "#0f1728"; ctx.lineWidth = 2; ctx.lineCap = "round"; const p = at(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const ctx = ref.current!.getContext("2d")!; const p = at(e); ctx.lineTo(p.x, p.y); ctx.stroke(); dirty.current = true; };
  const up = () => { if (!drawing.current) return; drawing.current = false; if (dirty.current) onChange(ref.current!.toDataURL("image/png")); };
  const clear = () => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(""); };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between"><span className="font-bold text-slate-700">TTD BAST (opsional)</span><button type="button" onClick={clear} className="inline-flex items-center gap-1 text-[11px] text-slate-500 border border-slate-200 rounded px-2 py-0.5"><Eraser className="h-3 w-3" /> Hapus</button></div>
      <canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} className="w-full touch-none rounded-lg border border-slate-200 bg-white" style={{ height: 130 }} />
    </div>
  );
}

export default function AsetInternal({ assets, user, onChanged }: { assets: Asset[]; user: AuthUser; onChanged: () => void }) {
  const manage = user.role === "Admin" || user.role === "Logistik";
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [q, setQ] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => { if (manage) api.getEmployees().then(es => setEmployees(es.filter(e => e.active))).catch(() => {}); }, [manage]);

  // serah-terima / ganti custodian modal
  const [hoAsset, setHoAsset] = React.useState<Asset | null>(null);
  const [hoForm, setHoForm] = React.useState({ custodianId: "", date: "", note: "", signature: "" });
  const [hoErr, setHoErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  // opname modal
  const [opAsset, setOpAsset] = React.useState<Asset | null>(null);
  const [opForm, setOpForm] = React.useState({ condition: "Baik", note: "" });
  const [opErr, setOpErr] = React.useState<string | null>(null);
  const [confirmReturn, setConfirmReturn] = React.useState<Asset | null>(null);

  const internal = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    return assets
      .filter(a => a.peruntukan === "Internal")
      .filter(a => !s || (a.name || "").toLowerCase().includes(s) || (a.id || "").toLowerCase().includes(s) || (custodianOf(a).custodianName || "").toLowerCase().includes(s))
      .sort((a, b) => (custodianOf(b).custodianName || "~").localeCompare(custodianOf(a).custodianName || "~"));
  }, [assets, q]);
  const heldCount = internal.filter(isHeld).length;

  const openHandover = (a: Asset) => { setHoAsset(a); setHoForm({ custodianId: String(custodianOf(a).custodianId || ""), date: new Date().toISOString().slice(0, 10), note: "", signature: "" }); setHoErr(null); };
  const submitHandover = async () => {
    if (!hoAsset) return;
    if (!hoForm.custodianId) return setHoErr("Pilih karyawan dulu.");
    setBusy(true); setHoErr(null);
    try {
      await api.handoverInternal(hoAsset.id, { custodianId: Number(hoForm.custodianId), handoverDate: hoForm.date || undefined, note: hoForm.note || undefined, signatureBase64: hoForm.signature || undefined });
      setHoAsset(null); onChanged();
    } catch (e: any) { setHoErr(e?.message || "Gagal serah-terima."); } finally { setBusy(false); }
  };
  const openOpname = (a: Asset) => { setOpAsset(a); setOpForm({ condition: "Baik", note: "" }); setOpErr(null); };
  const submitOpname = async () => {
    if (!opAsset) return;
    setBusy(true); setOpErr(null);
    try { await api.opnameInternal(opAsset.id, { condition: opForm.condition, note: opForm.note || undefined }); setOpAsset(null); onChanged(); }
    catch (e: any) { setOpErr(e?.message || "Gagal opname."); } finally { setBusy(false); }
  };
  const doReturn = async (a: Asset) => { setBusy(true); try { await api.returnInternal(a.id); setConfirmReturn(null); onChanged(); } catch (e: any) { setErr(e?.message || "Gagal tarik."); } finally { setBusy(false); } };

  if (!manage) {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-12 text-center shadow-xs max-w-md mx-auto mt-10">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-3"><Lock className="h-6 w-6 text-amber-500" /></div>
        <h3 className="font-extrabold text-slate-800 text-sm">Akses Terbatas</h3>
        <p className="text-slate-500 text-xs mt-1">Aset Internal dikelola oleh <strong>Admin</strong> / <strong>Logistik</strong>. Role Anda: {user.role}.</p>
      </div>
    );
  }

  const inp = "w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs outline-none focus:bg-white focus:ring-1 focus:ring-blue-500";
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2"><Boxes className="h-5 w-5 text-slate-700" /> Aset Internal</h2>
          <p className="text-slate-400 text-xs mt-0.5">Aset operasional Origin — dipegang karyawan (custodian). {internal.length} aset · {heldCount} dipegang.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari aset / custodian…" className="bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 w-56" />
        </div>
      </div>
      {err && <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"><AlertTriangle className="h-4 w-4" /> {err}</div>}

      <div className="bg-white border border-slate-100 rounded-xl shadow-xs overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-slate-400 border-b border-slate-100 bg-slate-50/60">
            <th className="text-left font-extrabold px-4 py-2.5">Aset</th>
            <th className="text-left font-extrabold px-4 py-2.5">Custodian</th>
            <th className="text-left font-extrabold px-4 py-2.5">Divisi</th>
            <th className="text-left font-extrabold px-4 py-2.5">Status</th>
            <th className="text-left font-extrabold px-4 py-2.5">Serah-Terima</th>
            <th className="text-left font-extrabold px-4 py-2.5">Opname Terakhir</th>
            <th className="text-right font-extrabold px-4 py-2.5">Aksi</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {internal.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Belum ada aset internal. Tandai aset "Internal" di Master Data (atau kategori Laptop/IT/CCTV otomatis Internal).</td></tr>
            ) : internal.map(a => {
              const d = custodianOf(a);
              const held = isHeld(a);
              return (
                <tr key={a.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2.5"><div className="font-bold text-slate-800">{a.name}</div><div className="font-mono text-[10px] text-slate-400">{a.id}</div></td>
                  <td className="px-4 py-2.5">{held ? <span className="inline-flex items-center gap-1 font-semibold text-slate-700"><UserCheck className="h-3.5 w-3.5 text-slate-500" /> {d.custodianName}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-slate-600">{held ? (d.custodianDept || "—") : "—"}</td>
                  <td className="px-4 py-2.5">{held
                    ? <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Dipegang</span>
                    : <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500"><Home className="h-3 w-3" /> Di Gudang</span>}</td>
                  <td className="px-4 py-2.5 text-slate-500">{held ? (d.handoverDate || "—") : "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500">{d.lastOpnameAt || <span className="text-slate-300">belum</span>}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {!held ? (
                        <button onClick={() => openHandover(a)} className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-2.5 py-1.5"><UserCheck className="h-3.5 w-3.5" /> Serah-Terima</button>
                      ) : (
                        <>
                          <button onClick={() => openOpname(a)} className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 bg-white hover:bg-teal-50 border border-teal-300 rounded-lg px-2 py-1.5"><ClipboardCheck className="h-3.5 w-3.5" /> Opname</button>
                          <button onClick={() => openHandover(a)} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5"><UserCheck className="h-3.5 w-3.5" /> Ganti</button>
                          <button onClick={() => setConfirmReturn(a)} className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-white hover:bg-amber-50 border border-amber-300 rounded-lg px-2 py-1.5"><Undo2 className="h-3.5 w-3.5" /> Tarik</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Serah-terima / ganti custodian */}
      {hoAsset && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold text-slate-700 uppercase tracking-widest block flex items-center gap-1"><Building className="h-3 w-3" /> Serah-Terima Internal</span>
                <h3 className="text-base font-bold text-slate-950">{hoAsset.name}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{hoAsset.id}{isHeld(hoAsset) ? ` · dari ${custodianOf(hoAsset).custodianName}` : ""}</p>
              </div>
              <button onClick={() => setHoAsset(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Karyawan (Custodian) <span className="text-rose-500">*</span></label>
                <select value={hoForm.custodianId} onChange={e => setHoForm({ ...hoForm, custodianId: e.target.value })} className={`${inp} cursor-pointer`}>
                  <option value="">— pilih karyawan —</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.department ? ` · ${e.department}` : ""}</option>)}
                </select>
                {employees.length === 0 && <p className="text-[10px] text-amber-600">Belum ada karyawan. Tambahkan di menu Organisasi → Karyawan.</p>}
              </div>
              <div className="space-y-1.5"><label className="font-bold text-slate-700">Tanggal</label><input type="date" value={hoForm.date} onChange={e => setHoForm({ ...hoForm, date: e.target.value })} className={inp} /></div>
              <div className="space-y-1.5"><label className="font-bold text-slate-700">Catatan (opsional)</label><textarea value={hoForm.note} onChange={e => setHoForm({ ...hoForm, note: e.target.value })} rows={2} className={`${inp} resize-none`} placeholder="cth. Laptop + charger + tas" /></div>
              <SignaturePad onChange={v => setHoForm({ ...hoForm, signature: v })} />
              {hoErr && <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5"><AlertTriangle className="h-3.5 w-3.5" /> {hoErr}</div>}
              <div className="pt-2 border-t border-slate-100 flex justify-end gap-3">
                <button onClick={() => setHoAsset(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg">Batal</button>
                <button onClick={submitHandover} disabled={busy} className="bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white font-bold px-5 py-2 rounded-lg flex items-center gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Serahkan</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stock-opname */}
      {opAsset && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold text-teal-700 uppercase tracking-widest block flex items-center gap-1"><ClipboardCheck className="h-3 w-3" /> Stock-Opname</span>
                <h3 className="text-base font-bold text-slate-950">{opAsset.name}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Custodian: {custodianOf(opAsset).custodianName}</p>
              </div>
              <button onClick={() => setOpAsset(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Kondisi</label>
                <select value={opForm.condition} onChange={e => setOpForm({ ...opForm, condition: e.target.value })} className={`${inp} cursor-pointer`}>
                  <option>Baik</option><option>Rusak Ringan</option><option>Rusak Berat</option><option>Hilang</option>
                </select>
              </div>
              <div className="space-y-1.5"><label className="font-bold text-slate-700">Catatan</label><textarea value={opForm.note} onChange={e => setOpForm({ ...opForm, note: e.target.value })} rows={2} className={`${inp} resize-none`} placeholder="cth. kondisi fisik ok, lengkap" /></div>
              {opErr && <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5"><AlertTriangle className="h-3.5 w-3.5" /> {opErr}</div>}
              <div className="pt-2 border-t border-slate-100 flex justify-end gap-3">
                <button onClick={() => setOpAsset(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg">Batal</button>
                <button onClick={submitOpname} disabled={busy} className="bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-bold px-5 py-2 rounded-lg flex items-center gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Simpan Opname</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmReturn && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-100 p-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 border border-amber-200 grid place-items-center"><Undo2 className="h-5 w-5 text-amber-500" /></div>
            <p className="text-slate-500 text-xs">Tarik <strong className="text-slate-800">{confirmReturn.name}</strong> dari <strong>{custodianOf(confirmReturn).custodianName}</strong> kembali ke Gudang?</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmReturn(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs">Batal</button>
              <button onClick={() => doReturn(confirmReturn)} disabled={busy} className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white font-bold px-4 py-2 rounded-lg text-xs">Ya, Tarik</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
