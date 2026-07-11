/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * In-app notification bell (poll-based). Shows an unread badge; the dropdown lists
 * recent notifications, marks one read on tap, and can mark all read.
 */
import React from "react";
import { Bell, CheckCheck, X, Wrench, ClipboardCheck } from "lucide-react";
import { api, type NotifItem } from "../api";

const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)}m lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)}j lalu`;
  return `${Math.floor(s / 86400)}h lalu`;
};

export default function NotificationBell() {
  const [items, setItems] = React.useState<NotifItem[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  const load = React.useCallback(async () => {
    try {
      const r = await api.getNotifications();
      setItems(r.items);
      setUnread(r.unread);
    } catch {
      /* silent — polling */
    }
  }, []);

  React.useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const markRead = async (n: NotifItem) => {
    if (n.read) return;
    setItems(prev => prev.map(x => (x.id === n.id ? { ...x, read: true } : x)));
    setUnread(u => Math.max(0, u - 1));
    try {
      const r = await api.markNotificationRead(n.id);
      setUnread(r.unread);
    } catch {
      load();
    }
  };
  const markAll = async () => {
    setItems(prev => prev.map(x => ({ ...x, read: true })));
    setUnread(0);
    try {
      await api.markAllNotificationsRead();
    } catch {
      load();
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Notifikasi"
        className="relative flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-blue-600 hover:border-blue-300 transition"
      >
        <Bell className="h-4.5 w-4.5" />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-rose-500 text-white text-[10px] font-extrabold border-2 border-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[92vw] bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
            <span className="text-xs font-extrabold text-slate-700">Notifikasi</span>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button onClick={markAll} title="Tandai semua dibaca" className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700 px-1.5 py-0.5 rounded">
                  <CheckCheck className="h-3.5 w-3.5" /> Semua
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 p-0.5 rounded">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">Belum ada notifikasi.</div>
            ) : (
              items.map(n => {
                const Icon = n.type === "install_assigned" ? Wrench : ClipboardCheck;
                return (
                  <button
                    key={n.id}
                    onClick={() => markRead(n)}
                    className={`w-full flex items-start gap-2.5 px-4 py-2.5 text-left transition hover:bg-slate-50 ${n.read ? "opacity-60" : "bg-blue-50/40"}`}
                  >
                    <span className={`mt-0.5 h-6 w-6 shrink-0 grid place-items-center rounded-lg ${n.read ? "bg-slate-100 text-slate-400" : "bg-blue-100 text-blue-600"}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-800 truncate">{n.title}</span>
                        {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />}
                      </span>
                      {n.body && <span className="block text-[10.5px] text-slate-500 leading-snug">{n.body}</span>}
                      <span className="block text-[9px] text-slate-400 mt-0.5">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
