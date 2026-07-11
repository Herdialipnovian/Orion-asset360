/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Master Data = flat master table of all assets (Excel-aligned columns), with
 * add / edit / delete / Excel import + template. Assets sync with the 10-stage flow.
 */
import React from "react";
import {
  Database, Plus, Pencil, Trash2, X, AlertTriangle, CheckCircle, Loader2, Upload, Download, FileSpreadsheet, Search
} from "lucide-react";
import { api, type AuthUser } from "../api";
import { Asset } from "../types";

const STAGE_SHORT: { [k: number]: string } = {
  1: "Request", 2: "Produksi", 3: "Gudang", 4: "Kirim", 5: "Transit",
  6: "Terpasang", 7: "Audit", 8: "Maintenance", 9: "Penarikan", 10: "Disposal"
};
const stageBadge = (s: number) =>
  s === 3 ? "bg-green-50 text-green-700 border-green-200"
    : s >= 6 && s <= 7 ? "bg-indigo-50 text-indigo-700 border-indigo-200"
    : s === 8 ? "bg-rose-50 text-rose-700 border-rose-200"
    : s === 10 ? "bg-slate-100 text-slate-600 border-slate-300"
    : "bg-amber-50 text-amber-700 border-amber-200";

const rupiah = (v: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v || 0);
const emptyForm = () => ({ client: "", category: "", name: "", warna: "", merk: "Custom", type: "", serialNumber: "", fisik: "Baru", tglBeli: "", harga: "0", qty: "1" });

interface Props {
  assets: Asset[];
  categoryOptions: string[];
  clientOptions: string[];
  user: AuthUser;
  onChanged: () => void;
}

