/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
import { SlidersHorizontal, Building2, Gauge, Save, Loader2, CheckCircle, AlertTriangle, Lock, Database, Trash2, RefreshCw } from "lucide-react";
import { api, type AuthUser } from "../api";

type Field = { key: string; label: string; type: "text" | "email" | "number"; suffix?: string; hint?: string; min?: number; max?: number };
type Section = { title: string; icon: any; desc: string; fields: Field[] };

const SECTIONS: Section[] = [
  {
    title: "Profil Perusahaan",
    icon: Building2,
    desc: "Ditampilkan pada kop setiap dokumen, seperti Work Order, Surat Jalan, dan BAST.",
    fields: [
      { key: "company_name", label: "Nama Perusahaan", type: "text" },
      { key: "company_address", label: "Alamat", type: "text" },
      { key: "company_email", label: "Email Support", type: "email" }
    ]
  },
  {
    title: "Parameter Operasional",
    icon: Gauge,
    desc: "Nilai bawaan yang digunakan untuk perhitungan dan indikator di seluruh sistem.",
    fields: [
      { key: "depreciation_pct", label: "Depresiasi / Nilai Sisa Scrap", type: "number", suffix: "%", min: 0, max: 100, hint: "Estimasi nilai sisa aset baru dihitung dari persentase ini dikalikan harga beli." },
      { key: "useful_life_months", label: "Umur Ekonomis Aset", type: "number", suffix: "bulan", min: 1, max: 600, hint: "Digunakan untuk perhitungan depresiasi garis lurus pada Utilisasi Aset. Nilai bawaan 60 bulan setara dengan 5 tahun." },
      { key: "sla_target_pct", label: "Target SLA / Kepatuhan", type: "number", suffix: "%", min: 0, max: 100, hint: "Batas minimum agar indikator operasional di Dashboard ditampilkan dalam kondisi sehat (hijau)." },
      { key: "default_timeline_weeks", label: "Estimasi Waktu Pengadaan", type: "number", suffix: "minggu", min: 1, max: 104, hint: "Estimasi durasi bawaan saat membuat pengajuan aset baru." }
    ]
  }
];

