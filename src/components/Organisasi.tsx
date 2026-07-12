/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Organisasi — Admin masters that support the multi-pattern deployment model:
 *  • Area    : geographic zones; PIC & Merchandiser scope to Client + Area (distribution/roadshow).
 *  • Kategori : asset categories used by the Master Data asset form + filters (auto-added on create/import too).
 *  • Karyawan: internal-asset custodians (who holds a company laptop/printer). NOT login users.
 */
import React from "react";
import { MapPin, Users, Plus, Pencil, Trash2, X, Check, AlertTriangle, Loader2, Lock, Building2, Store, ListChecks, Tag } from "lucide-react";
import { api, type AuthUser, type Employee, type MasterItem, type Client, type DeploymentType } from "../api";

const DEPLOY_TYPES: DeploymentType[] = ["Internal", "Event", "Distribusi"];
const TYPE_STYLE: Record<DeploymentType, string> = {
  Internal: "bg-slate-100 text-slate-600 border-slate-200",
  Event: "bg-amber-50 text-amber-700 border-amber-200",
  Distribusi: "bg-teal-50 text-teal-700 border-teal-200"
};

export default function Organisasi({ user, onChanged }: { user: AuthUser; onChanged?: () => void }) {
  const [areas, setAreas] = React.useState<MasterItem[]>([]);
  const [categories, setCategories] = React.useState<MasterItem[]>([]);
  const [emps, setEmps] = React.useState<Employee[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [a, cat, e, c] = await Promise.all([api.getAreas(), api.getMaster("categories"), api.getEmployees(), api.getClients()]);
      setAreas(a);
      setCategories(cat);
      setEmps(e);
      setClients(c);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Gagal memuat data organisasi.");
    } finally {
      setLoading(false);
    }
  }, []);
  // Reload our local lists AND notify the app so master changes flow into the
  // Master Data asset form dropdowns + top-bar client filter (App holds categoryNames/clientNames).
  const afterChange = React.useCallback(() => { load(); onChanged?.(); }, [load, onChanged]);
  React.useEffect(() => {
    if (user.role === "Admin") load();
    else setLoading(false);
  }, [user.role, load]);

  if (user.role !== "Admin") {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-12 text-center shadow-xs max-w-md mx-auto mt-10">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-3">
          <Lock className="h-6 w-6 text-amber-500" />
        </div>
        <h3 className="font-extrabold text-slate-800 text-sm">Akses Terbatas</h3>
        <p className="text-slate-500 text-xs mt-1 leading-relaxed">Organisasi hanya dapat diakses oleh <strong>Admin</strong>. Role Anda: {user.role}.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="pb-2 border-b border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2"><Building2 className="h-5 w-5 text-blue-600" /> Organisasi</h2>
        <p className="text-slate-400 text-xs mt-0.5">Client, Area, Kategori Aset &amp; Karyawan — master pendukung aset, deployment &amp; custodian.</p>
      </div>
      {err && <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"><AlertTriangle className="h-4 w-4" /> {err}</div>}
      {loading ? (
        <div className="py-16 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
      ) : (
        <div className="space-y-6">
          {/* Client & Kategori feed App-level dropdowns (clientNames/categoryNames) → afterChange
              also refreshes the app. Area & Karyawan are not tracked at the App level → local load only. */}
          <ClientCard clients={clients} onChange={afterChange} onErr={setErr} />
          <div className="grid gap-6 lg:grid-cols-3">
            <AreaCard areas={areas} onChange={load} onErr={setErr} />
            <CategoryCard categories={categories} onChange={afterChange} />
            <EmployeeCard emps={emps} onChange={load} onErr={setErr} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Clients (name + deployment-type tags + store-list flag) ---------- */
const emptyClient = () => ({ name: "", deploymentTypes: [] as DeploymentType[], hasStoreList: false });
function ClientCard({ clients, onChange, onErr }: { clients: Client[]; onChange: () => void; onErr: (e: string) => void }) {
  const [editing, setEditing] = React.useState<Client | "new" | null>(null);
  const [form, setForm] = React.useState(emptyClient());
  const [busy, setBusy] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState<Client | null>(null);
  const [merr, setMerr] = React.useState<string | null>(null); // error shown INSIDE the modal

  const openNew = () => { setForm(emptyClient()); setMerr(null); setEditing("new"); };
  const openEdit = (c: Client) => { setForm({ name: c.name, deploymentTypes: [...c.deploymentTypes], hasStoreList: c.hasStoreList }); setMerr(null); setEditing(c); };
  const toggleType = (t: DeploymentType) =>
    setForm(f => ({ ...f, deploymentTypes: f.deploymentTypes.includes(t) ? f.deploymentTypes.filter(x => x !== t) : [...f.deploymentTypes, t] }));
  const save = async () => {
    if (!form.name.trim() || busy) { if (!form.name.trim()) setMerr("Nama client wajib diisi."); return; }
    setBusy(true); setMerr(null);
    const payload = { name: form.name.trim(), deploymentTypes: form.deploymentTypes, hasStoreList: form.hasStoreList };
    try {
      if (editing === "new") await api.createClient(payload);
      else if (editing) await api.updateClient(editing.id, payload);
      setEditing(null); onChange();
    } catch (e: any) { setMerr(e?.message || "Gagal simpan client."); } finally { setBusy(false); }
  };
  const del = async (c: Client) => { try { await api.deleteClient(c.id); setConfirmDel(null); onChange(); } catch (er: any) { onErr(er?.message || "Gagal hapus."); } };

  const inp = "w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs outline-none focus:bg-white focus:ring-1 focus:ring-blue-500";
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-xs overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        <Store className="h-4 w-4 text-blue-600" />
        <h3 className="font-bold text-slate-800 text-sm">Client</h3>
        <span className="text-[10px] text-slate-400">· kategori proyek (Event / Distribusi / Internal) &amp; list toko</span>
        <button onClick={openNew} className="ml-auto flex items-center gap-1 text-[11px] bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1.5 rounded-lg"><Plus className="h-3.5 w-3.5" /> Tambah</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/60">
              <th className="text-left font-extrabold px-5 py-2.5">Client</th>
              <th className="text-left font-extrabold px-5 py-2.5">Tipe Proyek</th>
              <th className="text-left font-extrabold px-5 py-2.5">List Toko</th>
              <th className="text-right font-extrabold px-5 py-2.5">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clients.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">Belum ada client.</td></tr>
            ) : clients.map(c => (
              <tr key={c.id} className="hover:bg-slate-50/50">
                <td className="px-5 py-2.5 font-bold text-slate-800">{c.name}</td>
                <td className="px-5 py-2.5">
                  {c.deploymentTypes.length === 0 ? (
                    <span className="text-slate-300 italic">belum ditentukan</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {c.deploymentTypes.map(t => (
                        <span key={t} className={`inline-block px-2 py-0.5 rounded-md border font-bold text-[10px] ${TYPE_STYLE[t]}`}>{t}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-5 py-2.5">
                  {c.hasStoreList
                    ? <span className="inline-flex items-center gap-1 text-emerald-600 font-bold"><ListChecks className="h-3.5 w-3.5" /> Ada</span>
                    : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-5 py-2.5 text-right">
                  <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setConfirmDel(c)} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-950">{editing === "new" ? "Tambah Client" : editing.name}</h3>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5"><label className="font-bold text-slate-700">Nama Client <span className="text-rose-500">*</span></label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inp} placeholder="cth. AICE" /></div>
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Tipe Proyek</label>
                <p className="text-[10px] text-slate-400 -mt-1">Boleh lebih dari satu — satu client bisa jalanin Event &amp; Distribusi sekaligus.</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {DEPLOY_TYPES.map(t => {
                    const on = form.deploymentTypes.includes(t);
                    return (
                      <button key={t} type="button" onClick={() => toggleType(t)}
                        className={`px-3 py-1.5 rounded-lg border font-bold text-[11px] transition ${on ? TYPE_STYLE[t] + " ring-1 ring-offset-1 ring-current" : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"}`}>
                        {on && <Check className="h-3 w-3 inline mr-1 -mt-0.5" />}{t}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
                <input type="checkbox" checked={form.hasStoreList} onChange={e => setForm({ ...form, hasStoreList: e.target.checked })} className="h-4 w-4 rounded accent-blue-600" />
                <span className="font-bold text-slate-700">Punya list toko</span>
                <span className="text-[10px] text-slate-400">(relevan untuk Distribusi — titik/toko sudah terdaftar)</span>
              </label>
              {merr && <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {merr}</div>}
              <div className="pt-2 border-t border-slate-100 flex justify-end gap-3">
                <button onClick={() => setEditing(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg">Batal</button>
                <button onClick={save} disabled={busy} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-5 py-2 rounded-lg flex items-center gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Simpan</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-100 p-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 border border-rose-200 grid place-items-center"><Trash2 className="h-5 w-5 text-rose-500" /></div>
            <p className="text-slate-500 text-xs">Hapus client <strong className="text-slate-800">{confirmDel.name}</strong>? Tidak bisa jika masih dipakai aset.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs">Batal</button>
              <button onClick={() => del(confirmDel)} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 rounded-lg text-xs">Ya, Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Areas ---------- */
function AreaCard({ areas, onChange, onErr }: { areas: MasterItem[]; onChange: () => void; onErr: (e: string) => void }) {
  const [adding, setAdding] = React.useState("");
  const [editId, setEditId] = React.useState<number | null>(null);
  const [editVal, setEditVal] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [aerr, setAerr] = React.useState<string | null>(null); // LOCAL error shown right at the card

  const add = async () => {
    if (busy) return;
    const name = adding.trim();
    if (!name) { setAerr("Isi nama area dulu, lalu klik Tambah."); return; }
    setBusy(true); setAerr(null);
    try { await api.createArea(name); setAdding(""); onChange(); } catch (e: any) { setAerr(e?.message || "Gagal menambah area."); } finally { setBusy(false); }
  };
  const saveEdit = async (id: number) => {
    const name = editVal.trim();
    if (!name) return;
    setAerr(null);
    try { await api.updateArea(id, name); setEditId(null); onChange(); } catch (e: any) { setAerr(e?.message || "Gagal ubah area."); }
  };
  const del = async (id: number) => { setAerr(null); try { await api.deleteArea(id); onChange(); } catch (e: any) { setAerr(e?.message || "Gagal hapus area."); } };

  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-xs overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-teal-600" />
        <h3 className="font-bold text-slate-800 text-sm">Area</h3>
        <span className="text-[10px] text-slate-400 ml-auto">{areas.length} area</span>
      </div>
      <div className="p-4 flex gap-2">
        <input value={adding} onChange={e => setAdding(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Tambah area baru (cth. Palembang)"
          className="flex-1 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs outline-none focus:bg-white focus:ring-1 focus:ring-blue-500" />
        <button onClick={add} disabled={busy} className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-3 rounded-lg">
          <Plus className="h-4 w-4" /> Tambah
        </button>
      </div>
      {aerr && <div className="mx-4 -mt-2 mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {aerr}</div>}
      <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
        {areas.length === 0 ? (
          <li className="px-5 py-8 text-center text-xs text-slate-400">Belum ada area.</li>
        ) : areas.map(a => (
          <li key={a.id} className="flex items-center gap-2 px-5 py-2.5">
            {editId === a.id ? (
              <>
                <input value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEdit(a.id)}
                  className="flex-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md text-xs outline-none focus:ring-1 focus:ring-blue-500" />
                <button onClick={() => saveEdit(a.id)} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50"><Check className="h-3.5 w-3.5" /></button>
                <button onClick={() => setEditId(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>
              </>
            ) : (
              <>
                <span className="flex-1 text-xs font-semibold text-slate-700 flex items-center gap-2"><MapPin className="h-3 w-3 text-teal-500" /> {a.name}</span>
                <button onClick={() => { setEditId(a.id); setEditVal(a.name); }} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => del(a.id)} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Categories (asset categories — name-only master, feeds the Master Data asset form) ---------- */
function CategoryCard({ categories, onChange }: { categories: MasterItem[]; onChange: () => void }) {
  const [adding, setAdding] = React.useState("");
  const [editId, setEditId] = React.useState<number | null>(null);
  const [editVal, setEditVal] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [cerr, setCerr] = React.useState<string | null>(null); // LOCAL error shown right at the card

  const add = async () => {
    if (busy) return;
    const name = adding.trim();
    if (!name) { setCerr("Isi nama kategori dulu, lalu klik Tambah."); return; }
    setBusy(true); setCerr(null);
    try { await api.createMaster("categories", name); setAdding(""); onChange(); } catch (e: any) { setCerr(e?.message || "Gagal menambah kategori."); } finally { setBusy(false); }
  };
  const saveEdit = async (id: number) => {
    const name = editVal.trim();
    if (!name) return;
    setCerr(null);
    try { await api.updateMaster("categories", id, name); setEditId(null); onChange(); } catch (e: any) { setCerr(e?.message || "Gagal ubah kategori."); }
  };
  const del = async (id: number) => { setCerr(null); try { await api.deleteMaster("categories", id); onChange(); } catch (e: any) { setCerr(e?.message || "Gagal hapus kategori."); } };

  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-xs overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        <Tag className="h-4 w-4 text-violet-600" />
        <h3 className="font-bold text-slate-800 text-sm">Kategori Aset</h3>
        <span className="text-[10px] text-slate-400 ml-auto">{categories.length} kategori</span>
      </div>
      <div className="p-4 flex gap-2">
        <input value={adding} onChange={e => setAdding(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          aria-label="Nama kategori baru"
          placeholder="Tambah kategori baru (cth. Booth)"
          className="flex-1 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs outline-none focus:bg-white focus:ring-1 focus:ring-blue-500" />
        <button onClick={add} disabled={busy} className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-3 rounded-lg">
          <Plus className="h-4 w-4" /> Tambah
        </button>
      </div>
      {cerr && <div className="mx-4 -mt-2 mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {cerr}</div>}
      <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
        {categories.length === 0 ? (
          <li className="px-5 py-8 text-center text-xs text-slate-400">Belum ada kategori.</li>
        ) : categories.map(c => (
          <li key={c.id} className="flex items-center gap-2 px-5 py-2.5">
            {editId === c.id ? (
              <>
                <input value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEdit(c.id)}
                  aria-label="Ubah nama kategori" autoFocus
                  className="flex-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md text-xs outline-none focus:ring-1 focus:ring-blue-500" />
                <button onClick={() => saveEdit(c.id)} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50"><Check className="h-3.5 w-3.5" /></button>
                <button onClick={() => setEditId(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>
              </>
            ) : (
              <>
                <span className="flex-1 text-xs font-semibold text-slate-700 flex items-center gap-2"><Tag className="h-3 w-3 text-violet-500" /> {c.name}</span>
                <button onClick={() => { setEditId(c.id); setEditVal(c.name); }} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => del(c.id)} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Employees / Karyawan ---------- */
const emptyEmp = () => ({ code: "", name: "", department: "", position: "" });
function EmployeeCard({ emps, onChange, onErr }: { emps: Employee[]; onChange: () => void; onErr: (e: string) => void }) {
  const [editing, setEditing] = React.useState<Employee | "new" | null>(null);
  const [form, setForm] = React.useState(emptyEmp());
  const [busy, setBusy] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState<Employee | null>(null);
  const [merr, setMerr] = React.useState<string | null>(null); // error shown INSIDE the modal

  const openNew = () => { setForm(emptyEmp()); setMerr(null); setEditing("new"); };
  const openEdit = (e: Employee) => { setForm({ code: e.code || "", name: e.name, department: e.department || "", position: e.position || "" }); setMerr(null); setEditing(e); };
  const save = async () => {
    if (!form.name.trim() || busy) { if (!form.name.trim()) setMerr("Nama karyawan wajib diisi."); return; }
    setBusy(true); setMerr(null);
    try {
      if (editing === "new") await api.createEmployee({ code: form.code.trim(), name: form.name.trim(), department: form.department.trim(), position: form.position.trim() });
      else if (editing) await api.updateEmployee(editing.id, { code: form.code.trim(), name: form.name.trim(), department: form.department.trim(), position: form.position.trim() });
      setEditing(null); onChange();
    } catch (e: any) { setMerr(e?.message || "Gagal simpan karyawan."); } finally { setBusy(false); }
  };
  const del = async (e: Employee) => { try { await api.deleteEmployee(e.id); setConfirmDel(null); onChange(); } catch (er: any) { onErr(er?.message || "Gagal hapus."); } };

  const inp = "w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs outline-none focus:bg-white focus:ring-1 focus:ring-blue-500";
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-xs overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        <Users className="h-4 w-4 text-indigo-600" />
        <h3 className="font-bold text-slate-800 text-sm">Karyawan (Custodian)</h3>
        <button onClick={openNew} className="ml-auto flex items-center gap-1 text-[11px] bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1.5 rounded-lg"><Plus className="h-3.5 w-3.5" /> Tambah</button>
      </div>
      <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
        {emps.length === 0 ? (
          <li className="px-5 py-8 text-center text-xs text-slate-400">Belum ada karyawan.</li>
        ) : emps.map(e => (
          <li key={e.id} className="flex items-center gap-3 px-5 py-2.5">
            <div className="h-7 w-7 rounded-full bg-indigo-600 text-white text-[10px] font-extrabold grid place-items-center shrink-0">{e.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-800 truncate">{e.name} {e.code && <span className="font-mono font-normal text-[10px] text-slate-400">· {e.code}</span>}</p>
              <p className="text-[10px] text-slate-500">{[e.position, e.department].filter(Boolean).join(" · ") || "—"}</p>
            </div>
            <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={() => setConfirmDel(e)} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>

      {editing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-950">{editing === "new" ? "Tambah Karyawan" : editing.name}</h3>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="space-y-1.5"><label className="font-bold text-slate-700">Nama <span className="text-rose-500">*</span></label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inp} placeholder="cth. Rian Hidayat" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><label className="font-bold text-slate-700">Kode/NIK</label><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className={inp} placeholder="ORG-IT-01" /></div>
                <div className="space-y-1.5"><label className="font-bold text-slate-700">Divisi</label><input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className={inp} placeholder="IT" /></div>
              </div>
              <div className="space-y-1.5"><label className="font-bold text-slate-700">Jabatan</label><input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className={inp} placeholder="IT Support" /></div>
              {merr && <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {merr}</div>}
              <div className="pt-2 border-t border-slate-100 flex justify-end gap-3">
                <button onClick={() => setEditing(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg">Batal</button>
                <button onClick={save} disabled={busy} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-5 py-2 rounded-lg flex items-center gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Simpan</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-100 p-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 border border-rose-200 grid place-items-center"><Trash2 className="h-5 w-5 text-rose-500" /></div>
            <p className="text-slate-500 text-xs">Hapus karyawan <strong className="text-slate-800">{confirmDel.name}</strong>?</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs">Batal</button>
              <button onClick={() => del(confirmDel)} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 rounded-lg text-xs">Ya, Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
