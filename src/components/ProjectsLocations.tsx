/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Proyek & Lokasi — the deployment foundation shared by all three patterns.
 *  • Proyek (Campaign): a client's job + a mode (Internal / Event / Distribusi). Assets deploy under a project.
 *  • Lokasi: Venue (event) / Toko (distribusi) / Internal target — from a list, or added in the field.
 * Managed by Admin + Logistik (operational planning).
 */
import React from "react";
import { Briefcase, MapPin, Plus, Pencil, Trash2, X, Loader2, Lock, AlertTriangle, Store, Tent, Building, CheckCircle2 } from "lucide-react";
import { api, type AuthUser, type Project, type ProjectMode, type Loc, type LocationType, type MasterItem, type Client } from "../api";

const MODE_STYLE: Record<ProjectMode, string> = {
  Internal: "bg-slate-100 text-slate-600 border-slate-200",
  Event: "bg-amber-50 text-amber-700 border-amber-200",
  Distribusi: "bg-teal-50 text-teal-700 border-teal-200"
};
const LOC_ICON: Record<LocationType, React.ComponentType<any>> = { Venue: Tent, Toko: Store, Internal: Building };
const LOC_TYPES: LocationType[] = ["Toko", "Venue", "Internal"];
const MODES: ProjectMode[] = ["Internal", "Event", "Distribusi"];