export default function AssetMaster({ assets, categoryOptions, clientOptions, user, onChanged }: Props) {
  const canEdit = user.role === "Admin" || user.role === "Logistik";
  const canDelete = user.role === "Admin";

  const [search, setSearch] = React.useState("");
  const [notice, setNotice] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const [editing, setEditing] = React.useState<Asset | "new" | null>(null);
  const [form, setForm] = React.useState(emptyForm());
  const [saving, setSaving] = React.useState(false);
  const [formErr, setFormErr] = React.useState<string | null>(null);
  const [confirmDel, setConfirmDel] = React.useState<Asset | null>(null);
  const [pending, setPending] = React.useState<{ rows: any[] } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const rows = React.useMemo(() => {
    const q = search.toLowerCase();
    return assets
      .filter(a =>
        !q ||
        a.id.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.client.toLowerCase().includes(q) ||
        (a.category || "").toLowerCase().includes(q)
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [assets, search]);

  const openNew = () => { setForm(emptyForm()); setFormErr(null); setEditing("new"); };
  const openEdit = (a: Asset) => {
    setForm({
      client: a.client || "", category: a.category || "", name: a.name || "",
      warna: a.warna || "", merk: a.specs?.brand || "", type: a.type || "",
      serialNumber: a.serialNumber || "", fisik: a.fisik || "Baru", tglBeli: a.tglBeli || "",
      harga: String(a.financials?.purchaseCost ?? 0), qty: String(a.quantity ?? 1)
    });
    setFormErr(null);
    setEditing(a);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    if (!form.name.trim() || !form.client.trim()) return setFormErr("Nama Asset & Client wajib diisi.");
    if (Number(form.qty) < 1) return setFormErr("Qty minimal 1.");
    setSaving(true);
    try {
      if (editing === "new") {
        await api.importAssets("append", [{
          client: form.client.trim(), category: form.category.trim(), name: form.name.trim(),
          warna: form.warna.trim(), merk: form.merk.trim(), type: form.type.trim(),
          serialNumber: form.serialNumber.trim(), fisik: form.fisik, tglBeli: form.tglBeli,
          harga: Number(form.harga) || 0, qty: Number(form.qty) || 1
        }]);
        setNotice(`Aset "${form.name.trim()}" ditambahkan (Fase 3 · Gudang).`);
      } else if (editing) {
        await api.updateAsset(editing.id, {
          name: form.name.trim(), category: form.category.trim(), client: form.client.trim(),
          warna: form.warna.trim(), merk: form.merk.trim(), type: form.type.trim(),
          serialNumber: form.serialNumber.trim(), fisik: form.fisik, tglBeli: form.tglBeli,
          harga: Number(form.harga) || 0, quantity: Number(form.qty) || 1
        });
        setNotice(`Aset ${editing.id} diperbarui.`);
      }
      setEditing(null);
      onChanged();
    } catch (e: any) {
      setFormErr(e?.message || "Gagal menyimpan aset.");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async (a: Asset) => {
    setErr(null);
    try {
      await api.deleteAsset(a.id);
      setNotice(`Aset ${a.id} (${a.name}) dihapus.`);
    } catch (e: any) {
      setErr(e?.message || "Gagal menghapus aset.");
    } finally {
      setConfirmDel(null);
      onChanged();
    }
  };

  // ---- Excel ----
  const downloadTemplate = async () => {
    setErr(null);
    try {
      const XLSX = await import("xlsx");
      const header = ["Client", "Kategori", "Nama Asset", "Warna", "Merk", "Type", "Serial Number", "Fisik", "Tgl Beli", "Harga", "Qty"];
      const data = assets.map(a => [a.client, a.category, a.name, a.warna || "", a.specs?.brand || "", a.type || "", a.serialNumber || "", a.fisik || "", a.tglBeli || "", a.financials?.purchaseCost ?? 0, a.quantity]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...data]), "Master Asset Client");
      XLSX.writeFile(wb, "template-master-asset.xlsx");
    } catch (e: any) {
      setErr(e?.message || "Gagal membuat template.");
    }
  };

  const fmtDate = (v: any) => {
    if (!v) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
  };

  const onFile = async (file: File) => {
    setErr(null);
    setNotice(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sn = wb.SheetNames.find(n => /asset|aset|master/i.test(n)) || wb.SheetNames[0];
      const raw: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: "" });
      const pick = (r: any, ...pats: string[]) => {
        for (const k of Object.keys(r)) if (pats.some(p => new RegExp(p, "i").test(k))) return r[k];
        return "";
      };
      const rows = raw
        .map(r => ({
          client: String(pick(r, "client") ?? "").trim(),
          category: String(pick(r, "kategori", "category") ?? "").trim(),
          name: String(pick(r, "nama") ?? "").trim(),
          warna: String(pick(r, "warna", "color") ?? "").trim(),
          merk: String(pick(r, "merk", "brand") ?? "").trim(),
          type: String(pick(r, "^type", "tipe") ?? "").trim(),
          serialNumber: String(pick(r, "serial") ?? "").trim(),
          fisik: String(pick(r, "fisik", "kondisi") ?? "").trim(),
          tglBeli: fmtDate(pick(r, "tgl", "beli")),
          harga: Number(String(pick(r, "harga", "price") ?? "").toString().replace(/[^\d.-]/g, "")) || 0,
          qty: Number(pick(r, "qty", "jumlah", "kuantitas")) || 1
        }))
        .filter(r => r.name && r.client);
      if (!rows.length) {
        setErr("File tidak berisi baris aset valid (butuh minimal kolom Client & Nama Asset). Pakai Download Template sebagai acuan.");
        return;
      }
      setPending({ rows });
    } catch (e: any) {
      setErr("Gagal membaca file Excel: " + (e?.message || ""));
    }
  };

  const doImport = async (mode: "append" | "replace") => {
    if (!pending) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.importAssets(mode, pending.rows);
      setNotice(`Impor "${mode === "replace" ? "Ganti Semua" : "Tambah"}" selesai — ${r.added} aset masuk (Fase 3 · Gudang), ${r.categories} kategori & ${r.clients} client tersinkron ke Master.`);
      setPending(null);
      onChanged();
    } catch (e: any) {
      setErr(e?.message || "Gagal mengimpor aset.");
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 text-slate-800 text-xs";

  return (
    <div className="space-y-5">
      {/* Header + toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2 border-b border-slate-100">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" /> Master Data Aset
          </h2>
          <p className="text-slate-400 text-xs mt-0.5">
            {assets.length} aset terdaftar · sinkron dengan alur 10 fase (aset baru = Fase 3 / Gudang). Kelola lewat Asset Register untuk memajukan fase.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari ID/nama/client…" className="bg-slate-50 border border-slate-200 pl-8 pr-3 py-2 rounded-lg text-xs outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 w-44" />
          </div>
          <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-3 rounded-lg transition">
            <Download className="h-4 w-4" /> Template
          </button>
          {canEdit && (
            <>
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-3 rounded-lg transition">
                <Upload className="h-4 w-4" /> Import
              </button>
              <button onClick={openNew} className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition">
                <Plus className="h-4 w-4" /> Tambah Aset
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ""; }} />
            </>
          )}
        </div>
      </div>

      {notice && (
        <div className="flex items-start justify-between gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <span className="flex items-start gap-2"><CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" /> {notice}</span>
          <button onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-800"><X className="h-4 w-4" /></button>
        </div>
      )}
      {err && (
        <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {err}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider">
                {["Asset ID", "Client", "Kategori", "Nama Asset", "Warna", "Merk", "Type", "Serial No.", "Fisik", "Tgl Beli", "Harga", "Qty", "Fase"].map(h => (
                  <th key={h} className="text-left font-extrabold px-3 py-3">{h}</th>
                ))}
                <th className="text-right font-extrabold px-3 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr><td colSpan={14} className="px-4 py-10 text-center text-slate-400">Belum ada aset. Klik "Tambah Aset" atau "Import".</td></tr>
              ) : (
                rows.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-3 py-2.5 font-mono font-bold text-blue-600">{a.id}</td>
                    <td className="px-3 py-2.5 text-slate-700">{a.client}</td>
                    <td className="px-3 py-2.5 text-slate-600">{a.category}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-800">{a.name}</td>
                    <td className="px-3 py-2.5 text-slate-600">{a.warna || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600">{a.specs?.brand || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600">{a.type || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-500 font-mono">{a.serialNumber || "—"}</td>
                    <td className="px-3 py-2.5"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${a.fisik === "Second" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{a.fisik || "—"}</span></td>
                    <td className="px-3 py-2.5 text-slate-500">{a.tglBeli || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-700 font-semibold">{rupiah(a.financials?.purchaseCost || 0)}</td>
                    <td className="px-3 py-2.5 text-slate-800 font-bold">{a.quantity}</td>
                    <td className="px-3 py-2.5"><span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${stageBadge(a.currentStage)}`}>{a.currentStage}·{STAGE_SHORT[a.currentStage]}</span></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <button onClick={() => openEdit(a)} title="Edit" className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition"><Pencil className="h-3.5 w-3.5" /></button>
                        )}
                        {canDelete && (
                          <button onClick={() => setConfirmDel(a)} title="Hapus" className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"><Trash2 className="h-3.5 w-3.5" /></button>
                        )}
                        {!canEdit && !canDelete && <span className="text-[10px] text-slate-400">—</span>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest block">{editing === "new" ? "Registrasi Aset Baru" : `Edit ${editing.id}`}</span>
                <h3 className="text-base font-bold text-slate-950">{editing === "new" ? "Tambah Aset (masuk Fase 3 / Gudang)" : editing.name}</h3>
              </div>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={save} className="p-5 grid grid-cols-2 gap-4 text-xs">
              <div className="col-span-2 space-y-1.5">
                <label className="font-bold text-slate-700">Nama Asset <span className="text-rose-500">*</span></label>
                <input name="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={input} placeholder="cth. Saddlebag 80x80" />
              </div>
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Client <span className="text-rose-500">*</span></label>
                <input name="client" list="am-clients" value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} className={input} placeholder="pilih / ketik baru" />
                <datalist id="am-clients">{clientOptions.map(o => <option key={o} value={o} />)}</datalist>
              </div>
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Kategori</label>
                <input list="am-cats" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={input} placeholder="pilih / ketik baru" />
                <datalist id="am-cats">{categoryOptions.map(o => <option key={o} value={o} />)}</datalist>
              </div>
              <div className="space-y-1.5"><label className="font-bold text-slate-700">Warna</label><input value={form.warna} onChange={e => setForm({ ...form, warna: e.target.value })} className={input} /></div>
              <div className="space-y-1.5"><label className="font-bold text-slate-700">Merk</label><input value={form.merk} onChange={e => setForm({ ...form, merk: e.target.value })} className={input} /></div>
              <div className="space-y-1.5"><label className="font-bold text-slate-700">Type</label><input value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={input} placeholder="cth. PVC" /></div>
              <div className="space-y-1.5"><label className="font-bold text-slate-700">Serial Number</label><input value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })} className={input} /></div>
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Fisik</label>
                <select value={form.fisik} onChange={e => setForm({ ...form, fisik: e.target.value })} className={`${input} cursor-pointer`}>
                  <option>Baru</option><option>Second</option>
                </select>
              </div>
              <div className="space-y-1.5"><label className="font-bold text-slate-700">Tgl Beli</label><input type="date" value={form.tglBeli} onChange={e => setForm({ ...form, tglBeli: e.target.value })} className={input} /></div>
              <div className="space-y-1.5"><label className="font-bold text-slate-700">Harga (IDR)</label><input type="number" min="0" value={form.harga} onChange={e => setForm({ ...form, harga: e.target.value })} className={input} /></div>
              <div className="space-y-1.5"><label className="font-bold text-slate-700">Qty <span className="text-rose-500">*</span></label><input name="qty" type="number" min="1" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} className={input} /></div>

              {formErr && <div className="col-span-2 flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 font-semibold"><AlertTriangle className="h-4 w-4 flex-shrink-0" /> {formErr}</div>}

              <div className="col-span-2 pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setEditing(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg transition">Batal</button>
                <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-5 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}{editing === "new" ? "Simpan Aset" : "Simpan Perubahan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-100 p-6 space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center"><Trash2 className="h-5 w-5 text-rose-500" /></div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Hapus Aset?</h3>
              <p className="text-slate-500 text-xs mt-1 leading-relaxed"><strong className="font-mono">{confirmDel.id}</strong> — {confirmDel.name} akan dihapus permanen dari master. Log historis tetap disimpan.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs transition">Batal</button>
              <button onClick={() => doDelete(confirmDel)} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition">Ya, Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* Import mode modal */}
      {pending && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-600 p-2 rounded-lg"><FileSpreadsheet className="h-5 w-5" /></div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">Data Terbaca dari File</h3>
                <p className="text-[11px] text-slate-500">{pending.rows.length} baris aset. Client/Kategori baru otomatis masuk Master. Pilih cara impor:</p>
              </div>
            </div>
            <div className="space-y-2.5">
              <button onClick={() => doImport("append")} disabled={busy} className="w-full text-left bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-4 py-3 transition disabled:opacity-50">
                <p className="text-xs font-extrabold text-blue-800">Tambah Data Baru</p>
                <p className="text-[10.5px] text-blue-600/80 mt-0.5">Aset lama tetap. Baris file ditambah sebagai aset baru (Fase 3 / Gudang).</p>
              </button>
              <button onClick={() => doImport("replace")} disabled={busy} className="w-full text-left bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg px-4 py-3 transition disabled:opacity-50">
                <p className="text-xs font-extrabold text-rose-800">Ganti Semua (Hapus Aset Lama)</p>
                <p className="text-[10.5px] text-rose-600/80 mt-0.5">HATI-HATI: semua aset (termasuk yang sedang berjalan di flow) dihapus, diganti isi file.</p>
              </button>
            </div>
            <div className="flex justify-end pt-1">
              <button onClick={() => setPending(null)} disabled={busy} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs transition disabled:opacity-50">Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
