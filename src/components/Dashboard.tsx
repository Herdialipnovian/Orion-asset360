/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  Boxes,
  CheckCircle,
  Warehouse,
  Wrench,
  Wallet,
  Bell,
  Calendar,
  Info,
  ArrowRight,
  Activity,
  AlertTriangle,
  ClipboardList,
  Settings,
  Home,
  Truck,
  MapPin,
  Compass,
  ShieldCheck,
  CornerUpLeft,
  Trash2,
  TrendingUp,
  Users
} from "lucide-react";
import { faseNo } from "../faseDisplay";
import { Asset, ActivityLog } from "../types";
import type { AuthUser } from "../api";

interface DashboardProps {
  assets: Asset[];
  activityLogs: ActivityLog[];
  selectedClient: string;
  user: AuthUser;
  settings: Record<string, string>;
  onNavigateToStage: (stageIndex: number) => void;
  onNavigateToTab: (tabName: string) => void;
}

// Per-stage presentation metadata (label / donut hex / bar class / icon)
const STAGE_META: { [k: number]: { label: string; hex: string; bar: string; icon: any } } = {
  // Fase 1 (Request) & 2 (Produksi) removed from the flow — assets start in Gudang (Fase 3).
  3: { label: "Gudang", hex: "#16a34a", bar: "bg-green-500", icon: Home },
  4: { label: "Kirim", hex: "#ea580c", bar: "bg-orange-500", icon: Truck },
  5: { label: "Transit", hex: "#d97706", bar: "bg-amber-500", icon: MapPin },
  6: { label: "Pasang", hex: "#4f46e5", bar: "bg-indigo-500", icon: Compass },
  7: { label: "Audit", hex: "#db2777", bar: "bg-pink-500", icon: ShieldCheck },
  8: { label: "Maint.", hex: "#e11d48", bar: "bg-rose-500", icon: Wrench },
  9: { label: "Tarik", hex: "#0891b2", bar: "bg-cyan-500", icon: CornerUpLeft },
  10: { label: "Disposal", hex: "#475569", bar: "bg-slate-500", icon: Trash2 }
};

const DIST_PALETTE = ["#4f46e5", "#0d9488", "#2563eb", "#db2777", "#ea580c", "#16a34a", "#8b5cf6", "#d97706"];

const rupiah = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

const rupiahShort = (v: number) => {
  if (v >= 1e9) return `Rp ${(v / 1e9).toFixed(1).replace(".0", "")} M`;
  if (v >= 1e6) return `Rp ${(v / 1e6).toFixed(1).replace(".0", "")} jt`;
  if (v >= 1e3) return `Rp ${Math.round(v / 1e3)} rb`;
  return rupiah(v);
};

// Shorten long client names for compact labels
const shorten = (name: string, max = 20) => {
  const clean = name.replace(/^PT\s+/i, "").split("(")[0].split(" - ")[0].trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
};

// Human-friendly relative time from an ISO timestamp
function timeAgo(iso: string): { rel: string; clock: string } {
  const d = new Date(iso);
  const then = d.getTime();
  if (isNaN(then)) return { rel: "—", clock: "" };
  const now = Date.now();
  const diff = now - then;
  const day = 86400000;
  const clock = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
  const sameDay = d.toDateString() === new Date().toDateString();
  if (sameDay) return { rel: "Hari ini", clock };
  if (diff < 2 * day) return { rel: "Kemarin", clock };
  if (diff < 7 * day) return { rel: `${Math.floor(diff / day)} hari lalu`, clock };
  return { rel: d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }), clock };
}

