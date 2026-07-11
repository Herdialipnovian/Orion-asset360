/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Field PWA root: auth gate, data load, offline outbox wiring, and a lightweight
 * screen stack (no router — the app is operated, not deep-linked).
 */
import React from "react";
import { Home as HomeIcon, QrCode, User, LogOut, RefreshCw, Wifi, WifiOff, RefreshCcw } from "lucide-react";
import type { Asset, ActivityLog } from "../types";
import { Bell } from "lucide-react";
import { fieldApi, getToken, type AuthUser, type NotifItem, ApiError } from "./fieldApi";
import { subscribe as outboxSubscribe, listCommits, syncAll, isSyncing, discardCommit, type CommitRecord } from "./outbox";
import { ROLE_SHORT, Spinner, Toast, Brand } from "./ui";
import FieldLogin from "./components/FieldLogin";
import Home from "./components/Home";
import Scanner from "./components/Scanner";
import AssetDetail from "./components/AssetDetail";
import ActionScreen from "./components/ActionScreen";
import InstallTask from "./components/InstallTask";
import AssignTask from "./components/AssignTask";
import Notifications from "./components/Notifications";
import SyncCenter from "./components/SyncCenter";
import { myInstallTask, canAssignInstall } from "./lifecycle";

type View =
  | { t: "home" }
  | { t: "scan" }
  | { t: "sync" }
  | { t: "profile" }
  | { t: "detail"; id: string }
  | { t: "action"; id: string; target: number }
  | { t: "install"; id: string }
  | { t: "assign"; id: string }
  | { t: "notif" };

