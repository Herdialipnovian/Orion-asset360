/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  Plus,
  Search,
  Filter,
  ChevronRight,
  X,
  FileText,
  ClipboardList,
  Settings,
  Home,
  Truck,
  MapPin,
  Compass,
  ShieldCheck,
  Wrench,
  CornerUpLeft,
  Trash2,
  QrCode,
  ArrowRight,
  AlertTriangle,
  Check,
  Play,
  RefreshCw,
  Building,
  UserCheck,
  Briefcase
} from "lucide-react";
import { Asset, AssetStage } from "../types";
import { api, type AuthUser } from "../api";
import { installedOf } from "../installProgress";

// Code-split: Leaflet (+ its CSS) only loads when the operator opens the distribusi map.
const TokoMap = React.lazy(() => import("./TokoMap"));
const ReportDistribusi = React.lazy(() => import("./ReportDistribusi"));
import { SAMPLE_CLIENTS } from "../data/initialData";

const STAGE_ICONS: { [key: number]: any } = {
  1: ClipboardList,
  2: Settings,
  3: Home,
  4: Truck,
  5: MapPin,
  6: Compass,
  7: ShieldCheck,
  8: Wrench,
  9: CornerUpLeft,
  10: Trash2
};

const STAGE_LABELS: { [key: number]: string } = {
  1: "Request & WO-Project",
  2: "Fase Perakitan/Produksi",
  3: "Inventory & Gudang",
  4: "Pengiriman/Surat Jalan",
  5: "Transit / Pelacakan Kiriman",
  6: "Pemasangan Deployed",
  7: "Audit & Kepatuhan",
  8: "Pemeliharaan Aktif",
  9: "Penarikan Relokasi",
  10: "Pemusnahan/Disposal"
};

const cleanLabel = (s: number) => (STAGE_LABELS[s] || "").replace(/&amp;/g, "&");

// ===========================================================================
// LIFECYCLE STATE MACHINE — which stage(s) an asset can move to from each stage
// ===========================================================================
const TRANSITIONS: { [k: number]: number[] } = {
  // Fase 1 (Request) & 2 (Produksi) removed — assets start in Gudang (Fase 3) via Master Data.
  3: [4],
  4: [5],
  5: [6],
  6: [7, 8, 9], // deployed → audit / maintenance / retrieval
  7: [6, 8, 9], // audit → back to operational / maintenance / retrieval
  8: [6, 9], // maintenance → redeploy / retrieval
  9: [3, 6, 10], // retrieval → back to warehouse / relocate / disposal
  10: []
};

// Short action verb shown on each transition button (keyed by target stage)
const TRANSITION_VERB: { [k: number]: string } = {
  2: "Kirim ke Produksi",
  3: "Terima di Gudang",
  4: "Terbitkan Surat Jalan",
  5: "Input Tracking / Transit",
  6: "Konfirmasi Pemasangan",
  7: "Lakukan Audit",
  8: "Buka Tiket Maintenance",
  9: "Tarik / Relokasi Aset",
  10: "Disposal / Retire Aset"
};

type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea" | "checkbox" | "tags" | "time" | "generated" | "destinations" | "signature" | "checklist" | "assignments";
  required?: boolean;
  options?: string[];
  // For selects whose options come from the user directory (per the asset's client).
  source?: "pic" | "merchandiser";
  min?: number;
  max?: number;
  step?: string;
  def?: any;
  placeholder?: string;
  full?: boolean;
  readOnly?: boolean;
  hint?: string;
};

// Auto-generate a Surat Jalan number (client-side; operator can regenerate).
const genSuratJalan = () => `SJ/ORG/${new Date().getFullYear()}/${String(Math.floor(Math.random() * 90000) + 10000)}`;

// 3rd-party couriers/vendors that handle the actual delivery (logistik just pastes their tracking link).
const COURIERS = [
  "JNE", "J&T Express", "SiCepat", "AnterAja", "Ninja Xpress", "Wahana", "Pos Indonesia",
  "ID Express", "Lion Parcel", "Shopee (SPX Express)", "Lalamove", "GoSend (Gojek)",
  "GrabExpress", "Paxel", "Deliveree", "Lainnya"
];

// The data captured when transitioning INTO each stage (drives the gate form)
const GATE_FORMS: { [target: number]: { stageKey: string; title: string; fields: FieldDef[] } } = {
  2: {
    stageKey: "production",
    title: "Mulai Produksi / Perakitan",
    fields: [
      { key: "prodLead", label: "Leader Produksi", type: "text", required: true, placeholder: "cth. Gerry Pratama" },
      { key: "qcInspector", label: "QC Inspector", type: "text", required: true },
      { key: "qcScore", label: "Skor QC (0–100)", type: "number", required: true, min: 0, max: 100, def: 95 },
      { key: "productionReportCode", label: "Kode Laporan Produksi", type: "text" },
      { key: "readyDate", label: "Tanggal Siap", type: "date", required: true }
    ]
  },
  3: {
    stageKey: "inventory",
    title: "Terima Aset di Gudang",
    fields: [
      { key: "warehouseName", label: "Nama Gudang", type: "text", required: true, def: "Gudang Utama Origin Jakarta" },
      { key: "shelfLoc", label: "Lokasi Rak / Shelf", type: "text", required: true },
      { key: "stockCode", label: "Kode Stok", type: "text" },
      { key: "rackNumber", label: "Nomor Rak", type: "text" },
      { key: "receivedDate", label: "Tanggal Terima", type: "date", required: true }
    ]
  },
  4: {
    stageKey: "shipping",
    title: "Terbitkan Surat Jalan",
    fields: [
      { key: "suratJalanNo", label: "Nomor Surat Jalan (otomatis)", type: "generated", required: true, full: true },
      { key: "driverName", label: "Nama Driver", type: "text", required: true },
      { key: "vehiclePlate", label: "Plat Kendaraan", type: "text", required: true },
      { key: "vendorShipping", label: "Vendor Logistik", type: "text" },
      { key: "departureTime", label: "Waktu Berangkat", type: "time", required: true },
      { key: "destinations", label: "Tujuan Pengiriman (bisa 2 tempat atau lebih)", type: "destinations", full: true, required: true }
    ]
  },
  5: {
    stageKey: "transit",
    title: "Input Link Tracking Kiriman (Kurir / Vendor)",
    fields: [
      { key: "courier", label: "Kurir / Vendor Pengiriman", type: "select", required: true, options: COURIERS },
      { key: "trackingUrl", label: "Link Tracking (tempel dari kurir)", type: "text", required: true, full: true, placeholder: "https://… link resi/tracking dari kurir" },
      { key: "trackingNo", label: "Nomor Resi (opsional)", type: "text", placeholder: "cth. JX1234567890" },
      { key: "eta", label: "Estimasi Tiba (ETA)", type: "text", required: true, placeholder: "cth. 2 hari / 25 Jul" }
    ]
  },
  6: {
    stageKey: "deployment",
    title: "Tugaskan Pemasangan / Setup",
    fields: [
      { key: "installationDate", label: "Tanggal Rencana Pasang", type: "date", required: true },
      { key: "assignments", label: "Tugaskan ke Merchandiser (bagi per qty)", type: "assignments", full: true, required: true, hint: "Merchandiser menyelesaikan porsinya via aplikasi mobile (foto + TTD BAST). Total qty harus = qty aset." },
      { key: "planogramMatched", label: "Wajib sesuai Planogram / Tata Ruang", type: "checkbox", def: true, full: true },
      { key: "verifiedItems", label: "Item yang harus diverifikasi (pisahkan dengan koma)", type: "tags", full: true, placeholder: "Braket, UPS, Kabel LAN" }
    ]
  },
  7: {
    stageKey: "audit",
    title: "Audit & Kepatuhan",
    fields: [
      { key: "auditorName", label: "Nama Auditor", type: "text", required: true },
      { key: "lastAuditDate", label: "Tanggal Audit", type: "date", required: true },
      {
        key: "checklist",
        label: "Checklist Kepatuhan (skor & status otomatis)",
        type: "checklist",
        full: true,
        options: ["Sesuai planogram / tata ruang", "Kondisi fisik baik (tanpa kerusakan)", "Branding / stiker lengkap & benar", "Area bersih, rapi & aman", "Berfungsi normal"]
      },
      { key: "recommendation", label: "Rekomendasi / Catatan", type: "textarea", full: true }
    ]
  },
  8: {
    stageKey: "maintenance",
    title: "Buka Tiket Maintenance",
    fields: [
      { key: "activeTicketId", label: "ID Tiket", type: "text", placeholder: "auto jika kosong" },
      { key: "issueType", label: "Jenis Kerusakan / Gangguan", type: "text", required: true, full: true },
      { key: "technician", label: "Teknisi Ditugaskan", type: "text", required: true },
      { key: "repairCost", label: "Estimasi Biaya (IDR)", type: "number", min: 0, def: 0 }
    ]
  },
  9: {
    stageKey: "retrieval",
    title: "Ajukan Penarikan / Relokasi",
    fields: [
      { key: "reason", label: "Alasan Penarikan", type: "textarea", required: true, full: true },
      { key: "assessResult", label: "Hasil Penilaian", type: "select", options: ["REDEPLOY", "DIPINDAHKAN", "DISCARD"], required: true, def: "REDEPLOY" },
      { key: "checkedBy", label: "Diperiksa Oleh", type: "text", required: true },
      { key: "conditionRating", label: "Rating Kondisi (1–5)", type: "number", min: 1, max: 5, def: 4 }
    ]
  },
  10: {
    stageKey: "disposal",
    title: "Proses Disposal / Pemusnahan",
    fields: [
      { key: "disposalMethod", label: "Metode Disposal", type: "select", options: ["SCRAP", "LELANG", "DONASI", "REFURBISH"], required: true, def: "SCRAP" },
      { key: "disposalDate", label: "Tanggal Disposal", type: "date", required: true },
      { key: "approvedBy", label: "Disetujui Oleh", type: "text", required: true },
      { key: "scrapValue", label: "Nilai Sisa Scrap (IDR)", type: "number", min: 0, def: 0 }
    ]
  }
};

// Special gate for the Transit(5) -> Deployed(6) "arrival" path: Proof of Delivery
// (konfirmasi penerimaan), writing to the `transit` section. Redeploys (7/8/9 -> 6)
// keep using the normal GATE_FORMS[6] deployment/BAST gate.
const POD_GATE: { stageKey: string; title: string; fields: FieldDef[] } = {
  stageKey: "transit",
  title: "Konfirmasi Penerimaan (POD)",
  fields: [
    { key: "podRecipient", label: "Diterima Oleh (PIC Penerima)", type: "text", required: true, readOnly: true, hint: "Otomatis mengikuti PIC tujuan pengiriman — tidak bisa diubah." },
    { key: "podTime", label: "Tanggal Terima", type: "date", required: true },
    { key: "conditionOnArrival", label: "Kondisi Barang saat Tiba", type: "select", required: true, options: ["Sempurna", "Bagus", "Ada Lecet", "Rusak Sebagian"] },
    { key: "podNote", label: "Catatan (opsional)", type: "textarea", full: true },
    { key: "signatureBase64", label: "Tanda Tangan Penerima", type: "signature", required: true, full: true }
  ]
};

// Redeploy back into Fase 6 (from Audit/Maintenance/Retrieval). A fresh install
// cycle: the server clears any prior assignments; the PIC re-assigns in-place after.
const REDEPLOY_GATE: { stageKey: string; title: string; fields: FieldDef[] } = {
  stageKey: "deployment",
  title: "Pasang Kembali / Redeploy",
  fields: [
    { key: "installationDate", label: "Tanggal Pasang Ulang", type: "date", required: true },
    { key: "redeployNote", label: "Catatan (opsional)", type: "textarea", full: true }
  ]
};

// Internal (Fase 1) Fase-7 audit = stock-opname: is the asset physically there, with the
// right custodian, in good condition? Same shape as GATE_FORMS[7] so submit logic is reused.
const INTERNAL_AUDIT_GATE: { stageKey: string; title: string; fields: FieldDef[] } = {
  stageKey: "audit",
  title: "Stock Opname / Audit Aset Internal",
  fields: [
    { key: "auditorName", label: "Nama Auditor", type: "text", required: true },
    { key: "lastAuditDate", label: "Tanggal Opname", type: "date", required: true },
    {
      key: "checklist",
      label: "Checklist Stock Opname (skor & status otomatis)",
      type: "checklist",
      full: true,
      options: ["Barang fisik ada di tangan custodian", "Custodian sesuai catatan", "Kondisi fisik baik (tanpa kerusakan)", "Kelengkapan / aksesori lengkap", "Masih berfungsi normal"]
    },
    { key: "recommendation", label: "Rekomendasi / Catatan", type: "textarea", full: true }
  ]
};

// Is this asset being deployed as an INTERNAL (custodian) asset?
const isInternalDeploy = (asset?: Asset | null) => (asset?.stageDetails as any)?.deployment?.mode === "Internal";

// Pick the gate config for a transition into Fase 6 (source-aware):
//  5→6 = POD receipt · 6 in-place = assignment gate · 7/8/9→6 = redeploy.
const gateFor = (target: number, current: number, asset?: Asset | null) => {
  if (target === 7 && isInternalDeploy(asset)) return INTERNAL_AUDIT_GATE;
  if (target === 6) {
    if (current === 5) return POD_GATE;
    if (current === 6) return GATE_FORMS[6];
    return REDEPLOY_GATE;
  }
  return GATE_FORMS[target];
};
// Button/label verb, source-aware.
const verbFor = (target: number, current: number, asset?: Asset | null) => {
  if (target === 7 && isInternalDeploy(asset)) return "Stock Opname / Audit Internal";
  if (target === 6 && current === 5) return "Konfirmasi Penerimaan (POD)";
  if (target === 6 && current !== 6) return "Pasang Kembali (Redeploy)";
  return TRANSITION_VERB[target];
};

const CATEGORY_OPTIONS = [
  "Display & Kiosk",
  "Infrastruktur IT",
  "Komputer & Laptop",
  "HVAC & Pendingin",
  "Peralatan Retail",
  "Peralatan Kantor",
  "Sistem Keamanan",
  "Seragam & Atribut",
  "Perlengkapan Event",
  "Peralatan Khusus"
];

interface LifecycleManagerProps {
  assets: Asset[];
  user?: AuthUser;
  selectedClient: string;
  categoryOptions?: string[];
  clientOptions?: string[];
  settings?: Record<string, string>;
  onAddAsset: (newAsset: Asset) => Promise<{ ok: boolean; error?: string; id?: string }>;
  onUpdateAssetStage: (
    assetId: string,
    nextStage: AssetStage,
    updatedDetails: any,
    meta?: { logAction?: string; operator?: string; maintenanceStatus?: Asset["maintenanceStatus"]; auditScore?: number }
  ) => Promise<{ ok: boolean; error?: string }>;
  onShipAsset: (assetId: string, updatedDetails: any, meta?: { logAction?: string; operator?: string }) => Promise<{ ok: boolean; error?: string }>;
  onAssignInstall: (assetId: string, assignments: { merchandiserId: number; qty: number }[], baseUpdatedAt?: string) => Promise<{ ok: boolean; error?: string }>;
  onHandoverInternal?: (assetId: string, p: { custodianId: number; handoverDate?: string; signatureBase64?: string; note?: string; projectId?: number | null }) => Promise<{ ok: boolean; error?: string }>;
  onDeployVenue?: (assetId: string, p: { locationId: number; pic?: string; setupDate?: string; note?: string; signatureBase64?: string; projectId?: number | null; courier?: string; trackingUrl?: string; trackingNo?: string; eta?: string }) => Promise<{ ok: boolean; error?: string }>;
  onArriveVenue?: (assetId: string) => Promise<{ ok: boolean; error?: string }>;
  onShipReturn?: (assetId: string, p: { courier?: string; trackingUrl?: string; trackingNo?: string; eta?: string }) => Promise<{ ok: boolean; error?: string }>;
  onArriveWarehouse?: (assetId: string) => Promise<{ ok: boolean; error?: string }>;
  onDistribute?: (assetId: string, placements: { locationId: number; merchandiserId?: number; qty: number }[], projectId?: number | null) => Promise<{ ok: boolean; error?: string }>;
  onPlaceToko?: (assetId: string, p: { locationId: number; doneQty?: number; gpsLat?: number; gpsLng?: number; signatureBase64?: string; note?: string }) => Promise<{ ok: boolean; error?: string }>;
  onAuditSample?: (assetId: string, samples: { locationId: number; compliant: boolean }[], meta?: { method?: "manual" | "auto"; samplePct?: number }) => Promise<{ ok: boolean; error?: string }>;
  onSetProject?: (assetId: string, projectId: number | null) => Promise<{ ok: boolean; error?: string }>;
  initialStageFilter?: number | string;
}

