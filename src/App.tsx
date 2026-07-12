/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  LayoutDashboard, 
  Layers, 
  FileText, 
  Activity, 
  RefreshCw,
  Settings,
  ShieldCheck,
  CheckSquare,
  Boxes,
  Recycle,
  ClipboardList,
  Home,
  Truck,
  MapPin,
  Compass,
  Wrench,
  CornerUpLeft,
  Trash2,
  Menu,
  X,
  QrCode,
  Briefcase,
  Building2,
  User,
  SlidersHorizontal,
  Server,
  AlertTriangle,
  Info,
  CheckCircle,
  Database,
  Globe,
  ArrowRight,
  LogOut
} from "lucide-react";

import Dashboard from "./components/Dashboard";
import LifecycleManager from "./components/LifecycleManager";
import OperationsDocs from "./components/OperationsDocs";

import { 
  INITIAL_ASSETS, 
  INITIAL_ACTIVITY_LOGS, 
  SAMPLE_CLIENTS 
} from "./data/initialData";
import { Asset, AssetStage, ActivityLog } from "./types";
import Login from "./components/Login";
import UserManagement from "./components/UserManagement";
import NotificationBell from "./components/NotificationBell";
import AssetMaster from "./components/AssetMaster";
import Organisasi from "./components/Organisasi";
import AsetInternal from "./components/AsetInternal";
import AssetUtilization from "./components/AssetUtilization";
import ProjectsLocations from "./components/ProjectsLocations";
import SystemSettings from "./components/SystemSettings";
import { api, getToken, type AuthUser } from "./api";

// All 10 lifecycle phases shown in the sidebar (main menu) — mirrors the STEP/FASE filter.
// Fase 1 (Request/WO) & 2 (Produksi) removed — assets are added in Master Data (born in Gudang/Fase 3).
const PHASE_NAV: { stage: number; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { stage: 3, label: "Inventory & Gudang", Icon: Home },
  { stage: 4, label: "Pengiriman", Icon: Truck },
  { stage: 5, label: "Transit / Kiriman", Icon: Compass },
  { stage: 6, label: "Pemasangan", Icon: MapPin },
  { stage: 7, label: "Audit & Kepatuhan", Icon: ShieldCheck },
  { stage: 8, label: "Maintenance", Icon: Wrench },
  { stage: 9, label: "Penarikan / Relokasi", Icon: CornerUpLeft },
  { stage: 10, label: "Disposal", Icon: Trash2 }
];

