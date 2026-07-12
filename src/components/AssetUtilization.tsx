/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Inovasi #4 — Riwayat & Utilisasi Aset. Analitik pemanfaatan: 1 aset dipakai berapa
 * deployment (event/toko/serah-terima), umur pakai, dan nilai buku (depresiasi garis-lurus).
 * Deploy-count diambil dari activity-log PENUH (server), jadi tetap terhitung walau legs/
 * placements ditimpa saat aset dipakai ulang. Nilai buku dihitung di sini dari tglBeli +
 * harga beli + setting depresiasi/umur ekonomis (aset milik Origin; aset klien tak disusutkan).
 */
import React from "react";
import { Recycle, TrendingDown, CalendarClock, Activity, Boxes, Wallet } from "lucide-react";
import type { Asset } from "../types";
import { api } from "../api";

type Util = { assetId: string; deployments: number; movements: number; lastActiveAt: string | null };

const rupiah = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");
const monthsBetween = (iso?: string | null) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (Date.now() - t) / (1000 * 60 * 60 * 24 * 30.4375));
};
const ageLabel = (m: number | null) => {
  if (m == null) return "—";
  const yrs = Math.floor(m / 12);
  const mos = Math.round(m % 12);
  if (yrs <= 0) return `${mos} bln`;
  return mos ? `${yrs} thn ${mos} bln` : `${yrs} thn`;
};
const dateLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export default function AssetUtilization({
  assets,
  settings,
  selectedClient
}: {
  assets: Asset[];
  settings: Record<string, string>;
  selectedClient?: string;
}) {
  const [util, setUtil] = React.useState<Record<string, Util>>({});
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [sortKey, setSortKey] = React.useState<"deployments" | "age" | "book">("deployments");

  React.useEffect(() => {
    let live = true;
    setLoading(true);
    api.getUtilization()
      .then(rows => { if (live) { setUtil(Object.fromEntries(rows.map(r => [r.assetId, r]))); setErr(null); } })
      .catch(e => { if (live) setErr(e?.message || "Gagal memuat data utilisasi aset. Silakan coba lagi."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  // Finite-number guards so a legit 0 (e.g. 0% residual scrap) is NOT clobbered by a default.
  const numSetting = (raw: string | undefined, def: number) => (raw != null && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : def);
  const deprPct = Math.min(100, Math.max(0, numSetting(settings?.depreciation_pct, 15)));
  const lifeMonths = Math.max(1, numSetting(settings?.useful_life_months, 60));

  const rows = React.useMemo(() => {
    // Utilisasi berlaku untuk aset reusable (bukan consumable habis-pakai); tampilkan semua
    // aset deployment + internal, kecuali yang sudah disposal (Fase 10).
    let list = assets.filter(a => a.currentStage !== 10);
    if (selectedClient && selectedClient !== "ALL") list = list.filter(a => a.client === selectedClient);
    return list.map(a => {
      const u = util[a.id] || { assetId: a.id, deployments: 0, movements: 0, lastActiveAt: null };
      const ageM = monthsBetween(a.tglBeli || a.createdAt);
      const cost = Number(a.financials?.purchaseCost) || 0;
      const isOrigin = (a.owner || "Origin") !== "Client";
      const scrap = cost * (deprPct / 100);
      let book: number | null = null;
      let depreciated = 0;
      if (isOrigin && cost > 0 && ageM != null) {
        const ratio = Math.min(1, ageM / lifeMonths);
        book = Math.max(scrap, cost - (cost - scrap) * ratio);
        depreciated = cost - book;
      }
      const perYear = ageM && ageM > 0.5 ? u.deployments / (ageM / 12) : null;
      return { a, u, ageM, cost, isOrigin, book, depreciated, perYear };
    }).sort((x, y) => {
      if (sortKey === "deployments") return y.u.deployments - x.u.deployments;
      if (sortKey === "age") return (y.ageM ?? -1) - (x.ageM ?? -1);
      return (y.book ?? -1) - (x.book ?? -1);
    });
  }, [assets, util, selectedClient, deprPct, lifeMonths, sortKey]);

  const totals = React.useMemo(() => {
    const cost = rows.reduce((s, r) => s + (r.isOrigin ? r.cost : 0), 0);
    const book = rows.reduce((s, r) => s + (r.book ?? 0), 0);
    const depr = rows.reduce((s, r) => s + r.depreciated, 0);
    const deploys = rows.reduce((s, r) => s + r.u.deployments, 0);
    const active = rows.filter(r => r.u.deployments > 0).length;
    return { cost, book, depr, deploys, active, count: rows.length };
  }, [rows]);

  const cards = [
    { label: "Aset dipantau", value: String(totals.count), sub: `${totals.active} aset pernah dipakai`, Icon: Boxes, tone: "text-teal-600" },
    { label: "Total penerjunan", value: String(totals.deploys), sub: "event, toko, dan serah-terima", Icon: Activity, tone: "text-blue-600" },
    { label: "Nilai perolehan", value: rupiah(totals.cost), sub: "harga beli aset Origin", Icon: Wallet, tone: "text-slate-600" },
    { label: "Nilai buku kini", value: rupiah(totals.book), sub: `penyusutan ${rupiah(totals.depr)}`, Icon: TrendingDown, tone: "text-amber-600" }
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2"><Recycle className="h-5 w-5 text-teal-600" /> Riwayat &amp; Utilisasi Aset</h2>
          <p className="text-xs text-slate-500 mt-0.5">Berapa kali tiap aset dipakai, umur pakainya, serta nilai bukunya (depresiasi garis lurus selama {lifeMonths} bulan, dengan nilai sisa {deprPct}%).</p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-slate-400 font-semibold">Urutkan:</span>
          {([["deployments", "Paling sering dipakai"], ["age", "Tertua"], ["book", "Nilai buku"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setSortKey(k)} className={`px-2.5 py-1 rounded-md font-bold border transition ${sortKey === k ? "bg-teal-600 text-white border-teal-600" : "bg-white text-slate-500 border-slate-200 hover:border-teal-300"}`}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">{c.label}</span>
              <c.Icon className={`h-4 w-4 ${c.tone}`} />
            </div>
            <div className="text-xl font-extrabold text-slate-900 mt-1 tabular-nums">{c.value}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      {err && <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold">{err}</div>}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-left">
                <th className="font-extrabold px-3 py-2.5">Aset</th>
                <th className="font-extrabold px-3 py-2.5">Pemilik</th>
                <th className="font-extrabold px-3 py-2.5"><span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Umur</span></th>
                <th className="font-extrabold px-3 py-2.5 text-right">Penerjunan</th>
                <th className="font-extrabold px-3 py-2.5 text-right">Penerjunan/thn</th>
                <th className="font-extrabold px-3 py-2.5 text-right">Aktivitas</th>
                <th className="font-extrabold px-3 py-2.5">Terakhir Aktif</th>
                <th className="font-extrabold px-3 py-2.5 text-right">Nilai perolehan</th>
                <th className="font-extrabold px-3 py-2.5 text-right">Nilai buku</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">Memuat data utilisasi…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">Belum ada aset yang dapat dianalisis.</td></tr>
              ) : rows.map(({ a, u, ageM, cost, isOrigin, book, depreciated, perYear }) => (
                <tr key={a.id} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2.5">
                    <div className="font-bold text-slate-800">{a.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{a.id}{a.client ? ` · ${a.client}` : ""}</div>
                  </td>
                  <td className="px-3 py-2.5"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isOrigin ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"}`}>{isOrigin ? "Origin" : "Client"}</span></td>
                  <td className="px-3 py-2.5 text-slate-600">{ageLabel(ageM)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-extrabold text-slate-800">{u.deployments}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{perYear != null ? perYear.toFixed(1) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{u.movements}</td>
                  <td className="px-3 py-2.5 text-slate-500">{dateLabel(u.lastActiveAt)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{cost > 0 ? rupiah(cost) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {book == null ? <span className="text-slate-300">—</span> : (
                      <span className="font-bold text-slate-800">{rupiah(book)}<span className="block text-[10px] font-normal text-amber-600">−{rupiah(depreciated)}</span></span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-slate-400">Penerjunan adalah jumlah kali aset dikerahkan, baik untuk distribusi toko, setup Venue, maupun serah-terima internal, yang dihitung dari log lengkap. Aktivitas adalah jumlah laporan lapangan, seperti relokasi dan pemasangan. Nilai buku aset Client tidak disusutkan oleh Origin.</p>
    </div>
  );
}
