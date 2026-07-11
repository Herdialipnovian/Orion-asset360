/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
import { SlidersHorizontal, Building2, Gauge, Save, Loader2, CheckCircle, AlertTriangle, Lock } from "lucide-react";
import { api, type AuthUser } from "../api";

type Field = { key: string; label: string; type: "text" | "email" | "number"; suffix?: string; hint?: string; min?: number; max?: number };
type Section = { title: string; icon: any; desc: string; fields: Field[] };

const SECTIONS: Section[] = [
  {
    title: "Profil Perusahaan",
    icon: Building2,
    desc: "Tampil di kop semua dokumen (Work Order, Surat Jalan, BAST, dll.)",
    fields: [
      { key: "company_name", label: "Nama Perusahaan", type: "text" },
      { key: "company_address", label: "Alamat", type: "text" },
      { key: "company_email", label: "Email Support", type: "email" }
    ]
  },
  {
    title: "Parameter Operasional",
    icon: Gauge,
    desc: "Nilai default yang dipakai perhitungan & indikator di seluruh sistem.",
    fields: [
      { key: "depreciation_pct", label: "Depresiasi / Nilai Sisa Scrap", type: "number", suffix: "%", min: 0, max: 100, hint: "Estimasi nilai sisa aset baru = % ini × harga beli." },
      { key: "sla_target_pct", label: "Target SLA / Kepatuhan", type: "number", suffix: "%", min: 0, max: 100, hint: "Ambang 'sehat' (hijau) indikator operasional di Dashboard." },
      { key: "default_timeline_weeks", label: "Default Timeline Pengadaan", type: "number", suffix: "minggu", min: 1, max: 104, hint: "Estimasi durasi default saat membuat pengajuan aset baru." }
    ]
  }
];

export default function SystemSettings({ user, onSaved }: { user: AuthUser; onSaved?: () => void }) {
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (user.role !== "Admin") {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        setForm(await api.getSettings());
      } catch (e: any) {
        setErr(e?.message || "Gagal memuat pengaturan.");
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
          Pengaturan Sistem hanya dapat diubah oleh <strong>Admin</strong>. Role Anda: {user.role}.
        </p>
      </div>
    );
  }

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

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
      setNotice("Pengaturan berhasil disimpan & diterapkan ke seluruh sistem.");
      onSaved?.();
    } catch (e: any) {
      setErr(e?.message || "Gagal menyimpan pengaturan.");
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
          <p className="text-slate-400 text-xs mt-0.5">Konfigurasi global — perubahan langsung diterapkan ke dokumen, form, & dashboard.</p>
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
    </div>
  );
}