export default function ProjectsLocations({ user }: { user: AuthUser }) {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [locs, setLocs] = React.useState<Loc[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [areas, setAreas] = React.useState<MasterItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const manage = user.role === "Admin" || user.role === "Logistik";

  const load = React.useCallback(async () => {
    try {
      const [p, l, c, a] = await Promise.all([api.getProjects(), api.getLocations(), api.getClients(), api.getAreas()]);
      setProjects(p); setLocs(l); setClients(c); setAreas(a); setErr(null);
    } catch (e: any) { setErr(e?.message || "Gagal memuat data."); } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  if (!manage) {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-12 text-center shadow-xs max-w-md mx-auto mt-10">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-3"><Lock className="h-6 w-6 text-amber-500" /></div>
        <h3 className="font-extrabold text-slate-800 text-sm">Akses Terbatas</h3>
        <p className="text-slate-500 text-xs mt-1">Proyek &amp; Lokasi dikelola oleh <strong>Admin</strong> atau <strong>Logistik</strong>. Role Anda: {user.role}.</p>
      </div>
    );
  }

  const clientNames = clients.map(c => c.name);
  const areaNames = areas.map(a => a.name);
  return (
    <div className="space-y-6">
      <div className="pb-2 border-b border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2"><Briefcase className="h-5 w-5 text-blue-600" /> Proyek &amp; Lokasi</h2>
        <p className="text-slate-400 text-xs mt-0.5">Fondasi deployment — proyek (mode Internal/Event/Distribusi) + venue/toko/target internal.</p>
      </div>
      {err && <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"><AlertTriangle className="h-4 w-4" /> {err}</div>}
      {loading ? (
        <div className="py-16 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
      ) : (
        <div className="space-y-6">
          <ProjectCard projects={projects} clientNames={clientNames} areaNames={areaNames} onChange={load} onErr={setErr} />
          <LocationCard locs={locs} clientNames={clientNames} areaNames={areaNames} onChange={load} onErr={setErr} />
        </div>
      )}
    </div>
  );
}

const inp = "w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs outline-none focus:bg-white focus:ring-1 focus:ring-blue-500";
const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
      <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white">
        <h3 className="text-base font-bold text-slate-950">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </div>
      <div className="p-5 space-y-3 text-xs">{children}</div>
    </div>
  </div>
);
const ConfirmDelete = ({ label, onCancel, onConfirm }: { label: string; onCancel: () => void; onConfirm: () => void }) => (
  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
    <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-100 p-6 text-center space-y-4">
      <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 border border-rose-200 grid place-items-center"><Trash2 className="h-5 w-5 text-rose-500" /></div>
      <p className="text-slate-500 text-xs">Hapus <strong className="text-slate-800">{label}</strong>?</p>
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs">Batal</button>
        <button onClick={onConfirm} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 rounded-lg text-xs">Ya, Hapus</button>
      </div>
    </div>
  </div>
);

/* ---------- Proyek ---------- */
const emptyProject = () => ({ name: "", client: "", mode: "Distribusi" as ProjectMode, status: "active" as "active" | "done", area: "", startDate: "", endDate: "", notes: "" });
function ProjectCard({ projects, clientNames, areaNames, onChange, onErr }: { projects: Project[]; clientNames: string[]; areaNames: string[]; onChange: () => void; onErr: (e: string) => void }) {
  const [editing, setEditing] = React.useState<Project | "new" | null>(null);
  const [form, setForm] = React.useState(emptyProject());
  const [busy, setBusy] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState<Project | null>(null);

  const openNew = () => { setForm(emptyProject()); setEditing("new"); };
  const openEdit = (p: Project) => { setForm({ name: p.name, client: p.client || "", mode: p.mode, status: p.status, area: p.area || "", startDate: p.startDate || "", endDate: p.endDate || "", notes: p.notes || "" }); setEditing(p); };
  const save = async () => {
    if (!form.name.trim() || busy) { if (!form.name.trim()) onErr("Nama proyek wajib diisi."); return; }
    setBusy(true);
    const payload = { name: form.name.trim(), client: form.mode === "Internal" ? null : (form.client || null), mode: form.mode, status: form.status, area: form.area || null, startDate: form.startDate || null, endDate: form.endDate || null, notes: form.notes || null };
    try {
      if (editing === "new") await api.createProject(payload as any);
      else if (editing) await api.updateProject(editing.id, payload as any);
      setEditing(null); onChange();
    } catch (e: any) { onErr(e?.message || "Gagal simpan proyek."); } finally { setBusy(false); }
  };
  const del = async (p: Project) => { try { await api.deleteProject(p.id); setConfirmDel(null); onChange(); } catch (e: any) { onErr(e?.message || "Gagal hapus."); } };

  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-xs overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-blue-600" />
        <h3 className="font-bold text-slate-800 text-sm">Proyek</h3>
        <span className="text-[10px] text-slate-400">{projects.length} proyek</span>
        <button onClick={openNew} className="ml-auto flex items-center gap-1 text-[11px] bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1.5 rounded-lg"><Plus className="h-3.5 w-3.5" /> Tambah</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-slate-400 border-b border-slate-100 bg-slate-50/60">
            <th className="text-left font-extrabold px-5 py-2.5">Proyek</th>
            <th className="text-left font-extrabold px-5 py-2.5">Client</th>
            <th className="text-left font-extrabold px-5 py-2.5">Mode</th>
            <th className="text-left font-extrabold px-5 py-2.5">Area</th>
            <th className="text-left font-extrabold px-5 py-2.5">Aset</th>
            <th className="text-left font-extrabold px-5 py-2.5">Status</th>
            <th className="text-right font-extrabold px-5 py-2.5">Aksi</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {projects.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">Belum ada proyek.</td></tr>
            ) : projects.map(p => (
              <tr key={p.id} className="hover:bg-slate-50/50">
                <td className="px-5 py-2.5 font-bold text-slate-800">{p.name}</td>
                <td className="px-5 py-2.5 text-slate-600">{p.client || <span className="text-slate-400">Internal</span>}</td>
                <td className="px-5 py-2.5"><span className={`inline-block px-2 py-0.5 rounded-md border font-bold text-[10px] ${MODE_STYLE[p.mode]}`}>{p.mode}</span></td>
                <td className="px-5 py-2.5 text-slate-600">{p.area || "—"}</td>
                <td className="px-5 py-2.5 text-slate-600 tabular-nums">{p.assetCount ?? 0}</td>
                <td className="px-5 py-2.5">{p.status === "done"
                  ? <span className="inline-flex items-center gap-1 text-slate-500 font-bold"><CheckCircle2 className="h-3.5 w-3.5" /> Selesai</span>
                  : <span className="inline-flex items-center gap-1 text-emerald-600 font-bold"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Aktif</span>}</td>
                <td className="px-5 py-2.5 text-right">
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setConfirmDel(p)} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing === "new" ? "Tambah Proyek" : editing.name} onClose={() => setEditing(null)}>
          <div className="space-y-1.5"><label className="font-bold text-slate-700">Nama Proyek <span className="text-rose-500">*</span></label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inp} placeholder="cth. AICE Roadshow Ramadan 2026" /></div>
          <div className="space-y-1.5">
            <label className="font-bold text-slate-700">Mode</label>
            <div className="flex gap-2">
              {MODES.map(m => (
                <button key={m} type="button" onClick={() => setForm({ ...form, mode: m })}
                  className={`flex-1 px-2 py-1.5 rounded-lg border font-bold text-[11px] transition ${form.mode === m ? MODE_STYLE[m] + " ring-1 ring-current" : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"}`}>{m}</button>
              ))}
            </div>
          </div>
          {form.mode !== "Internal" && (
            <div className="space-y-1.5"><label className="font-bold text-slate-700">Client</label>
              <select value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} className={`${inp} cursor-pointer`}>
                <option value="">— pilih client —</option>
                {clientNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><label className="font-bold text-slate-700">Area</label>
              <select value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} className={`${inp} cursor-pointer`}>
                <option value="">— opsional —</option>
                {areaNames.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><label className="font-bold text-slate-700">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })} className={`${inp} cursor-pointer`}>
                <option value="active">Aktif</option><option value="done">Selesai</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><label className="font-bold text-slate-700">Mulai</label><input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className={inp} /></div>
            <div className="space-y-1.5"><label className="font-bold text-slate-700">Selesai</label><input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className={inp} /></div>
          </div>
          <div className="space-y-1.5"><label className="font-bold text-slate-700">Catatan</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={`${inp} resize-none`} rows={2} /></div>
          <div className="pt-2 border-t border-slate-100 flex justify-end gap-3">
            <button onClick={() => setEditing(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg">Batal</button>
            <button onClick={save} disabled={busy} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-5 py-2 rounded-lg flex items-center gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Simpan</button>
          </div>
        </Modal>
      )}
      {confirmDel && <ConfirmDelete label={`proyek ${confirmDel.name}`} onCancel={() => setConfirmDel(null)} onConfirm={() => del(confirmDel)} />}
    </div>
  );
}