export default function FieldApp() {
  const [booting, setBooting] = React.useState(true);
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [assets, setAssets] = React.useState<Asset[]>([]);
  const [activity, setActivity] = React.useState<ActivityLog[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [stack, setStack] = React.useState<View[]>([{ t: "home" }]);
  const [toast, setToast] = React.useState<{ msg: string; tone: "info" | "error" | "success" } | null>(null);
  const [online, setOnline] = React.useState(navigator.onLine);
  const [outbox, setOutbox] = React.useState<CommitRecord[]>([]);
  const [syncing, setSyncing] = React.useState(false);
  const [notifs, setNotifs] = React.useState<NotifItem[]>([]);
  const [notifUnread, setNotifUnread] = React.useState(0);

  const view = stack[stack.length - 1];
  const push = (v: View) => setStack(s => [...s, v]);
  const pop = () => setStack(s => (s.length > 1 ? s.slice(0, -1) : s));
  const goTab = (t: "home" | "scan" | "sync" | "profile") => setStack([{ t }]);

  const handleAuthError = React.useCallback((e: any) => {
    if (e instanceof ApiError && e.status === 401) {
      fieldApi.logout();
      setUser(null);
      setToast({ msg: "Sesi berakhir. Silakan masuk lagi.", tone: "error" });
      return true;
    }
    return false;
  }, []);

  const loadNotifs = React.useCallback(async () => {
    try {
      const r = await fieldApi.notifications();
      setNotifs(r.items);
      setNotifUnread(r.unread);
    } catch {
      /* silent */
    }
  }, []);

  const markNotif = React.useCallback(async (id: number) => {
    setNotifs(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
    setNotifUnread(u => Math.max(0, u - 1));
    try {
      const r = await fieldApi.markNotifRead(id);
      setNotifUnread(r.unread);
    } catch {
      loadNotifs();
    }
  }, [loadNotifs]);

  const markAllNotifs = React.useCallback(async () => {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    setNotifUnread(0);
    try {
      await fieldApi.markAllNotifsRead();
    } catch {
      loadNotifs();
    }
  }, [loadNotifs]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [a, act] = await Promise.all([fieldApi.getAssets(), fieldApi.getActivity()]);
      setAssets(a);
      setActivity(act);
      loadNotifs();
    } catch (e: any) {
      if (!handleAuthError(e)) setToast({ msg: e?.message || "Gagal memuat data.", tone: "error" });
    } finally {
      setLoading(false);
    }
  }, [handleAuthError, loadNotifs]);

  const refreshOutbox = React.useCallback(async () => {
    setOutbox(await listCommits());
    setSyncing(isSyncing());
  }, []);

  const doSync = React.useCallback(
    async (opts?: { force?: boolean }) => {
      const res = await syncAll(opts);
      if (res.synced > 0 || res.conflicts > 0) await load();
      if (res.conflicts > 0) setToast({ msg: `${res.conflicts} perubahan konflik. Buka Sinkronisasi.`, tone: "error" });
      else if (res.synced > 0) setToast({ msg: `${res.synced} perubahan tersinkron.`, tone: "success" });
      return res;
    },
    [load]
  );

  // Boot: apply the saved glove/outdoor preference.
  React.useEffect(() => {
    if (localStorage.getItem("field_glove") === "1") document.documentElement.classList.add("glove");
  }, []);

  // Boot: resume session if a token exists.
  React.useEffect(() => {
    (async () => {
      if (getToken()) {
        try {
          setUser(await fieldApi.me());
        } catch {
          fieldApi.logout();
        }
      }
      setBooting(false);
    })();
  }, []);

  // Outbox subscription
  React.useEffect(() => {
    refreshOutbox();
    return outboxSubscribe(refreshOutbox);
  }, [refreshOutbox]);

  // On login: load data, then flush any queued commits.
  React.useEffect(() => {
    if (user) load().then(() => doSync());
  }, [user, load, doSync]);

  // Poll notifications every 60s while logged in.
  React.useEffect(() => {
    if (!user) return;
    const t = setInterval(() => loadNotifs(), 60000);
    return () => clearInterval(t);
  }, [user, loadNotifs]);

  // Connectivity: flush the outbox the moment we're back online.
  React.useEffect(() => {
    const on = () => {
      setOnline(true);
      doSync();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [doSync]);

  const pendingByAsset = React.useMemo(() => {
    const m = new Map<string, CommitRecord>();
    for (const c of outbox) if (!m.has(c.assetId)) m.set(c.assetId, c);
    return m;
  }, [outbox]);

  const signIn = (u: AuthUser) => {
    setStack([{ t: "home" }]);
    setUser(u);
  };
  const signOut = () => {
    fieldApi.logout();
    setStack([{ t: "home" }]);
    setUser(null);
  };

  if (booting) return <div className="grid min-h-dvh place-items-center"><Spinner label="Memuat…" /></div>;
  if (!user) return <FieldLogin onLogin={signIn} />;

  const detailAsset =
    view.t === "detail" || view.t === "action" || view.t === "install" || view.t === "assign" ? assets.find(a => a.id === view.id) : undefined;

  const TABS: { t: "home" | "scan" | "sync" | "profile"; label: string; icon: React.ReactNode; badge?: number }[] = [
    { t: "home", label: "Tugas", icon: <HomeIcon className="h-5 w-5" /> },
    { t: "scan", label: "Scan", icon: <QrCode className="h-5 w-5" /> },
    { t: "sync", label: "Sinkron", icon: <RefreshCcw className="h-5 w-5" />, badge: outbox.length },
    { t: "profile", label: "Profil", icon: <User className="h-5 w-5" /> }
  ];

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[#141d31] bg-[#080c17]/90 px-4 py-2.5 backdrop-blur">
        <Brand compact />
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${online ? "text-emerald-400" : "text-amber-400"}`}>
            {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {online ? "Online" : "Offline"}
          </div>
          <button onClick={() => push({ t: "notif" })} aria-label="Notifikasi" className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[#1e2b45] bg-[#0f1728] text-slate-300 active:scale-95">
            <Bell className="h-4.5 w-4.5" />
            {notifUnread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-[#080c17] bg-rose-500 px-1 text-[10px] font-extrabold text-white">
                {notifUnread > 9 ? "9+" : notifUnread}
              </span>
            )}
          </button>
        </div>
      </div>

      <main className="flex-1">
        {view.t === "home" && (
          <Home assets={assets} user={user} loading={loading} pendingIds={new Set(pendingByAsset.keys())} onOpen={id => push({ t: "detail", id })} onRefresh={load} />
        )}
        {view.t === "scan" && <Scanner assets={assets} onOpen={id => push({ t: "detail", id })} />}
        {view.t === "sync" && (
          <SyncCenter
            items={outbox}
            online={online}
            syncing={syncing}
            onSyncNow={() => doSync()}
            onRetry={id => doSync({ force: true }).then(() => void id)}
            onDiscard={id => discardCommit(id).then(load)}
          />
        )}
        {view.t === "profile" && <Profile user={user} online={online} onLogout={signOut} />}
        {view.t === "detail" &&
          (detailAsset ? (
            <AssetDetail
              asset={detailAsset}
              user={user}
              activity={activity}
              pending={pendingByAsset.get(detailAsset.id)}
              onBack={pop}
              onAction={target => push({ t: "action", id: detailAsset.id, target })}
              onInstallTask={() => push({ t: "install", id: detailAsset.id })}
              onAssign={() => push({ t: "assign", id: detailAsset.id })}
              onOpenSync={() => goTab("sync")}
            />
          ) : (
            <NotFound onBack={pop} />
          ))}
        {view.t === "action" &&
          (detailAsset ? (
            <ActionScreen
              asset={detailAsset}
              target={view.target}
              user={user}
              online={online}
              onBack={pop}
              onQueued={offline => {
                setToast({ msg: offline ? "Disimpan offline — terkirim saat online." : "Perubahan diantre & dikirim…", tone: offline ? "info" : "success" });
                pop();
                doSync();
              }}
            />
          ) : (
            <NotFound onBack={pop} />
          ))}
        {view.t === "install" &&
          (() => {
            const task = detailAsset ? myInstallTask(detailAsset, user.id) : null;
            return detailAsset && task ? (
              <InstallTask
                asset={detailAsset}
                task={task}
                user={user}
                online={online}
                onBack={pop}
                onQueued={offline => {
                  setToast({ msg: offline ? "Disimpan offline — terkirim saat online." : "Laporan diantre & dikirim…", tone: offline ? "info" : "success" });
                  pop();
                  doSync();
                }}
              />
            ) : (
              <NotFound onBack={pop} />
            );
          })()}
        {view.t === "assign" &&
          (detailAsset && canAssignInstall(detailAsset, user) ? (
            <AssignTask asset={detailAsset} user={user} online={online} onBack={pop} onDone={async () => { setToast({ msg: "Penugasan tersimpan.", tone: "success" }); pop(); await load(); }} />
          ) : (
            <NotFound onBack={pop} />
          ))}
        {view.t === "notif" && <Notifications items={notifs} onBack={pop} onRead={markNotif} onReadAll={markAllNotifs} onOpen={id => { pop(); push({ t: "detail", id }); }} />}
      </main>

      <nav className="sticky bottom-0 z-30 grid grid-cols-4 border-t border-[#141d31] bg-[#080c17]/95 backdrop-blur">
        {TABS.map(tab => {
          const active = view.t === tab.t;
          return (
            <button
              key={tab.t}
              onClick={() => goTab(tab.t)}
              className={`tap relative flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold transition ${active ? "text-[#4d8bff]" : "text-slate-500"}`}
            >
              <span className="relative">
                {tab.icon}
                {!!tab.badge && tab.badge > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#ffcd00] px-1 text-[9px] font-black text-[#1a1300]">{tab.badge}</span>
                )}
              </span>
              {tab.label}
            </button>
          );
        })}
      </nav>

      {toast && <Toast msg={toast.msg} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  );
}

function Profile({ user, online, onLogout }: { user: AuthUser; online: boolean; onLogout: () => void }) {
  const [glove, setGlove] = React.useState(() => document.documentElement.classList.contains("glove"));
  const toggleGlove = () => {
    const v = !glove;
    setGlove(v);
    document.documentElement.classList.toggle("glove", v);
    localStorage.setItem("field_glove", v ? "1" : "0");
  };
  return (
    <div className="flex flex-col gap-4 px-4 pb-28 pt-4">
      <div className="flex items-center gap-4 rounded-2xl border border-[#1e2b45] bg-[#0f1728] p-4">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-[#4d8bff]/15 text-xl font-black text-[#8fb4ff]">{user.name.slice(0, 1).toUpperCase()}</div>
        <div>
          <div className="text-lg font-bold text-white">{user.name}</div>
          <div className="text-sm text-slate-400">@{user.username}</div>
          <div className="mt-1 inline-flex rounded-full bg-slate-700/50 px-2 py-0.5 text-[11px] font-semibold text-slate-300">{ROLE_SHORT[user.role] || user.role}</div>
        </div>
      </div>

      <label className="flex items-center justify-between rounded-2xl border border-[#1e2b45] bg-[#0f1728] px-4 py-3.5">
        <span className="pr-3">
          <span className="block text-sm font-semibold text-slate-100">Mode Sarung Tangan / Outdoor</span>
          <span className="block text-xs text-slate-500">Teks & tombol lebih besar, kontras tinggi.</span>
        </span>
        <button
          type="button"
          onClick={toggleGlove}
          aria-pressed={glove}
          aria-label="Mode sarung tangan"
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${glove ? "bg-emerald-500" : "bg-slate-600"}`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${glove ? "left-6" : "left-1"}`} />
        </button>
      </label>

      <div className="flex flex-col gap-2 rounded-2xl border border-[#1e2b45] bg-[#0f1728] p-4 text-sm">
        <div className="flex items-center justify-between"><span className="text-slate-400">Koneksi</span><span className={online ? "text-emerald-400" : "text-amber-400"}>{online ? "Online" : "Offline"}</span></div>
        <div className="flex items-center justify-between"><span className="text-slate-400">Versi</span><span className="font-mono text-slate-300">Field v1 · Fase 5</span></div>
      </div>
      <button onClick={onLogout} className="tap flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 text-base font-bold text-rose-300 active:scale-[0.98]"><LogOut className="h-5 w-5" /> Keluar</button>
    </div>
  );
}

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
      <p className="text-slate-300">Aset tidak ditemukan atau sudah berubah.</p>
      <button onClick={onBack} className="tap flex items-center gap-2 rounded-xl bg-[#4d8bff] px-5 font-bold text-white"><RefreshCw className="h-4 w-4" /> Kembali</button>
    </div>
  );
}
