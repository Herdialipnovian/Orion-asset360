/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
import { LogIn, Loader2, Server } from "lucide-react";
import { fieldApi, isNative, apiBase, setApiBase, type AuthUser } from "../fieldApi";
import { Brand } from "../ui";

export default function FieldLogin({ onLogin }: { onLogin: (u: AuthUser) => void }) {
  const native = isNative();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [server, setServer] = React.useState(() => apiBase() || (native ? "http://100.90.238.127:3201" : ""));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) return setErr("Isi username & password.");
    if (native && !server.trim()) return setErr("Isi alamat server dulu.");
    if (native) setApiBase(server);
    setBusy(true);
    setErr("");
    try {
      const { user } = await fieldApi.login(username.trim(), password);
      onLogin(user);
    } catch (e: any) {
      setErr(e?.message || "Gagal masuk. Cek alamat server & koneksi.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4">
          <Brand />
          <div className="text-center">
            <h1 className="text-2xl font-black text-white">Field Operations</h1>
            <p className="mt-1 text-sm text-slate-400">Scan · Aksi Lapangan · Bukti Foto</p>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {native && (
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><Server className="h-3.5 w-3.5" /> Alamat Server</span>
              <input
                value={server}
                onChange={e => {
                  setServer(e.target.value);
                  setApiBase(e.target.value);
                }}
                autoCapitalize="none"
                autoCorrect="off"
                inputMode="url"
                placeholder="http://192.168.x.x:3201"
                className="tap rounded-xl border border-[#1e2b45] bg-[#0f1728] px-4 font-mono text-sm text-white outline-none placeholder:text-slate-600 focus:border-[#4d8bff]"
              />
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Username</span>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="username"
              className="tap rounded-xl border border-[#1e2b45] bg-[#0f1728] px-4 text-base text-white outline-none placeholder:text-slate-600 focus:border-[#4d8bff]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Password</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="tap rounded-xl border border-[#1e2b45] bg-[#0f1728] px-4 text-base text-white outline-none placeholder:text-slate-600 focus:border-[#4d8bff]"
            />
          </label>

          {err && <div className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{err}</div>}

          <button
            type="submit"
            disabled={busy}
            className="tap mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#4d8bff] px-4 text-base font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
            {busy ? "Masuk…" : "Masuk"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-slate-600">PT Origin Connect · Asset360 Field · v1</p>
      </div>
    </div>
  );
}
