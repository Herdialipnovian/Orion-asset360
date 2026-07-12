/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Inovasi #9 — Master toko fleksibel. Field staff (PIC/Merchandiser) menambah Toko/Venue baru
 * langsung di lapangan; GPS diisi otomatis dari lokasi perangkat (best-effort). Lokasi masuk
 * master (source="field") sehingga langsung bisa dipakai untuk distribusi/venue di CMS.
 */
import React from "react";
import { ArrowLeft, MapPin, Loader2, Store, Locate, CheckCircle2, WifiOff } from "lucide-react";
import { fieldApi, type AuthUser } from "../fieldApi";
import { getGeo } from "../camera";
import { Toast } from "../ui";

export default function AddLocation({
  user,
  online,
  onBack,
  onAdded
}: {
  user: AuthUser;
  online: boolean;
  onBack: () => void;
  onAdded: (name: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<"Toko" | "Venue">("Toko");
  const [area, setArea] = React.useState(user.area || "");
  const [areaOpts, setAreaOpts] = React.useState<{ id: number; name: string }[]>([]);
  const [address, setAddress] = React.useState("");
  const [gps, setGps] = React.useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState<{ msg: string; tone: "info" | "error" | "success" } | null>(null);

  // Auto-capture GPS on mount (best-effort; user can re-locate manually).
  React.useEffect(() => {
    let live = true;
    setLocating(true);
    getGeo().then(g => { if (live) { setGps(g); setLocating(false); } });
    // Strict dropdown: drop a prefilled area (user.area) that isn't in the master, so the shown
    // placeholder and the submitted value never diverge.
    fieldApi.areas().then(a => { if (live) { setAreaOpts(a); setArea(prev => a.some(x => x.name === prev) ? prev : ""); } }).catch(() => {});
    return () => { live = false; };
  }, []);

  const relocate = async () => {
    setLocating(true);
    const g = await getGeo();
    setGps(g);
    setLocating(false);
    if (!g) setToast({ msg: "GPS tidak tersedia — bisa lanjut tanpa koordinat.", tone: "info" });
  };

  async function submit() {
    if (!name.trim()) return setToast({ msg: `Nama ${type.toLowerCase()} wajib diisi.`, tone: "error" });
    if (!online) return setToast({ msg: "Tambah lokasi butuh koneksi online.", tone: "error" });
    setBusy(true);
    try {
      await fieldApi.addLocation({
        name: name.trim(),
        type,
        client: user.client || undefined,
        area: area.trim() || undefined,
        address: address.trim() || undefined,
        gpsLat: gps?.lat,
        gpsLng: gps?.lng
      });
      onAdded(name.trim());
    } catch (e: any) {
      setToast({ msg: e?.message || "Gagal menambah lokasi.", tone: "error" });
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-28 pt-3">
      <div className="flex items-center gap-3">
        <button onClick={onBack} aria-label="Kembali" className="tap flex w-12 items-center justify-center rounded-xl border border-[#1e2b45] bg-[#0f1728] text-slate-300 active:scale-95">
          <ArrowLeft className="h-5 w-5" />
        </button>
        {!online && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
            <WifiOff className="h-3 w-3" /> Offline
          </span>
        )}
      </div>

      <header>
        <h1 className="text-xl font-bold text-white flex items-center gap-2"><Store className="h-5 w-5 text-[#4d8bff]" /> Tambah {type}</h1>
        <p className="mt-1 text-sm text-slate-400">Lokasi baru masuk master {user.client ? `client ${user.client}` : ""} — langsung siap dipakai.</p>
      </header>

      {/* Type toggle */}
      <div className="flex gap-2">
        {(["Toko", "Venue"] as const).map(t => (
          <button key={t} onClick={() => setType(t)} className={`tap flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${type === t ? "border-[#4d8bff] bg-[#4d8bff]/15 text-[#8fb4ff]" : "border-[#1e2b45] bg-[#0f1728] text-slate-400"}`}>{t}</button>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Nama {type}</span>
        <input value={name} onChange={e => setName(e.target.value)} placeholder={type === "Toko" ? "mis. Alfamart Sudirman" : "mis. Atrium Mall"} className="rounded-xl border border-[#1e2b45] bg-[#0b1220] px-3 py-3 text-sm text-white outline-none focus:border-[#4d8bff]" />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Area</span>
        <select value={area} onChange={e => setArea(e.target.value)} className="tap rounded-xl border border-[#1e2b45] bg-[#0b1220] px-3 py-3 text-sm text-white outline-none focus:border-[#4d8bff]">
          <option value="">— pilih area —</option>
          {areaOpts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
        </select>
        {areaOpts.length === 0 && <span className="text-[11px] text-amber-300">Belum ada master Area. Minta Admin tambah di menu Organisasi dulu.</span>}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Alamat <span className="text-slate-600">(opsional)</span></span>
        <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Jl. ..." className="rounded-xl border border-[#1e2b45] bg-[#0b1220] px-3 py-3 text-sm text-white outline-none focus:border-[#4d8bff]" />
      </label>

      {/* GPS */}
      <div className="rounded-2xl border border-[#1e2b45] bg-[#0f1728] p-3.5 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#4d8bff]/10 text-[#8fb4ff]"><MapPin className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-slate-300">Titik GPS</div>
          <div className="text-[11px] text-slate-400 font-mono truncate">
            {locating ? "Mendeteksi lokasi…" : gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : "Belum ada koordinat"}
            {!locating && gps && <CheckCircle2 className="inline h-3 w-3 text-emerald-400 ml-1" />}
          </div>
        </div>
        <button onClick={relocate} disabled={locating} className="tap flex items-center gap-1.5 rounded-xl border border-[#1e2b45] bg-[#0b1220] px-3 py-2 text-xs font-semibold text-slate-300 active:scale-95 disabled:opacity-50">
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Locate className="h-4 w-4" />} {gps ? "Ulang" : "Deteksi"}
        </button>
      </div>

      <button onClick={submit} disabled={busy} className="tap flex items-center justify-center gap-2 rounded-xl bg-[#4d8bff] px-4 py-3 text-base font-bold text-white active:scale-[0.98] disabled:opacity-50">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Store className="h-5 w-5" />}
        {online ? `Simpan ${type}` : "Butuh online"}
      </button>

      {toast && <Toast msg={toast.msg} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  );
}