const formatRupiah = (val: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val);

// On-screen signature pad → PNG data URL, for Proof-of-Delivery (konfirmasi penerimaan).
function SignaturePad({ onChange }: { value?: string; onChange: (v: string) => void }) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const drawing = React.useRef(false);
  const last = React.useRef<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    const c = ref.current;
    if (c) {
      c.width = c.offsetWidth || 480;
      c.height = c.offsetHeight || 130;
    }
  }, []);

  const at = (e: React.MouseEvent | React.TouchEvent) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    const t: any = "touches" in e ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };
  const down = (e: React.MouseEvent | React.TouchEvent) => { drawing.current = true; last.current = at(e); };
  const moveTo = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const p = at(e);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if ("touches" in e) e.preventDefault();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    onChange(ref.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current;
    if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    onChange("");
  };

  return (
    <div className="space-y-1">
      <canvas
        ref={ref}
        className="w-full h-[130px] bg-white border border-slate-300 rounded-lg touch-none cursor-crosshair"
        onMouseDown={down}
        onMouseMove={moveTo}
        onMouseUp={up}
        onMouseLeave={up}
        onTouchStart={down}
        onTouchMove={moveTo}
        onTouchEnd={up}
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-400">Minta penerima tanda tangan di kotak di atas.</span>
        <button type="button" onClick={clear} className="text-[11px] font-bold text-rose-500 hover:text-rose-600">Hapus</button>
      </div>
    </div>
  );
}