export default function Dashboard({
  assets,
  activityLogs,
  selectedClient,
  user,
  settings,
  onNavigateToStage,
  onNavigateToTab
}: DashboardProps) {
  const slaTarget = Number(settings.sla_target_pct) || 90;
  // ============================================================
  // All metrics are derived live from the (client-filtered) data
  // ============================================================
  const m = React.useMemo(() => {
    // Deployment dashboard — Internal (custodian) assets are tracked in the Aset Internal menu.
    const pool = assets.filter(a => a.peruntukan !== "Internal");
    const list = selectedClient === "ALL" ? pool : pool.filter(a => a.client === selectedClient);

    const units = (arr: Asset[]) => arr.reduce((s, a) => s + (Number(a.quantity) || 0), 0);
    const byStage: { [k: number]: Asset[] } = {};
    const uByStage: { [k: number]: number } = {};
    for (let i = 1; i <= 10; i++) {
      byStage[i] = list.filter(a => a.currentStage === i);
      uByStage[i] = units(byStage[i]);
    }

    const totalUnits = units(list);
    const activeUnits = units(list.filter(a => a.currentStage !== 10));
    const deployedUnits = uByStage[6] + uByStage[7];
    const warehouseUnits = uByStage[3];
    const maintenanceUnits = uByStage[8];
    const pipelineUnits = uByStage[1] + uByStage[2] + uByStage[4] + uByStage[5];
    const retiredUnits = uByStage[9] + uByStage[10];

    const totalValue = list.reduce((s, a) => s + (a.financials?.purchaseCost || 0), 0);
    const scrapValue = list.reduce((s, a) => s + (a.financials?.disposalValue || 0), 0);

    // Average audit score across assets that have actually been audited (deployed onward)
    const audited = list.filter(a => a.currentStage >= 6 && typeof a.auditScore === "number");
    const avgAudit = audited.length ? Math.round(audited.reduce((s, a) => s + (a.auditScore || 0), 0) / audited.length) : 0;

    // Compliance status breakdown (from the audit checklist result)
    const compliance = { patuh: 0, perlu: 0, tidak: 0, total: 0 };
    for (const a of list) {
      const st = (a.stageDetails as any)?.audit?.complianceStatus;
      if (st === "PATUH") compliance.patuh++;
      else if (st === "PERLU PERBAIKAN") compliance.perlu++;
      else if (st === "TIDAK PATUH") compliance.tidak++;
    }
    compliance.total = compliance.patuh + compliance.perlu + compliance.tidak;

    const base = activeUnits || 1;
    const pct = (n: number) => Math.round((n / base) * 1000) / 10;

    // Donut status buckets (by unit, over total units)
    const tBase = totalUnits || 1;
    const buckets = [
      { name: "Terpasang", units: deployedUnits, hex: "#10b981" },
      { name: "Gudang / Idle", units: warehouseUnits, hex: "#3b82f6" },
      { name: "Dalam Proses", units: pipelineUnits, hex: "#f59e0b" },
      { name: "Maintenance", units: maintenanceUnits, hex: "#e11d48" },
      { name: "Penarikan / Retired", units: retiredUnits, hex: "#64748b" }
    ]
      .filter(b => b.units > 0)
      .map(b => ({ ...b, pct: Math.round((b.units / tBase) * 1000) / 10 }));

    // Per-stage distribution for the bar chart
    const maxStageUnit = Math.max(1, ...Object.values(uByStage));
    const stages = [3, 4, 5, 6, 7, 8, 9, 10].map(s => {
      return { stage: s, ...STAGE_META[s], units: uByStage[s], recs: byStage[s].length, h: Math.round((uByStage[s] / maxStageUnit) * 100) };
    });

    // Operational indicators (all derived)
    const indicators = [
      { name: "Tingkat Deployment", val: pct(deployedUnits), hint: "Unit terpasang / aktif" },
      { name: "Skor Audit Rata-rata", val: avgAudit, hint: `${audited.length} aset teraudit` },
      { name: "Unit Beroperasi Sehat", val: pct(activeUnits - maintenanceUnits), hint: "Di luar maintenance / aktif" },
      { name: "Okupansi Gudang", val: pct(warehouseUnits), hint: "Idle di gudang / aktif" }
    ];

    // Distribution card: per-client (global view) or per-category (client-filtered view)
    const isAll = selectedClient === "ALL";
    const grouped = new Map<string, number>();
    list.forEach(a => {
      const key = isAll ? a.client : a.category;
      grouped.set(key, (grouped.get(key) || 0) + (Number(a.quantity) || 0));
    });
    let distribution = Array.from(grouped.entries())
      .map(([name, u]) => ({ name, units: u }))
      .sort((a, b) => b.units - a.units);
    if (distribution.length > 7) {
      const head = distribution.slice(0, 6);
      const restU = distribution.slice(6).reduce((s, x) => s + x.units, 0);
      distribution = [...head, { name: "Lainnya", units: restU }];
    }
    distribution = distribution.map((d, i) => ({
      ...d,
      pct: Math.round((d.units / tBase) * 1000) / 10,
      hex: DIST_PALETTE[i % DIST_PALETTE.length]
    }));

    // Assets needing attention (for the bell badge)
    const attention = list.filter(
      a => a.currentStage === 8 || a.maintenanceStatus === "REPAIRING" || a.maintenanceStatus === "PENDING" || (typeof a.auditScore === "number" && a.auditScore < 80 && a.currentStage >= 6)
    ).length;

    const logs = [...activityLogs]
      .filter(l => selectedClient === "ALL" || assets.find(a => a.id === l.assetId)?.client === selectedClient)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      records: list.length,
      totalUnits,
      activeUnits,
      deployedUnits,
      warehouseUnits,
      maintenanceUnits,
      maintenanceRecs: byStage[8].length,
      pipelineUnits,
      totalValue,
      scrapValue,
      avgAudit,
      compliance,
      buckets,
      stages,
      indicators,
      distribution,
      distributionTitle: isAll ? "Sebaran Aset per Client" : `Sebaran per Kategori — ${shorten(selectedClient, 24)}`,
      attention,
      logs,
      pct
    };
  }, [assets, activityLogs, selectedClient]);

  const periodLabel = React.useMemo(
    () => "Periode: " + new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
    []
  );

  // KPI cards (all live)
  const kpis = [
    {
      title: "Total Aset Aktif",
      value: m.totalUnits.toLocaleString("id-ID"),
      unit: "unit",
      sub: `${m.records} aset terdaftar · ${m.activeUnits.toLocaleString("id-ID")} unit aktif`,
      color: "text-blue-600 bg-blue-100/50 border-blue-200",
      icon: Boxes,
      nav: () => onNavigateToTab("manager")
    },
    {
      title: "Terpasang di Lokasi",
      value: m.deployedUnits.toLocaleString("id-ID"),
      unit: "unit",
      sub: `${m.pct(m.deployedUnits)}% dari unit aktif`,
      color: "text-emerald-600 bg-emerald-100/50 border-emerald-200",
      icon: CheckCircle,
      nav: () => onNavigateToStage(6)
    },
    {
      title: "Idle / Gudang",
      value: m.warehouseUnits.toLocaleString("id-ID"),
      unit: "unit",
      sub: `${m.pct(m.warehouseUnits)}% siap didistribusi`,
      color: "text-purple-600 bg-purple-100/50 border-purple-200",
      icon: Warehouse,
      nav: () => onNavigateToStage(3)
    },
    {
      title: "Dalam Maintenance",
      value: m.maintenanceUnits.toLocaleString("id-ID"),
      unit: "unit",
      sub: `${m.maintenanceRecs} tiket perbaikan aktif`,
      color: "text-amber-600 bg-amber-100/50 border-amber-200",
      icon: Wrench,
      nav: () => onNavigateToStage(8)
    },
    {
      title: "Total Nilai Aset",
      value: rupiahShort(m.totalValue),
      unit: "",
      sub: `Estimasi sisa scrap ${rupiahShort(m.scrapValue)}`,
      color: "text-indigo-600 bg-indigo-100/50 border-indigo-200",
      icon: Wallet,
      nav: () => onNavigateToTab("manager")
    }
  ];

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">Dashboard</h2>
          <p className="text-slate-400 text-xs mt-0.5">
            Ringkasan performa aset secara real-time
            {selectedClient !== "ALL" && (
              <span className="ml-1 text-blue-500 font-semibold">· {shorten(selectedClient, 30)}</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 shadow-sm">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <span>{periodLabel}</span>
          </div>
          <div className="relative bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
            <Bell className="h-4 w-4 text-slate-600" />
            {m.attention > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white font-mono text-[9px] font-bold h-4 w-4 rounded-full flex items-center justify-center">
                {m.attention}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 pl-2">
            <div className="h-8.5 w-8.5 rounded-full bg-blue-600 text-white font-extrabold flex items-center justify-center text-xs border border-blue-500 shadow-sm">
              {user.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-bold text-slate-800 leading-none">{user.name}</p>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5 leading-none">{user.role}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. KPI cards (live) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <button
              key={idx}
              onClick={kpi.nav}
              className="text-left bg-white border border-slate-100 rounded-xl p-4 shadow-xs hover:shadow-md hover:border-slate-200 transition duration-200 flex items-center justify-between group"
            >
              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide truncate">{kpi.title}</p>
                <p className="text-2xl font-extrabold text-slate-800 tracking-tight">
                  {kpi.value}
                  {kpi.unit && <span className="text-xs font-semibold text-slate-400 ml-1">{kpi.unit}</span>}
                </p>
                <p className="text-[10px] font-semibold text-slate-400 leading-snug">{kpi.sub}</p>
              </div>
              <div className={`p-3 rounded-lg border ${kpi.color} group-hover:scale-105 transition`}>
                <Icon className="h-5 w-5" />
              </div>
            </button>
          );
        })}
      </div>

      {/* 3. Donut (status) · Per-stage bars · Operational indicators */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* A: Donut - Status Asset */}
        <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-50">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest">Status Aset</h3>
              <span className="text-[10px] font-bold text-slate-400">per unit</span>
            </div>

            <div className="py-6 flex flex-col sm:flex-row items-center justify-center gap-6">
              <div className="relative h-32 w-32 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                  {(() => {
                    let acc = 0;
                    return m.buckets.map((b, i) => {
                      const el = (
                        <circle
                          key={i}
                          cx="18"
                          cy="18"
                          r="15.915"
                          fill="none"
                          stroke={b.hex}
                          strokeWidth="3.4"
                          strokeDasharray={`${b.pct} ${100 - b.pct}`}
                          strokeDashoffset={-acc}
                        />
                      );
                      acc += b.pct;
                      return el;
                    });
                  })()}
                </svg>
                <div className="absolute text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase leading-none">Total</p>
                  <p className="text-base font-extrabold text-slate-800 mt-1">{m.totalUnits.toLocaleString("id-ID")}</p>
                  <p className="text-[9px] text-slate-400 font-semibold">unit</p>
                </div>
              </div>

              <div className="space-y-2 text-xs flex-1 w-full">
                {m.buckets.length === 0 ? (
                  <p className="text-slate-400 text-center py-4">Belum ada data aset.</p>
                ) : (
                  m.buckets.map((slice, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.hex }} />
                        <span>{slice.name}</span>
                      </div>
                      <div className="text-right font-semibold text-slate-800">
                        <span>{slice.units.toLocaleString("id-ID")}</span>
                        <span className="text-[11px] text-slate-400 font-normal ml-1">({slice.pct}%)</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigateToTab("manager")}
            className="text-left text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 pt-3 border-t border-slate-50"
          >
            Lihat Detail
          </button>
        </div>

        {/* B: Per-stage distribution bars (replaces static line chart) */}
        <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-50">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest">Distribusi per Fase</h3>
              <span className="text-[10px] font-bold text-slate-400">Fase 1–8</span>
            </div>

            <div className="py-4">
              <div className="relative h-32 w-full mt-2 flex items-end justify-between gap-1">
                {m.stages.map(st => (
                  <button
                    key={st.stage}
                    onClick={() => onNavigateToStage(st.stage)}
                    title={`Fase ${faseNo(st.stage)} · ${st.label}: ${st.units} unit (${st.recs} aset)`}
                    className="group flex-1 h-full flex flex-col items-center justify-end gap-1"
                  >
                    <span className="text-[8px] font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition">
                      {st.units}
                    </span>
                    <div
                      className={`w-full rounded-t ${st.bar} opacity-85 group-hover:opacity-100 transition-all`}
                      style={{ height: `${Math.max(st.units > 0 ? 6 : 0, st.h)}%` }}
                    />
                    <span className="text-[8px] font-bold text-slate-400 group-hover:text-slate-700">{faseNo(st.stage)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500 pt-3 border-t border-slate-50">
            <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
            <span>Jumlah unit di tiap tahap siklus hidup — klik bar untuk detail fase.</span>
          </div>
        </div>

        {/* C: Operational indicators (derived) */}
        <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-50">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest">Indikator Operasional</h3>
              <button onClick={() => onNavigateToTab("dokumen")} className="text-[10px] font-bold text-blue-600 hover:underline">
                Lihat Detail
              </button>
            </div>

            <div className="space-y-4 py-4">
              {m.indicators.map((ind, idx) => {
                const good = ind.val >= slaTarget;
                const mid = ind.val >= 70 && ind.val < slaTarget;
                const barColor = good ? "bg-emerald-500" : mid ? "bg-blue-500" : "bg-amber-500";
                const txtColor = good ? "text-emerald-600" : mid ? "text-blue-600" : "text-amber-600";
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                      <span className="truncate pr-2">{ind.name}</span>
                      <span className={`${txtColor} font-extrabold`}>{ind.val}%</span>
                    </div>
                    <div className="relative">
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor} transition-all duration-500`}
                          style={{ width: `${Math.min(100, Math.max(0, ind.val))}%` }}
                        />
                      </div>
                      <span className="absolute right-0 -top-3.5 text-[8px] text-slate-400 font-bold">{ind.hint}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {m.compliance.total > 0 && (
              <div className="pt-1 border-t border-slate-50">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Kepatuhan Audit</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2 text-center">
                    <div className="text-lg font-extrabold text-emerald-600">{m.compliance.patuh}</div>
                    <div className="text-[9px] font-bold text-emerald-700 uppercase">Patuh</div>
                  </div>
                  <div className="rounded-lg bg-amber-50 border border-amber-100 p-2 text-center">
                    <div className="text-lg font-extrabold text-amber-600">{m.compliance.perlu}</div>
                    <div className="text-[9px] font-bold text-amber-700 uppercase leading-tight">Perlu Perbaikan</div>
                  </div>
                  <div className="rounded-lg bg-rose-50 border border-rose-100 p-2 text-center">
                    <div className="text-lg font-extrabold text-rose-600">{m.compliance.tidak}</div>
                    <div className="text-[9px] font-bold text-rose-700 uppercase leading-tight">Tidak Patuh</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="text-[10px] text-slate-400 flex items-center gap-1 font-semibold">
            <Info className="h-3.5 w-3.5 text-blue-500" />
            <span>Skor audit rata-rata portofolio: {m.avgAudit}%.</span>
          </div>
        </div>
      </div>

      {/* 4. Distribution breakdown (left) · Live activity feed (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* A: Distribution per client / category */}
        <div className="lg:col-span-7 bg-white border border-slate-100 rounded-xl p-5 shadow-xs flex flex-col justify-between min-h-[400px]">
          <div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-50">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-slate-400" /> {m.distributionTitle}
              </h3>
              <span className="text-[10px] font-bold text-slate-400">unit</span>
            </div>

            <div className="mt-4 space-y-3.5">
              {m.distribution.length === 0 ? (
                <p className="text-slate-400 text-center py-16 text-sm">Belum ada aset untuk ditampilkan.</p>
              ) : (
                m.distribution.map((d, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700 truncate pr-2" title={d.name}>
                        {shorten(d.name, 32)}
                      </span>
                      <span className="font-semibold text-slate-500 shrink-0">
                        <strong className="text-slate-800">{d.units.toLocaleString("id-ID")}</strong>
                        <span className="text-[10px] text-slate-400 ml-1">({d.pct}%)</span>
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(2, d.pct)}%`, backgroundColor: d.hex }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-50 flex items-center justify-between text-xs text-slate-400 mt-4">
            <span>
              Total: <strong className="text-slate-700 font-bold">{m.totalUnits.toLocaleString("id-ID")} unit</strong> ·{" "}
              {m.records} aset
            </span>
            <button
              onClick={() => onNavigateToTab("manager")}
              className="text-blue-600 font-bold hover:underline flex items-center gap-1 text-[11px]"
            >
              <span>Kelola Aset</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* B: Live activity feed from activityLogs */}
        <div className="lg:col-span-5 bg-white border border-slate-100 rounded-xl p-5 shadow-xs flex flex-col justify-between min-h-[400px]">
          <div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-50">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest">Aktivitas Terbaru</h3>
            </div>

            <div className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto custom-scrollbar pt-1">
              {m.logs.length === 0 ? (
                <div className="text-slate-400 text-center py-16 text-xs leading-relaxed">
                  Belum ada aktivitas.
                  <br />
                  Tambahkan atau proses aset untuk mulai mencatat aktivitas.
                </div>
              ) : (
                m.logs.slice(0, 8).map(log => {
                  const meta = STAGE_META[log.stage] || { label: `Fase ${faseNo(log.stage)}`, hex: "#94a3b8", bar: "bg-slate-400", icon: ClipboardList };
                  const Icon = meta.icon;
                  const tone =
                    log.type === "success"
                      ? "text-emerald-500 bg-emerald-50"
                      : log.type === "warning"
                      ? "text-amber-500 bg-amber-50"
                      : log.type === "error"
                      ? "text-rose-500 bg-rose-50"
                      : "text-blue-500 bg-blue-50";
                  const t = timeAgo(log.timestamp);
                  return (
                    <div key={log.id} className="flex items-start gap-3 py-3 transition hover:bg-slate-50/50 px-1 rounded-lg">
                      <div className={`p-1.5 rounded-lg shrink-0 ${tone}`}>
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="flex-1 text-xs min-w-0">
                        <p className="font-bold text-slate-800 leading-snug line-clamp-2">{log.action}</p>
                        <p className="text-slate-400 font-medium text-[11px] mt-0.5 leading-snug truncate">
                          {log.assetName} · {log.operator}
                        </p>
                      </div>
                      <div className="text-right text-[10px] leading-snug shrink-0 font-medium">
                        <p className="text-slate-800">{t.rel}</p>
                        <p className="text-slate-400 mt-0.5 font-mono">{t.clock}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-50 text-[10.5px] text-slate-400 text-center font-medium flex items-center justify-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-emerald-500" />
            <span>
              {m.logs.length} entri log · {m.attention} aset perlu perhatian
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
