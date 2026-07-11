/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
import { UserPlus, Pencil, Trash2, X, AlertTriangle, CheckCircle, ShieldCheck, Loader2, Lock, Users } from "lucide-react";
import { api, type AuthUser, type UserRow } from "../api";

const ROLES = [
  { value: "Admin", badge: "bg-indigo-50 text-indigo-700 border-indigo-200", desc: "Akses penuh — semua fase & manajemen user" },
  { value: "Logistik", badge: "bg-blue-50 text-blue-700 border-blue-200", desc: "Produksi, gudang, kirim, transit, penarikan" },
  { value: "PIC", badge: "bg-pink-50 text-pink-700 border-pink-200", desc: "Penerima di lokasi client — terima kiriman & audit" },
  { value: "Merchandiser", badge: "bg-rose-50 text-rose-700 border-rose-200", desc: "Pemasangan & maintenance di lokasi client" }
];
const badgeFor = (role: string) => ROLES.find(r => r.value === role)?.badge || "bg-slate-100 text-slate-700 border-slate-200";
// PIC & Merchandiser belong to a specific client; Admin & Logistik are global.
const CLIENT_SCOPED = ["PIC", "Merchandiser"];
const isClientScoped = (role: string) => CLIENT_SCOPED.includes(role);

const fmtDate = (s: string) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};

