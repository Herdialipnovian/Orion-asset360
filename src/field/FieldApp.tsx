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
import { Bell, MapPinPlus } from "lucide-react";
import { fieldApi, getToken, apiBase, type AuthUser, type NotifItem, ApiError } from "./fieldApi";
import { subscribe as outboxSubscribe, listCommits, syncAll, isSyncing, discardCommit, type CommitRecord } from "./outbox";
import { ROLE_SHORT, Spinner, Toast, Brand } from "./ui";
import FieldLogin from "./components/FieldLogin";
import Home from "./components/Home";
import Scanner from "./components/Scanner";
import AssetDetail from "./components/AssetDetail";
import ActionScreen from "./components/ActionScreen";
import InstallTask from "./components/InstallTask";
import AssignTask from "./components/AssignTask";
import PlacementTask from "./components/PlacementTask";
import VenueTask from "./components/VenueTask";
import AddLocation from "./components/AddLocation";
import Notifications from "./components/Notifications";
import SyncCenter from "./components/SyncCenter";
import { myInstallTask, myPlacementTasks, canAssignInstall, canDeployVenue } from "./lifecycle";

type View =
  | { t: "home" }
  | { t: "scan" }
  | { t: "sync" }
  | { t: "profile" }
  | { t: "detail"; id: string }
  | { t: "action"; id: string; target: number }
  | { t: "install"; id: string }
  | { t: "assign"; id: string }
  | { t: "placement"; id: string }
  | { t: "venue"; id: string }
  | { t: "addloc" }
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
      if (res.conflicts > 0) setToast({ msg: `${res.conflicts} perubahan mengalami konflik. Silakan buka menu Sinkronisasi.`, tone: "error" });
      else if (res.synced > 0) setToast({ msg: `${res.synced} perubahan berhasil disinkronkan.`, tone: "success" });
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

  // Poll notifications every 60s while logged in (fallback if SSE is down).
  React.useEffect(() => {
    if (!user) return;
    const t = setInterval(() => loadNotifs(), 60000);
    return () => clearInterval(t);
  }, [user, loadNotifs]);

  // Live updates (SSE), hardened for mobile: reconnect on network change + when the
  // app returns to the foreground (WebViews suspend background connections), and a
  // fresh "hello" on (re)connect re-syncs anything missed. Closed while offline to
  // avoid retry churn; the outbox + poll cover the offline window.
  const [sseLive, setSseLive] = React.useState(false);
  React.useEffect(() => {
    if (!user) return;
    let es: EventSource | null = null;
    let rT: ReturnType<typeof setTimeout> | null = null;
    const debouncedLoad = () => {
      if (rT) clearTimeout(rT);
      rT = setTimeout(() => load(), 400);
    };
    const connect = () => {
      if (es && es.readyState !== 2) return; // already open/connecting
      if (es) es.close();
      const token = getToken();
      if (!token || !navigator.onLine) return;
      es = new EventSource(`${apiBase()}/api/events?token=${encodeURIComponent(token)}`);
      es.addEventListener("hello", () => {
        setSseLive(true);
        debouncedLoad();
      });
      es.addEventListener("asset", debouncedLoad);
      es.addEventListener("notif", () => loadNotifs());
      es.onopen = () => setSseLive(true);
      es.onerror = () => setSseLive(false); // EventSource retries; foreground/online forces a fresh one
    };
    const disconnect = () => {
      if (es) es.close();
      es = null;
      setSseLive(false);
    };
    connect();
    const onOnline = () => connect();
    const onOffline = () => disconnect();
    const onVis = () => {
      if (document.visibilityState === "visible") {
        connect();
        debouncedLoad(); // catch up after being backgrounded
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (rT) clearTimeout(rT);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVis);
      disconnect();
    };
  }, [user, load, loadNotifs]);

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

  // Coarse whole-asset lock — ONLY for stage transitions / install (a placement is per-toko,
  // so a queued placement must not lock the whole asset or its sibling toko).
  const pendingByAsset = React.useMemo(() => {
    const m = new Map<string, CommitRecord>();
    for (const c of outbox) if (c.kind !== "placement" && !m.has(c.assetId)) m.set(c.assetId, c);
    return m;
  }, [outbox]);
  // Per-toko pending placements: assetId -> set of locationIds already queued (offline).
  const pendingPlacements = React.useMemo(() => {
    const m = new Map<string, Set<number>>();
    for (const c of outbox) {
      if (c.kind !== "placement" || c.locationId == null) continue;
      if (!m.has(c.assetId)) m.set(c.assetId, new Set());
      m.get(c.assetId)!.add(Number(c.locationId));
    }
    return m;
  }, [outbox]);
  const noPend = React.useMemo(() => new Set<number>(), []);

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
    view.t === "detail" || view.t === "action" || view.t === "install" || view.t === "assign" || view.t === "placement" || view.t === "venue" ? assets.find(a => a.id === view.id) : undefined;

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
            {online ? (sseLive ? "Live" : "Online") : "Offline"}
            {online && sseLive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          </div>
          <button onClick={() => push({ t: "addloc" })} aria-label="Tambah Toko/Venue" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1e2b45] bg-[#0f1728] text-slate-300 active:scale-95">
            <MapPinPlus className="h-4.5 w-4.5" />
          </button>
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
          <Home assets={assets} user={user} loading={loading} pendingIds={new Set(pendingByAsset.keys())} pendingPlacements={pendingPlacements} onOpen={id => push({ t: "detail", id })} onRefresh={load} />
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
              pendingLocs={pendingPlacements.get(detailAsset.id) || noPend}
              onBack={pop}
              onAction={target => push({ t: "action", id: detailAsset.id, target })}
              onInstallTask={() => push({ t: "install", id: detailAsset.id })}
              onAssign={() => push({ t: "assign", id: detailAsset.id })}
              onPlacement={() => push({ t: "placement", id: detailAsset.id })}
              onVenue={() => push({ t: "venue", id: detailAsset.id })}
              onArriveVenue={async () => {
                if (!online) { setToast({ msg: "Perlu koneksi internet untuk mengonfirmasi kedatangan.", tone: "error" }); return; }
                try { await fieldApi.arriveVenue(detailAsset.id); setToast({ msg: "Kedatangan di lokasi berhasil dikonfirmasi.", tone: "success" }); await load(); }
                catch (e: any) { setToast({ msg: e?.message || "Gagal mengonfirmasi kedatangan.", tone: "error" }); }
              }}
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
                setToast({ msg: offline ? "Tersimpan offline — akan terkirim saat kembali online." : "Perubahan diantre dan sedang dikirim…", tone: offline ? "info" : "success" });
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
                  setToast({ msg: offline ? "Tersimpan offline — akan terkirim saat kembali online." : "Laporan diantre dan sedang dikirim…", tone: offline ? "info" : "success" });
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
            <AssignTask asset={detailAsset} user={user} online={online} onBack={pop} onDone={async () => { setToast({ msg: "Penugasan berhasil disimpan.", tone: "success" }); pop(); await load(); }} />
          ) : (
            <NotFound onBack={pop} />
          ))}
        {view.t === "venue" &&
          (detailAsset && canDeployVenue(detailAsset, user) ? (
            <VenueTask asset={detailAsset} user={user} online={online} onBack={pop} onDone={async () => { setToast({ msg: "Aset dikirim ke lokasi — konfirmasi \"Kedatangan di Lokasi\" saat tiba di tujuan.", tone: "success" }); pop(); await load(); }} />
          ) : (
            <NotFound onBack={pop} />
          ))}
        {view.t === "placement" &&
          (() => {
            const pl = detailAsset ? pendingPlacements.get(detailAsset.id) || noPend : noPend;
            const tasks = detailAsset ? myPlacementTasks(detailAsset, user.id).filter(t => !pl.has(t.locationId)) : [];
            return detailAsset && tasks.length ? (
              <PlacementTask
                asset={detailAsset}
                tasks={tasks}
                user={user}
                online={online}
                onBack={pop}
                onQueued={offline => {
                  setToast({ msg: offline ? "Tersimpan offline — akan terkirim saat kembali online." : "Laporan diantre dan sedang dikirim…", tone: offline ? "info" : "success" });
                  pop();
                  doSync();
                }}
              />
            ) : (
              <NotFound onBack={pop} />
            );
          })()}
        {view.t === "notif" && <Notifications items={notifs} onBack={pop} onRead={markNotif} onReadAll={markAllNotifs} onOpen={id => { pop(); push({ t: "detail", id }); }} />}
        {view.t === "addloc" && <AddLocation user={user} online={online} onBack={pop} onAdded={name => { setToast({ msg: `${name} berhasil ditambahkan ke data master.`, tone: "success" }); pop(); }} />}
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
          <span className="block text-xs text-slate-500">Teks dan tombol lebih besar dengan kontras tinggi.</span>
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