export default function SystemSettings({ user, onSaved }: { user: AuthUser; onSaved?: () => void }) {
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [dbStat, setDbStat] = React.useState<{ seedMode: "demo" | "production"; assets: number; activity: number } | null>(null);
  const [dbBusy, setDbBusy] = React.useState(false);
  const [wipeOpen, setWipeOpen] = React.useState(false);
  const [wipeText, setWipeText] = React.useState("");

  React.useEffect(() => {
    if (user.role !== "Admin") {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [s, st] = await Promise.all([api.getSettings(), api.dbStatus()]);
        setForm(s);
        setDbStat(st);
      } catch (e: any) {
        setErr(e?.message || "Gagal memuat pengaturan. Silakan coba lagi.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user.role]);

  if (user.role !== "Admin") {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-12 text-center shadow-xs max-w-md mx-auto mt-10">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-3">
          <Lock className="h-6 w-6 text-amber-500" />
        </div>
        <h3 className="font-extrabold text-slate-800 text-sm">Akses Terbatas</h3>
        <p className="text-slate-500 text-xs mt-1 leading-relaxed">
          Pengaturan Sistem hanya dapat diubah oleh <strong>Admin</strong>. Role Anda saat ini: {user.role}.
        </p>
      </div>
    );
  }

  // Keep the data-mode/counts fresh if data changes elsewhere while this page stays open.
  React.useEffect(() => {
    if (user.role !== "Admin") return;
    const refresh = () => { api.dbStatus().then(setDbStat).catch(() => {}); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [user.role]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const toggleMode = async () => {
    if (!dbStat || dbBusy) return;
    setDbBusy(true); setErr(null); setNotice(null);
    try {
      const next = dbStat.seedMode === "production" ? "demo" : "production";
      setDbStat(await api.setDbMode(next));
      setNotice(next === "production"
        ? "Mode diubah ke Produksi. Data contoh tidak akan dimuat ulang saat sistem dinyalakan ulang."
        : "Mode diubah ke Demo. Data contoh dapat dimuat kembali saat reset atau saat sistem dinyalakan ulang.");
    } catch (e: any) {
      setErr(e?.message || "Gagal mengubah mode data.");
    } finally {
      setDbBusy(false);
    }
  };

  const doWipe = async () => {
    if (dbBusy) return;
    setDbBusy(true); setErr(null); setNotice(null);
    try {
      const st = await api.wipeData(wipeText.trim());
      setDbStat({ seedMode: st.seedMode, assets: st.assets, activity: st.activity });
      setWipeOpen(false); setWipeText("");
      setNotice("Seluruh data operasional telah dikosongkan. Sistem siap untuk pengisian data produksi.");
      onSaved?.();
    } catch (e: any) {
      setErr(e?.message || "Gagal mengosongkan data.");
    } finally {
      setDbBusy(false);
    }
  };

  const save = async () => {
    setErr(null);
    setNotice(null);
    // Light validation for numeric fields
    for (const s of SECTIONS) {
      for (const f of s.fields) {
        if (f.type === "number") {
          const n = Number(form[f.key]);
          if (form[f.key] === "" || isNaN(n)) return setErr(`"${f.label}" harus berupa angka.`);
          if (f.min != null && n < f.min) return setErr(`"${f.label}" minimal ${f.min}.`);
          if (f.max != null && n > f.max) return setErr(`"${f.label}" maksimal ${f.max}.`);
        } else if (!String(form[f.key] || "").trim()) {
          return setErr(`"${f.label}" wajib diisi.`);
        }
      }
    }
    setSaving(true);
    try {
      const updated = await api.updateSettings(form);
      setForm(updated);
      setNotice("Pengaturan berhasil disimpan dan diterapkan ke seluruh sistem.");
      onSaved?.();
    } catch (e: any) {
      setErr(e?.message || "Gagal menyimpan pengaturan. Silakan coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-blue-600" /> Pengaturan Sistem
          </h2>
          <p className="text-slate-400 text-xs mt-0.5">Konfigurasi global. Setiap perubahan langsung diterapkan ke dokumen, formulir, dan Dashboard.</p>
        </div>
        <button
          onClick={save}
          disabled={saving || loading}
          className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition self-start sm:self-auto"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span>Simpan Perubahan</span>
        </button>
      </div>

      {notice && (
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <CheckCircle className="h-4 w-4" /> {notice}
        </div>
      )}
      {err && (
        <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4" /> {err}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {SECTIONS.map(section => {
            const Icon = section.icon;
            return (
              <div key={section.title} className="bg-white border border-slate-100 rounded-xl shadow-xs">
                <div className="px-5 py-3.5 border-b border-slate-100">
                  <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <Icon className="h-4 w-4 text-blue-600" /> {section.title}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">{section.desc}</p>
                </div>
                <div className="p-5 space-y-4">
                  {section.fields.map(f => (
                    <div key={f.key} className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">{f.label}</label>
                      <div className="relative">
                        <input
                          name={f.key}
                          type={f.type === "number" ? "number" : f.type === "email" ? "email" : "text"}
                          min={f.min}
                          max={f.max}
                          value={form[f.key] ?? ""}
                          onChange={e => set(f.key, e.target.value)}
                          className={`w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 text-slate-800 text-xs ${f.suffix ? "pr-20" : ""}`}
                        />
                        {f.suffix && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase tracking-wide">{f.suffix}</span>
                        )}
                      </div>
                      {f.hint && <p className="text-[10px] text-slate-400 leading-snug">{f.hint}</p>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && dbStat && (() => {
        const prod = dbStat.seedMode === "production";
        return (
          <div className="bg-white border border-slate-100 rounded-xl shadow-xs">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Database className="h-4 w-4 text-blue-600" /> Manajemen Data
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">Kelola mode data sistem dan pengosongan data untuk memulai penggunaan dengan data yang sebenarnya.</p>
            </div>
            <div className="p-5 space-y-5">
              {/* Current mode */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-bold text-slate-700">Mode data saat ini:</span>
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${prod ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                  {prod ? "Produksi (data sebenarnya)" : "Demo (data contoh)"}
                </span>
                <span className="text-[11px] text-slate-400 ml-auto">{dbStat.assets} aset · {dbStat.activity} aktivitas</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed -mt-2">
                {prod
                  ? "Sistem berjalan dengan data sebenarnya. Data contoh tidak akan dimuat ulang saat sistem dinyalakan ulang."
                  : "Sistem masih memuat data contoh. Alihkan ke mode Produksi sebelum mengisi data yang sebenarnya agar data Anda tidak tertimpa saat sistem dinyalakan ulang."}
              </p>

              {/* Mode toggle */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800">{prod ? "Kembalikan ke Mode Demo" : "Alihkan ke Mode Produksi"}</p>
                  <p className="text-[11px] text-slate-400 leading-snug">{prod ? "Izinkan data contoh dimuat kembali saat reset / dinyalakan ulang." : "Hentikan pemuatan data contoh — aman untuk data sebenarnya."}</p>
                </div>
                <button onClick={toggleMode} disabled={dbBusy} className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-white hover:bg-blue-50 border border-blue-300 rounded-lg px-3 py-2 transition disabled:opacity-50">
                  <RefreshCw className={`h-3.5 w-3.5 ${dbBusy ? "animate-spin" : ""}`} /> {prod ? "Ke Mode Demo" : "Ke Mode Produksi"}
                </button>
              </div>

              {/* Danger zone: wipe */}
              <div className="rounded-lg border border-rose-200 bg-rose-50/50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-rose-700 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Kosongkan Semua Data (Mulai Bersih)</p>
                    <p className="text-[11px] text-rose-600/80 leading-snug mt-0.5">Menghapus seluruh aset, aktivitas, evidence &amp; notifikasi, lalu mengalihkan ke mode Produksi. Master (client, kategori, area, karyawan, proyek, lokasi) dan akun pengguna tetap dipertahankan. Tindakan ini tidak dapat dibatalkan.</p>
                  </div>
                  <button onClick={() => { setWipeText(""); setWipeOpen(true); }} disabled={dbBusy} className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg px-3 py-2 transition disabled:opacity-50">
                    <Trash2 className="h-3.5 w-3.5" /> Kosongkan
                  </button>
                </div>
              </div>
            </div>

            {wipeOpen && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-100 p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-200 grid place-items-center"><Trash2 className="h-5 w-5 text-rose-500" /></div>
                    <h3 className="text-base font-bold text-slate-950">Kosongkan Semua Data?</h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">Seluruh aset ({dbStat.assets}), aktivitas, evidence, dan notifikasi akan dihapus permanen, lalu sistem beralih ke mode Produksi. Ketik <strong className="text-rose-600 font-mono">KOSONGKAN</strong> untuk melanjutkan.</p>
                  <input autoFocus value={wipeText} onChange={e => setWipeText(e.target.value)} placeholder="Ketik KOSONGKAN" className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs outline-none focus:bg-white focus:ring-1 focus:ring-rose-500" />
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => { setWipeOpen(false); setWipeText(""); }} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs">Batal</button>
                    <button onClick={doWipe} disabled={dbBusy || wipeText.trim() !== "KOSONGKAN"} className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5">{dbBusy && <Loader2 className="h-4 w-4 animate-spin" />}Ya, Kosongkan</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