export default function UserManagement({ user, clientOptions = [] }: { user: AuthUser; clientOptions?: string[] }) {
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const [editing, setEditing] = React.useState<UserRow | "new" | null>(null);
  const [form, setForm] = React.useState({ username: "", name: "", role: "Logistik", password: "", client: "", area: "" });
  const [formErr, setFormErr] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState<UserRow | null>(null);
  const [areas, setAreas] = React.useState<string[]>([]);

  const load = React.useCallback(async () => {
    try {
      setUsers(await api.getUsers());
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Gagal memuat daftar user.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (user.role === "Admin") {
      load();
      api.getAreas().then(a => setAreas(a.map(x => x.name))).catch(() => setAreas([]));
    } else setLoading(false);
  }, [user.role, load]);

  // Access gate (backend also enforces)
  if (user.role !== "Admin") {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-12 text-center shadow-xs max-w-md mx-auto mt-10">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-3">
          <Lock className="h-6 w-6 text-amber-500" />
        </div>
        <h3 className="font-extrabold text-slate-800 text-sm">Akses Terbatas</h3>
        <p className="text-slate-500 text-xs mt-1 leading-relaxed">
          Manajemen user hanya dapat diakses oleh <strong>Admin</strong>. Role Anda saat ini: {user.role}.
        </p>
      </div>
    );
  }

  const openNew = () => {
    setForm({ username: "", name: "", role: "Logistik", password: "", client: "", area: "" });
    setFormErr(null);
    setEditing("new");
  };
  const openEdit = (u: UserRow) => {
    setForm({ username: u.username, name: u.name, role: u.role, password: "", client: u.client || "", area: u.area || "" });
    setFormErr(null);
    setEditing(u);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    if (editing === "new" && (!form.username.trim() || !form.name.trim() || !form.password)) {
      return setFormErr("Username, nama, dan password (min 6) wajib diisi.");
    }
    if (editing !== "new" && !form.name.trim()) return setFormErr("Nama wajib diisi.");
    if (isClientScoped(form.role) && !form.client) {
      return setFormErr(`Role ${form.role} harus ditugaskan ke satu client.`);
    }
    setSaving(true);
    try {
      const client = isClientScoped(form.role) ? form.client : "";
      const area = isClientScoped(form.role) ? form.area : "";
      if (editing === "new") {
        await api.createUser({ username: form.username.trim(), name: form.name.trim(), role: form.role, password: form.password, client, area });
        setNotice(`User "${form.username.trim()}" berhasil dibuat.`);
      } else if (editing) {
        const patch: { name?: string; role?: string; password?: string; client?: string; area?: string } = { name: form.name.trim(), role: form.role, client, area };
        if (form.password) patch.password = form.password;
        await api.updateUser(editing.id, patch);
        setNotice(`User "${editing.username}" berhasil diperbarui.`);
      }
      setEditing(null);
      await load();
    } catch (e: any) {
      setFormErr(e?.message || "Gagal menyimpan user.");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async (u: UserRow) => {
    setErr(null);
    try {
      await api.deleteUser(u.id);
      setNotice(`User "${u.username}" dihapus.`);
    } catch (e: any) {
      setErr(e?.message || "Gagal menghapus user.");
    } finally {
      setConfirmDel(null);
      await load();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" /> User Management
          </h2>
          <p className="text-slate-400 text-xs mt-0.5">Kelola akun operator & hak akses role · {users.length} user terdaftar</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition self-start sm:self-auto"
        >
          <UserPlus className="h-4 w-4" />
          <span>Tambah User</span>
        </button>
      </div>

      {/* Banners */}
      {notice && (
        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <span className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" /> {notice}
          </span>
          <button onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {err && (
        <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4" /> {err}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider">
                <th className="text-left font-extrabold px-5 py-3">Nama</th>
                <th className="text-left font-extrabold px-5 py-3">Username</th>
                <th className="text-left font-extrabold px-5 py-3">Role</th>
                <th className="text-left font-extrabold px-5 py-3">Client</th>
                <th className="text-left font-extrabold px-5 py-3">Area</th>
                <th className="text-left font-extrabold px-5 py-3">Dibuat</th>
                <th className="text-right font-extrabold px-5 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-400">
                    Belum ada user.
                  </td>
                </tr>
              ) : (
                users.map(u => {
                  const isSelf = u.id === user.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-blue-600 text-white text-[10px] font-extrabold flex items-center justify-center border border-blue-500 shrink-0">
                            {u.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-bold text-slate-800">
                            {u.name}
                            {isSelf && <span className="ml-1.5 text-[9px] font-bold text-blue-500 uppercase">(Anda)</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 font-mono text-slate-500">{u.username}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${badgeFor(u.role)}`}>
                          {u.role === "Admin" && <ShieldCheck className="h-3 w-3" />}
                          {u.role}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {u.client ? (
                          <span className="font-semibold text-slate-700">{u.client}</span>
                        ) : (
                          <span className="text-slate-300">— semua —</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {u.area ? (
                          <span className="inline-flex items-center rounded-full bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 text-[10px] font-bold">{u.area}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-500">{fmtDate(u.created_at)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEdit(u)}
                            title="Edit user"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDel(u)}
                            disabled={isSelf}
                            title={isSelf ? "Tidak bisa menghapus akun sendiri" : "Hapus user"}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest block">
                  {editing === "new" ? "Buat Akun Baru" : "Edit Akun"}
                </span>
                <h3 className="text-base font-bold text-slate-950">{editing === "new" ? "Tambah User" : editing.name}</h3>
              </div>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={save} className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">
                  Username {editing === "new" && <span className="text-rose-500">*</span>}
                </label>
                <input
                  name="username"
                  value={form.username}
                  disabled={editing !== "new"}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
                  placeholder="cth. budi.santoso"
                />
                {editing !== "new" && <p className="text-[10px] text-slate-400">Username tidak bisa diubah.</p>}
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">
                  Nama Lengkap <span className="text-rose-500">*</span>
                </label>
                <input
                  name="name"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 text-slate-800"
                  placeholder="cth. Budi Santoso"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Role / Hak Akses</label>
                <select
                  name="role"
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value, client: isClientScoped(e.target.value) ? form.client : "", area: isClientScoped(e.target.value) ? form.area : "" })}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 font-medium text-slate-800 cursor-pointer"
                >
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>
                      {r.value}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 leading-relaxed">{ROLES.find(r => r.value === form.role)?.desc}</p>
              </div>

              {isClientScoped(form.role) && (
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700">
                    Client Ditugaskan <span className="text-rose-500">*</span>
                  </label>
                  <select
                    name="client"
                    value={form.client}
                    onChange={e => setForm({ ...form, client: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 font-medium text-slate-800 cursor-pointer"
                  >
                    <option value="">— pilih client —</option>
                    {clientOptions.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    {/* Preserve an assigned client that's no longer in the master list */}
                    {form.client && !clientOptions.includes(form.client) && <option value={form.client}>{form.client}</option>}
                  </select>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    {form.role} hanya menangani aset milik client ini (setiap client punya PIC & Merchandiser sendiri).
                  </p>
                </div>
              )}

              {isClientScoped(form.role) && (
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700">
                    Area <span className="font-normal text-slate-400">(opsional — untuk distribusi/roadshow)</span>
                  </label>
                  <select
                    name="area"
                    value={form.area}
                    onChange={e => setForm({ ...form, area: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 font-medium text-slate-800 cursor-pointer"
                  >
                    <option value="">— tanpa area (mis. event) —</option>
                    {areas.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                    {form.area && !areas.includes(form.area) && <option value={form.area}>{form.area}</option>}
                  </select>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Isi kalau {form.role} bertanggung jawab di area tertentu (mis. PIC Area Aceh). Kosongkan untuk event.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">
                  Password {editing === "new" ? <span className="text-rose-500">*</span> : <span className="font-normal text-slate-400">(kosongkan jika tidak diubah)</span>}
                </label>
                <input
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 text-slate-800"
                  placeholder={editing === "new" ? "min. 6 karakter" : "••••••••"}
                />
              </div>

              {formErr && (
                <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 font-semibold">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{formErr}</span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setEditing(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg transition">
                  Batal
                </button>
                <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-5 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editing === "new" ? "Buat User" : "Simpan Perubahan"}
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
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center">
              <Trash2 className="h-5 w-5 text-rose-500" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Hapus User?</h3>
              <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                Akun <strong className="text-slate-800">{confirmDel.name}</strong> ({confirmDel.username}) akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setConfirmDel(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs transition">
                Batal
              </button>
              <button onClick={() => doDelete(confirmDel)} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition">
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