/* ---------- Lokasi ---------- */
const emptyLoc = () => ({ name: "", type: "Toko" as LocationType, client: "", area: "", address: "", pic: "", code: "" });
function LocationCard({ locs, clientNames, areaNames, onChange, onErr }: { locs: Loc[]; clientNames: string[]; areaNames: string[]; onChange: () => void; onErr: (e: string) => void }) {
  const [editing, setEditing] = React.useState<Loc | "new" | null>(null);
  const [form, setForm] = React.useState(emptyLoc());
  const [busy, setBusy] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState<Loc | null>(null);
  const [typeFilter, setTypeFilter] = React.useState<"" | LocationType>("");

  const openNew = () => { setForm(emptyLoc()); setEditing("new"); };
  const openEdit = (l: Loc) => { setForm({ name: l.name, type: l.type, client: l.client || "", area: l.area || "", address: l.address || "", pic: l.pic || "", code: l.code || "" }); setEditing(l); };
  const save = async () => {
    if (!form.name.trim() || busy) { if (!form.name.trim()) onErr("Nama lokasi wajib diisi."); return; }
    setBusy(true);
    const payload = { name: form.name.trim(), type: form.type, client: form.client || null, area: form.area || null, address: form.address || null, pic: form.pic || null, code: form.code || null };
    try {
      if (editing === "new") await api.createLocation(payload as any);
      else if (editing) await api.updateLocation(editing.id, payload as any);
      setEditing(null); onChange();
    } catch (e: any) { onErr(e?.message || "Gagal simpan lokasi."); } finally { setBusy(false); }
  };
  const del = async (l: Loc) => { try { await api.deleteLocation(l.id); setConfirmDel(null); onChange(); } catch (e: any) { onErr(e?.message || "Gagal hapus."); } };

  const shown = typeFilter ? locs.filter(l => l.type === typeFilter) : locs;
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-xs overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
        <MapPin className="h-4 w-4 text-teal-600" />
        <h3 className="font-bold text-slate-800 text-sm">Lokasi</h3>
        <span className="text-[10px] text-slate-400">{shown.length} lokasi</span>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} className="ml-2 text-[11px] bg-slate-50 border border-slate-200 rounded-md px-2 py-1 outline-none cursor-pointer">
          <option value="">Semua tipe</option>{LOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={openNew} className="ml-auto flex items-center gap-1 text-[11px] bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1.5 rounded-lg"><Plus className="h-3.5 w-3.5" /> Tambah</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-slate-400 border-b border-slate-100 bg-slate-50/60">
            <th className="text-left font-extrabold px-5 py-2.5">Nama</th>
            <th className="text-left font-extrabold px-5 py-2.5">Tipe</th>
            <th className="text-left font-extrabold px-5 py-2.5">Client</th>
            <th className="text-left font-extrabold px-5 py-2.5">Area</th>
            <th className="text-left font-extrabold px-5 py-2.5">PIC</th>
            <th className="text-left font-extrabold px-5 py-2.5">Sumber</th>
            <th className="text-right font-extrabold px-5 py-2.5">Aksi</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {shown.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">Belum ada lokasi.</td></tr>
            ) : shown.map(l => {
              const Icon = LOC_ICON[l.type];
              return (
                <tr key={l.id} className="hover:bg-slate-50/50">
                  <td className="px-5 py-2.5 font-bold text-slate-800">{l.name}{l.address && <div className="font-normal text-[10px] text-slate-400">{l.address}</div>}</td>
                  <td className="px-5 py-2.5"><span className="inline-flex items-center gap-1 text-slate-600 font-semibold"><Icon className="h-3.5 w-3.5" /> {l.type}</span></td>
                  <td className="px-5 py-2.5 text-slate-600">{l.client || "—"}</td>
                  <td className="px-5 py-2.5 text-slate-600">{l.area || "—"}</td>
                  <td className="px-5 py-2.5 text-slate-600">{l.pic || "—"}</td>
                  <td className="px-5 py-2.5">{l.source === "field"
                    ? <span className="text-amber-600 font-bold text-[10px]">Lapangan</span>
                    : <span className="text-slate-400 text-[10px]">List</span>}</td>
                  <td className="px-5 py-2.5 text-right">
                    <button onClick={() => openEdit(l)} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setConfirmDel(l)} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing === "new" ? "Tambah Lokasi" : editing.name} onClose={() => setEditing(null)}>
          <div className="space-y-1.5"><label className="font-bold text-slate-700">Nama Lokasi <span className="text-rose-500">*</span></label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inp} placeholder="cth. Indomaret Sudirman" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><label className="font-bold text-slate-700">Tipe</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as LocationType })} className={`${inp} cursor-pointer`}>{LOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
            </div>
            <div className="space-y-1.5"><label className="font-bold text-slate-700">Kode</label><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className={inp} placeholder="TK-JKT-01" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><label className="font-bold text-slate-700">Client</label>
              <select value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} className={`${inp} cursor-pointer`}>
                <option value="">— opsional —</option>{clientNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><label className="font-bold text-slate-700">Area</label>
              <select value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} className={`${inp} cursor-pointer`}>
                <option value="">— opsional —</option>{areaNames.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5"><label className="font-bold text-slate-700">Alamat</label><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className={inp} placeholder="Jl. …" /></div>
          <div className="space-y-1.5"><label className="font-bold text-slate-700">PIC Lokasi</label><input value={form.pic} onChange={e => setForm({ ...form, pic: e.target.value })} className={inp} placeholder="opsional" /></div>
          <div className="pt-2 border-t border-slate-100 flex justify-end gap-3">
            <button onClick={() => setEditing(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg">Batal</button>
            <button onClick={save} disabled={busy} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-5 py-2 rounded-lg flex items-center gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Simpan</button>
          </div>
        </Modal>
      )}
      {confirmDel && <ConfirmDelete label={`lokasi ${confirmDel.name}`} onCancel={() => setConfirmDel(null)} onConfirm={() => del(confirmDel)} />}
    </div>
  );
}
