/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { 
  Briefcase, 
  RefreshCw, 
  Layers, 
  Activity, 
  ShieldCheck, 
  Wrench,
  CheckCircle,
  Database
} from "lucide-react";
import { Asset, ProjectStats } from "../types";

interface HeaderProps {
  assets: Asset[];
  selectedClient: string;
  onClientChange: (client: string) => void;
  uniqueClients: string[];
  onResetData: () => void;
}

export default function Header({
  assets,
  selectedClient,
  onClientChange,
  uniqueClients,
  onResetData
}: HeaderProps) {
  
  // Calculate dynamic statistics based on current active client selection:
  const filteredAssets = selectedClient === "ALL" 
    ? assets 
    : assets.filter(a => a.client === selectedClient);

  const stats: ProjectStats = React.useMemo(() => {
    const total = filteredAssets.length;
    let reqs = 0, prods = 0, warehouses = 0, transits = 0;
    let deployed = 0, inMaintenance = 0;
    let accumAuditScore = 0;
    let auditedCount = 0;
    let totalPurchasedValue = 0;
    let totalScrapRecovered = 0;

    filteredAssets.forEach(a => {
      totalPurchasedValue += a.financials.purchaseCost;
      if (a.currentStage === 1) reqs++;
      else if (a.currentStage === 2) prods++;
      else if (a.currentStage === 3) warehouses++;
      else if (a.currentStage === 4 || a.currentStage === 5) transits++;
      else if (a.currentStage === 6) {
        deployed++;
        if (a.auditScore) {
          accumAuditScore += a.auditScore;
          auditedCount++;
        }
      } else if (a.currentStage === 7) {
        deployed++; // Deployed but currently in auditing
        if (a.auditScore) {
          accumAuditScore += a.auditScore;
          auditedCount++;
        }
      } else if (a.currentStage === 8) {
        inMaintenance++;
        if (a.auditScore) {
          accumAuditScore += a.auditScore;
          auditedCount++;
        }
      } else if (a.currentStage === 9) {
        deployed++; // Retrieval
      } else if (a.currentStage === 10) {
        totalScrapRecovered += a.stageDetails.disposal?.scrapValue || 0;
      }
    });

    const averageAudit = auditedCount > 0 ? Math.round(accumAuditScore / auditedCount) : 95;
    
    return {
      totalAssets: total,
      activeRequests: reqs,
      inProduction: prods,
      inWarehouse: warehouses,
      inTransit: transits,
      deployedCount: deployed,
      auditedCount,
      inMaintenance,
      complianceRate: averageAudit,
      operationalEfficiency: Math.round((deployed / (total || 1)) * 100),
      savedCost: totalScrapRecovered || 2000000 // default mock saved
    };
  }, [filteredAssets]);

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <header id="app-header" className="bg-slate-900 text-white shadow-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Top Navbar Row */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Branding */}
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2.5 rounded-lg text-white shadow-indigo-500/20 shadow-md">
              <Layers className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold uppercase tracking-widest bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                  PORTAL CLIENT
                </span>
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                  LIFECYCLE LIVE
                </span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Sistem Manajemen Aset <span className="font-light text-slate-400 text-sm">v1.2</span>
              </h1>
            </div>
          </div>

          {/* Controls & Client Switcher */}
          <div className="flex flex-wrap items-center gap-3">
            
            <div className="flex items-center bg-slate-800/80 rounded-lg p-1.5 border border-slate-700">
              <label htmlFor="client-select" className="text-xs text-slate-400 px-2 flex items-center gap-1.5 font-medium">
                <Briefcase className="h-3 w-3" />
                Client:
              </label>
              <select
                id="client-select"
                value={selectedClient}
                onChange={(e) => onClientChange(e.target.value)}
                className="bg-slate-900 text-xs text-white border-0 font-medium rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="ALL">Semua Korporasi (Global)</option>
                {uniqueClients.map(cli => (
                  <option key={cli} value={cli}>{cli}</option>
                ))}
              </select>
            </div>

            {/* Quick Restart Simulator */}
            <button
              id="btn-reset-data"
              onClick={onResetData}
              title="Reset data simulasi ke semula"
              className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700/80 px-3 py-2 rounded-lg border border-slate-700 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Reset Simulasi</span>
            </button>
          </div>
        </div>

        {/* Dynamic Summary Cards */}
        <div id="stats-dashboard-header" className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          
          <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-800/90 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Aset Terdaftar</p>
              <p className="text-2xl font-bold mt-1 text-white">
                {stats.totalAssets} <span className="text-xs font-normal text-slate-400">unit</span>
              </p>
              <span className="text-[10px] text-slate-400 mt-1 block">
                {stats.activeRequests} request baru · {stats.inWarehouse} di gudang
              </span>
            </div>
            <div className="bg-blue-500/10 p-3 rounded-xl text-blue-400 hidden sm:block">
              <Database className="h-6 w-6" />
            </div>
          </div>

          <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-800/90 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Skor Kepatuhan Audit</p>
              <p className="text-2xl font-bold mt-1 text-emerald-400">
                {stats.complianceRate}%
              </p>
              <span className="text-[10px] text-slate-400 mt-1 block flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-emerald-400" /> Standar SLA terpenuhi
              </span>
            </div>
            <div className="bg-emerald-500/10 p-3 rounded-xl text-emerald-400 hidden sm:block">
              <ShieldCheck className="h-6 w-6" />
            </div>
          </div>

          <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-800/90 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Tingkat Deployment</p>
              <p className="text-2xl font-bold mt-1 text-blue-400">
                {stats.operationalEfficiency}%
              </p>
              <span className="text-[10px] text-slate-400 mt-1 block">
                {stats.deployedCount} aktif di lokasi · {stats.inTransit} di jalan
              </span>
            </div>
            <div className="bg-indigo-500/10 p-3 rounded-xl text-indigo-400 hidden sm:block">
              <Activity className="h-6 w-6" />
            </div>
          </div>

          <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-800/90 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Sisa Nilai Scrap Aset</p>
              <p className="text-2xl font-bold mt-1 text-indigo-300">
                {formatRupiah(stats.savedCost)}
              </p>
              <span className="text-[10px] text-slate-400 mt-1 block">
                {stats.inMaintenance} aset sedang diperbaiki
              </span>
            </div>
            <div className="bg-indigo-500/10 p-3 rounded-xl text-indigo-300 hidden sm:block">
              <Wrench className="h-6 w-6" />
            </div>
          </div>

        </div>

      </div>
    </header>
  );
}
