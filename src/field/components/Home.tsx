/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
import { Search, ChevronRight, ClipboardList, Boxes, RefreshCw, Clock } from "lucide-react";
import type { Asset } from "../../types";
import type { AuthUser } from "../fieldApi";
import { eligibleActions, myInstallTask, myPlacementTasks, canDeployVenue } from "../lifecycle";
import { StageBadge, EmptyState, Spinner, ROLE_SHORT } from "../ui";

// Inner content of an asset row (kept as a helper so `key` sits on the
// intrinsic <button>, matching the CMS pattern — custom-component keys trip
// this project's JSX typing since @types/react isn't a direct dep).
function rowInner(a: Asset, action?: string, pending?: boolean) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-white">{a.name}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
          <span className="font-mono text-slate-300">{a.id}</span>
          <span className="text-slate-600">·</span>
          <span className="truncate">{a.client}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StageBadge stage={a.currentStage} size="sm" />
          {pending && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300"><Clock className="h-3 w-3" /> menunggu sinkron</span>}
          {action && !pending && <span className="rounded-full bg-[#4d8bff]/15 px-2 py-0.5 text-[11px] font-semibold text-[#8fb4ff]">{action}</span>}
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" />
    </>
  );
}

const ROW_CLASS = "tap flex w-full items-center gap-3 rounded-2xl border border-[#1e2b45] bg-[#0f1728] px-4 py-3 text-left transition active:scale-[0.99]";

export default function Home({
  assets,
  user,
  loading,
  pendingIds,
  pendingPlacements,
  onOpen,
  onRefresh
}: {
  assets: Asset[];
  user: AuthUser;
  loading: boolean;
  pendingIds: Set<string>;
  pendingPlacements?: Map<string, Set<number>>;
  onOpen: (id: string) => void;
  onRefresh: () => void;
}) {
  const [qStr, setQStr] = React.useState("");

  const tasks = React.useMemo(
    () =>
      assets
        .map(a => {
          const actions = eligibleActions(a.currentStage, user.role, a);
          const it = myInstallTask(a, user.id);
          const labels = [] as string[];
          if (it) labels.push(`Pasang ${it.remaining} unit`);
          const pl = pendingPlacements?.get(a.id);
          myPlacementTasks(a, user.id)
            .filter(p => !pl?.has(p.locationId))
            .forEach(p => labels.push(`Pasang di ${p.toko} (${p.remaining} unit)`));
          if (canDeployVenue(a, user)) labels.push("Kirim ke Lokasi Berikutnya");
          labels.push(...actions.map(x => x.verb));
          return { a, labels };
        })
        .filter(x => x.labels.length > 0 && !pendingIds.has(x.a.id)),
    [assets, user.role, user.id, pendingIds, pendingPlacements]
  );

  const query = qStr.trim().toLowerCase();
  const searchResults = React.useMemo(() => {
    if (!query) return [] as Asset[];
    return assets.filter(
      a => a.id.toLowerCase().includes(query) || a.name.toLowerCase().includes(query) || (a.client || "").toLowerCase().includes(query)
    );
  }, [assets, query]);

  return (
    <div className="flex flex-col gap-5 px-4 pb-28 pt-3">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-400">Halo,</div>
          <div className="text-lg font-bold text-white">{user.name}</div>
          <div className="mt-1 inline-flex rounded-full bg-slate-700/50 px-2 py-0.5 text-[11px] font-semibold text-slate-300">{ROLE_SHORT[user.role] || user.role}</div>
        </div>
        <button onClick={onRefresh} aria-label="Muat ulang" className="tap flex w-12 items-center justify-center rounded-xl border border-[#1e2b45] bg-[#0f1728] text-slate-300 active:scale-95">
          <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={qStr}
          onChange={e => setQStr(e.target.value)}
          placeholder="Cari Asset ID, nama, atau client…"
          autoCapitalize="none"
          className="tap w-full rounded-xl border border-[#1e2b45] bg-[#0f1728] pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[#4d8bff]"
        />
      </div>

      {query ? (
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <Boxes className="h-4 w-4" /> Hasil pencarian ({searchResults.length})
          </h2>
          {searchResults.length === 0 ? (
            <EmptyState title="Tidak ada aset yang cocok" hint="Coba cari dengan Asset ID atau nama lain." />
          ) : (
            searchResults.map(a => (
              <button key={a.id} onClick={() => onOpen(a.id)} className={ROW_CLASS}>
                {rowInner(a, undefined, pendingIds.has(a.id))}
              </button>
            ))
          )}
        </section>
      ) : (
        <section className="flex flex-col gap-2.5">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <ClipboardList className="h-4 w-4" /> Tugas Saya ({tasks.length})
          </h2>
          {loading && assets.length === 0 ? (
            <Spinner label="Memuat aset…" />
          ) : tasks.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="h-8 w-8" />}
              title="Belum ada tugas untuk role Anda"
              hint={`Sebagai ${ROLE_SHORT[user.role] || user.role}, aksi lapangan akan muncul di sini saat ada aset pada fase yang bisa Anda proses. Scan QR aset untuk memulai.`}
            />
          ) : (
            tasks.map(({ a, labels }) => (
              <button key={a.id} onClick={() => onOpen(a.id)} className={ROW_CLASS}>
                {rowInner(a, labels.join(" / "))}
              </button>
            ))
          )}
        </section>
      )}
    </div>
  );
}