export default function App() {
  const [assets, setAssets] = React.useState<Asset[]>([]);
  const [activityLogs, setActivityLogs] = React.useState<ActivityLog[]>([]);

  // Auth + data-loading state
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = React.useState(true);
  const [dataError, setDataError] = React.useState<string | null>(null);
  const [categoryNames, setCategoryNames] = React.useState<string[]>([]);
  const [clientNames, setClientNames] = React.useState<string[]>([]);
  const [settings, setSettings] = React.useState<Record<string, string>>({});
  const [selectedClient, setSelectedClient] = React.useState<string>("ALL");
  const [currentTab, setCurrentTab] = React.useState<string>("dashboard");
  const [initialStageFilter, setInitialStageFilter] = React.useState<number | string>("ALL");
  
  // UI States
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = React.useState(false);
  const [scannedAssetCode, setScannedAssetCode] = React.useState("");
  const [scannedAssetDetail, setScannedAssetDetail] = React.useState<Asset | null>(null);
  const [scanResultFeedback, setScanResultFeedback] = React.useState<string | null>(null);
  
  // Custom Settings Modals
  const [activeModal, setActiveModal] = React.useState<string | null>(null);

  // Verify an existing session on mount.
  React.useEffect(() => {
    (async () => {
      if (!getToken()) {
        setAuthChecking(false);
        return;
      }
      try {
        setUser(await api.me());
      } catch {
        api.logout();
      } finally {
        setAuthChecking(false);
      }
    })();
  }, []);

  // Load assets + activity logs from the API.
  const refresh = React.useCallback(async () => {
    try {
      const [a, l, cats, clis, cfg] = await Promise.all([
        api.getAssets(),
        api.getActivity(),
        api.getMaster("categories"),
        api.getMaster("clients"),
        api.getSettings()
      ]);
      setAssets(a);
      setActivityLogs(l);
      setCategoryNames(cats.map(c => c.name));
      setClientNames(clis.map(c => c.name));
      setSettings(cfg);
      setDataError(null);
    } catch (e: any) {
      setDataError(e?.message || "Gagal memuat data dari server. Silakan coba beberapa saat lagi.");
    }
  }, []);

  React.useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  // Keep the top-bar Client filter honest: if the selected client disappears (renamed or
  // deleted in Organisasi), fall back to ALL so the dropdown's shown value and the actual
  // filter can never desync. Guard on clientNames.length so we don't reset during first load.
  React.useEffect(() => {
    if (selectedClient !== "ALL" && clientNames.length > 0 && !clientNames.includes(selectedClient)) {
      setSelectedClient("ALL");
    }
  }, [clientNames, selectedClient]);

  // Live updates (SSE): the server pushes on any data change, so the CMS reflects
  // work done elsewhere (mobile merchandiser, another operator) without a manual
  // refresh. Auto-reconnects; a fresh "hello" on (re)connect re-syncs missed changes.
  const [live, setLive] = React.useState(false);
  React.useEffect(() => {
    if (!user) return;
    const token = getToken();
    if (!token) return;
    const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    let t: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => refresh(), 300); // coalesce bursts into one refetch
    };
    es.addEventListener("hello", () => {
      setLive(true);
      debouncedRefresh(); // catch up on anything missed while disconnected
    });
    es.addEventListener("asset", debouncedRefresh);
    es.addEventListener("notif", () => window.dispatchEvent(new CustomEvent("asset360:notif")));
    es.onerror = () => setLive(false); // EventSource retries on its own
    return () => {
      if (t) clearTimeout(t);
      es.close();
      setLive(false);
    };
  }, [user, refresh]);

  // Reset demo data (Admin only; server-side re-seed).
  const restoreDefaults = async () => {
    if (!window.confirm("Kembalikan data demo? Seluruh aset & aktivitas saat ini akan dihapus dan diganti dengan data contoh. Hanya tersedia saat mode Demo.")) return;
    try {
      const r = await api.reset();
      setAssets(r.assets);
      setActivityLogs(r.logs);
      setInitialStageFilter("ALL");
    } catch (e: any) {
      alert(e?.message || "Reset data gagal. Fitur ini hanya tersedia untuk Admin.");
    }
  };

  // Action: Add new asset (Fase 1 Request) via the API.
  const handleAddAsset = async (newAsset: Asset): Promise<{ ok: boolean; error?: string; id?: string }> => {
    try {
      const r = await api.createAsset(newAsset);
      await refresh();
      return { ok: true, id: r?.asset?.id };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Gagal menambahkan aset. Silakan coba lagi." };
    }
  };

  // Action: Move/branch an asset's lifecycle stage via the API (server-authoritative).
  const handleUpdateAssetStage = async (
    assetId: string,
    nextStage: AssetStage,
    updatedDetails: any,
    meta?: {
      logAction?: string;
      operator?: string;
      maintenanceStatus?: Asset["maintenanceStatus"];
      auditScore?: number;
    }
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      await api.updateStage(assetId, nextStage, updatedDetails, meta);
      await refresh();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Gagal memproses perpindahan Fase aset." };
    }
  };

  // Action: Issue a Surat Jalan (Fase 4). Server may SPLIT the asset — shipped qty
  // becomes a separate Fase-4 record, the remainder stays in Gudang (Fase 3).
  const handleShipAsset = async (
    assetId: string,
    updatedDetails: any,
    meta?: { logAction?: string; operator?: string }
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      await api.shipAsset(assetId, updatedDetails, meta);
      await refresh();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Gagal menerbitkan surat jalan." };
    }
  };

  // Action: assign / re-assign Merchandiser install portions (Fase 6, server-merged).
  const handleAssignInstall = async (
    assetId: string,
    assignments: { merchandiserId: number; qty: number }[],
    baseUpdatedAt?: string
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      await api.assignInstall(assetId, { assignments, baseUpdatedAt });
      await refresh();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Gagal menugaskan pemasangan kepada Merchandiser." };
    }
  };

  // Fase 1 Internal: serah-terima aset Origin ke Karyawan (custodian). Moves the asset to Fase 6.
  const handleHandoverInternal = async (
    assetId: string,
    p: { custodianId: number; handoverDate?: string; signatureBase64?: string; note?: string; projectId?: number | null }
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      await api.handoverInternal(assetId, p);
      await refresh();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Gagal memproses serah terima internal." };
    }
  };

  // Fase 2 Event: setup / relocate an asset at a venue leg (roadshow).
  const handleDeployVenue = async (
    assetId: string,
    p: { locationId: number; pic?: string; setupDate?: string; note?: string; signatureBase64?: string; projectId?: number | null; suratJalanNo?: string; courier?: string; trackingUrl?: string; trackingNo?: string; eta?: string }
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      await api.deployVenue(assetId, p);
      await refresh();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Gagal mengirim aset ke Venue." };
    }
  };
  // Fase 2 Event — 2-step ship→arrive between venues + return-to-warehouse (all tracked like Fase 5).
  const handleArriveVenue = async (assetId: string): Promise<{ ok: boolean; error?: string }> => {
    try { await api.arriveVenue(assetId); await refresh(); return { ok: true }; }
    catch (e: any) { return { ok: false, error: e?.message || "Gagal mengonfirmasi kedatangan di Venue." }; }
  };
  const handleShipReturn = async (
    assetId: string,
    p: { suratJalanNo?: string; courier?: string; trackingUrl?: string; trackingNo?: string; eta?: string }
  ): Promise<{ ok: boolean; error?: string }> => {
    try { await api.shipReturn(assetId, p); await refresh(); return { ok: true }; }
    catch (e: any) { return { ok: false, error: e?.message || "Gagal mengirim aset kembali ke Gudang." }; }
  };
  const handleArriveWarehouse = async (assetId: string): Promise<{ ok: boolean; error?: string }> => {
    try { await api.arriveWarehouse(assetId); await refresh(); return { ok: true }; }
    catch (e: any) { return { ok: false, error: e?.message || "Gagal mengonfirmasi kedatangan di Gudang." }; }
  };
  // Consolidated dispatch: many assets → one Surat Jalan / driver / destination.
  const handleBatchShip = async (
    p: { items: { id: string; qty: number }[]; suratJalanNo?: string; driverName: string; vehiclePlate?: string; vendorShipping?: string; departureTime?: string; area: string; picPenerima?: string; courier?: string; trackingUrl?: string; trackingNo?: string; eta?: string }
  ): Promise<{ ok: boolean; error?: string; suratJalanNo?: string }> => {
    try { const r = await api.batchShip(p); await refresh(); return { ok: true, suratJalanNo: r.suratJalanNo }; }
    catch (e: any) { return { ok: false, error: e?.message || "Gagal mengirim bersama." }; }
  };
  const handleGroupAdvance = async (
    p: { batchId: string; fromStage: number; toStage: number; stageKey?: string; section?: any; meta?: { logAction?: string; operator?: string } }
  ): Promise<{ ok: boolean; error?: string; count?: number }> => {
    try { const r = await api.groupAdvance(p); await refresh(); return { ok: true, count: r.count }; }
    catch (e: any) { return { ok: false, error: e?.message || "Gagal memproses grup pengiriman." }; }
  };

  // Fase 3 Distribusi: fan-out placements / report a toko placement / sampling audit.
  const handleDistribute = async (
    assetId: string,
    placements: { locationId: number; merchandiserId?: number; qty: number }[],
    projectId?: number | null
  ): Promise<{ ok: boolean; error?: string }> => {
    try { await api.distribute(assetId, { placements, projectId }); await refresh(); return { ok: true }; }
    catch (e: any) { return { ok: false, error: e?.message || "Gagal memproses distribusi aset." }; }
  };
  const handlePlaceToko = async (
    assetId: string,
    p: { locationId: number; doneQty?: number; gpsLat?: number; gpsLng?: number; signatureBase64?: string; note?: string }
  ): Promise<{ ok: boolean; error?: string }> => {
    try { await api.placeAtToko(assetId, p); await refresh(); return { ok: true }; }
    catch (e: any) { return { ok: false, error: e?.message || "Gagal menyimpan data pemasangan di Toko." }; }
  };
  const handleAuditSample = async (
    assetId: string,
    samples: { locationId: number; compliant: boolean }[],
    meta?: { method?: "manual" | "auto"; samplePct?: number }
  ): Promise<{ ok: boolean; error?: string }> => {
    try { await api.auditSample(assetId, samples, meta); await refresh(); return { ok: true }; }
    catch (e: any) { return { ok: false, error: e?.message || "Gagal memproses Audit sampling." }; }
  };
  const handleSetProject = async (assetId: string, projectId: number | null): Promise<{ ok: boolean; error?: string }> => {
    try { await api.setAssetProject(assetId, projectId); await refresh(); return { ok: true }; }
    catch (e: any) { return { ok: false, error: e?.message || "Gagal menetapkan proyek." }; }
  };

  // Navigates straight to a tab while selecting a stage filter where applicable
  const handleTabRedirect = (tabName: string) => {
    setCurrentTab(tabName);
  };

  // Direct access navigation helper for Stage Clicks inside Sidebar
  const jumpToStageFilterInManager = (stageNum: number) => {
    setInitialStageFilter(stageNum);
    setCurrentTab("manager");
    setIsMobileSidebarOpen(false);
  };

  // Open clean Manager
  const openWholeManagerRegistry = () => {
    setInitialStageFilter("ALL");
    setCurrentTab("manager");
    setIsMobileSidebarOpen(false);
  };

  // QR trigger scan action
  const triggerMockQRScanning = (assetCode: string) => {
    if (!assetCode) return;
    const match = assets.find(a => a.id === assetCode || a.qrcode === assetCode || a.qrcode === `ASETIFY-${assetCode}`);
    
    if (match) {
      setScanResultFeedback("matched");
      setScannedAssetDetail(match);
      
      // Attempt synthetic audio beep feedback
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      } catch (e) {
        // Fallback silently if audio context is blocked
      }
    } else {
      setScanResultFeedback("not_found");
      setScannedAssetDetail(null);
    }
  };

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(val);
  };

  const handleLogout = () => {
    api.logout();
    setUser(null);
    setAssets([]);
    setActivityLogs([]);
  };

  // --- Auth gates ---
  if (authChecking) {
    return <div className="min-h-screen grid place-items-center bg-[#0a0f1d] text-slate-400 text-sm">Memuat sesi…</div>;
  }
  if (!user) {
    return <Login onSuccess={setUser} />;
  }

  return (
    <div id="origin-container" className="min-h-screen bg-slate-50 font-sans text-slate-800 flex">
      
      {/* ========================================== */}
      {/* A. DARK SIDEBAR NAVIGATION (LEFT SECTION)  */}
      {/* ========================================== */}
      <aside className="w-68 bg-[#0a0f1d] text-slate-300 flex-shrink-0 hidden lg:flex flex-col justify-between border-r border-[#151c2d] sticky top-0 h-screen select-none overflow-y-auto">
        <div className="flex flex-col">
          
          {/* 1. Header Branded Space matching Mockup exactly */}
          <div className="p-5 border-b border-[#141b2b] flex items-center justify-start">
            <div className="flex flex-col select-none">
              <div className="flex items-center relative py-1.5 h-11">
                {/* Yellow circle placed exactly on the left-center */}
                <span className="absolute left-[2px] w-9 h-9 rounded-full bg-[#FFCD00] block" />
                {/* Text ORIGIN layers with elegant bold typography */}
                <span className="relative text-2xl font-black font-sans text-white tracking-[0.08em] leading-none pl-3.5 select-none drop-shadow-sm">
                  ORIGIN
                </span>
              </div>
              {/* Tagline aligned underneath, matching the branding */}
              <span className="text-[7.8px] font-medium font-sans text-slate-400 tracking-[0.027em] self-end mt-1 text-right block pr-1">
                Your needs, our perspective
              </span>
            </div>
          </div>

          {/* 2. Menu Items Container */}
          <div className="px-3.5 py-4 space-y-5">
            
            {/* Action Item: Dashboard */}
            <div className="space-y-1">
              <button
                onClick={() => { setCurrentTab("dashboard"); setIsMobileSidebarOpen(false); }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-bold transition duration-200 ${
                  currentTab === "dashboard"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/10"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/40"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <LayoutDashboard className="h-4.5 w-4.5" />
                  <span>Dashboard</span>
                </div>
              </button>
            </div>

            {/* Menu Section 1: MENU UTAMA */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-extrabold text-[#3a445e] uppercase tracking-widest block px-3.5">
                MENU UTAMA
              </span>

              {/* Standard List linking directly to the stages */}
              <div className="space-y-0.5 text-xs">
                
                {PHASE_NAV.map(({ stage, label, Icon }) => (
                  <button
                    key={stage}
                    onClick={() => jumpToStageFilterInManager(stage)}
                    className={`w-full flex items-center justify-between px-3.5 py-2 rounded-md font-bold transition ${
                      currentTab === "manager" && initialStageFilter === stage
                        ? "text-white bg-slate-800/70"
                        : "text-slate-400 hover:text-white hover:bg-slate-800/25"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 shrink-0 text-center font-mono text-[9px] text-slate-600">{stage}</span>
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                    </div>
                    <span className="text-[9px] font-extrabold bg-[#131b2f] text-slate-400 px-1.5 py-0.2 rounded-full">
                      {assets.filter(a => a.currentStage === stage && a.peruntukan !== "Internal").length}
                    </span>
                  </button>
                ))}

                <button
                  onClick={openWholeManagerRegistry}
                  className={`w-full flex items-center justify-between px-3.5 py-2 rounded-md font-bold transition ${
                    currentTab === "manager" && initialStageFilter === "ALL"
                      ? "text-white bg-slate-800/70 z-10 font-bold"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/25"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Layers className="h-4 w-4" />
                    <span>Asset Register</span>
                  </div>
                </button>

                <button
                  onClick={() => { setCurrentTab("internal"); setIsMobileSidebarOpen(false); }}
                  className={`w-full flex items-center justify-between px-3.5 py-2 rounded-md font-bold transition ${
                    currentTab === "internal"
                      ? "text-white bg-slate-800/70"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/25"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Boxes className="h-4 w-4" />
                    <span>Aset Internal</span>
                  </div>
                </button>

                <button
                  onClick={() => { setCurrentTab("dokumen"); setIsMobileSidebarOpen(false); }}
                  className={`w-full flex items-center justify-between px-3.5 py-2 rounded-md font-bold transition ${
                    currentTab === "dokumen"
                      ? "text-white bg-slate-800/70"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/25"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FileText className="h-4 w-4" />
                    <span>Laporan &amp; BAST</span>
                  </div>
                </button>

                <button
                  onClick={() => { setCurrentTab("utilisasi"); setIsMobileSidebarOpen(false); }}
                  className={`w-full flex items-center justify-between px-3.5 py-2 rounded-md font-bold transition ${
                    currentTab === "utilisasi"
                      ? "text-white bg-slate-800/70"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/25"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Recycle className="h-4 w-4" />
                    <span>Utilisasi Aset</span>
                  </div>
                </button>

              </div>
            </div>

            {/* Menu Section 2: PENGATURAN */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-extrabold text-[#3a445e] uppercase tracking-widest block px-3.5">
                PENGATURAN
              </span>
              <div className="space-y-0.5 text-xs text-slate-400 font-bold">
                <button 
                  onClick={() => { setCurrentTab("masterdata"); setIsMobileSidebarOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 rounded-md transition text-left ${currentTab === "masterdata" ? "text-white bg-slate-800/70" : "hover:text-white hover:bg-slate-800/25"}`}
                >
                  <Database className="h-4 w-4 text-slate-500" />
                  <span>Master Data</span>
                </button>
                <button 
                  onClick={() => { setCurrentTab("users"); setIsMobileSidebarOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 rounded-md transition text-left ${currentTab === "users" ? "text-white bg-slate-800/70" : "hover:text-white hover:bg-slate-800/25"}`}
                >
                  <User className="h-4 w-4 text-slate-500" />
                  <span>User Management</span>
                </button>
                <button
                  onClick={() => { setCurrentTab("organisasi"); setIsMobileSidebarOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 rounded-md transition text-left ${currentTab === "organisasi" ? "text-white bg-slate-800/70" : "hover:text-white hover:bg-slate-800/25"}`}
                >
                  <Building2 className="h-4 w-4 text-slate-500" />
                  <span>Organisasi</span>
                </button>
                <button
                  onClick={() => { setCurrentTab("proyek"); setIsMobileSidebarOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 rounded-md transition text-left ${currentTab === "proyek" ? "text-white bg-slate-800/70" : "hover:text-white hover:bg-slate-800/25"}`}
                >
                  <Briefcase className="h-4 w-4 text-slate-500" />
                  <span>Proyek &amp; Lokasi</span>
                </button>
                <button
                  onClick={() => { setCurrentTab("settings"); setIsMobileSidebarOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 rounded-md transition text-left ${currentTab === "settings" ? "text-white bg-slate-800/70" : "hover:text-white hover:bg-slate-800/25"}`}
                >
                  <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                  <span>Pengaturan Sistem</span>
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* 3. Bottom persistent component representing the QR Scan Widget */}
        <div className="p-4 border-t border-[#141b2b] bg-[#070b14]/50">
          <div className="bg-[#0b1220] border border-[#16213a] rounded-xl p-3.5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="bg-blue-600/10 p-2 rounded-lg text-blue-400 border border-blue-500/25">
                <QrCode className="h-4 w-4" />
              </div>
              <div className="leading-tight">
                <p className="text-xs font-bold text-white">QR Scan Asset</p>
                <p className="text-[10px] text-slate-500 font-medium">Auto-verify physical tags</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 leading-normal">
              Pindai QR atau Barcode untuk melihat detail dan perkembangan aset.
            </p>
            <button
              onClick={() => { setIsQrScannerOpen(true); setScanResultFeedback(null); setScannedAssetDetail(null); }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold py-2 rounded-lg transition shadow-sm cursor-pointer"
            >
              Scan Sekarang
            </button>
          </div>
        </div>

      </aside>

      {/* ========================================== */}
      {/* B. MAIN PANEL WITH LIGHT THEME CONTENT     */}
      {/* ========================================== */}
      <div className="flex-1 flex flex-col min-h-screen max-w-full overflow-hidden">
        
        {/* Mobile Header Bar shown only on small screens */}
        <header className="lg:hidden bg-[#0a0f1d] text-white border-b border-[#141b2b] px-4 py-3 flex items-center justify-between sticky top-0 z-40">
          <div className="flex flex-col select-none scale-85 origin-left">
            <div className="flex items-center relative py-0.5 h-8">
              {/* Yellow circle */}
              <span className="absolute left-[1px] w-7 h-7 rounded-full bg-[#FFCD00] block" />
              <span className="relative text-lg font-black font-sans text-white tracking-[0.08em] leading-none pl-2.5">
                ORIGIN
              </span>
            </div>
            <span className="text-[6.5px] font-medium font-sans text-slate-400 tracking-[0.015em] self-end mt-0.5 text-right block pr-0.5">
              Your needs, our perspective
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setIsQrScannerOpen(true); setScanResultFeedback(null); }}
              className="p-1.5 bg-slate-800 rounded border border-slate-700 text-slate-200"
              title="Scan QR"
            >
              <QrCode className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              className="p-1.5 bg-slate-800 rounded border border-slate-700 text-slate-200"
            >
              {isMobileSidebarOpen ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
            </button>
          </div>
        </header>

        {/* Dynamic Mobile Sidebar Slideout Drawer overlay */}
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden bg-slate-900/40 backdrop-blur-xs">
            <div className="w-68 bg-[#0a0f1d] h-full flex flex-col justify-between border-r border-[#151c2d] text-slate-300">
              <div className="flex flex-col">
                <div className="p-4 border-b border-[#141b2b] flex justify-between items-center bg-[#070b14]">
                  <div className="flex flex-col select-none scale-90 origin-left">
                    <div className="flex items-center relative py-0.5 h-8">
                      {/* Yellow circle */}
                      <span className="absolute left-[1px] w-7 h-7 rounded-full bg-[#FFCD00] block" />
                      <span className="relative text-lg font-black font-sans text-white tracking-[0.08em] leading-none pl-2.5">
                        ORIGIN
                      </span>
                    </div>
                    <span className="text-[6.8px] font-medium font-sans text-slate-400 tracking-[0.015em] self-end mt-0.5 text-right block pr-0.5">
                      Your needs, our perspective
                    </span>
                  </div>
                  <button 
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                {/* Menu items inside Drawer */}
                <div className="p-3 space-y-4">
                  <button
                    onClick={() => { setCurrentTab("dashboard"); setIsMobileSidebarOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold ${
                      currentTab === "dashboard" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800/40"
                    }`}
                  >
                    <LayoutDashboard className="h-4.5 w-4.5" />
                    <span>Dashboard</span>
                  </button>

                  <div className="space-y-1">
                    <span className="text-[9px] font-extrabold text-[#3a445e] uppercase tracking-widest block px-3">
                      MENU UTAMA
                    </span>
                    <div className="space-y-0.5 text-xs">
                      {PHASE_NAV.map(({ stage, label, Icon }) => (
                        <button
                          key={stage}
                          onClick={() => jumpToStageFilterInManager(stage)}
                          className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md font-semibold text-left transition ${
                            currentTab === "manager" && initialStageFilter === stage
                              ? "text-white bg-slate-800/70"
                              : "text-slate-400 hover:text-white hover:bg-slate-800/20"
                          }`}
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="w-4 shrink-0 text-center font-mono text-[9px] text-slate-600">{stage}</span>
                            <Icon className="h-4 w-4" />
                            <span>{label}</span>
                          </span>
                          <span className="text-[9px] font-extrabold bg-[#131b2f] text-slate-400 px-1.5 py-0.2 rounded-full">
                            {assets.filter(a => a.currentStage === stage && a.peruntukan !== "Internal").length}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] font-extrabold text-[#3a445e] tracking-widest uppercase block px-3">LAINNYA</span>
                    <div className="space-y-0.5 text-xs font-bold">
                      <button
                        onClick={openWholeManagerRegistry}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-slate-400 hover:text-white rounded"
                      >
                        <Layers className="h-4 w-4" />
                        <span>Asset Registry</span>
                      </button>
                      <button
                        onClick={() => { setCurrentTab("dokumen"); setIsMobileSidebarOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-slate-400 hover:text-white rounded"
                      >
                        <FileText className="h-4 w-4" />
                        <span>Laporan BAST</span>
                      </button>
                    </div>
                  </div>

                </div>
              </div>

              <div className="p-4 border-t border-[#141b2b] bg-[#070b14]/50 text-center">
                <button
                  onClick={() => { setIsQrScannerOpen(true); setIsMobileSidebarOpen(false); }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-xs font-bold"
                >
                  Scan QR Asset
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sub Header / Client Filter Panel */}
        <div className="bg-white border-b border-slate-200 px-4 md:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs font-sans">
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1.5 border border-slate-200 max-w-sm w-fit">
            <span className="text-[10px] text-slate-500 font-extrabold uppercase px-1 flex items-center gap-1">
              <Briefcase className="h-3 w-3" />
              Client:
            </span>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="bg-transparent text-xs text-slate-700 font-extrabold border-0 outline-none select-none cursor-pointer pr-4 focus:ring-0 leading-tight"
            >
              <option value="ALL">Semua Client</option>
              {clientNames.map(cli => (
                <option key={cli} value={cli}>{cli.split(' Mitra')[0].split(' (Persero)')[0]}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span
              title={live ? "Live — perubahan muncul otomatis" : "Terputus dari server — coba muat ulang"}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
              <span className={live ? "text-emerald-600" : "text-slate-400"}>{live ? "LIVE" : "OFFLINE"}</span>
            </span>
            <NotificationBell />
            {/* Logged-in user chip */}
            <div className="flex items-center gap-2 pr-1">
              <div className="h-7 w-7 rounded-full bg-blue-600 text-white text-[10px] font-extrabold flex items-center justify-center border border-blue-500">
                {user.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="hidden sm:block leading-tight">
                <p className="text-[11px] font-bold text-slate-800">{user.name}</p>
                <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">{user.role}</p>
              </div>
            </div>

            {user.role === "Admin" && (
              <button
                onClick={restoreDefaults}
                title="Reset data demo ke semula (Admin)"
                className="flex items-center justify-center gap-1 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Reset Data</span>
              </button>
            )}

            <button
              onClick={handleLogout}
              title="Keluar dari sesi"
              className="flex items-center justify-center gap-1 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>

        {/* Dynamic page contents routing based on state */}
        <main className="p-4 md:p-8 flex-1 max-w-7xl mx-auto w-full">
          
          <AnimatePresence mode="wait">
            
            {currentTab === "dashboard" && (
              <motion.div
                key="dashboard-tab"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <Dashboard
                  assets={assets}
                  activityLogs={activityLogs}
                  selectedClient={selectedClient}
                  user={user}
                  settings={settings}
                  onNavigateToStage={jumpToStageFilterInManager}
                  onNavigateToTab={handleTabRedirect}
                />
              </motion.div>
            )}

            {currentTab === "manager" && (
              <motion.div
                key="manager-tab"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <LifecycleManager
                  assets={assets}
                  user={user}
                  selectedClient={selectedClient}
                  categoryOptions={categoryNames}
                  clientOptions={clientNames}
                  settings={settings}
                  onAddAsset={handleAddAsset}
                  onUpdateAssetStage={handleUpdateAssetStage}
                  onShipAsset={handleShipAsset}
                  onAssignInstall={handleAssignInstall}
                  onHandoverInternal={handleHandoverInternal}
                  onDeployVenue={handleDeployVenue}
                  onArriveVenue={handleArriveVenue}
                  onShipReturn={handleShipReturn}
                  onArriveWarehouse={handleArriveWarehouse}
                  onBatchShip={handleBatchShip}
                  onGroupAdvance={handleGroupAdvance}
                  onDistribute={handleDistribute}
                  onPlaceToko={handlePlaceToko}
                  onAuditSample={handleAuditSample}
                  onSetProject={handleSetProject}
                  initialStageFilter={initialStageFilter}
                />
              </motion.div>
            )}

            {currentTab === "internal" && (
              <motion.div
                key="internal-tab"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <AsetInternal assets={assets} user={user} onChanged={refresh} />
              </motion.div>
            )}

            {currentTab === "dokumen" && (
              <motion.div
                key="documents-tab"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <OperationsDocs assets={assets} settings={settings} />
              </motion.div>
            )}

            {currentTab === "utilisasi" && (
              <motion.div
                key="utilisasi-tab"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <AssetUtilization assets={assets} settings={settings} selectedClient={selectedClient} />
              </motion.div>
            )}

            {currentTab === "users" && (
              <motion.div
                key="users-tab"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <UserManagement user={user} clientOptions={clientNames} />
              </motion.div>
            )}

            {currentTab === "masterdata" && (
              <motion.div
                key="masterdata-tab"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <AssetMaster assets={assets} categoryOptions={categoryNames} clientOptions={clientNames} user={user} onChanged={refresh} />
              </motion.div>
            )}

            {currentTab === "organisasi" && (
              <motion.div
                key="organisasi-tab"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <Organisasi user={user} onChanged={refresh} />
              </motion.div>
            )}

            {currentTab === "proyek" && (
              <motion.div
                key="proyek-tab"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <ProjectsLocations user={user} />
              </motion.div>
            )}

            {currentTab === "settings" && (
              <motion.div
                key="settings-tab"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <SystemSettings user={user} onSaved={refresh} />
              </motion.div>
            )}

          </AnimatePresence>

        </main>

        {/* Standard Corporate Footer */}
        <footer className="bg-white border-t border-slate-200 py-5 mt-10">
          <div className="max-w-7xl mx-auto px-6 md:px-8 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-slate-500 font-medium">
              <span>© 2026</span>
              <span className="font-extrabold text-slate-800 tracking-wider">ORIGIN ASSET360</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-3">
              <span className="text-emerald-500 font-bold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" /> CLOUD DEPLOYMENT SECURE
              </span>
              <span>·</span>
              <span>PRODUCTION ACTIVE</span>
            </div>
          </div>
        </footer>

      </div>

      {/* ======================================================= */}
      {/* C. POPUP FLOATING COMPONENT: QR MONITORING VERIFIER SCANNER */}
      {/* ======================================================= */}
      {isQrScannerOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b1220] border border-[#16213a] rounded-2xl max-w-md w-full p-6 text-white text-xs space-y-4 shadow-2xl relative">
            <button
              onClick={() => { setIsQrScannerOpen(false); setScanResultFeedback(null); }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center space-y-1">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest uppercase">AUDIT VERIFIER SCANNER</span>
              <h3 className="text-sm font-bold text-white">Pemindai QR Code Asset</h3>
            </div>

            {/* Moving Scanner Laser Animation effect */}
            <div className="relative h-48 bg-slate-950/80 rounded-xl border border-blue-900/50 flex flex-col items-center justify-center overflow-hidden">
              
              {/* Laser Line */}
              <div className="absolute left-0 w-full h-[2px] bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-[bounce_2.5s_infinite]" />

              {/* Angle Brackets */}
              <div className="absolute top-4 left-4 h-4 w-4 border-l-2 border-t-2 border-blue-500" />
              <div className="absolute top-4 right-4 h-4 w-4 border-r-2 border-t-2 border-blue-500" />
              <div className="absolute bottom-4 left-4 h-4 w-4 border-l-2 border-b-2 border-blue-500" />
              <div className="absolute bottom-4 right-4 h-4 w-4 border-r-2 border-b-2 border-blue-550" />

              {scanResultFeedback === "matched" ? (
                <div className="text-center space-y-2 z-10 text-emerald-400 bg-[#0c1e19]/90 border border-emerald-500/30 p-4 rounded-xl leading-relaxed scale-95 transition-all">
                  <CheckCircle className="h-8 w-8 mx-auto text-emerald-400" />
                  <p className="font-extrabold text-xs">QR VERIFIED SUCCESS!</p>
                  <p className="text-[11px] text-slate-300">Berhasil memindai <strong className="text-white font-mono">{scannedAssetDetail?.id}</strong></p>
                </div>
              ) : scanResultFeedback === "not_found" ? (
                <div className="text-center space-y-2 z-10 text-rose-400 bg-[#241315]/90 border border-rose-500/30 p-4 rounded-xl leading-relaxed">
                  <AlertTriangle className="h-8 w-8 mx-auto text-rose-400" />
                  <p className="font-extrabold text-xs">Tag Tidak Dikenal</p>
                  <p className="text-[10px] text-slate-300">QR Code yang Anda masukkan tidak terdaftar di database.</p>
                </div>
              ) : (
                <div className="text-center space-y-2.5 z-10 p-4 pointer-events-none text-slate-400">
                  <QrCode className="h-10 w-10 mx-auto text-blue-500 animate-pulse" />
                  <p className="text-[11px]">Mengarahkan kamera scanner...</p>
                </div>
              )}
            </div>

            {/* Scan ID Input Picker */}
            <div className="space-y-2">
              <label className="font-black text-slate-400 text-[10px] block uppercase tracking-wider">Masukkan ID Aset secara manual atau pilih dari daftar</label>
              <div className="flex gap-2">
                <select
                  value={scannedAssetCode}
                  onChange={(e) => setScannedAssetCode(e.target.value)}
                  className="bg-[#0b1321] border border-[#1d2b49] rounded-lg px-2.5 py-2 grow outline-none focus:border-blue-500 text-white font-mono font-bold cursor-pointer"
                >
                  <option value="">-- Pilih ID Aset Terdaftar --</option>
                  {assets.map(a => (
                    <option key={a.id} value={a.id}>{a.id} - {a.name.slice(0, 22)}...</option>
                  ))}
                  <option value="AST-UNKNOWN-999">AST-UNKNOWN-999 (Simulasi Error)</option>
                </select>
                
                <button
                  onClick={() => triggerMockQRScanning(scannedAssetCode)}
                  disabled={!scannedAssetCode}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold px-4 rounded-lg transition"
                >
                  Verifikasi
                </button>
              </div>
            </div>

            {/* Render matched assets details with quick jump link */}
            {scannedAssetDetail && (
              <div className="bg-[#121a2c] p-3 rounded-xl border border-[#1c2c4d] space-y-2">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="font-mono text-blue-400 font-extrabold">{scannedAssetDetail.id}</span>
                  <span className="bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-extrabold text-[9px]">Fase {scannedAssetDetail.currentStage}</span>
                </div>
                <div>
                  <p className="font-bold text-white text-[11px] leading-tight">{scannedAssetDetail.name}</p>
                  <p className="text-slate-450 text-[10px] mt-0.5 leading-snug">Client: {scannedAssetDetail.client}</p>
                </div>
                <div className="grid grid-cols-2 text-[10px] text-slate-400 pt-1.5 border-t border-[#1a2d52]">
                  <div>Qty: <strong className="text-white">{scannedAssetDetail.quantity} Unit</strong></div>
                  <div>Cost: <strong className="text-white">{formatRupiah(scannedAssetDetail.financials.purchaseCost)}</strong></div>
                </div>
                
                <div className="pt-2">
                  <button
                    onClick={() => {
                      jumpToStageFilterInManager(scannedAssetDetail.currentStage);
                      setIsQrScannerOpen(false);
                      setScanResultFeedback(null);
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg font-bold text-center flex items-center justify-center gap-1"
                  >
                    <span>Lacak Alur Aset</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-[#131e33] flex justify-end gap-2.5">
              <button 
                onClick={() => { setIsQrScannerOpen(false); setScanResultFeedback(null); }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2 rounded-lg transition"
              >
                Tutup Scanner
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* D. POPUP MODALS SIMULATING SETTINGS PREFERENCES         */}
      {/* ======================================================= */}



    </div>
  );
}
