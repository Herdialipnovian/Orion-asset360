/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
import { LogIn, Lock, User, AlertTriangle, Loader2, Layers } from "lucide-react";
import { api, type AuthUser } from "../api";

const DEMO = [
  { u: "admin", p: "admin123", role: "Admin" },
  { u: "logistik", p: "logistik123", role: "Logistik" },
  { u: "pic_garuda", p: "pic123", role: "PIC · Garuda Food" },
  { u: "merch_garuda", p: "merch123", role: "Merchandiser · Garuda Food" }
];

export default function Login({ onSuccess }: { onSuccess: (u: AuthUser) => void }) {
  const [username, setUsername] = React.useState("admin");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user } = await api.login(username.trim(), password);
      onSuccess(user);
    } catch (err: any) {
      setError(err?.message || "Gagal masuk. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-slate-200 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand */}
        <div className="flex flex-col items-center gap-2 select-none">
          <div className="flex items-center relative py-1.5 h-12">
            <span className="absolute left-[2px] w-10 h-10 rounded-full bg-[#FFCD00] block" />
            <span className="relative text-3xl font-black text-white tracking-[0.08em] pl-4 drop-shadow-sm">ORIGIN</span>
          </div>
          <p className="text-[11px] text-slate-400 tracking-wide">Asset360 · Sistem Manajemen Aset</p>
        </div>

        {/* Card */}
        <form onSubmit={submit} className="bg-[#0b1220] border border-[#16213a] rounded-2xl p-6 space-y-4 shadow-2xl">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-white">Masuk ke Portal</h2>
            <p className="text-[11px] text-slate-500">Silakan masuk terlebih dahulu untuk mengakses data aset.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                autoFocus
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-[#0b1321] border border-[#1d2b49] rounded-lg pl-9 pr-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 transition"
                placeholder="username"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-[#0b1321] border border-[#1d2b49] rounded-lg pl-9 pr-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 transition"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-[11px] font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-400 text-white font-bold py-2.5 rounded-lg transition flex items-center justify-center gap-2 text-sm"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            <span>{loading ? "Memverifikasi…" : "Masuk"}</span>
          </button>
        </form>

        {/* Demo creds */}
        <div className="bg-[#0b1220]/60 border border-[#16213a] rounded-xl p-3.5 space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="h-3 w-3" /> Akun Demo (klik untuk mengisi)
          </p>
          <div className="grid grid-cols-1 gap-1">
            {DEMO.map(d => (
              <button
                key={d.u}
                type="button"
                onClick={() => {
                  setUsername(d.u);
                  setPassword(d.p);
                  setError(null);
                }}
                className="flex items-center justify-between text-left text-[11px] bg-[#0b1321] hover:bg-[#111a2e] border border-[#1d2b49] rounded-lg px-2.5 py-1.5 transition"
              >
                <span className="font-mono text-blue-300">
                  {d.u} / {d.p}
                </span>
                <span className="text-slate-500">{d.role}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