export default function LifecycleManager({
  assets,
  user,
  selectedClient,
  categoryOptions,
  clientOptions,
  settings,
  onAddAsset,
  onUpdateAssetStage,
  onShipAsset,
  onAssignInstall,
  onHandoverInternal,
  onDeployVenue,
  onArriveVenue,
  onShipReturn,
  onArriveWarehouse,
  onDistribute,
  onPlaceToko,
  onAuditSample,
  onSetProject,
  initialStageFilter = "ALL"
}: LifecycleManagerProps) {
  const catOpts = categoryOptions && categoryOptions.length ? categoryOptions : CATEGORY_OPTIONS;
  const cliOpts = clientOptions && clientOptions.length ? clientOptions : SAMPLE_CLIENTS;
  const deprPct = Number(settings?.depreciation_pct) || 15;
  const defaultWeeks = Number(settings?.default_timeline_weeks) || 4;
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filterCategory, setFilterCategory] = React.useState("ALL");
  const [filterStage, setFilterStage] = React.useState<number | string>(initialStageFilter);

  const [isNewAssetModalOpen, setIsNewAssetModalOpen] = React.useState(false);
  // Detail modal tracks the asset by ID so it always reflects the freshest state after a transition
  const [detailAssetId, setDetailAssetId] = React.useState<string | null>(null);

  // Transition gate state
  const [transitionTarget, setTransitionTarget] = React.useState<number | null>(null);
  const [gateForm, setGateForm] = React.useState<Record<string, any>>({});
  const [gateError, setGateError] = React.useState<string | null>(null);

  // PIC / Merchandiser directory for the CURRENT asset's client (drives gate dropdowns:
  // Fase-4 Surat Jalan PIC Penerima, Fase-6 Pemasangan Tim Merchandiser).
  const [picOptions, setPicOptions] = React.useState<string[]>([]);
  const [merchDir, setMerchDir] = React.useState<{ id: number; name: string; area: string | null }[]>([]);
  const loadDirectory = React.useCallback(async (client?: string | null) => {
    if (!client) {
      setPicOptions([]);
      setMerchDir([]);
      return;
    }
    try {
      const [pics, merch] = await Promise.all([
        api.usersDirectory("PIC", client),
        api.usersDirectory("Merchandiser", client)
      ]);
      setPicOptions(pics.map(p => p.name));
      setMerchDir(merch.map(m => ({ id: m.id, name: m.name, area: (m as any).area ?? null })));
    } catch {
      setPicOptions([]);
      setMerchDir([]);
    }
  }, []);

  const [formError, setFormError] = React.useState<string | null>(null);

  // Fase 1 Internal — Karyawan (custodian) master + serah-terima modal state.
  const [employees, setEmployees] = React.useState<{ id: number; name: string; department: string | null }[]>([]);
  React.useEffect(() => {
    api.getEmployees().then(es => setEmployees(es.filter(e => e.active).map(e => ({ id: e.id, name: e.name, department: e.department })))).catch(() => {});
  }, []);
  const [handoverOpen, setHandoverOpen] = React.useState(false);
  const [handoverForm, setHandoverForm] = React.useState<{ custodianId: string; handoverDate: string; signature: string; note: string }>({ custodianId: "", handoverDate: "", signature: "", note: "" });
  const [handoverBusy, setHandoverBusy] = React.useState(false);
  const [handoverError, setHandoverError] = React.useState<string | null>(null);

  // Fase 2 Event — projects (to derive mode) + venue locations + venue-deploy modal state.
  const [projects, setProjects] = React.useState<{ id: number; name: string; mode: string; client: string | null; area: string | null; status: string }[]>([]);
  const [areaOptions, setAreaOptions] = React.useState<string[]>([]);
  React.useEffect(() => {
    api.getProjects().then(ps => setProjects(ps.map(p => ({ id: p.id, name: p.name, mode: p.mode, client: p.client ?? null, area: p.area ?? null, status: p.status })))).catch(() => {});
    api.getAreas().then(as => setAreaOptions(as.map(a => a.name))).catch(() => {});
  }, []);
  const [venues, setVenues] = React.useState<{ id: number; name: string; area: string | null }[]>([]);
  const loadVenues = React.useCallback(async (client?: string | null) => {
    try {
      const vs = await api.getLocations({ type: "Venue", ...(client ? { client } : {}) });
      setVenues(vs.map(v => ({ id: v.id, name: v.name, area: v.area })));
    } catch { setVenues([]); }
  }, []);
  const [venueOpen, setVenueOpen] = React.useState(false);
  const [venueForm, setVenueForm] = React.useState<{ locationId: string; pic: string; setupDate: string; note: string; signature: string; courier: string; trackingUrl: string; trackingNo: string; eta: string }>({ locationId: "", pic: "", setupDate: "", note: "", signature: "", courier: "", trackingUrl: "", trackingNo: "", eta: "" });
  const [venueBusy, setVenueBusy] = React.useState(false);
  const [venueError, setVenueError] = React.useState<string | null>(null);
  // Return-to-warehouse shipment modal (end of roadshow — venue → Gudang, tracked).
  const [returnOpen, setReturnOpen] = React.useState(false);
  const [returnForm, setReturnForm] = React.useState<{ courier: string; trackingUrl: string; trackingNo: string; eta: string }>({ courier: "", trackingUrl: "", trackingNo: "", eta: "" });
  const [returnBusy, setReturnBusy] = React.useState(false);
  const [returnError, setReturnError] = React.useState<string | null>(null);
  const [arriveBusy, setArriveBusy] = React.useState(false); // shared for arrive-venue / arrive-warehouse
  const [arriveError, setArriveError] = React.useState<string | null>(null); // shown inline in the detail panel (arrive buttons live OUTSIDE the modals)
  // The deployment mode for an asset: explicit (post-deploy) or inferred from its project.
  const projectModeOf = React.useCallback((asset?: Asset | null): string | null => {
    if (!asset) return null;
    const dm = (asset.stageDetails as any)?.deployment?.mode;
    if (dm) return dm;
    const p = asset.projectId != null ? projects.find(x => x.id === asset.projectId) : null;
    return p?.mode || null;
  }, [projects]);

  // Fase 3 Distribusi — toko locations + distribute modal + sampling-audit modal state.
  const [tokos, setTokos] = React.useState<{ id: number; name: string; area: string | null; gpsLat: number | null; gpsLng: number | null }[]>([]);
  const loadTokos = React.useCallback(async (client?: string | null) => {
    try {
      const ts = await api.getLocations({ type: "Toko", ...(client ? { client } : {}) });
      setTokos(ts.map(t => ({ id: t.id, name: t.name, area: t.area, gpsLat: t.gpsLat, gpsLng: t.gpsLng })));
    } catch { setTokos([]); }
  }, []);
  // Fallback GPS per toko (used by the map when a placement has no captured coordinate yet).
  const locGps = React.useMemo(() => {
    const m: Record<number, { lat: number; lng: number }> = {};
    for (const t of tokos) if (t.gpsLat != null && t.gpsLng != null) m[t.id] = { lat: t.gpsLat, lng: t.gpsLng };
    return m;
  }, [tokos]);
  const [mapOpen, setMapOpen] = React.useState(false);
  const openMap = async () => { if (detailAsset) await loadTokos(detailAsset.client); setMapOpen(true); };
  const [reportOpen, setReportOpen] = React.useState(false);
  const [reportEvidence, setReportEvidence] = React.useState<any[]>([]);
  const openReport = async () => {
    if (!detailAsset) return;
    await loadTokos(detailAsset.client);
    try { setReportEvidence(await api.getEvidence(detailAsset.id)); } catch { setReportEvidence([]); }
    setReportOpen(true);
  };
  const [distOpen, setDistOpen] = React.useState(false);
  const [distRows, setDistRows] = React.useState<{ locationId: string; merchandiserId: string; qty: string }[]>([]);
  const [distBusy, setDistBusy] = React.useState(false);
  const [distError, setDistError] = React.useState<string | null>(null);
  const [sampleOpen, setSampleOpen] = React.useState(false);
  const [sampleSel, setSampleSel] = React.useState<Record<number, "compliant" | "issue" | undefined>>({});
  const [sampleBusy, setSampleBusy] = React.useState(false);
  const [sampleError, setSampleError] = React.useState<string | null>(null);
  const [sampleMethod, setSampleMethod] = React.useState<"manual" | "auto">("manual");
  const [samplePctInput, setSamplePctInput] = React.useState("15");
  const [autoPct, setAutoPct] = React.useState<number | null>(null);
  // Proyek binding (drives projectModeOf → which deploy action shows).
  const [projBusy, setProjBusy] = React.useState(false);
  const [projError, setProjError] = React.useState<string | null>(null);
  const setProjectFor = async (projectId: number | null) => {
    if (!detailAsset || !onSetProject) return;
    setProjBusy(true); setProjError(null);
    const res = await onSetProject(detailAsset.id, projectId);
    setProjBusy(false);
    if (!res.ok) setProjError(res.error || "Gagal menetapkan proyek.");
  };

  const openDistribute = () => {
    if (!detailAsset) return;
    void loadTokos(detailAsset.client);
    void loadDirectory(detailAsset.client);
    const pls: any[] = (detailAsset.stageDetails as any)?.deployment?.placements || [];
    setDistRows(pls.length ? pls.map(p => ({ locationId: String(p.locationId), merchandiserId: p.merchandiserId ? String(p.merchandiserId) : "", qty: String(p.qty) })) : [{ locationId: "", merchandiserId: "", qty: String(detailAsset.quantity || 1) }]);
    setDistError(null);
    setDistOpen(true);
  };
  const submitDistribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailAsset || !onDistribute) return;
    const rows = distRows.filter(r => r.locationId).map(r => ({ locationId: Number(r.locationId), merchandiserId: r.merchandiserId ? Number(r.merchandiserId) : undefined, qty: Number(r.qty) || 0 }));
    if (!rows.length) return setDistError("Pilih minimal 1 toko.");
    const ids = rows.map(r => r.locationId);
    if (new Set(ids).size !== ids.length) return setDistError("Ada toko yang dobel.");
    const tot = rows.reduce((s, r) => s + r.qty, 0);
    if (tot > (detailAsset.quantity || 0)) return setDistError(`Total (${tot}) melebihi qty aset (${detailAsset.quantity}). Boleh kurang.`);
    setDistBusy(true); setDistError(null);
    const res = await onDistribute(detailAsset.id, rows, detailAsset.projectId ?? undefined);
    setDistBusy(false);
    if (!res.ok) return setDistError(res.error || "Gagal distribusi.");
    setDistOpen(false);
  };

  const openSample = () => {
    setSampleSel({});
    setSampleError(null);
    setSampleMethod("manual");
    setAutoPct(null);
    setSampleOpen(true);
  };
  // Auto-random: system picks ceil(pct% × toko) at random as the audit sample (default all "Patuh",
  // PIC flips any to "Temuan" after checking). Marks the run as method=auto for the client report.
  const autoRandomSample = () => {
    if (!detailAsset) return;
    const pls: any[] = (detailAsset.stageDetails as any)?.deployment?.placements || [];
    if (!pls.length) return;
    const pct = Math.min(100, Math.max(1, Math.round(Number(samplePctInput) || 0)));
    const n = Math.min(pls.length, Math.max(1, Math.ceil((pct / 100) * pls.length)));
    // Unbiased Fisher-Yates (Durstenfeld) — a sort() with a random comparator is NOT uniform.
    const pool = [...pls];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const sel: Record<number, "compliant" | "issue"> = {};
    for (const p of pool.slice(0, n)) sel[Number(p.locationId)] = "compliant";
    setSampleSel(sel);
    setSampleMethod("auto");
    setAutoPct(pct); // record the % actually used for THIS selection (input may change later)
    setSampleError(null);
  };
  const submitSample = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailAsset || !onAuditSample) return;
    const samples = Object.entries(sampleSel).filter(([, v]) => v).map(([lid, v]) => ({ locationId: Number(lid), compliant: v === "compliant" }));
    if (!samples.length) return setSampleError("Pilih minimal 1 toko sampel + status.");
    setSampleBusy(true); setSampleError(null);
    const meta = sampleMethod === "auto" ? { method: "auto" as const, samplePct: autoPct ?? undefined } : { method: "manual" as const };
    const res = await onAuditSample(detailAsset.id, samples, meta);
    setSampleBusy(false);
    if (!res.ok) return setSampleError(res.error || "Gagal audit sampling.");
    setSampleOpen(false);
  };

  React.useEffect(() => {
    if (initialStageFilter !== undefined) setFilterStage(initialStageFilter);
  }, [initialStageFilter]);

  const detailAsset = React.useMemo(
    () => assets.find(a => a.id === detailAssetId) || null,
    [assets, detailAssetId]
  );

  const openHandover = () => {
    setHandoverForm({ custodianId: "", handoverDate: new Date().toISOString().slice(0, 10), signature: "", note: "" });
    setHandoverError(null);
    setHandoverOpen(true);
  };
  const submitHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailAsset || !onHandoverInternal) return;
    if (!handoverForm.custodianId) return setHandoverError("Pilih karyawan (custodian) dulu.");
    setHandoverBusy(true);
    setHandoverError(null);
    const res = await onHandoverInternal(detailAsset.id, {
      custodianId: Number(handoverForm.custodianId),
      handoverDate: handoverForm.handoverDate || undefined,
      signatureBase64: handoverForm.signature || undefined,
      note: handoverForm.note || undefined,
      projectId: detailAsset.projectId ?? undefined
    });
    setHandoverBusy(false);
    if (!res.ok) return setHandoverError(res.error || "Gagal serah-terima.");
    setHandoverOpen(false);
  };

  const openVenue = () => {
    if (!detailAsset) return;
    void loadVenues(detailAsset.client);
    void loadDirectory(detailAsset.client);
    setVenueForm({ locationId: "", pic: "", setupDate: new Date().toISOString().slice(0, 10), note: "", signature: "", courier: "", trackingUrl: "", trackingNo: "", eta: "" });
    setVenueError(null);
    setVenueOpen(true);
  };
  const submitVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailAsset || !onDeployVenue) return;
    if (!venueForm.locationId) return setVenueError("Pilih venue dulu.");
    if (venueForm.trackingUrl && !/^https?:\/\//i.test(venueForm.trackingUrl.trim())) return setVenueError("Link tracking harus diawali http:// atau https://.");
    setVenueBusy(true);
    setVenueError(null);
    const res = await onDeployVenue(detailAsset.id, {
      locationId: Number(venueForm.locationId),
      pic: venueForm.pic || undefined,
      setupDate: venueForm.setupDate || undefined,
      note: venueForm.note || undefined,
      signatureBase64: venueForm.signature || undefined,
      projectId: detailAsset.projectId ?? undefined,
      courier: venueForm.courier || undefined,
      trackingUrl: venueForm.trackingUrl.trim() || undefined,
      trackingNo: venueForm.trackingNo.trim() || undefined,
      eta: venueForm.eta.trim() || undefined
    });
    setVenueBusy(false);
    if (!res.ok) return setVenueError(res.error || "Gagal kirim ke venue.");
    setVenueOpen(false);
  };
  const openReturn = () => {
    if (!detailAsset) return;
    setReturnForm({ courier: "", trackingUrl: "", trackingNo: "", eta: "" });
    setReturnError(null);
    setReturnOpen(true);
  };
  const submitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailAsset || !onShipReturn) return;
    if (returnForm.trackingUrl && !/^https?:\/\//i.test(returnForm.trackingUrl.trim())) return setReturnError("Link tracking harus diawali http:// atau https://.");
    setReturnBusy(true);
    setReturnError(null);
    const res = await onShipReturn(detailAsset.id, {
      courier: returnForm.courier || undefined,
      trackingUrl: returnForm.trackingUrl.trim() || undefined,
      trackingNo: returnForm.trackingNo.trim() || undefined,
      eta: returnForm.eta.trim() || undefined
    });
    setReturnBusy(false);
    if (!res.ok) return setReturnError(res.error || "Gagal kirim balik ke gudang.");
    setReturnOpen(false);
  };
  const doArriveVenue = async () => {
    if (!detailAsset || !onArriveVenue || arriveBusy) return;
    setArriveBusy(true); setArriveError(null);
    const res = await onArriveVenue(detailAsset.id);
    setArriveBusy(false);
    if (!res.ok) setArriveError(res.error || "Gagal konfirmasi tiba di venue.");
  };
  const doArriveWarehouse = async () => {
    if (!detailAsset || !onArriveWarehouse || arriveBusy) return;
    setArriveBusy(true); setArriveError(null);
    const res = await onArriveWarehouse(detailAsset.id);
    setArriveBusy(false);
    if (!res.ok) setArriveError(res.error || "Gagal konfirmasi tiba di gudang.");
  };

  const [newForm, setNewForm] = React.useState({
    name: "",
    category: "Infrastruktur IT",
    client: SAMPLE_CLIENTS[0],
    quantity: 1,
    purchaseCost: 15000000,
    specsRequired: "",
    picName: "Aris Munandar",
    vendorName: "PT Global Tech Integrasi"
  });

  const categories = React.useMemo(() => Array.from(new Set(assets.map(a => a.category))), [assets]);

  const filteredAssetsList = React.useMemo(() => {
    return assets.filter(asset => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        (asset.name || "").toLowerCase().includes(q) ||
        (asset.id || "").toLowerCase().includes(q) ||
        (asset.projectCode || "").toLowerCase().includes(q);
      const matchClient = selectedClient === "ALL" || asset.client === selectedClient;
      const matchCategory = filterCategory === "ALL" || asset.category === filterCategory;
      const matchStage = filterStage === "ALL" || asset.currentStage === Number(filterStage);
      // Deployment lifecycle only — Internal (custodian) assets live in the "Aset Internal" menu.
      const isDeployment = asset.peruntukan !== "Internal";
      return isDeployment && matchSearch && matchClient && matchCategory && matchStage;
    });
  }, [assets, searchQuery, selectedClient, filterCategory, filterStage]);

  const handleResetForm = () => {
    setNewForm({
      name: "",
      category: "Infrastruktur IT",
      client: SAMPLE_CLIENTS[0],
      quantity: 1,
      purchaseCost: 15000000,
      specsRequired: "",
      picName: "Aris Munandar",
      vendorName: "PT Global Tech Integrasi"
    });
    setFormError(null);
  };

  // Collision-resistant id/code generators
  const genId = () => {
    const suffix = Date.now().toString(36).slice(-4).toUpperCase();
    let id = `AST-2026-${suffix}`;
    let n = 1;
    while (assets.some(a => a.id === id)) id = `AST-2026-${suffix}${n++}`;
    return id;
  };

  // Submit and create asset (Step 1: Request Project) with validation
  const handleSubmitNewAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.name.trim()) return setFormError("Nama aset wajib diisi.");
    if (!newForm.vendorName.trim()) return setFormError("Vendor penyedia wajib diisi.");
    if (!newForm.picName.trim()) return setFormError("Penanggung jawab (PIC) wajib diisi.");
    if (!newForm.quantity || Number(newForm.quantity) < 1) return setFormError("Kuantitas minimal 1 unit.");
    if (!newForm.purchaseCost || Number(newForm.purchaseCost) < 1) return setFormError("Estimasi pembelian harus lebih dari 0.");

    const newId = genId();
    const newProjectCode = `WO-PRJ-2026-${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${Math.floor(Math.random() * 90 + 10)}`;

    const newlyCreatedAsset: Asset = {
      id: newId,
      name: newForm.name.trim(),
      category: newForm.category,
      client: newForm.client,
      projectCode: newProjectCode,
      quantity: Number(newForm.quantity),
      currentStage: AssetStage.REQUEST,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentLocation: "Tahap Persetujuan Pengadaan",
      specs: {
        brand: "Sesuai Request",
        sku: `${newForm.name.slice(0, 3).toUpperCase()}-REQ-2026`,
        dimensions: "Tergantung Vendor",
        powerWeight: "Pending Konfirmasi"
      },
      qrcode: `ASETIFY-${newId}`,
      financials: {
        purchaseCost: Number(newForm.purchaseCost),
        maintenanceCost: 0,
        disposalValue: Math.round(Number(newForm.purchaseCost) * (deprPct / 100))
      },
      auditScore: 100,
      maintenanceStatus: "NONE",
      stageDetails: {
        request: {
          reqId: `REQ-2026-${newId.split("-").pop()}`,
          timelineWeeks: defaultWeeks,
          specsRequired: newForm.specsRequired.trim() || "Spesifikasi standar operasional unit penunjang proyek.",
          vendorName: newForm.vendorName.trim(),
          picName: newForm.picName.trim(),
          approvalDate: new Date().toISOString().split("T")[0]
        },
        production: { prodLead: "", qcInspector: "", qcScore: 100, productionReportCode: "", evidencePhoto: "", readyDate: "" },
        inventory: { warehouseName: "", shelfLoc: "", stockCode: "", receivedDate: "", rackNumber: "" },
        shipping: { suratJalanNo: "", driverName: "", vehiclePlate: "", vendorShipping: "", departureTime: "" },
        transit: { currentLat: 0, currentLng: 0, eta: "" },
        deployment: { installTeam: "", installationDate: "", planogramMatched: false, verifiedItems: [], photoBefore: "", photoAfter: "" },
        audit: { lastAuditDate: "", auditorName: "", findings: [], scoring: 100, recommendation: "" },
        maintenance: { logHistory: [] },
        retrieval: {},
        disposal: {}
      }
    };

    const result = await onAddAsset(newlyCreatedAsset);
    if (!result.ok) {
      setFormError(result.error || "Gagal menyimpan aset ke server.");
      return;
    }
    setIsNewAssetModalOpen(false);
    handleResetForm();
    setDetailAssetId(result.id || newId); // jump to the newly created asset (server-generated id)
  };

  // ---- Transition gate ----
  const openGate = (target: number) => {
    if (!detailAsset) return;
    void loadDirectory(detailAsset.client); // populate PIC/Merchandiser dropdowns for this client
    const cfg = gateFor(target, detailAsset.currentStage, detailAsset);
    const existing = (detailAsset.stageDetails as any)[cfg.stageKey] || {};
    const init: Record<string, any> = {};
    cfg.fields.forEach(f => {
      let v = existing[f.key];
      if (f.type === "tags") v = Array.isArray(v) ? v.join(", ") : v || "";
      else if (f.type === "checkbox") v = typeof v === "boolean" ? v : f.def ?? false;
      else if (f.type === "destinations") v = Array.isArray(v) && v.length ? v : [{ area: "", picPenerima: "", qty: detailAsset.quantity || 1 }];
      else if (f.type === "assignments") v = Array.isArray(v) && v.length ? v : [{ merchandiserId: "", merchandiser: "", qty: detailAsset.quantity || 1, doneQty: 0 }];
      else if (f.type === "generated") v = v || genSuratJalan();
      else if (f.type === "time") v = v || new Date().toTimeString().slice(0, 5);
      else if (f.type === "checklist") v = v && typeof v === "object" ? v : {};
      else if (v === undefined || v === null || v === "") v = f.def ?? (f.type === "date" ? new Date().toISOString().split("T")[0] : "");
      init[f.key] = v;
    });
    // POD gate: recipient AUTO-follows the shipment's destination PIC(s) (read-only).
    if (cfg === POD_GATE) {
      const dests = (detailAsset.stageDetails as any)?.shipping?.destinations || [];
      const pics = [...new Set(dests.map((d: any) => d?.picPenerima).filter(Boolean))];
      if (pics.length) init.podRecipient = pics.join(" / ");
    }
    setGateForm(init);
    setGateError(null);
    setTransitionTarget(target);
  };

  const closeGate = () => {
    setTransitionTarget(null);
    setGateError(null);
  };

  const submitGate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailAsset || transitionTarget == null) return;
    const cfg = gateFor(transitionTarget, detailAsset.currentStage, detailAsset);

    // Validation
    for (const f of cfg.fields) {
      const raw = gateForm[f.key];
      if (f.required && f.type !== "checkbox" && f.type !== "destinations" && f.type !== "assignments" && (raw === undefined || raw === null || String(raw).trim() === "")) {
        return setGateError(`Field "${f.label}" wajib diisi.`);
      }
      if (f.type === "number" && raw !== "" && raw != null) {
        const n = Number(raw);
        if (isNaN(n)) return setGateError(`"${f.label}" harus berupa angka.`);
        if (f.min != null && n < f.min) return setGateError(`"${f.label}" minimal ${f.min}.`);
        if (f.max != null && n > f.max) return setGateError(`"${f.label}" maksimal ${f.max}.`);
      }
      if (f.key === "trackingUrl" && raw && !/^https?:\/\//i.test(String(raw).trim())) {
        return setGateError("Link tracking harus URL valid (diawali http:// atau https://).");
      }
      if (f.type === "signature" && f.required && (!raw || String(raw).length < 50)) {
        return setGateError("Tanda tangan penerima wajib — minta penerima tanda tangan dulu.");
      }
      if (f.type === "destinations") {
        const rows = Array.isArray(raw) ? raw : [];
        if (rows.length === 0) return setGateError("Tambahkan minimal 1 tujuan pengiriman.");
        for (const r of rows) {
          if (!String(r.area || "").trim() || !String(r.picPenerima || "").trim())
            return setGateError("Setiap tujuan wajib diisi: Tujuan/Area & PIC Penerima.");
          if (!(Number(r.qty) > 0)) return setGateError("Qty tiap tujuan harus lebih dari 0.");
        }
      }
      if (f.type === "assignments") {
        const rows = Array.isArray(raw) ? raw : [];
        if (rows.length === 0) return setGateError("Tambahkan minimal 1 Merchandiser.");
        const seen = new Set<string>();
        let tot = 0;
        for (const r of rows) {
          if (!r.merchandiserId) return setGateError("Setiap baris wajib pilih Merchandiser.");
          if (seen.has(String(r.merchandiserId))) return setGateError("Merchandiser tidak boleh dobel.");
          seen.add(String(r.merchandiserId));
          if (!(Number(r.qty) > 0)) return setGateError("Qty tiap Merchandiser harus lebih dari 0.");
          const dq = Number(r.doneQty) || 0;
          if (Number(r.qty) < dq) return setGateError(`Qty tidak boleh di bawah yang sudah dikerjakan (${dq}).`);
          tot += Number(r.qty);
        }
        if (tot > (detailAsset.quantity || 0)) return setGateError(`Total tugas (${tot}) melebihi qty aset (${detailAsset.quantity}). Boleh kurang (bertahap), tidak boleh lebih.`);
      }
    }

    // In-place install ASSIGNMENT (Fase 6) → dedicated endpoint (server merges + validates,
    // preserving any progress already reported). Not a stage transition.
    if (transitionTarget === 6 && detailAsset.currentStage === 6) {
      const rows = (Array.isArray(gateForm.assignments) ? gateForm.assignments : [])
        .map((r: any) => ({ merchandiserId: Number(r.merchandiserId), qty: Number(r.qty) || 0 }));
      const res = await onAssignInstall(detailAsset.id, rows, detailAsset.updatedAt);
      if (!res.ok) return setGateError(res.error || "Gagal menugaskan pemasangan.");
      closeGate();
      return;
    }

    // Build the updated stage section
    const section: Record<string, any> = { ...((detailAsset.stageDetails as any)[cfg.stageKey] || {}) };
    cfg.fields.forEach(f => {
      let v = gateForm[f.key];
      if (f.type === "number") v = v === "" || v == null ? 0 : Number(v);
      else if (f.type === "tags") v = String(v || "").split(",").map(s => s.trim()).filter(Boolean);
      else if (f.type === "checkbox") v = Boolean(v);
      else if (f.type === "destinations")
        v = (Array.isArray(v) ? v : []).map((r: any) => ({ area: String(r.area || "").trim(), picPenerima: String(r.picPenerima || "").trim(), qty: Number(r.qty) || 0 }));
      else if (f.type === "assignments") {
        v = (Array.isArray(v) ? v : []).map((r: any) => ({ merchandiserId: Number(r.merchandiserId), merchandiser: String(r.merchandiser || "").trim(), qty: Number(r.qty) || 0, status: "pending" }));
        section.installedQty = 0;
        section.fullyInstalled = false;
      }
      else if (f.type === "checklist") {
        const items = f.options || [];
        const map: any = v && typeof v === "object" ? v : {};
        const result: Record<string, boolean> = {};
        let passed = 0;
        for (const it of items) { const p = map[it] !== false; result[it] = p; if (p) passed++; }
        v = result;
        section.scoring = items.length ? Math.round((passed / items.length) * 100) : 0;
        section.findings = items.filter(it => !result[it]);
        section.complianceStatus = section.scoring >= 90 ? "PATUH" : section.scoring >= 70 ? "PERLU PERBAIKAN" : "TIDAK PATUH";
      }
      section[f.key] = v;
    });

    // POD arrival: flag damaged goods for a courier claim.
    if (cfg === POD_GATE) {
      section.claimFlag = /rusak/i.test(String(section.conditionOnArrival || ""));
    }

    // Sensible auto-fills for a couple of sections
    if (transitionTarget === 8 && !section.activeTicketId) {
      section.activeTicketId = `TKT-2026-${Math.floor(Math.random() * 9000 + 1000)}`;
    }
    if (transitionTarget === 8) {
      section.reportedAt = new Date().toISOString();
      // Append this ticket to the maintenance history (was only initialised, never recorded).
      const prior = Array.isArray(section.logHistory) ? section.logHistory : [];
      section.logHistory = [...prior, {
        date: section.reportedAt.slice(0, 10),
        act: `Tiket ${section.activeTicketId || "-"}: ${section.issueType || "kerusakan"} — teknisi ${section.technician || "-"}`,
        cost: Number(section.repairCost) || 0
      }];
    }

    const updatedDetails: any = { ...detailAsset.stageDetails, [cfg.stageKey]: section };
    // Maintenance resolved on redeploy (8→6): record a "selesai" entry (the redeploy gate writes
    // the deployment section, so the maintenance history is appended separately here).
    if (transitionTarget === 6 && detailAsset.currentStage === 8) {
      const maint = { ...((detailAsset.stageDetails as any).maintenance || {}) };
      const prior = Array.isArray(maint.logHistory) ? maint.logHistory : [];
      maint.logHistory = [...prior, { date: new Date().toISOString().slice(0, 10), act: "Selesai diperbaiki — dipasang kembali (redeploy)", cost: 0 }];
      updatedDetails.maintenance = maint;
    }

    const fromStage = detailAsset.currentStage;
    const meta: {
      logAction?: string;
      operator?: string;
      maintenanceStatus?: Asset["maintenanceStatus"];
      auditScore?: number;
    } = {
      logAction: `${cleanLabel(fromStage)} → ${cleanLabel(transitionTarget)}: ${cfg.title}.`,
      operator: "Admin Origin (Lifecycle Manager)"
    };
    if (transitionTarget === 7) meta.auditScore = Number(section.scoring) || detailAsset.auditScore;
    if (transitionTarget === 8) meta.maintenanceStatus = "REPAIRING";
    if (transitionTarget === 6 && fromStage === 8) meta.maintenanceStatus = "RESOLVED";
    if (transitionTarget === 6 && Array.isArray(section.assignments) && section.assignments.length) {
      const n = section.assignments.length;
      const tot = section.assignments.reduce((s: number, x: any) => s + (Number(x.qty) || 0), 0);
      meta.logAction = `Pemasangan ditugaskan ke ${n} merchandiser (total ${tot} unit).`;
    }

    // Fase 4 = Surat Jalan. Shipping a partial qty splits the asset (server-side):
    // shipped units -> Fase 4, remainder stays in Gudang (Fase 3).
    if (transitionTarget === 4) {
      const dests = Array.isArray(section.destinations) ? section.destinations : [];
      const shipQty = dests.reduce((s: number, d: any) => s + (Number(d.qty) || 0), 0);
      if (shipQty > detailAsset.quantity) {
        return setGateError(`Total qty tujuan (${shipQty}) melebihi stok di gudang (${detailAsset.quantity}).`);
      }
      const shipRes = await onShipAsset(detailAsset.id, updatedDetails, { logAction: meta.logAction, operator: meta.operator });
      if (!shipRes.ok) {
        setGateError(shipRes.error || "Gagal menerbitkan surat jalan.");
        return;
      }
      closeGate();
      return;
    }

    const result = await onUpdateAssetStage(detailAsset.id, transitionTarget as AssetStage, updatedDetails, meta);
    if (!result.ok) {
      setGateError(result.error || "Gagal memproses transisi di server.");
      return;
    }
    closeGate();
  };

  const statusColors: { [key: number]: string } = {
    1: "bg-blue-50 text-blue-700 border-blue-200",
    2: "bg-teal-50 text-teal-700 border-teal-200",
    3: "bg-green-50 text-green-700 border-green-200",
    4: "bg-orange-50 text-orange-700 border-orange-200",
    5: "bg-amber-50 text-amber-700 border-amber-200",
    6: "bg-indigo-50 text-indigo-700 border-indigo-200",
    7: "bg-pink-50 text-pink-700 border-pink-200",
    8: "bg-rose-50 text-rose-700 border-rose-200",
    9: "bg-cyan-50 text-cyan-700 border-cyan-200",
    10: "bg-slate-100 text-slate-700 border-slate-300"
  };

  const renderField = (f: FieldDef) => {
    const val = gateForm[f.key];
    const set = (v: any) => setGateForm(prev => ({ ...prev, [f.key]: v }));
    const base =
      "w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 text-slate-800 text-xs";

    let control: React.ReactNode;
    if (f.type === "textarea") {
      control = <textarea name={f.key} rows={2} className={base} value={val} onChange={e => set(e.target.value)} placeholder={f.placeholder} />;
    } else if (f.type === "select") {
      const dyn = f.source === "merchandiser" ? merchDir.map(m => m.name) : f.source === "pic" ? picOptions : null;
      const opts = dyn ?? f.options ?? [];
      // Keep an already-saved value selectable even if it's no longer in the directory.
      const withVal = val && !opts.includes(val) ? [val, ...opts] : opts;
      const roleLabel = f.source === "pic" ? "PIC" : "Merchandiser";
      control = (
        <div className="space-y-1">
          <select name={f.key} className={`${base} cursor-pointer font-medium`} value={val || ""} onChange={e => set(e.target.value)}>
            {f.source && <option value="">— pilih {roleLabel} —</option>}
            {withVal.map(o => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {f.source && dyn && dyn.length === 0 && (
            <p className="text-[10px] text-amber-600">
              Belum ada {roleLabel} untuk client {detailAsset?.client || "ini"}. Tambahkan dulu di User Management.
            </p>
          )}
        </div>
      );
    } else if (f.type === "checkbox") {
      control = (
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer">
          <input type="checkbox" name={f.key} checked={!!val} onChange={e => set(e.target.checked)} className="h-4 w-4 accent-blue-600" />
          <span>{val ? "Ya, sudah sesuai" : "Belum / tidak sesuai"}</span>
        </label>
      );
    } else if (f.type === "time") {
      control = <input name={f.key} type="time" className={base} value={val || ""} onChange={e => set(e.target.value)} />;
    } else if (f.type === "generated") {
      control = (
        <div className="flex items-center gap-2">
          <input readOnly name={f.key} value={val || ""} className={`${base} flex-1 font-mono bg-slate-100 cursor-default`} />
          <button
            type="button"
            onClick={() => set(genSuratJalan())}
            title="Generate ulang nomor surat jalan"
            aria-label="Generate ulang nomor surat jalan"
            className="shrink-0 h-[34px] w-[34px] grid place-items-center rounded-lg border border-slate-200 bg-white text-blue-600 hover:bg-blue-50 transition"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      );
    } else if (f.type === "destinations") {
      const rows: any[] = Array.isArray(val) ? val : [];
      const setRows = (r: any[]) => set(r);
      const total = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
      const qty = detailAsset?.quantity || 0;
      control = (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center bg-slate-50 border border-slate-200 rounded-lg p-2">
              <select
                className={`${base} col-span-5 cursor-pointer`}
                value={r.area || ""}
                onChange={e => setRows(rows.map((x, idx) => (idx === i ? { ...x, area: e.target.value } : x)))}
              >
                <option value="">— pilih area —</option>
                {(r.area && !areaOptions.includes(r.area) ? [r.area, ...areaOptions] : areaOptions).map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <select
                className={`${base} col-span-4 cursor-pointer`}
                value={r.picPenerima || ""}
                onChange={e => setRows(rows.map((x, idx) => (idx === i ? { ...x, picPenerima: e.target.value } : x)))}
              >
                <option value="">— pilih PIC —</option>
                {(r.picPenerima && !picOptions.includes(r.picPenerima) ? [r.picPenerima, ...picOptions] : picOptions).map(p => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                className={`${base} col-span-2`}
                placeholder="Qty"
                value={r.qty ?? ""}
                onChange={e => setRows(rows.map((x, idx) => (idx === i ? { ...x, qty: e.target.value } : x)))}
              />
              <button
                type="button"
                onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                disabled={rows.length <= 1}
                title="Hapus tujuan"
                aria-label="Hapus tujuan"
                className="col-span-1 grid h-8 place-items-center rounded-lg text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {picOptions.length === 0 && (
            <p className="text-[10px] text-amber-600">
              Belum ada PIC untuk client {detailAsset?.client || "ini"}. Tambahkan dulu di User Management agar bisa dipilih.
            </p>
          )}
          {areaOptions.length === 0 && (
            <p className="text-[10px] text-amber-600">
              Belum ada master Area. Tambahkan dulu di menu Organisasi agar Area bisa dipilih.
            </p>
          )}
          <div className="flex items-center justify-between pt-0.5">
            <button
              type="button"
              onClick={() => setRows([...rows, { area: "", picPenerima: "", qty: 1 }])}
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
            >
              <Plus className="h-3.5 w-3.5" /> Tambah Tujuan
            </button>
            <span className={`text-[11px] font-semibold ${qty && total === qty ? "text-emerald-600" : "text-amber-600"}`}>
              Total qty: {total}
              {qty ? ` / ${qty}` : ""}
            </span>
          </div>
        </div>
      );
    } else if (f.type === "assignments") {
      const rows: any[] = Array.isArray(val) ? val : [];
      const setRows = (r: any[]) => set(r);
      const total = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
      const qty = detailAsset?.quantity || 0;
      const sisa = qty - total;
      const chosen = new Set(rows.map(r => String(r.merchandiserId)).filter(Boolean));
      control = (
        <div className="space-y-2">
          {rows.map((r, i) => {
            const dq = Number(r.doneQty) || 0; // units this merchandiser has already reported (locked)
            return (
              <div key={i} className="grid grid-cols-12 gap-2 items-center bg-slate-50 border border-slate-200 rounded-lg p-2">
                <div className="col-span-7">
                  <select
                    className={`${base} w-full cursor-pointer disabled:bg-slate-100 disabled:text-slate-500`}
                    value={r.merchandiserId || ""}
                    disabled={dq > 0}
                    onChange={e => {
                      const mid = e.target.value;
                      const m = merchDir.find(x => String(x.id) === mid);
                      setRows(rows.map((x, idx) => (idx === i ? { ...x, merchandiserId: mid ? Number(mid) : "", merchandiser: m ? m.name : "" } : x)));
                    }}
                  >
                    <option value="">— pilih Merchandiser —</option>
                    {merchDir.map(m => (
                      <option key={m.id} value={m.id} disabled={chosen.has(String(m.id)) && String(r.merchandiserId) !== String(m.id)}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  {dq > 0 && <span className="mt-0.5 block text-[9px] font-semibold text-emerald-600">sudah pasang {dq}/{r.qty}</span>}
                </div>
                <input
                  type="number"
                  min={Math.max(1, dq)}
                  className={`${base} col-span-4`}
                  placeholder="Qty"
                  value={r.qty ?? ""}
                  onChange={e => setRows(rows.map((x, idx) => (idx === i ? { ...x, qty: e.target.value } : x)))}
                />
                <button
                  type="button"
                  onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                  disabled={rows.length <= 1 || dq > 0}
                  title={dq > 0 ? "Sudah ada progres — tidak bisa dihapus" : "Hapus merchandiser"}
                  aria-label="Hapus merchandiser"
                  className="col-span-1 grid h-8 place-items-center rounded-lg text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          {merchDir.length === 0 && (
            <p className="text-[10px] text-amber-600">
              Belum ada Merchandiser untuk client {detailAsset?.client || "ini"}. Tambahkan dulu di User Management.
            </p>
          )}
          <div className="flex items-center justify-between pt-0.5">
            <button
              type="button"
              onClick={() => setRows([...rows, { merchandiserId: "", merchandiser: "", qty: Math.max(1, sisa), doneQty: 0 }])}
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
            >
              <Plus className="h-3.5 w-3.5" /> Tambah Merchandiser
            </button>
            <span className={`text-[11px] font-semibold ${total > qty ? "text-rose-600" : sisa === 0 ? "text-emerald-600" : "text-amber-600"}`}>
              Ditugaskan {total}/{qty}
              {total > qty ? " (melebihi!)" : sisa > 0 ? ` · sisa ${sisa} belum ditugaskan` : ""}
            </span>
          </div>
        </div>
      );
    } else if (f.type === "signature") {
      control = <SignaturePad value={val} onChange={set} />;
    } else if (f.type === "checklist") {
      const items = f.options || [];
      const map: any = val && typeof val === "object" ? val : {};
      const passed = items.filter(it => map[it] !== false).length;
      const score = items.length ? Math.round((passed / items.length) * 100) : 0;
      const status = score >= 90 ? "PATUH" : score >= 70 ? "PERLU PERBAIKAN" : "TIDAK PATUH";
      const badge = score >= 90 ? "bg-emerald-100 text-emerald-700" : score >= 70 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700";
      control = (
        <div className="space-y-1.5">
          {items.map(it => {
            const p = map[it] !== false;
            return (
              <div key={it} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <span className="text-xs text-slate-700">{it}</span>
                <button
                  type="button"
                  onClick={() => set({ ...map, [it]: !p })}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded transition ${p ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}
                >
                  {p ? "LULUS" : "TIDAK"}
                </button>
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-500">
              Skor otomatis: <strong className="text-slate-800">{score}</strong> ({passed}/{items.length})
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge}`}>{status}</span>
          </div>
        </div>
      );
    } else {
      control = (
        <input
          name={f.key}
          type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
          min={f.min}
          max={f.max}
          step={f.step}
          readOnly={f.readOnly}
          className={f.readOnly ? `${base} bg-slate-100 cursor-default text-slate-600` : base}
          value={val}
          onChange={e => set(e.target.value)}
          placeholder={f.placeholder}
        />
      );
    }

    return (
      <div key={f.key} className={`space-y-1.5 ${f.full ? "col-span-2" : ""}`}>
        <label className="font-bold text-slate-700 text-xs">
          {f.label} {f.required && <span className="text-rose-500">*</span>}
        </label>
        {control}
        {f.hint && <p className="text-[10px] text-slate-400">{f.hint}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top filter toolbar */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
          <input
            type="text"
            placeholder="Cari ID, Nama Aset, atau Kode WO..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 pl-9 pr-4 py-2 rounded-lg text-xs outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-1.5">
            <span className="text-[10px] text-slate-500 font-bold px-1 uppercase tracking-wider flex items-center gap-1">
              <Filter className="h-3 w-3" /> Kategori:
            </span>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="bg-transparent border-0 text-slate-700 font-bold text-xs select-none cursor-pointer pr-4 focus:ring-0 outline-none"
            >
              <option value="ALL">Semua</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-1.5">
            <span className="text-[10px] text-slate-500 font-bold px-1 uppercase tracking-wider">Step/Fase:</span>
            <select
              value={filterStage}
              onChange={e => setFilterStage(e.target.value)}
              className="bg-transparent border-0 text-slate-700 font-bold text-xs select-none cursor-pointer pr-4 focus:ring-0 outline-none"
            >
              <option value="ALL">Semua Alur (3 s/d 10)</option>
              {[3, 4, 5, 6, 7, 8, 9, 10].map(s => (
                <option key={s} value={s}>
                  Fase {s} - {cleanLabel(s)}
                </option>
              ))}
            </select>
          </div>

          {/* Aset ditambah di menu Master Data (lahir di Gudang/Fase 3) — bukan lagi lewat wizard di sini. */}
        </div>
      </div>

      {/* Asset grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAssetsList.length === 0 ? (
          <div className="col-span-full bg-white p-12 text-center rounded-xl border border-slate-100 text-slate-400">
            Tidak ada aset yang terdaftar untuk kriteria pencarian ini.
          </div>
        ) : (
          filteredAssetsList.map(asset => {
            const IconComp = STAGE_ICONS[asset.currentStage] || ClipboardList;
            return (
              <div
                key={asset.id}
                onClick={() => setDetailAssetId(asset.id)}
                className="bg-white rounded-xl border border-slate-100 hover:border-slate-300 transition-all hover:shadow-md cursor-pointer flex flex-col justify-between overflow-hidden"
              >
                <div className="p-5 border-b border-slate-50 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">{asset.category}</span>
                    <span className="font-mono text-[10px] text-blue-600 font-extrabold bg-blue-50 px-2 py-0.5 rounded border border-blue-100/30">
                      {asset.id}
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm tracking-tight hover:text-blue-600 transition truncate" title={asset.name}>
                    {asset.name}
                  </h4>
                  <p className="text-[11px] text-slate-500 grid grid-cols-2 gap-x-2">
                    <span>
                      Client: <strong className="font-semibold text-slate-700 truncate block">{asset.client.split(" ")[1] || asset.client}</strong>
                    </span>
                    <span>
                      WO-Code: <strong className="font-mono text-slate-700 block">{asset.projectCode}</strong>
                    </span>
                  </p>
                </div>

                <div className="px-5 py-4 bg-slate-50/50 flex justify-between items-center text-xs">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-medium">Banyak / Biaya</p>
                    <p className="font-bold text-slate-800">
                      {asset.quantity} unit <span className="font-normal text-slate-400 text-[10px]">· {formatRupiah(asset.financials.purchaseCost)}</span>
                    </p>
                  </div>
                  {asset.currentStage === 6 && asset.stageDetails?.deployment?.assignments?.length ? (() => {
                    const d: any = asset.stageDetails.deployment;
                    const asg: any[] = d.assignments || [];
                    const installed = d.installedQty != null ? Number(d.installedQty) : installedOf(asg);
                    const full = installed >= asset.quantity;
                    return (
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 uppercase font-medium">Terpasang</p>
                        <p className={`font-extrabold ${full ? "text-emerald-600" : "text-indigo-600"}`}>
                          {installed}/{asset.quantity}
                        </p>
                      </div>
                    );
                  })() : asset.auditScore !== undefined && asset.currentStage >= 6 ? (
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase font-medium">Skor Audit</p>
                      <p
                        className={`font-extrabold ${
                          asset.auditScore >= 90 ? "text-emerald-600" : asset.auditScore >= 70 ? "text-blue-600" : "text-rose-600"
                        }`}
                      >
                        {asset.auditScore}/100
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="p-3 border-t border-slate-50 bg-white flex items-center justify-between">
                  <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold ${statusColors[asset.currentStage]}`}>
                    <IconComp className="h-3.5 w-3.5" />
                    <span>Fase {asset.currentStage}: {cleanLabel(asset.currentStage)}</span>
                  </div>
                  <div className="flex items-center text-slate-400 group hover:text-blue-600 text-xs font-semibold gap-0.5">
                    <span>Detail</span>
                    <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL 2: LIFECYCLE DETAIL + TRANSITION CONTROL */}
      {detailAsset && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100">
            {/* LEFT: specs / QR / financials */}
            <div className="p-6 md:w-5/12 space-y-5 flex-shrink-0 bg-slate-50/50">
              <div className="flex justify-between items-start gap-2">
                <span className="font-mono text-xs bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded border border-blue-200">{detailAsset.id}</span>
                <button onClick={() => setDetailAssetId(null)} className="md:hidden text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-1">
                <h3 className="font-bold text-slate-950 text-base leading-snug">{detailAsset.name}</h3>
                <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold">{detailAsset.category}</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center space-y-3">
                <div className="bg-slate-100 w-32 h-32 mx-auto rounded-lg border border-slate-200 flex flex-col items-center justify-center relative p-2">
                  <QrCode className="h-28 w-28 text-slate-800" />
                  <span className="absolute bottom-1 bg-blue-600 text-[8px] font-bold text-white px-1.5 rounded uppercase">
                    Step {detailAsset.currentStage} Live
                  </span>
                </div>
                <div>
                  <p className="text-xs font-mono font-bold text-slate-700 select-all">{detailAsset.qrcode}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Scan tag QR ini pada fisik unit untuk verifikasi check-point audit.</p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <h5 className="font-extrabold text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-1">Spesifikasi Komponen:</h5>
                <div className="space-y-2 text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Merk / Brand:</span> <strong className="font-bold text-slate-800">{detailAsset.specs.brand || "—"}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">SKU Code:</span> <strong className="font-mono text-slate-800">{detailAsset.specs.sku || "—"}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Dimensi Fisik:</span> <strong className="font-bold text-slate-800">{detailAsset.specs.dimensions || "—"}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Daya / Berat:</span> <strong className="font-bold text-slate-800">{detailAsset.specs.powerWeight || "—"}</strong>
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-xs pt-2">
                <h5 className="font-extrabold text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-1">Arsip Kas &amp; Nilai Buku:</h5>
                <div className="space-y-2 text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Harga Pengadaan:</span> <strong className="font-bold text-slate-800">{formatRupiah(detailAsset.financials.purchaseCost)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Biaya Servis:</span> <strong className="font-bold text-slate-800">{formatRupiah(detailAsset.financials.maintenanceCost)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Estimasi Sisa Scrap:</span> <strong className="font-bold text-blue-600">{formatRupiah(detailAsset.financials.disposalValue)}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT: transition control + timeline */}
            <div className="p-6 md:w-7/12 flex flex-col justify-between max-h-[85vh] overflow-y-auto">
              <div className="space-y-5">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-base">URUTAN PENUH LIFECYCLE (1-10)</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Kelola perpindahan fase aset end-to-end</p>
                  </div>
                  <button
                    onClick={() => setDetailAssetId(null)}
                    className="hidden md:flex text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {detailAsset.currentStage === 5 && detailAsset.stageDetails?.transit?.trackingUrl ? (() => {
                  const tr: any = detailAsset.stageDetails.transit;
                  const sh: any = detailAsset.stageDetails.shipping;
                  const dests: any[] = Array.isArray(sh?.destinations) ? sh.destinations : [];
                  const picLine = dests.map(d => `${d.picPenerima || "-"} (${d.area || "-"})`).join(", ");
                  const waText =
                    `Halo${dests[0]?.picPenerima ? " " + dests[0].picPenerima : ""}, kiriman aset "${detailAsset.name}"` +
                    `${dests.length ? " tujuan " + dests.map(d => d.area).filter(Boolean).join(" / ") : ""}` +
                    `${sh?.suratJalanNo ? " (Surat Jalan " + sh.suratJalanNo + ")" : ""}` +
                    ` sedang dalam pengiriman via ${tr.courier || "kurir"}${tr.trackingNo ? " resi " + tr.trackingNo : ""}.` +
                    ` Lacak posisi di: ${tr.trackingUrl}${tr.eta ? ". Estimasi tiba: " + tr.eta : ""}.`;
                  return (
                    <div className="bg-white border border-emerald-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="bg-emerald-500 text-white p-1.5 rounded-lg"><Truck className="h-3.5 w-3.5" /></span>
                        <div>
                          <p className="text-xs font-extrabold text-slate-800">Pelacakan Kiriman</p>
                          <p className="text-[10px] text-slate-500">
                            {tr.courier || "Kurir"}
                            {tr.trackingNo ? ` · Resi ${tr.trackingNo}` : ""}
                            {tr.eta ? ` · ETA ${tr.eta}` : ""}
                          </p>
                        </div>
                      </div>
                      {picLine && (
                        <p className="text-[11px] text-slate-500">
                          Penerima (PIC): <strong className="text-slate-700">{picLine}</strong>
                        </p>
                      )}
                      <div className="flex gap-2">
                        <a
                          href={tr.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition"
                        >
                          <MapPin className="h-3.5 w-3.5" /> Buka Tracking
                        </a>
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-lg transition"
                        >
                          <ArrowRight className="h-3.5 w-3.5" /> Bagikan ke PIC
                        </a>
                      </div>
                    </div>
                  );
                })() : null}

                {detailAsset.stageDetails?.transit?.podRecipient ? (() => {
                  const tr: any = detailAsset.stageDetails.transit;
                  return (
                    <div className={`rounded-xl p-4 space-y-2 border ${tr.claimFlag ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200"}`}>
                      <div className="flex items-center gap-2">
                        <span className={`${tr.claimFlag ? "bg-rose-500" : "bg-emerald-500"} text-white p-1.5 rounded-lg`}><Check className="h-3.5 w-3.5" /></span>
                        <div>
                          <p className="text-xs font-extrabold text-slate-800">Konfirmasi Penerimaan (POD)</p>
                          <p className="text-[10px] text-slate-500">
                            Diterima oleh <strong className="text-slate-700">{tr.podRecipient}</strong>
                            {tr.podTime ? ` · ${tr.podTime}` : ""} · Kondisi: <strong className="text-slate-700">{tr.conditionOnArrival || "-"}</strong>
                          </p>
                        </div>
                      </div>
                      {tr.signatureBase64 && <img src={tr.signatureBase64} alt="Tanda tangan penerima" className="h-16 bg-white border border-slate-200 rounded" />}
                      {tr.podNote && <p className="text-[11px] text-slate-500">Catatan: {tr.podNote}</p>}
                      {tr.claimFlag && <p className="text-[11px] font-bold text-rose-600">⚠ Barang tiba dalam kondisi rusak — perlu klaim ke kurir.</p>}
                    </div>
                  );
                })() : null}

                {detailAsset.stageDetails?.deployment?.assignments?.length ? (() => {
                  const d: any = detailAsset.stageDetails.deployment;
                  const asg: any[] = d.assignments || [];
                  const installed = d.installedQty != null ? Number(d.installedQty) : installedOf(asg);
                  const totalQ = detailAsset.quantity || asg.reduce((s, a) => s + (Number(a.qty) || 0), 0);
                  const full = installed >= totalQ;
                  const pct = totalQ ? Math.round((installed / totalQ) * 100) : 0;
                  return (
                    <div className={`rounded-xl p-4 space-y-3 border ${full ? "border-emerald-200 bg-emerald-50" : "border-indigo-200 bg-indigo-50"}`}>
                      <div className="flex items-center gap-2">
                        <span className={`${full ? "bg-emerald-500" : "bg-indigo-500"} text-white p-1.5 rounded-lg`}><MapPin className="h-3.5 w-3.5" /></span>
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-slate-800">Pemasangan · Penugasan Merchandiser</p>
                          <p className="text-[10px] text-slate-500">
                            {d.installationDate ? `Rencana ${d.installationDate} · ` : ""}Planogram: <strong className="text-slate-700">{d.planogramMatched ? "Wajib sesuai" : "—"}</strong>
                          </p>
                        </div>
                        <span className={`ml-auto shrink-0 text-[11px] font-extrabold ${full ? "text-emerald-700" : "text-indigo-700"}`}>{installed}/{totalQ} terpasang</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white overflow-hidden border border-slate-200">
                        <div className={`h-full ${full ? "bg-emerald-500" : "bg-indigo-500"} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="space-y-1.5">
                        {asg.map((a, i) => {
                          const dq = a.doneQty != null ? Number(a.doneQty) : a.status === "done" ? Number(a.qty) : 0;
                          const done = dq >= a.qty;
                          const partial = dq > 0 && !done;
                          const circle = done ? "bg-emerald-500" : partial ? "bg-amber-500" : "bg-slate-300";
                          const pill = done ? "bg-emerald-100 text-emerald-700" : partial ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500";
                          return (
                            <div key={i} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                              <span className={`h-6 w-6 shrink-0 grid place-items-center rounded-full text-[9px] font-extrabold text-white ${circle}`}>{dq}/{a.qty}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-bold text-slate-800 truncate">{a.merchandiser}</p>
                                <p className="text-[9px] text-slate-400">{dq}/{a.qty} unit{done && a.completedAt ? ` · selesai ${new Date(a.completedAt).toLocaleDateString("id-ID")}` : partial && a.lastReportAt ? ` · update ${new Date(a.lastReportAt).toLocaleDateString("id-ID")}` : ""}</p>
                              </div>
                              {a.signature && (done || partial) && <img src={a.signature} alt="TTD" className="h-7 bg-white border border-slate-200 rounded" />}
                              <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full ${pill}`}>{done ? "Selesai" : partial ? `Sebagian ${dq}/${a.qty}` : "Menunggu"}</span>
                            </div>
                          );
                        })}
                      </div>
                      {Array.isArray(d.verifiedItems) && d.verifiedItems.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {d.verifiedItems.map((it: string, i: number) => (
                            <span key={i} className="text-[10px] bg-white border border-indigo-200 text-indigo-700 px-1.5 py-0.5 rounded-full">{it}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })() : detailAsset.stageDetails?.deployment?.installTeam ? (() => {
                  const d: any = detailAsset.stageDetails.deployment;
                  return (
                    <div className="rounded-xl p-4 space-y-2 border border-indigo-200 bg-indigo-50">
                      <div className="flex items-center gap-2">
                        <span className="bg-indigo-500 text-white p-1.5 rounded-lg"><MapPin className="h-3.5 w-3.5" /></span>
                        <div>
                          <p className="text-xs font-extrabold text-slate-800">Pemasangan / Setup (BAST)</p>
                          <p className="text-[10px] text-slate-500">
                            Tim: <strong className="text-slate-700">{d.installTeam}</strong>
                            {d.installationDate ? ` · ${d.installationDate}` : ""} · Planogram: <strong className="text-slate-700">{d.planogramMatched ? "Sesuai" : "Belum"}</strong>
                          </p>
                        </div>
                      </div>
                      {Array.isArray(d.verifiedItems) && d.verifiedItems.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {d.verifiedItems.map((it: string, i: number) => (
                            <span key={i} className="text-[10px] bg-white border border-indigo-200 text-indigo-700 px-1.5 py-0.5 rounded-full">{it}</span>
                          ))}
                        </div>
                      )}
                      {d.bastSignature && <img src={d.bastSignature} alt="TTD BAST pemasangan" className="h-16 bg-white border border-slate-200 rounded" />}
                    </div>
                  );
                })() : null}

                {/* Internal (Fase 1) — custodian handover panel */}
                {isInternalDeploy(detailAsset) && detailAsset.stageDetails?.deployment?.custodianName && (() => {
                  const d: any = detailAsset.stageDetails.deployment;
                  return (
                    <div className="rounded-xl p-4 space-y-2 border border-slate-300 bg-slate-50">
                      <div className="flex items-center gap-2">
                        <span className="bg-slate-800 text-white p-1.5 rounded-lg"><UserCheck className="h-3.5 w-3.5" /></span>
                        <div>
                          <p className="text-xs font-extrabold text-slate-800">Serah-Terima Internal (Custodian)</p>
                          <p className="text-[10px] text-slate-500">
                            Dipegang: <strong className="text-slate-700">{d.custodianName}</strong>
                            {d.custodianDept ? ` · ${d.custodianDept}` : ""}{d.handoverDate ? ` · ${d.handoverDate}` : ""}
                          </p>
                        </div>
                      </div>
                      {d.projectName && <p className="text-[10px] text-slate-500">Proyek: <strong className="text-slate-700">{d.projectName}</strong></p>}
                      {d.handoverNote && <p className="text-[10px] text-slate-500 italic">"{d.handoverNote}"</p>}
                      {d.handoverSignature && <img src={d.handoverSignature} alt="TTD BAST serah-terima" className="h-16 bg-white border border-slate-200 rounded" />}
                    </div>
                  );
                })()}

                {/* Event (Fase 2) — roadshow timeline (ordered venue legs) */}
                {Array.isArray(detailAsset.stageDetails?.deployment?.legs) && (detailAsset.stageDetails?.deployment?.legs?.length || 0) > 0 && (() => {
                  const d: any = detailAsset.stageDetails.deployment;
                  const legs = [...d.legs].sort((a: any, b: any) => (a.seq || 0) - (b.seq || 0));
                  return (
                    <div className="rounded-xl p-4 space-y-3 border border-amber-200 bg-amber-50/60">
                      <div className="flex items-center gap-2">
                        <span className="bg-amber-500 text-white p-1.5 rounded-lg"><Compass className="h-3.5 w-3.5" /></span>
                        <div>
                          <p className="text-xs font-extrabold text-slate-800">Roadshow / Venue Timeline</p>
                          <p className="text-[10px] text-slate-500">{legs.length} venue · sekarang di <strong className="text-amber-700">leg {d.currentLegSeq || legs[legs.length - 1]?.seq}</strong></p>
                        </div>
                      </div>
                      <div className="space-y-2 relative pl-4 border-l-2 border-amber-200">
                        {legs.map((lg: any) => {
                          const tone = lg.status === "active" ? "bg-amber-500 text-white border-amber-500" : lg.status === "transit" ? "bg-blue-500 text-white border-blue-500" : lg.status === "done" ? "bg-white text-slate-400 border-slate-200" : "bg-white text-amber-600 border-amber-300";
                          const badge = lg.status === "active" ? "Aktif" : lg.status === "transit" ? "Dikirim" : lg.status === "done" ? "Selesai" : "Rencana";
                          const dot = lg.status === "active" ? "bg-amber-500 border-amber-500" : lg.status === "transit" ? "bg-blue-500 border-blue-500" : lg.status === "done" ? "bg-slate-300 border-slate-300" : "bg-white border-amber-400";
                          return (
                            <div key={lg.seq} className="relative">
                              <span className={`absolute -left-[1.15rem] top-1 h-3 w-3 rounded-full border-2 ${dot}`} />
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400">#{lg.seq}</span>
                                <span className="text-xs font-bold text-slate-800">{lg.venue}</span>
                                {lg.area && <span className="text-[10px] text-slate-500">· {lg.area}</span>}
                                <span className={`ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full border ${tone}`}>{badge}</span>
                              </div>
                              <p className="text-[10px] text-slate-500">
                                {lg.pic ? `PIC: ${lg.pic}` : "PIC: —"}{lg.status === "transit" && lg.shipping?.shippedAt ? ` · dikirim ${lg.shipping.shippedAt}${lg.shipping.eta ? ` · ETA ${lg.shipping.eta}` : ""}` : ""}{lg.setupDate ? ` · setup ${lg.setupDate}` : ""}{lg.teardownDate ? ` → bongkar ${lg.teardownDate}` : ""}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Event shipment tracking (Fase-5 style) — in-transit leg (→venue) OR return-to-gudang (→Gudang) */}
                {(() => {
                  const d: any = detailAsset.stageDetails?.deployment || {};
                  const legs: any[] = Array.isArray(d.legs) ? d.legs : [];
                  const transitLeg = legs.find(l => l.status === "transit");
                  const retTransit = d.returnShipment?.status === "transit" ? d.returnShipment : null;
                  if (!transitLeg && !retTransit) return null;
                  const toGudang = !!retTransit && !transitLeg;
                  const ship: any = transitLeg?.shipping || retTransit;
                  const destName = toGudang ? "Gudang" : `${transitLeg.venue}${transitLeg.area ? ` (${transitLeg.area})` : ""}`;
                  const pic = toGudang ? "" : (transitLeg.pic || "");
                  const tUrl = ship?.trackingUrl;
                  const waText =
                    `Halo${pic ? " " + pic : ""}, aset "${detailAsset.name}" sedang dalam pengiriman ke ${destName}` +
                    ` via ${ship?.courier || "kurir"}${ship?.trackingNo ? " resi " + ship.trackingNo : ""}.` +
                    (tUrl ? ` Lacak: ${tUrl}` : "") +
                    (ship?.eta ? ` Estimasi tiba: ${ship.eta}.` : "");
                  return (
                    <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="bg-blue-500 text-white p-1.5 rounded-lg"><Truck className="h-3.5 w-3.5" /></span>
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-slate-800">Pelacakan Kiriman {toGudang ? "→ Gudang" : "→ Venue"}</p>
                          <p className="text-[10px] text-slate-500">
                            Tujuan: <strong className="text-slate-700">{destName}</strong>
                            {ship?.courier ? ` · ${ship.courier}` : ""}{ship?.trackingNo ? ` · Resi ${ship.trackingNo}` : ""}{ship?.eta ? ` · ETA ${ship.eta}` : ""}
                          </p>
                        </div>
                      </div>
                      {pic && <p className="text-[11px] text-slate-500">Diterima PIC: <strong className="text-slate-700">{pic}</strong></p>}
                      <div className="flex gap-2">
                        {tUrl ? (
                          <a href={tUrl} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition">
                            <MapPin className="h-3.5 w-3.5" /> Buka Tracking
                          </a>
                        ) : (
                          <span className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 text-slate-400 text-xs font-bold px-3 py-2 rounded-lg">Tanpa link tracking</span>
                        )}
                        <a href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-lg transition">
                          <ArrowRight className="h-3.5 w-3.5" /> Bagikan{pic ? " ke PIC" : ""}
                        </a>
                      </div>
                    </div>
                  );
                })()}

                {/* Distribusi (Fase 3) — placement monitor + coverage */}
                {Array.isArray(detailAsset.stageDetails?.deployment?.placements) && (detailAsset.stageDetails?.deployment?.placements?.length || 0) > 0 && (() => {
                  const d: any = detailAsset.stageDetails.deployment;
                  const pls: any[] = d.placements;
                  const installed = pls.reduce((s, p) => s + (Number(p.doneQty) || 0), 0);
                  const cov = d.coverage;
                  return (
                    <div className="rounded-xl p-4 space-y-3 border border-teal-200 bg-teal-50/60">
                      <div className="flex items-center gap-2">
                        <span className="bg-teal-600 text-white p-1.5 rounded-lg"><MapPin className="h-3.5 w-3.5" /></span>
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-slate-800">Distribusi Toko</p>
                          <p className="text-[10px] text-slate-500">{pls.length} toko · terpasang <strong className="text-teal-700">{installed}/{detailAsset.quantity}</strong> unit{cov ? ` · audit ${cov.auditedToko}/${cov.totalToko} (${cov.compliancePct}% patuh)` : ""}</p>
                        </div>
                        <div className="ml-auto shrink-0 flex items-center gap-1.5">
                          <button onClick={openMap} className="flex items-center gap-1 text-[11px] font-bold text-teal-700 bg-white hover:bg-teal-50 border border-teal-300 rounded-lg px-2.5 py-1.5">
                            <MapPin className="h-3.5 w-3.5" /> Peta Sebaran
                          </button>
                          <button onClick={openReport} className="flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5">
                            <FileText className="h-3.5 w-3.5" /> Laporan Klien
                          </button>
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-white rounded-full overflow-hidden border border-teal-100">
                        <div className="h-full bg-teal-500" style={{ width: `${Math.min(100, Math.round((installed / (detailAsset.quantity || 1)) * 100))}%` }} />
                      </div>
                      <div className="space-y-1.5 max-h-56 overflow-y-auto">
                        {pls.map((p: any) => {
                          const dq = Number(p.doneQty) || 0;
                          const done = dq >= (Number(p.qty) || 0), partial = dq > 0 && !done;
                          const pill = done ? "bg-emerald-100 text-emerald-700" : partial ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500";
                          return (
                            <div key={p.locationId} className="flex items-center gap-2 bg-white border border-slate-100 rounded-lg px-2.5 py-1.5">
                              <MapPin className={`h-3 w-3 shrink-0 ${p.gpsLat != null ? "text-teal-500" : "text-slate-300"}`} />
                              <span className="min-w-0 flex-1">
                                <span className="block text-[11px] font-bold text-slate-800 truncate">{p.toko}{p.area ? <span className="font-normal text-slate-400"> · {p.area}</span> : null}</span>
                                <span className="block text-[9px] text-slate-400">{p.merchandiser || "—"}{p.audited ? (p.auditCompliant ? " · ✓ patuh" : " · ✗ temuan") : ""}</span>
                              </span>
                              <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full ${pill}`}>{done ? "Selesai" : partial ? `${dq}/${p.qty}` : "Menunggu"}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {detailAsset.stageDetails?.audit?.lastAuditDate ? (() => {
                  const au: any = detailAsset.stageDetails.audit;
                  const st = au.complianceStatus || (au.scoring >= 90 ? "PATUH" : au.scoring >= 70 ? "PERLU PERBAIKAN" : "TIDAK PATUH");
                  const tones: any = { PATUH: "border-emerald-200 bg-emerald-50", "PERLU PERBAIKAN": "border-amber-200 bg-amber-50", "TIDAK PATUH": "border-rose-200 bg-rose-50" };
                  const badge: any = { PATUH: "bg-emerald-500", "PERLU PERBAIKAN": "bg-amber-500", "TIDAK PATUH": "bg-rose-500" };
                  return (
                    <div className={`rounded-xl p-4 space-y-2 border ${tones[st] || tones["TIDAK PATUH"]}`}>
                      <div className="flex items-center gap-2">
                        <span className={`${badge[st] || badge["TIDAK PATUH"]} text-white p-1.5 rounded-lg`}><ShieldCheck className="h-3.5 w-3.5" /></span>
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-slate-800">Audit &amp; Kepatuhan</p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {au.auditorName || "-"}{au.lastAuditDate ? ` · ${au.lastAuditDate}` : ""} · Skor <strong className="text-slate-700">{au.scoring}</strong>
                          </p>
                        </div>
                        <span className={`ml-auto shrink-0 text-[10px] font-bold text-white px-2 py-0.5 rounded-full ${badge[st] || badge["TIDAK PATUH"]}`}>{st}</span>
                      </div>
                      {Array.isArray(au.findings) && au.findings.length > 0 && (
                        <div className="text-[11px] text-slate-600"><span className="text-slate-400">Temuan:</span> {au.findings.join(", ")}</div>
                      )}
                      {au.recommendation && <div className="text-[11px] text-slate-500">Rekomendasi: {au.recommendation}</div>}
                    </div>
                  );
                })() : null}

                {/* TRANSITION CONTROL PANEL */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50/40 border border-blue-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-600 text-white p-1.5 rounded-lg">
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </span>
                    <div>
                      <p className="text-xs font-extrabold text-slate-800">Proses / Pindahkan Fase</p>
                      <p className="text-[10px] text-slate-500">
                        Posisi saat ini: <strong className="text-blue-700">Fase {detailAsset.currentStage} · {cleanLabel(detailAsset.currentStage)}</strong>
                      </p>
                    </div>
                  </div>

                  {/* Internal custodian handover moved to the dedicated "Aset Internal" menu. */}

                  {/* Proyek — binds the asset to a Project; its mode drives which deploy action
                      (Event / Distribusi) appears below. One source of truth (client + mode + area). */}
                  {onSetProject && !isInternalDeploy(detailAsset) && detailAsset.peruntukan !== "Internal" && detailAsset.currentStage >= 3 && detailAsset.currentStage <= 6 && (() => {
                    const cur = detailAsset.projectId != null ? projects.find(p => p.id === detailAsset.projectId) : null;
                    const base = projects.filter(p => p.status === "active" && p.mode !== "Internal" && (p.client || null) === (detailAsset.client || null));
                    // Always keep the currently-bound project selectable so the controlled value
                    // matches a real <option> (else the select shows "— tanpa proyek —" despite a binding).
                    const opts = cur && !base.some(o => o.id === cur.id) ? [cur, ...base] : base;
                    const modeLocked = !!(detailAsset.stageDetails as any)?.deployment?.mode; // after first deploy, mode is fixed
                    return (
                      <div className="bg-white border border-indigo-100 rounded-xl p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="bg-indigo-600 text-white p-1.5 rounded-lg"><Briefcase className="h-3.5 w-3.5" /></span>
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold text-slate-800">Proyek Deployment</p>
                            <p className="text-[10px] text-slate-500">{cur ? `${cur.name} · ${cur.mode}${cur.area ? " · " + cur.area : ""}` : "Belum ditetapkan — pilih proyek untuk membuka aksi deployment."}</p>
                          </div>
                        </div>
                        <select
                          value={detailAsset.projectId ?? ""}
                          disabled={projBusy || modeLocked}
                          onChange={e => setProjectFor(e.target.value === "" ? null : Number(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                        >
                          <option value="">— tanpa proyek —</option>
                          {opts.map(p => <option key={p.id} value={p.id}>{p.name} · {p.mode}{p.area ? ` · ${p.area}` : ""}</option>)}
                        </select>
                        {opts.length === 0 && <p className="text-[10px] text-amber-600">Belum ada proyek {detailAsset.client ? `untuk ${detailAsset.client}` : ""}. Buat dulu di Proyek &amp; Lokasi.</p>}
                        {modeLocked && <p className="text-[10px] text-slate-400">Mode sudah terkunci ({(detailAsset.stageDetails as any).deployment.mode}) karena aset sudah mulai deployment.</p>}
                        {projError && <p className="text-[10px] text-rose-600 font-semibold">{projError}</p>}
                      </div>
                    );
                  })()}

                  {/* Fase 2 Event — setup / relocate asset at a venue (roadshow). */}
                  {onDeployVenue && projectModeOf(detailAsset) === "Event" && detailAsset.currentStage >= 3 && detailAsset.currentStage <= 6 && (() => {
                    const dep: any = detailAsset.stageDetails?.deployment || {};
                    const legs: any[] = Array.isArray(dep.legs) ? dep.legs : [];
                    const transitLeg = legs.find(l => l.status === "transit");
                    const activeLeg = legs.find(l => l.status === "active");
                    const retTransit = dep.returnShipment?.status === "transit";
                    // Gudang (warehouse) operations are Logistik/Admin only — matches the backend role gate.
                    const gudangRole = !user || user.role === "Admin" || user.role === "Logistik";
                    // Arrive buttons live OUTSIDE the shipment modals → surface their errors inline here.
                    const errBanner = arriveError ? (
                      <div className="w-full flex items-start gap-2 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{arriveError}</span></div>
                    ) : null;
                    // In-transit BACK to warehouse → confirm arrival at gudang (Logistik/Admin only).
                    if (retTransit) return (
                      <>
                        {errBanner}
                        {gudangRole ? (
                          <button onClick={doArriveWarehouse} disabled={arriveBusy}
                            className="w-full flex items-center gap-2 text-left bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white border border-emerald-600 rounded-lg px-3 py-2.5 transition shadow-sm">
                            <Check className="h-4 w-4 shrink-0" />
                            <span className="min-w-0">
                              <span className="block text-[11px] font-bold leading-tight">Konfirmasi Tiba di Gudang</span>
                              <span className="block text-[9px] text-emerald-50 leading-tight">Aset kembali ke Fase 3 (Gudang) — roadshow selesai</span>
                            </span>
                          </button>
                        ) : (
                          <div className="w-full flex items-center gap-2 bg-cyan-50 border border-cyan-200 text-cyan-700 rounded-lg px-3 py-2.5 text-[11px] font-semibold"><Home className="h-4 w-4 shrink-0" /><span>Dalam pengiriman balik ke gudang — menunggu <strong>Logistik/Admin</strong> konfirmasi tiba.</span></div>
                        )}
                      </>
                    );
                    // In-transit TO a venue → confirm arrival at that venue (PIC of the venue's client / Logistik / Admin).
                    if (transitLeg) return (
                      <>
                        {errBanner}
                        <button onClick={doArriveVenue} disabled={arriveBusy}
                          className="w-full flex items-center gap-2 text-left bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white border border-emerald-600 rounded-lg px-3 py-2.5 transition shadow-sm">
                          <Check className="h-4 w-4 shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-[11px] font-bold leading-tight">Konfirmasi Tiba di Venue</span>
                            <span className="block text-[9px] text-emerald-50 leading-tight">{transitLeg.venue}{transitLeg.area ? ` · ${transitLeg.area}` : ""} — set aktif di venue</span>
                          </span>
                        </button>
                      </>
                    );
                    // Arrived (or fresh) → ship to (next) venue; and if at a venue, ship back to gudang (Logistik/Admin).
                    const hasLegs = legs.length > 0;
                    return (
                      <>
                        {errBanner}
                        <button onClick={openVenue}
                          className="w-full flex items-center gap-2 text-left bg-amber-500 hover:bg-amber-600 text-white border border-amber-500 rounded-lg px-3 py-2.5 transition shadow-sm">
                          <Truck className="h-4 w-4 shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-[11px] font-bold leading-tight">{hasLegs ? "Kirim ke Venue Berikutnya" : "Kirim ke Venue (Setup Event)"}</span>
                            <span className="block text-[9px] text-amber-50 leading-tight">{hasLegs ? "Kirim aset + tracking ke venue berikutnya (roadshow)" : "Kirim aset + tracking ke venue #1 (aset ke Fase 6)"}</span>
                          </span>
                        </button>
                        {activeLeg && onShipReturn && gudangRole && (
                          <button onClick={openReturn}
                            className="w-full flex items-center gap-2 text-left bg-white hover:bg-cyan-50 text-cyan-700 border border-cyan-300 rounded-lg px-3 py-2.5 transition shadow-sm">
                            <Home className="h-4 w-4 shrink-0" />
                            <span className="min-w-0">
                              <span className="block text-[11px] font-bold leading-tight">Kirim Balik ke Gudang</span>
                              <span className="block text-[9px] text-cyan-600 leading-tight">Roadshow selesai — kirim aset + tracking balik ke gudang</span>
                            </span>
                          </button>
                        )}
                      </>
                    );
                  })()}

                  {/* Fase 3 Distribusi — fan-out placement per toko. */}
                  {onDistribute && projectModeOf(detailAsset) === "Distribusi" && detailAsset.currentStage >= 3 && detailAsset.currentStage <= 6 && (() => {
                    const hasPls = (detailAsset.stageDetails?.deployment?.placements?.length || 0) > 0;
                    return (
                      <button
                        onClick={openDistribute}
                        className="w-full flex items-center gap-2 text-left bg-teal-600 hover:bg-teal-700 text-white border border-teal-600 rounded-lg px-3 py-2.5 transition shadow-sm"
                      >
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-bold leading-tight">{hasPls ? "Kelola Distribusi Toko" : "Distribusi ke Toko"}</span>
                          <span className="block text-[9px] text-teal-50 leading-tight">{hasPls ? "Tambah / ubah pembagian per-toko (progres aman)" : "Bagi qty ke toko + merchandiser; mereka pasang di lapangan"}</span>
                        </span>
                      </button>
                    );
                  })()}

                  {/* Fase 3 Distribusi — sampling audit (subset toko). */}
                  {onAuditSample && projectModeOf(detailAsset) === "Distribusi" && (detailAsset.stageDetails?.deployment?.placements?.length || 0) > 0 && detailAsset.currentStage >= 6 && detailAsset.currentStage <= 7 && (
                    <button
                      onClick={openSample}
                      className="w-full flex items-center gap-2 text-left bg-white hover:bg-teal-50 text-teal-700 border border-teal-300 rounded-lg px-3 py-2.5 transition"
                    >
                      <ShieldCheck className="h-4 w-4 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-[11px] font-bold leading-tight">Audit Sampling Toko</span>
                        <span className="block text-[9px] text-teal-600 leading-tight">Cek sebagian toko (10–20%) → coverage &amp; kepatuhan</span>
                      </span>
                    </button>
                  )}

                  {detailAsset.currentStage === 6 && !detailAsset.stageDetails?.deployment?.fullyInstalled && !isInternalDeploy(detailAsset) && projectModeOf(detailAsset) !== "Event" && projectModeOf(detailAsset) !== "Distribusi" && (() => {
                    const hasAsg = (detailAsset.stageDetails?.deployment?.assignments?.length || 0) > 0;
                    return (
                      <button
                        onClick={() => openGate(6)}
                        className="w-full flex items-center gap-2 text-left bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-600 rounded-lg px-3 py-2.5 transition shadow-sm"
                      >
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-bold leading-tight">{hasAsg ? "Kelola Penugasan Pemasangan" : "Tugaskan Pemasangan / Setup"}</span>
                          <span className="block text-[9px] text-indigo-100 leading-tight">{hasAsg ? "Tambah / ubah pembagian Merchandiser (progres tetap aman)" : "Bagi qty ke Merchandiser; mereka lapor via mobile (tetap Fase 6)"}</span>
                        </span>
                      </button>
                    );
                  })()}

                  {TRANSITIONS[detailAsset.currentStage]?.length ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {TRANSITIONS[detailAsset.currentStage].map(t => {
                        const Icon = STAGE_ICONS[t];
                        const dep: any = detailAsset.stageDetails?.deployment || {};
                        const asg: any[] = dep.assignments || [];
                        // Audit (6->7) with pending install portions is ALLOWED (soft gate),
                        // but flagged amber so the operator sees the honest progress.
                        const installed = installedOf(asg);
                        const installPartial = t === 7 && detailAsset.currentStage === 6 && asg.length > 0 && !dep.fullyInstalled;
                        return (
                          <button
                            key={t}
                            onClick={() => openGate(t)}
                            title={installPartial ? `Pemasangan baru ${installed}/${detailAsset.quantity} terpasang — Audit tetap boleh, progres sisanya tercatat.` : ""}
                            className={`flex items-center gap-2 text-left border rounded-lg px-3 py-2 transition group shadow-xs ${installPartial ? "bg-amber-50 border-amber-200 hover:bg-amber-500 hover:border-amber-500 hover:text-white" : "bg-white hover:bg-blue-600 hover:text-white border-slate-200 hover:border-blue-600"}`}
                          >
                            <span className={installPartial ? "text-amber-600 group-hover:text-white" : "text-blue-600 group-hover:text-white"}>
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[11px] font-bold leading-tight text-slate-800 group-hover:text-white">{verbFor(t, detailAsset.currentStage, detailAsset)}</span>
                              <span className="block text-[9px] leading-tight text-slate-400 group-hover:text-blue-100">
                                {installPartial ? `⚠ baru ${installed}/${detailAsset.quantity} terpasang` : `Fase ${t} · ${cleanLabel(t)}`}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-500" />
                      Aset sudah di fase akhir (Disposal). Data diarsipkan permanen — tidak ada transisi lanjutan.
                    </div>
                  )}
                </div>

                {/* TIMELINE */}
                <div className="space-y-5 relative pl-4 border-l border-slate-100 py-2">
                  {[3, 4, 5, 6, 7, 8, 9, 10].map(stepNumber => {
                    const isActive = detailAsset.currentStage === stepNumber;
                    const isCompleted = detailAsset.currentStage > stepNumber;
                    const IconComponent = STAGE_ICONS[stepNumber] || ClipboardList;

                    let bubbleClass = "bg-slate-100 text-slate-400 border-slate-200";
                    let textClass = "text-slate-400";
                    if (isActive) {
                      bubbleClass = "bg-blue-600 text-white border-blue-600 outline outline-4 outline-blue-600/15";
                      textClass = "text-slate-900 font-bold";
                    } else if (isCompleted) {
                      bubbleClass = "bg-emerald-500 text-white border-emerald-500";
                      textClass = "text-slate-700 font-semibold";
                    }

                    return (
                      <div key={stepNumber} className="relative group">
                        <span className={`absolute -left-[27px] top-0.5 flex h-5.5 w-5.5 items-center justify-center rounded-full border text-[9px] font-bold shadow-sm transition-all ${bubbleClass}`}>
                          {stepNumber}
                        </span>

                        <div className="pl-3 space-y-1 text-xs">
                          <h5 className={`flex items-center gap-1.5 ${textClass}`}>
                            <IconComponent className="h-3.5 w-3.5" />
                            {cleanLabel(stepNumber)}
                            {isActive && (
                              <span className="bg-blue-50 text-blue-600 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold uppercase animate-pulse">SEDANG JALAN</span>
                            )}
                            {isCompleted && <span className="text-emerald-500 font-bold text-[10px]">✓ Selesai</span>}
                          </h5>

                          {(isActive || isCompleted) && (
                            <div className="mt-1 bg-slate-50 rounded-lg p-2.5 border border-slate-200/50 space-y-1.5 text-[11px] text-slate-600">
                              {stepNumber === 1 && (
                                <p>
                                  Code WO: <strong className="font-mono text-slate-800">{detailAsset.projectCode}</strong> · ID Req:{" "}
                                  <strong className="font-mono">{detailAsset.stageDetails.request.reqId}</strong>
                                  <br />
                                  PIC: <strong>{detailAsset.stageDetails.request.picName}</strong> · Vendor: <strong>{detailAsset.stageDetails.request.vendorName}</strong>
                                </p>
                              )}
                              {stepNumber === 2 && (
                                <p>
                                  Leader Produksi: <strong>{detailAsset.stageDetails.production.prodLead || "—"}</strong>
                                  <br />
                                  QC: <strong className="text-emerald-600">{detailAsset.stageDetails.production.qcScore || 0}/100</strong> · Kode:{" "}
                                  <strong className="font-mono">{detailAsset.stageDetails.production.productionReportCode || "—"}</strong>
                                </p>
                              )}
                              {stepNumber === 3 && (
                                <p>
                                  Gudang: <strong>{detailAsset.stageDetails.inventory.warehouseName || "—"}</strong>
                                  <br />
                                  Rak: <strong>{detailAsset.stageDetails.inventory.shelfLoc || "—"}</strong> · Stok:{" "}
                                  <strong className="font-mono">{detailAsset.stageDetails.inventory.stockCode || "—"}</strong>
                                </p>
                              )}
                              {stepNumber === 4 && (
                                <p>
                                  Surat Jalan: <strong className="font-mono text-slate-800">{detailAsset.stageDetails.shipping.suratJalanNo || "—"}</strong>
                                  <br />
                                  Driver: <strong>{detailAsset.stageDetails.shipping.driverName || "—"}</strong> · Plat:{" "}
                                  <strong className="font-mono">{detailAsset.stageDetails.shipping.vehiclePlate || "—"}</strong>
                                </p>
                              )}
                              {stepNumber === 5 && (
                                <p>
                                  Koordinat: <strong className="font-mono text-slate-700">{detailAsset.stageDetails.transit.currentLat || 0}, {detailAsset.stageDetails.transit.currentLng || 0}</strong>
                                  <br />
                                  ETA: <strong>{detailAsset.stageDetails.transit.eta || "—"}</strong>
                                </p>
                              )}
                              {stepNumber === 6 && (() => {
                                const d: any = detailAsset.stageDetails.deployment;
                                const asg: any[] = d.assignments || [];
                                if (asg.length) {
                                  const installed = d.installedQty != null ? Number(d.installedQty) : installedOf(asg);
                                  return (
                                    <p>
                                      Terpasang: <strong>{installed}/{detailAsset.quantity}</strong> · Rencana: <strong>{d.installationDate || "—"}</strong>
                                      <br />
                                      Tim: <strong>{asg.map(a => `${a.merchandiser} (${a.qty}${a.status === "done" ? " ✓" : ""})`).join(", ")}</strong>
                                    </p>
                                  );
                                }
                                return (
                                  <p>
                                    Tim Pasang: <strong>{d.installTeam || "—"}</strong> · Tgl: <strong>{d.installationDate || "—"}</strong>
                                    <br />
                                    Planogram: <strong>{d.planogramMatched ? "Sesuai" : "Belum dievaluasi"}</strong>
                                  </p>
                                );
                              })()}
                              {stepNumber === 7 && (
                                <p>
                                  Auditor: <strong>{detailAsset.stageDetails.audit.auditorName || "—"}</strong>
                                  <br />
                                  Tgl: <strong>{detailAsset.stageDetails.audit.lastAuditDate || "—"}</strong> · Skor:{" "}
                                  <strong className="text-emerald-600">{detailAsset.stageDetails.audit.scoring || detailAsset.auditScore || 0}/100</strong>
                                </p>
                              )}
                              {stepNumber === 8 && (
                                <p>
                                  Status: <strong className="text-rose-600">🛠 {detailAsset.maintenanceStatus === "REPAIRING" ? "Perbaikan Berjalan" : detailAsset.maintenanceStatus === "RESOLVED" ? "Selesai Diperbaiki" : "Tiket Menunggu"}</strong>
                                  <br />
                                  Isu: <strong>{detailAsset.stageDetails.maintenance.issueType || "—"}</strong> · Tiket:{" "}
                                  <strong className="font-mono">{detailAsset.stageDetails.maintenance.activeTicketId || "—"}</strong>
                                </p>
                              )}
                              {stepNumber === 9 && (
                                <p>
                                  Alasan: <strong>{detailAsset.stageDetails.retrieval.reason || "—"}</strong>
                                  <br />
                                  Keputusan: <strong className="text-blue-600 bg-blue-50 px-1 rounded">{detailAsset.stageDetails.retrieval.assessResult || "—"}</strong>
                                </p>
                              )}
                              {stepNumber === 10 && (
                                <p>
                                  Metode: <strong>{detailAsset.stageDetails.disposal.disposalMethod || "—"}</strong> · Tgl: {detailAsset.stageDetails.disposal.disposalDate || "—"}
                                  <br />
                                  Sisa Scrap: <strong className="text-emerald-600">{formatRupiah(detailAsset.stageDetails.disposal.scrapValue || 0)}</strong>
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 mt-6 flex justify-end">
                <button
                  onClick={() => setDetailAssetId(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-6 py-2 rounded-lg text-xs transition"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: TRANSITION GATE FORM (on top of the detail modal) */}
      {detailAsset && transitionTarget != null && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest block flex items-center gap-1">
                  Fase {detailAsset.currentStage} <ArrowRight className="h-3 w-3" /> Fase {transitionTarget}
                </span>
                <h3 className="text-base font-bold text-slate-950">{gateFor(transitionTarget, detailAsset.currentStage, detailAsset).title}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{detailAsset.name}</p>
              </div>
              <button onClick={closeGate} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submitGate} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">{gateFor(transitionTarget, detailAsset.currentStage, detailAsset).fields.map(renderField)}</div>

              {gateError && (
                <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2 text-xs font-semibold">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{gateError}</span>
                </div>
              )}

              <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-lg text-[10.5px] text-slate-500 flex items-start gap-2">
                <FileText className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                <span>Menyimpan akan memindahkan aset ke <strong className="text-slate-700">Fase {transitionTarget} · {cleanLabel(transitionTarget)}</strong>, mencatat log aktivitas, dan memperbarui dashboard secara real-time.</span>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={closeGate} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs transition">
                  Batal
                </button>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2 rounded-lg text-xs transition shadow-sm flex items-center gap-1.5">
                  <Check className="h-4 w-4" />
                  Simpan &amp; Pindahkan Fase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: INTERNAL HANDOVER (serah-terima ke Karyawan/custodian) */}
      {detailAsset && handoverOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold text-slate-700 uppercase tracking-widest block flex items-center gap-1">Serah-Terima Internal <ArrowRight className="h-3 w-3" /> Fase 6</span>
                <h3 className="text-base font-bold text-slate-950">Serahkan ke Karyawan (Custodian)</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{detailAsset.name} · {detailAsset.quantity} unit</p>
              </div>
              <button onClick={() => setHandoverOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitHandover} className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Karyawan Penerima (Custodian) <span className="text-rose-500">*</span></label>
                <select value={handoverForm.custodianId} onChange={e => setHandoverForm({ ...handoverForm, custodianId: e.target.value })} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 cursor-pointer">
                  <option value="">— pilih karyawan —</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.department ? ` · ${e.department}` : ""}</option>)}
                </select>
                {employees.length === 0 && <p className="text-[10px] text-amber-600">Belum ada karyawan. Tambahkan dulu di menu Organisasi → Karyawan.</p>}
              </div>
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Tanggal Serah-Terima</label>
                <input type="date" value={handoverForm.handoverDate} onChange={e => setHandoverForm({ ...handoverForm, handoverDate: e.target.value })} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Catatan (opsional)</label>
                <textarea value={handoverForm.note} onChange={e => setHandoverForm({ ...handoverForm, note: e.target.value })} rows={2} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 resize-none" placeholder="cth. Laptop Lenovo + charger + tas" />
              </div>
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Tanda Tangan BAST (opsional)</label>
                <SignaturePad value={handoverForm.signature} onChange={v => setHandoverForm({ ...handoverForm, signature: v })} />
              </div>
              {handoverError && <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 flex-shrink-0" /><span>{handoverError}</span></div>}
              <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-lg text-[10.5px] text-slate-500 flex items-start gap-2">
                <FileText className="h-3.5 w-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                <span>Aset akan pindah ke <strong className="text-slate-700">Fase 6 · Terpasang/Dipakai</strong> dengan custodian tercatat (skip surat jalan/transit untuk aset internal).</span>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setHandoverOpen(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg transition">Batal</button>
                <button type="submit" disabled={handoverBusy} className="bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white font-bold px-5 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"><UserCheck className="h-4 w-4" />Serah-Terima</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: EVENT VENUE SETUP / RELOCATE (roadshow leg) */}
      {detailAsset && venueOpen && (() => {
        const hasLegs = (detailAsset.stageDetails?.deployment?.legs?.length || 0) > 0;
        return (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest block">Event / Roadshow · Kirim</span>
                <h3 className="text-base font-bold text-slate-950">{hasLegs ? "Kirim ke Venue Berikutnya" : "Kirim ke Venue (Setup)"}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{detailAsset.name}</p>
              </div>
              <button onClick={() => setVenueOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitVenue} className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Venue <span className="text-rose-500">*</span></label>
                <select value={venueForm.locationId} onChange={e => setVenueForm({ ...venueForm, locationId: e.target.value })} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-amber-500 cursor-pointer">
                  <option value="">— pilih venue —</option>
                  {venues.map(v => <option key={v.id} value={v.id}>{v.name}{v.area ? ` · ${v.area}` : ""}</option>)}
                </select>
                {venues.length === 0 && <p className="text-[10px] text-amber-600">Belum ada venue untuk client ini. Tambahkan dulu di Proyek &amp; Lokasi (tipe Venue).</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><label className="font-bold text-slate-700">PIC di Venue</label>
                  <select value={venueForm.pic} onChange={e => setVenueForm({ ...venueForm, pic: e.target.value })} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-amber-500 cursor-pointer">
                    <option value="">— pilih PIC —</option>
                    {(venueForm.pic && !picOptions.includes(venueForm.pic) ? [venueForm.pic, ...picOptions] : picOptions).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5"><label className="font-bold text-slate-700">Rencana Setup</label><input type="date" value={venueForm.setupDate} onChange={e => setVenueForm({ ...venueForm, setupDate: e.target.value })} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-amber-500" /></div>
              </div>
              {/* Tracking kiriman (seperti Fase 5 Pengiriman) — aset dikirim ke venue tujuan */}
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2.5">
                <p className="text-[11px] font-extrabold text-blue-800 flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Tracking Pengiriman ke Venue</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><label className="font-bold text-slate-700">Kurir / Vendor</label>
                    <select value={venueForm.courier} onChange={e => setVenueForm({ ...venueForm, courier: e.target.value })} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer">
                      <option value="">— pilih kurir —</option>
                      {COURIERS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5"><label className="font-bold text-slate-700">ETA (estimasi tiba)</label><input value={venueForm.eta} onChange={e => setVenueForm({ ...venueForm, eta: e.target.value })} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500" placeholder="cth. 2 hari / 25 Jul" /></div>
                </div>
                <div className="space-y-1.5"><label className="font-bold text-slate-700">Link Tracking (tempel dari kurir)</label><input value={venueForm.trackingUrl} onChange={e => setVenueForm({ ...venueForm, trackingUrl: e.target.value })} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500" placeholder="https://… link resi/tracking" /></div>
                <div className="space-y-1.5"><label className="font-bold text-slate-700">Nomor Resi (opsional)</label><input value={venueForm.trackingNo} onChange={e => setVenueForm({ ...venueForm, trackingNo: e.target.value })} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500" placeholder="cth. JX1234567890" /></div>
              </div>
              <div className="space-y-1.5"><label className="font-bold text-slate-700">Catatan (opsional)</label><textarea value={venueForm.note} onChange={e => setVenueForm({ ...venueForm, note: e.target.value })} rows={2} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-amber-500 resize-none" placeholder="cth. Tenda + sound + booth" /></div>
              {venueError && <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 flex-shrink-0" /><span>{venueError}</span></div>}
              <div className="p-2.5 bg-amber-50 border border-amber-200/70 rounded-lg text-[10.5px] text-amber-700 flex items-start gap-2">
                <Truck className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>{hasLegs ? "Venue aktif ditutup, aset DIKIRIM ke venue berikutnya (status: dalam pengiriman). Konfirmasi “Tiba di Venue” saat sampai." : "Aset dikirim ke venue #1 (aset ke Fase 6, status dalam pengiriman). Konfirmasi “Tiba di Venue” saat sampai."}</span>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setVenueOpen(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg transition">Batal</button>
                <button type="submit" disabled={venueBusy} className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-bold px-5 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"><Truck className="h-4 w-4" />{hasLegs ? "Kirim ke Venue" : "Kirim & Setup"}</button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}

      {/* MODAL 5b: KIRIM BALIK KE GUDANG (return shipment, roadshow selesai) */}
      {detailAsset && returnOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold text-cyan-600 uppercase tracking-widest block">Event / Roadshow · Selesai</span>
                <h3 className="text-base font-bold text-slate-950">Kirim Balik ke Gudang</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{detailAsset.name}</p>
              </div>
              <button onClick={() => setReturnOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitReturn} className="p-5 space-y-4 text-xs">
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2.5">
                <p className="text-[11px] font-extrabold text-blue-800 flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Tracking Pengiriman ke Gudang</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><label className="font-bold text-slate-700">Kurir / Vendor</label>
                    <select value={returnForm.courier} onChange={e => setReturnForm({ ...returnForm, courier: e.target.value })} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer">
                      <option value="">— pilih kurir —</option>
                      {COURIERS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5"><label className="font-bold text-slate-700">ETA (estimasi tiba)</label><input value={returnForm.eta} onChange={e => setReturnForm({ ...returnForm, eta: e.target.value })} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500" placeholder="cth. 2 hari / 25 Jul" /></div>
                </div>
                <div className="space-y-1.5"><label className="font-bold text-slate-700">Link Tracking (tempel dari kurir)</label><input value={returnForm.trackingUrl} onChange={e => setReturnForm({ ...returnForm, trackingUrl: e.target.value })} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500" placeholder="https://… link resi/tracking" /></div>
                <div className="space-y-1.5"><label className="font-bold text-slate-700">Nomor Resi (opsional)</label><input value={returnForm.trackingNo} onChange={e => setReturnForm({ ...returnForm, trackingNo: e.target.value })} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500" placeholder="cth. JX1234567890" /></div>
              </div>
              {returnError && <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 flex-shrink-0" /><span>{returnError}</span></div>}
              <div className="p-2.5 bg-cyan-50 border border-cyan-200/70 rounded-lg text-[10.5px] text-cyan-700 flex items-start gap-2">
                <Home className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>Venue aktif ditutup & aset dikirim balik ke gudang (status: dalam pengiriman). Konfirmasi “Tiba di Gudang” saat sampai — aset kembali ke Fase 3.</span>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setReturnOpen(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg transition">Batal</button>
                <button type="submit" disabled={returnBusy} className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 text-white font-bold px-5 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"><Truck className="h-4 w-4" />Kirim Balik</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: DISTRIBUSI — fan-out placement per toko */}
      {detailAsset && distOpen && (() => {
        const tot = distRows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
        return (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold text-teal-600 uppercase tracking-widest block">Distribusi ke Toko</span>
                <h3 className="text-base font-bold text-slate-950">Bagi {detailAsset.quantity} unit ke toko</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{detailAsset.name}</p>
              </div>
              <button onClick={() => setDistOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitDistribute} className="p-5 space-y-3 text-xs">
              {tokos.length === 0 && <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Belum ada toko untuk client ini. Tambahkan di Proyek &amp; Lokasi (tipe Toko), atau merchandiser bisa tambah di lapangan.</p>}
              <div className="space-y-2">
                {distRows.map((r, i) => {
                  // Area-lock UX: scope the MD dropdown to the picked toko's area + warn if none.
                  const toko = tokos.find(t => String(t.id) === String(r.locationId));
                  const tokoArea = toko?.area || null;
                  const tokoNoArea = !!(r.locationId && !tokoArea);              // toko belum ber-area
                  const mdsForRow = tokoArea ? merchDir.filter(m => m.area === tokoArea) : []; // only in-area MDs are valid
                  const noMd = !!(r.locationId && tokoArea && mdsForRow.length === 0);
                  // Keep a stale/out-of-area selected MD VISIBLE (flagged) so it isn't silently blank on edit.
                  const staleMd = !!r.merchandiserId && !mdsForRow.some(m => String(m.id) === String(r.merchandiserId));
                  const staleMdName = staleMd ? (merchDir.find(m => String(m.id) === String(r.merchandiserId))?.name || "MD") : null;
                  return (
                  <div key={i} className="space-y-1">
                    <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                    <select value={r.locationId} onChange={e => setDistRows(rows => rows.map((x, j) => j === i ? { ...x, locationId: e.target.value, merchandiserId: "" } : x))} className="bg-slate-50 border border-slate-200 px-2 py-2 rounded-lg outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer min-w-0">
                      <option value="">— toko —</option>
                      {tokos.map(t => <option key={t.id} value={t.id}>{t.name}{t.area ? ` · ${t.area}` : ""}</option>)}
                    </select>
                    <select value={r.merchandiserId} disabled={!r.locationId || tokoNoArea} onChange={e => setDistRows(rows => rows.map((x, j) => j === i ? { ...x, merchandiserId: e.target.value } : x))} className="bg-slate-50 border border-slate-200 px-2 py-2 rounded-lg outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer min-w-0 disabled:opacity-50">
                      <option value="">{tokoNoArea ? "— toko tanpa area —" : tokoArea ? `— MD area ${tokoArea} —` : "— pilih toko dulu —"}</option>
                      {staleMd && <option value={r.merchandiserId}>⚠ {staleMdName} (luar area — ganti)</option>}
                      {mdsForRow.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <input type="number" min={0} value={r.qty} onChange={e => setDistRows(rows => rows.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} className="w-16 bg-slate-50 border border-slate-200 px-2 py-2 rounded-lg outline-none focus:ring-1 focus:ring-teal-500" placeholder="Qty" />
                    <button type="button" onClick={() => setDistRows(rows => rows.length > 1 ? rows.filter((_, j) => j !== i) : rows)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    {noMd && <p className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" /> Belum ada MD di area <strong>{tokoArea}</strong> — tambahkan user Merchandiser area itu di User Management.</p>}
                    {tokoNoArea && <p className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" /> Toko ini belum punya Area — set area toko dulu di Proyek &amp; Lokasi.</p>}
                  </div>
                  );
                })}
              </div>
              <button type="button" onClick={() => setDistRows(rows => [...rows, { locationId: "", merchandiserId: "", qty: "1" }])} className="flex items-center gap-1 text-[11px] text-teal-700 font-bold hover:text-teal-800"><Plus className="h-3.5 w-3.5" /> Tambah Toko</button>
              <div className={`text-[11px] font-bold ${tot > (detailAsset.quantity || 0) ? "text-rose-600" : "text-slate-500"}`}>Total dibagi: {tot} / {detailAsset.quantity} unit{tot < (detailAsset.quantity || 0) ? " (boleh kurang — bertahap)" : ""}</div>
              {distError && <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 flex-shrink-0" /><span>{distError}</span></div>}
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setDistOpen(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg transition">Batal</button>
                <button type="submit" disabled={distBusy} className="bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-bold px-5 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"><MapPin className="h-4 w-4" />Simpan Distribusi</button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}

      {/* MODAL 7: SAMPLING AUDIT — mark a subset of toko audited + compliant */}
      {detailAsset && sampleOpen && (() => {
        const pls: any[] = (detailAsset.stageDetails as any)?.deployment?.placements || [];
        const picked = Object.values(sampleSel).filter(Boolean).length;
        return (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold text-teal-600 uppercase tracking-widest block">Audit Sampling</span>
                <h3 className="text-base font-bold text-slate-950">Cek sebagian toko</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Pilih ~10–20% toko · {picked} dipilih{sampleMethod === "auto" ? " · auto-random" : ""}</p>
              </div>
              <button onClick={() => setSampleOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitSample} className="p-5 space-y-3 text-xs">
              {/* Auto-random selector: sistem pilih X% toko acak (vs pilih manual di bawah). */}
              <div className="flex items-center gap-2 bg-teal-50 border border-teal-100 rounded-lg p-2.5">
                <span className="text-[11px] font-bold text-teal-700 whitespace-nowrap">🎲 Auto-random</span>
                <input type="number" min={1} max={100} value={samplePctInput} onChange={e => setSamplePctInput(e.target.value)} className="w-14 rounded-md border border-teal-200 bg-white px-2 py-1 text-center text-[11px] font-bold text-slate-700 outline-none focus:border-teal-400" />
                <span className="text-[11px] font-semibold text-teal-600">%</span>
                <button type="button" onClick={autoRandomSample} className="ml-auto text-[10px] font-bold px-2.5 py-1.5 rounded-md bg-teal-600 hover:bg-teal-700 text-white transition">Pilih Acak</button>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>atau pilih toko manual di bawah</span>
                {picked > 0 && <button type="button" onClick={() => { setSampleSel({}); setSampleMethod("manual"); }} className="font-bold text-slate-500 hover:text-slate-700 underline">Reset</button>}
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {pls.map((p: any) => {
                  const sel = sampleSel[p.locationId];
                  return (
                    <div key={p.locationId} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2">
                      <span className="min-w-0 flex-1 text-[11px] font-bold text-slate-700 truncate">{p.toko}{p.audited ? <span className="font-normal text-teal-500"> · sudah</span> : null}</span>
                      <button type="button" onClick={() => { const next = sel === "compliant" ? undefined : "compliant"; if ((sel === undefined) !== (next === undefined)) setSampleMethod("manual"); setSampleSel(s => ({ ...s, [p.locationId]: next })); }} className={`text-[10px] font-bold px-2 py-1 rounded-md border ${sel === "compliant" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-emerald-600 border-emerald-200"}`}>Patuh</button>
                      <button type="button" onClick={() => { const next = sel === "issue" ? undefined : "issue"; if ((sel === undefined) !== (next === undefined)) setSampleMethod("manual"); setSampleSel(s => ({ ...s, [p.locationId]: next })); }} className={`text-[10px] font-bold px-2 py-1 rounded-md border ${sel === "issue" ? "bg-rose-500 text-white border-rose-500" : "bg-white text-rose-600 border-rose-200"}`}>Temuan</button>
                    </div>
                  );
                })}
              </div>
              {sampleError && <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 flex-shrink-0" /><span>{sampleError}</span></div>}
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setSampleOpen(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg transition">Batal</button>
                <button type="submit" disabled={sampleBusy} className="bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-bold px-5 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" />Simpan Audit</button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}

      {/* MODAL 8: DISTRIBUSI MAP — toko pins (lazy-loaded Leaflet) */}
      {mapOpen && detailAsset && (
        <React.Suspense fallback={<div className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-sm grid place-items-center text-white text-sm">Memuat peta…</div>}>
          <TokoMap
            placements={(detailAsset.stageDetails as any)?.deployment?.placements || []}
            locGps={locGps}
            quantity={detailAsset.quantity || 0}
            onClose={() => setMapOpen(false)}
          />
        </React.Suspense>
      )}

      {/* MODAL 9: CLIENT REPORT — per-toko coverage + geo + foto (printable) */}
      {reportOpen && detailAsset && (
        <React.Suspense fallback={<div className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-sm grid place-items-center text-white text-sm">Menyiapkan laporan…</div>}>
          <ReportDistribusi
            asset={detailAsset}
            evidence={reportEvidence}
            locGps={locGps}
            company={settings?.company_name}
            today={new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}
            onClose={() => setReportOpen(false)}
          />
        </React.Suspense>
      )}
    </div>
  );
}
