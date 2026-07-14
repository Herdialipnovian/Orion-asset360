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
  ArrowRight,
  AlertTriangle,
  Check,
  Play,
  RefreshCw,
  Building,
  UserCheck,
  Briefcase,
  Loader2,
  Eye
} from "lucide-react";
import { Asset, AssetStage } from "../types";
import { api, type AuthUser } from "../api";
import { installedOf } from "../installProgress";
import { AUDIT_ITEMS, QTY_ITEM_KEY, computeAudit, defaultAuditMap } from "../auditChecklist";
import { faseNo, TOTAL_FASE } from "../faseDisplay";

// Code-split: Leaflet (+ its CSS) only loads when the operator opens the distribusi map.
const TokoMap = React.lazy(() => import("./TokoMap"));
const ReportDistribusi = React.lazy(() => import("./ReportDistribusi"));
import { SAMPLE_CLIENTS } from "../data/initialData";

const STAGE_ICONS: { [key: number]: any } = {
  3: Home,
  4: Truck,
  5: MapPin,
  6: Compass,
  7: ShieldCheck,
  8: Wrench,
  9: CornerUpLeft,
  10: Trash2
};

// One short, scannable operator term per phase (internal stage → name). Single source of truth:
// every faseNo()+cleanLabel() call site reads from here, so a rename here updates the whole app.
const STAGE_LABELS: { [key: number]: string } = {
  3: "Gudang",
  4: "Surat Jalan",
  5: "Transit",
  6: "Proses Pemasangan",
  7: "Asset Terpasang",
  8: "Audit",
  9: "Penarikan",
  10: "Disposal"
};
// One-line context under each phase name (identity card + timeline).
const STAGE_SUBTITLES: { [key: number]: string } = {
  3: "Tersimpan di gudang, siap dikirim",
  4: "Surat Jalan terbit, aset dilepas",
  5: "Dalam perjalanan kurir/vendor",
  6: "Aktif di lokasi / dipakai custodian",
  7: "Pengecekan fisik & kepatuhan",
  8: "Tiket perbaikan sedang berjalan",
  9: "Ditarik / direlokasi dari lokasi",
  10: "Dimusnahkan, nilai scrap dicatat"
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
  3: "Terima di Gudang",
  4: "Terbitkan Surat Jalan",
  5: "Input Tracking / Transit",
  6: "Konfirmasi Pemasangan",
  7: "Lakukan Audit",
  8: "Buka Tiket Pemeliharaan",
  9: "Tarik dari Peredaran",
  10: "Musnahkan Aset"
};

type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea" | "checkbox" | "tags" | "time" | "generated" | "destinations" | "signature" | "checklist" | "auditstatus" | "assignments";
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
const BATCH_INP = "w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs outline-none focus:bg-white focus:ring-1 focus:ring-blue-500";
// Shipment-group lockstep MOVEMENT path: a batched asset at each of these stages can advance the
// whole group (same batchId) together to the mapped next stage. Audit(7)/Maintenance(8) excluded.
const GROUP_NEXT: { [k: number]: number } = { 4: 5, 5: 6, 6: 9, 9: 3 };
const batchIdOf = (a: Asset | null | undefined) => (a?.stageDetails as any)?.shipping?.batchId as string | undefined;
const COURIERS = [
  "JNE", "J&T Express", "SiCepat", "AnterAja", "Ninja Xpress", "Wahana", "Pos Indonesia",
  "ID Express", "Lion Parcel", "Shopee (SPX Express)", "Lalamove", "GoSend (Gojek)",
  "GrabExpress", "Paxel", "Deliveree", "Lainnya"
];

// Visual identity per deployment flow, so the flows are distinguishable at a glance (color bar + chip).
// "Belum" = not yet bound to a project & not yet shipped — an undecided Gudang asset (neutral grey),
// distinct from a committed courier shipment (Kurir Standar / blue).
const FLOW_UI: Record<string, { label: string; bar: string; chip: string; ring: string; Icon: React.ComponentType<{ className?: string }> }> = {
  Belum:      { label: "Belum diikat proyek", bar: "bg-slate-300", chip: "bg-slate-100 text-slate-500 border-slate-200", ring: "hover:border-slate-300", Icon: ClipboardList },
  Standard:   { label: "Kurir Standar",      bar: "bg-blue-500",   chip: "bg-blue-50 text-blue-700 border-blue-200",     ring: "hover:border-blue-300",   Icon: Truck },
  Event:      { label: "Event Roadshow",     bar: "bg-amber-500",  chip: "bg-amber-50 text-amber-700 border-amber-200",  ring: "hover:border-amber-300",  Icon: Compass },
  Distribusi: { label: "Distribusi Toko",    bar: "bg-teal-500",   chip: "bg-teal-50 text-teal-700 border-teal-200",     ring: "hover:border-teal-300",   Icon: Building },
  Internal:   { label: "Internal Custodian", bar: "bg-violet-500", chip: "bg-violet-50 text-violet-700 border-violet-200", ring: "hover:border-violet-300", Icon: Briefcase },
};
// VISUAL key: a bound/stamped flow, or "Belum" when the asset has no project and no stamped mode yet.
// (Gating logic elsewhere still treats an unbound asset as courier-eligible.)
const flowKeyOf = (m: string | null | undefined): "Belum" | "Standard" | "Event" | "Distribusi" | "Internal" =>
  m === "Event" || m === "Distribusi" || m === "Internal" || m === "Standard" ? m : "Belum";

// Per-item audit checklist (Fase 7) — shared with the mobile field app so both score identically.

// The data captured when transitioning INTO each stage (drives the gate form)
const GATE_FORMS: { [target: number]: { stageKey: string; title: string; fields: FieldDef[] } } = {
  2: {
    stageKey: "production",
    title: "Mulai Produksi / Perakitan",
    fields: [
      { key: "prodLead", label: "Leader Produksi", type: "text", required: true, placeholder: "contoh: Gerry Pratama" },
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
      { key: "vendorShipping", label: "Vendor Logistik", type: "select", options: COURIERS },
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
      { key: "trackingNo", label: "Nomor Resi (opsional)", type: "text", placeholder: "contoh: JX1234567890" },
      { key: "eta", label: "Estimasi Tiba (ETA)", type: "text", required: true, placeholder: "contoh: 2 hari / 25 Jul" }
    ]
  },
  6: {
    stageKey: "deployment",
    title: "Tugaskan Pemasangan / Setup",
    fields: [
      { key: "installationDate", label: "Tanggal Rencana Pasang", type: "date", required: true },
      { key: "assignments", label: "Tugaskan ke Merchandiser (bagi per qty)", type: "assignments", full: true, required: true, hint: "Merchandiser menyelesaikan porsinya melalui aplikasi mobile (foto beserta tanda tangan BAST). Total qty harus sama dengan qty aset." },
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
        label: "Checklist Audit per Aset (skor & status otomatis)",
        type: "auditstatus",
        full: true
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
  onAssignInstall: (assetId: string, assignments: { merchandiserId: number; qty: number }[], baseUpdatedAt?: string, locationId?: number | null) => Promise<{ ok: boolean; error?: string }>;
  onHandoverInternal?: (assetId: string, p: { custodianId: number; handoverDate?: string; signatureBase64?: string; note?: string; projectId?: number | null }) => Promise<{ ok: boolean; error?: string }>;
  onDeployVenue?: (assetId: string, p: { locationId: number; pic?: string; setupDate?: string; note?: string; signatureBase64?: string; projectId?: number | null; suratJalanNo?: string; courier?: string; trackingUrl?: string; trackingNo?: string; eta?: string }) => Promise<{ ok: boolean; error?: string }>;
  onArriveVenue?: (assetId: string) => Promise<{ ok: boolean; error?: string }>;
  onShipReturn?: (assetId: string, p: { suratJalanNo?: string; courier?: string; trackingUrl?: string; trackingNo?: string; eta?: string }) => Promise<{ ok: boolean; error?: string }>;
  onArriveWarehouse?: (assetId: string) => Promise<{ ok: boolean; error?: string }>;
  onBatchShip?: (p: { items: { id: string; qty: number }[]; deployMode?: string; projectId?: number | null; suratJalanNo?: string; driverName: string; vehiclePlate?: string; vendorShipping?: string; departureTime?: string; area: string; picPenerima?: string; courier?: string; trackingUrl?: string; trackingNo?: string; eta?: string }) => Promise<{ ok: boolean; error?: string; suratJalanNo?: string }>;
  onGroupAdvance?: (p: { batchId: string; fromStage: number; toStage: number; stageKey?: string; section?: any; perAsset?: Record<string, any>; meta?: { logAction?: string; operator?: string } }) => Promise<{ ok: boolean; error?: string; count?: number }>;
  onGroupVenue?: (p: { batchId: string; op: "deploy" | "arrive-venue" | "ship-return" | "arrive-warehouse"; locationId?: number; pic?: string; suratJalanNo?: string; courier?: string; trackingUrl?: string; trackingNo?: string; eta?: string; setupDate?: string }) => Promise<{ ok: boolean; error?: string; count?: number; skipped?: number }>;
  onDistribute?: (assetId: string, placements: { locationId: number; merchandiserId?: number; qty: number }[], projectId?: number | null) => Promise<{ ok: boolean; error?: string }>;
  onPlaceToko?: (assetId: string, p: { locationId: number; doneQty?: number; gpsLat?: number; gpsLng?: number; signatureBase64?: string; note?: string }) => Promise<{ ok: boolean; error?: string }>;
  onCompleteInstall?: (assetId: string, p: { merchandiserId: number; doneQty?: number; note?: string }) => Promise<{ ok: boolean; error?: string }>;
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

// Per-asset audit checklist (8 items + qty + auto score). Reused by the single-asset gate AND by the
// grouped audit (one block per member) so a shipment is audited PER ITEM in one form, not once-for-all.
function AuditChecklist({ map, onChange }: { map: Record<string, any>; onChange: (m: Record<string, any>) => void }) {
  const m = map && typeof map === "object" ? map : {};
  const qty = m[QTY_ITEM_KEY] === "" ? "" : Number(m[QTY_ITEM_KEY]) || 0;
  const passed = AUDIT_ITEMS.filter(it => m[it.key] !== false).length;
  const score = AUDIT_ITEMS.length ? Math.round((passed / AUDIT_ITEMS.length) * 100) : 0;
  const status = score >= 90 ? "PATUH" : score >= 70 ? "PERLU PERBAIKAN" : "TIDAK PATUH";
  const badge = score >= 90 ? "bg-emerald-100 text-emerald-700" : score >= 70 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700";
  const pick = (k: string, good: boolean) => onChange({ ...m, [k]: good });
  return (
    <div className="space-y-1.5">
      {AUDIT_ITEMS.map(it => {
        const good = m[it.key] !== false;
        return (
          <div key={it.key} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <span className="text-xs text-slate-700 flex-1 min-w-0">{it.label}</span>
            {it.qty && (
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-slate-500">Qty</span>
                <input type="number" min={0} value={qty} onChange={e => onChange({ ...m, [QTY_ITEM_KEY]: e.target.value === "" ? "" : Math.max(0, Number(e.target.value)) })} className="w-14 bg-white border border-slate-200 px-2 py-1 rounded text-xs text-center outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
            )}
            <div className="flex rounded-md overflow-hidden border border-slate-200 shrink-0">
              <button type="button" onClick={() => pick(it.key, true)} className={`text-[10px] font-bold px-2.5 py-1 transition ${good ? "bg-emerald-500 text-white" : "bg-white text-slate-500 hover:bg-slate-100"}`}>{it.good}</button>
              <button type="button" onClick={() => pick(it.key, false)} className={`text-[10px] font-bold px-2.5 py-1 transition ${!good ? "bg-rose-500 text-white" : "bg-white text-slate-500 hover:bg-slate-100"}`}>{it.bad}</button>
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-slate-500">Skor otomatis: <strong className="text-slate-800">{score}</strong> ({passed}/{AUDIT_ITEMS.length})</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge}`}>{status}</span>
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
  onBatchShip,
  onGroupAdvance,
  onGroupVenue,
  onDistribute,
  onPlaceToko,
  onCompleteInstall,
  onAuditSample,
  onSetProject,
  initialStageFilter = "ALL"
}: LifecycleManagerProps) {
  const catOpts = categoryOptions && categoryOptions.length ? categoryOptions : CATEGORY_OPTIONS;
  const cliOpts = clientOptions && clientOptions.length ? clientOptions : SAMPLE_CLIENTS;
  const deprPct = Number(settings?.depreciation_pct) || 15;
  const defaultWeeks = Number(settings?.default_timeline_weeks) || 4;
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filterType, setFilterType] = React.useState("ALL");
  const [filterStage, setFilterStage] = React.useState<number | string>(initialStageFilter);
  const [flowFilter, setFlowFilter] = React.useState<"ALL" | "Belum" | "Standard" | "Event" | "Distribusi">("ALL");

  const [isNewAssetModalOpen, setIsNewAssetModalOpen] = React.useState(false);
  // Detail modal tracks the asset by ID so it always reflects the freshest state after a transition
  const [detailAssetId, setDetailAssetId] = React.useState<string | null>(null);

  // Consolidated dispatch ("Kirim Bersama"): select many Gudang (Fase 3) assets → one Surat Jalan.
  const [batchMode, setBatchMode] = React.useState(false);
  const [batchSel, setBatchSel] = React.useState<string[]>([]);
  const [batchOpen, setBatchOpen] = React.useState(false);
  const [batchFlash, setBatchFlash] = React.useState<{ sent: number; remained: number; count: number } | null>(null); // Gudang dispatch success animation
  const [batchQty, setBatchQty] = React.useState<Record<string, string>>({});
  const [batchForm, setBatchForm] = React.useState({ suratJalanNo: "", deployMode: "", projectId: "", driverName: "", vehiclePlate: "", vendorShipping: "", departureTime: "", area: "", picPenerima: "", courier: "", trackingUrl: "", trackingNo: "", eta: "" });
  const [batchBusy, setBatchBusy] = React.useState(false);
  const [batchError, setBatchError] = React.useState<string | null>(null);
  const [batchPrint, setBatchPrint] = React.useState<{ suratJalanNo: string; tanggal: string; projectName?: string; area: string; picPenerima: string; driverName: string; vehiclePlate: string; courier?: string; trackingNo?: string; rows: { id: string; name: string; qty: number }[] } | null>(null);
  // Shipment "View + Process" panel (opened from a group card) — view the shipment + advance the whole
  // group to the next phase. Surat Jalan (Fase 2/stage 4) → Transit (stage 5) via a tracking form.
  const [shipView, setShipView] = React.useState<{ batchId: string; members: Asset[] } | null>(null);
  const [shipForm, setShipForm] = React.useState({ courier: "", trackingNo: "", trackingUrl: "", eta: "" });
  const [shipBusy, setShipBusy] = React.useState(false);
  const [shipError, setShipError] = React.useState<string | null>(null);
  const [podForm, setPodForm] = React.useState({ podTime: "", conditionOnArrival: "Sempurna", podNote: "" });
  const [podSig, setPodSig] = React.useState("");
  const [podChecklist, setPodChecklist] = React.useState<Record<string, boolean>>({}); // per-asset "diterima" checklist (Transit)
  const [shipMd, setShipMd] = React.useState(""); // Proses Pemasangan: MD assigned for installation
  const [shipVenue, setShipVenue] = React.useState(""); // Proses Pemasangan: venue location for the install
  const openShipView = (g: { batchId: string; members: Asset[] }) => {
    setShipForm({ courier: "", trackingNo: "", trackingUrl: "", eta: "" });
    setPodForm({ podTime: new Date().toISOString().slice(0, 10), conditionOnArrival: "Sempurna", podNote: "" });
    setPodSig(""); setShipMd(""); setShipVenue(String((g.members[0]?.stageDetails as any)?.deployment?.venue?.locationId || ""));
    const chk: Record<string, boolean> = {}; g.members.forEach(m => { chk[m.id] = false; }); setPodChecklist(chk);
    void loadDirectory(g.members[0]?.client); // MD/PIC directory for this shipment's client (assignment dropdown)
    void loadVenues(g.members[0]?.client);    // Venue locations for the install-location dropdown
    setShipError(null); setShipView(g);
  };
  // Terpasang (Fase 4/stage 6): PIC assigns a Merchandiser (MD) to install the whole shipment.
  const submitAssignMD = async () => {
    if (!shipView) return;
    if (!shipVenue) return setShipError("Pilih lokasi Venue dulu.");
    if (!shipMd) return setShipError("Pilih Merchandiser (MD) dulu.");
    setShipBusy(true); setShipError(null);
    const mid = Number(shipMd);
    const locId = Number(shipVenue);
    let failed = "";
    for (const m of shipView.members) {
      const r = await onAssignInstall(m.id, [{ merchandiserId: mid, qty: m.quantity }], m.updatedAt, locId);
      if (!r.ok) { failed = `${m.name}: ${r.error || "gagal ditugaskan"}`; break; }
    }
    setShipBusy(false);
    if (failed) return setShipError(failed);
    setShipView(null);
  };
  // Share the shipment's tracking (courier/resi/link/ETA) to the recipient PIC via WhatsApp.
  const shareTrackingWA = (g: { batchId: string; members: Asset[] }) => {
    const t: any = g.members[0]?.stageDetails?.transit || {};
    const sh: any = g.members[0]?.stageDetails?.shipping || {};
    const dest = Array.isArray(sh.destinations) ? sh.destinations[0] : null;
    const lines = [
      `Pelacakan pengiriman ${g.batchId}`,
      dest?.area ? `Tujuan: ${dest.area}${dest.picPenerima ? ` (PIC: ${dest.picPenerima})` : ""}` : "",
      t.courier ? `Kurir: ${t.courier}${t.trackingNo ? ` · Resi: ${t.trackingNo}` : ""}` : "",
      t.eta ? `Estimasi tiba: ${t.eta}` : "",
      t.trackingUrl ? `Lacak: ${t.trackingUrl}` : "",
      `Aset: ${g.members.map(m => m.name).join(", ")}`,
    ].filter(Boolean);
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  };
  const submitShipPod = async () => {
    if (!shipView || !onGroupAdvance) return;
    if (!shipView.members.every(m => podChecklist[m.id])) return setShipError("Checklist semua aset yang diterima dulu.");
    if (!podForm.conditionOnArrival) return setShipError("Pilih kondisi barang saat tiba.");
    if (!podSig || podSig.length < 50) return setShipError("Tanda tangan penerima wajib diisi.");
    const sh: any = shipView.members[0]?.stageDetails?.shipping || {};
    const dest = Array.isArray(sh.destinations) ? sh.destinations[0] : null;
    setShipBusy(true); setShipError(null);
    const res = await onGroupAdvance({
      batchId: shipView.batchId, fromStage: 5, toStage: 6, stageKey: "transit",
      section: { podRecipient: dest?.picPenerima || "", podTime: podForm.podTime, conditionOnArrival: podForm.conditionOnArrival, podNote: podForm.podNote.trim(), signatureBase64: podSig, receivedItems: shipView.members.map(m => m.id) },
      meta: { logAction: `POD: ${shipView.batchId} diterima (${podForm.conditionOnArrival}) & ditandatangani ${dest?.picPenerima || "penerima"}`, operator: "Admin Origin (Surat Jalan)" },
    });
    setShipBusy(false);
    if (!res.ok) return setShipError(res.error || "Gagal konfirmasi penerimaan.");
    setShipView(null);
  };
  const submitShipTransit = async () => {
    if (!shipView || !onGroupAdvance) return;
    if (!shipForm.courier) return setShipError("Pilih kurir/vendor dulu.");
    if (!/^https?:\/\//i.test(shipForm.trackingUrl.trim())) return setShipError("Link tracking harus diawali http:// atau https://.");
    if (!shipForm.eta.trim()) return setShipError("Estimasi tiba (ETA) wajib diisi.");
    setShipBusy(true); setShipError(null);
    const res = await onGroupAdvance({
      batchId: shipView.batchId, fromStage: 4, toStage: 5, stageKey: "transit",
      section: { courier: shipForm.courier, trackingNo: shipForm.trackingNo.trim(), trackingUrl: shipForm.trackingUrl.trim(), eta: shipForm.eta.trim() },
      meta: { logAction: `Input tracking (${shipForm.courier}) — pengiriman ${shipView.batchId} masuk Transit`, operator: "Admin Origin (Surat Jalan)" },
    });
    setShipBusy(false);
    if (!res.ok) return setShipError(res.error || "Gagal memproses pengiriman.");
    setShipView(null);
  };

  // Transition gate state
  const [transitionTarget, setTransitionTarget] = React.useState<number | null>(null);
  const [groupMode, setGroupMode] = React.useState(false); // apply the gate to the whole shipment group
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
  const [venueForm, setVenueForm] = React.useState<{ locationId: string; pic: string; setupDate: string; note: string; signature: string; suratJalanNo: string; courier: string; trackingUrl: string; trackingNo: string; eta: string }>({ locationId: "", pic: "", setupDate: "", note: "", signature: "", suratJalanNo: "", courier: "", trackingUrl: "", trackingNo: "", eta: "" });
  const [venueBusy, setVenueBusy] = React.useState(false);
  const [venueError, setVenueError] = React.useState<string | null>(null);
  // Return-to-warehouse shipment modal (end of roadshow — venue → Gudang, tracked).
  const [returnOpen, setReturnOpen] = React.useState(false);
  const [returnForm, setReturnForm] = React.useState<{ suratJalanNo: string; courier: string; trackingUrl: string; trackingNo: string; eta: string }>({ suratJalanNo: "", courier: "", trackingUrl: "", trackingNo: "", eta: "" });
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
    if (new Set(ids).size !== ids.length) return setDistError("Ada toko yang terpilih lebih dari sekali.");
    const tot = rows.reduce((s, r) => s + r.qty, 0);
    if (tot > (detailAsset.quantity || 0)) return setDistError(`Total (${tot}) melebihi qty aset (${detailAsset.quantity}). Jumlah boleh lebih sedikit.`);
    setDistBusy(true); setDistError(null);
    const res = await onDistribute(detailAsset.id, rows, detailAsset.projectId ?? undefined);
    setDistBusy(false);
    if (!res.ok) return setDistError(res.error || "Gagal menyimpan distribusi.");
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
    if (!samples.length) return setSampleError("Pilih minimal 1 toko sampel dan tentukan statusnya.");
    setSampleBusy(true); setSampleError(null);
    const meta = sampleMethod === "auto" ? { method: "auto" as const, samplePct: autoPct ?? undefined } : { method: "manual" as const };
    const res = await onAuditSample(detailAsset.id, samples, meta);
    setSampleBusy(false);
    if (!res.ok) return setSampleError(res.error || "Gagal menyimpan audit sampling.");
    setSampleOpen(false);
  };

  React.useEffect(() => {
    if (initialStageFilter !== undefined) setFilterStage(initialStageFilter);
  }, [initialStageFilter]);
  // Reset any batch selection when the phase view changes (Gudang cart vs card views share batchSel).
  React.useEffect(() => { setBatchSel([]); setBatchQty({}); setBatchMode(false); setBatchError(null); setBatchForm(f => ({ ...f, deployMode: "" })); }, [filterStage]);

  const detailAsset = React.useMemo(
    () => assets.find(a => a.id === detailAssetId) || null,
    [assets, detailAssetId]
  );
  // Shipment group of the open asset (members share a batchId, still in-journey Fase 4–9).
  const detailBatchId = batchIdOf(detailAsset);
  const groupMembers = React.useMemo(
    () => (detailBatchId ? assets.filter(a => batchIdOf(a) === detailBatchId && a.currentStage >= 4 && a.currentStage <= 9) : []),
    [assets, detailBatchId]
  );
  const groupSameStage = detailAsset ? groupMembers.filter(a => a.currentStage === detailAsset.currentStage) : [];
  // A group of ≥2 members at the same stage can be processed together — for ANY action.
  const hasGroup = !!(detailBatchId && groupSameStage.length >= 2);
  // Master toggle (action panel): apply venue/location actions to the whole group. Default ON for a group.
  const [groupActs, setGroupActs] = React.useState(true);
  // Grouped audit: ONE form, a SEPARATE checklist per member (each item audited on its own condition).
  const [groupAuditMaps, setGroupAuditMaps] = React.useState<Record<string, Record<string, any>>>({});
  // Re-arm the default only when the SHIPMENT GROUP changes — switching between members of the same
  // group preserves a deliberate OFF choice (don't silently re-enable on every asset switch).
  React.useEffect(() => { setGroupActs(true); }, [detailBatchId]);
  // "Proses Grup" from the list opens a member's detail and (for a single forward step) auto-opens
  // that step's gate in group mode, so the operator processes the whole shipment from one entry point.
  const [pendingGroupGate, setPendingGroupGate] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (pendingGroupGate == null || !detailAsset) return;
    const t = pendingGroupGate; setPendingGroupGate(null);
    if ((TRANSITIONS[detailAsset.currentStage] || []).includes(t)) openGate(t);
  }, [pendingGroupGate, detailAsset]); // eslint-disable-line react-hooks/exhaustive-deps
  const openGroupProcess = (g: { batchId: string; members: Asset[] }) => {
    const first = g.members[0]; if (!first) return;
    setGroupActs(true);
    setDetailAssetId(first.id);
    const nx = TRANSITIONS[first.currentStage] || [];
    if (nx.length === 1) setPendingGroupGate(nx[0]); // single obvious next step → jump straight to its gate
  };
  const useGroupVenue = !!(onGroupVenue && hasGroup && groupActs);
  // Can the CURRENT gate transition be applied to the whole group? Any LEGAL ladder step (audit/
  // maintenance/penarikan/POD/…), ≥2 same-stage members.
  const groupable = !!(onGroupAdvance && detailAsset && transitionTarget != null &&
    (TRANSITIONS[detailAsset.currentStage] || []).includes(transitionTarget) && detailBatchId && groupSameStage.length >= 2);

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
    if (!res.ok) return setHandoverError(res.error || "Gagal memproses serah-terima.");
    setHandoverOpen(false);
  };

  const openVenue = () => {
    if (!detailAsset) return;
    void loadVenues(detailAsset.client);
    void loadDirectory(detailAsset.client);
    setVenueForm({ locationId: "", pic: "", setupDate: new Date().toISOString().slice(0, 10), note: "", signature: "", suratJalanNo: genSuratJalan(), courier: "", trackingUrl: "", trackingNo: "", eta: "" });
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
    const res = useGroupVenue
      ? await onGroupVenue!({
          batchId: detailBatchId!, op: "deploy",
          locationId: Number(venueForm.locationId),
          pic: venueForm.pic || undefined,
          setupDate: venueForm.setupDate || undefined,
          suratJalanNo: venueForm.suratJalanNo || undefined,
          courier: venueForm.courier || undefined,
          trackingUrl: venueForm.trackingUrl.trim() || undefined,
          trackingNo: venueForm.trackingNo.trim() || undefined,
          eta: venueForm.eta.trim() || undefined
        })
      : await onDeployVenue!(detailAsset.id, {
          locationId: Number(venueForm.locationId),
          pic: venueForm.pic || undefined,
          setupDate: venueForm.setupDate || undefined,
          note: venueForm.note || undefined,
          signatureBase64: venueForm.signature || undefined,
          projectId: detailAsset.projectId ?? undefined,
          suratJalanNo: venueForm.suratJalanNo || undefined,
          courier: venueForm.courier || undefined,
          trackingUrl: venueForm.trackingUrl.trim() || undefined,
          trackingNo: venueForm.trackingNo.trim() || undefined,
          eta: venueForm.eta.trim() || undefined
        });
    setVenueBusy(false);
    if (!res.ok) return setVenueError(res.error || "Gagal mengirim aset ke lokasi.");
    if ((res as any).skipped) return setVenueError(`${(res as any).count} aset dikirim · ${(res as any).skipped} dilewati (status tidak sesuai).`);
    setVenueOpen(false);
  };
  const openReturn = () => {
    if (!detailAsset) return;
    // Guard: returning to Gudang ends the roadshow — never let a stray tap start it.
    const n = useGroupVenue ? groupSameStage.length : 1;
    if (!window.confirm(`Kirim ${n > 1 ? `${n} aset grup ini` : "aset ini"} kembali ke gudang? Roadshow di lokasi ini ditutup.`)) return;
    setReturnForm({ suratJalanNo: genSuratJalan(), courier: "", trackingUrl: "", trackingNo: "", eta: "" });
    setReturnError(null);
    setReturnOpen(true);
  };
  const submitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailAsset || !onShipReturn) return;
    if (returnForm.trackingUrl && !/^https?:\/\//i.test(returnForm.trackingUrl.trim())) return setReturnError("Link tracking harus diawali http:// atau https://.");
    setReturnBusy(true);
    setReturnError(null);
    const res = useGroupVenue
      ? await onGroupVenue!({
          batchId: detailBatchId!, op: "ship-return",
          suratJalanNo: returnForm.suratJalanNo || undefined,
          courier: returnForm.courier || undefined,
          trackingUrl: returnForm.trackingUrl.trim() || undefined,
          trackingNo: returnForm.trackingNo.trim() || undefined,
          eta: returnForm.eta.trim() || undefined
        })
      : await onShipReturn!(detailAsset.id, {
          suratJalanNo: returnForm.suratJalanNo || undefined,
          courier: returnForm.courier || undefined,
          trackingUrl: returnForm.trackingUrl.trim() || undefined,
          trackingNo: returnForm.trackingNo.trim() || undefined,
          eta: returnForm.eta.trim() || undefined
        });
    setReturnBusy(false);
    if (!res.ok) return setReturnError(res.error || "Gagal mengirim aset kembali ke gudang.");
    if ((res as any).skipped) return setReturnError(`${(res as any).count} aset dikirim balik · ${(res as any).skipped} dilewati (status tidak sesuai).`);
    setReturnOpen(false);
  };
  const doArriveVenue = async () => {
    if (!detailAsset || arriveBusy) return;
    setArriveBusy(true); setArriveError(null);
    const res = useGroupVenue ? await onGroupVenue!({ batchId: detailBatchId!, op: "arrive-venue" }) : await onArriveVenue!(detailAsset.id);
    setArriveBusy(false);
    if (!res.ok) setArriveError(res.error || "Gagal mengonfirmasi kedatangan di lokasi.");
    else if ((res as any).skipped) setArriveError(`${(res as any).count} aset dikonfirmasi tiba · ${(res as any).skipped} dilewati.`);
  };
  const doArriveWarehouse = async () => {
    if (!detailAsset || arriveBusy) return;
    // Guard: this drops the asset back to Gudang (Fase 1) and ends the journey — confirm first.
    if (!window.confirm(`Konfirmasi ${useGroupVenue ? `${groupSameStage.length} aset` : "aset"} sudah TIBA di gudang? Kembali ke Gudang (Fase 1), perjalanan selesai.`)) return;
    setArriveBusy(true); setArriveError(null);
    const res = useGroupVenue ? await onGroupVenue!({ batchId: detailBatchId!, op: "arrive-warehouse" }) : await onArriveWarehouse!(detailAsset.id);
    setArriveBusy(false);
    if (!res.ok) setArriveError(res.error || "Gagal mengonfirmasi kedatangan di gudang.");
    else if ((res as any).skipped) setArriveError(`${(res as any).count} aset tiba di gudang · ${(res as any).skipped} dilewati.`);
  };

  // ── Confirm pemasangan FROM THE CMS (no mobile) — Admin/PIC for Event assignments, Admin for
  //    Distribusi placements. The field photo gate is waived server-side for these desk roles. ──
  const [confirmBusy, setConfirmBusy] = React.useState<string | null>(null);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);
  // Clear transient per-asset state when the open asset changes, so an error/busy flag never bleeds
  // onto an unrelated asset's detail view.
  React.useEffect(() => { setConfirmError(null); setConfirmBusy(null); setArriveError(null); }, [detailAssetId]);
  // Event/Standard install confirm: Admin (any) or PIC (their OWN client only — mirrors the server).
  const canConfirmInstall = !!user && (user.role === "Admin" || (user.role === "PIC" && (detailAsset?.client || null) === (user.client || null)));
  const canConfirmPlacement = !!user && user.role === "Admin"; // Distribusi (PIC excluded per rule)
  const doConfirmInstall = async (merchandiserId: number, who: string) => {
    if (!detailAsset || !onCompleteInstall || confirmBusy) return;
    if (!window.confirm(`Tandai sisa porsi pemasangan ${who} sebagai terpasang?`)) return;
    setConfirmBusy(`a${merchandiserId}`); setConfirmError(null);
    const res = await onCompleteInstall(detailAsset.id, { merchandiserId });
    setConfirmBusy(null);
    if (!res.ok) setConfirmError(res.error || "Gagal konfirmasi pemasangan.");
  };
  const doConfirmPlacement = async (locationId: number, toko: string) => {
    if (!detailAsset || !onPlaceToko || confirmBusy) return;
    if (!window.confirm(`Tandai sisa pemasangan di ${toko} sebagai terpasang?`)) return;
    setConfirmBusy(`p${locationId}`); setConfirmError(null);
    const res = await onPlaceToko(detailAsset.id, { locationId });
    setConfirmBusy(null);
    if (!res.ok) setConfirmError(res.error || "Gagal konfirmasi pemasangan.");
  };
  // Confirm the install portion of EVERY group member at once (each member's own Merchandiser portion).
  const doConfirmInstallGroup = async () => {
    if (!onCompleteInstall || confirmBusy) return;
    const tasks: { id: string; mid: number }[] = [];
    for (const m of groupSameStage) {
      const asg: any[] = (m.stageDetails as any)?.deployment?.assignments || [];
      for (const a of asg) {
        const dq = a.doneQty != null ? Number(a.doneQty) : a.status === "done" ? Number(a.qty) : 0;
        if (a.merchandiserId != null && dq < Number(a.qty)) tasks.push({ id: m.id, mid: Number(a.merchandiserId) });
      }
    }
    if (!tasks.length) return;
    if (!window.confirm(`Tandai pemasangan TERPASANG untuk ${tasks.length} porsi di ${groupSameStage.length} aset grup?`)) return;
    setConfirmBusy("group"); setConfirmError(null);
    let fail = 0;
    for (const t of tasks) { const r = await onCompleteInstall(t.id, { merchandiserId: t.mid }); if (!r.ok) fail++; }
    setConfirmBusy(null);
    if (fail) setConfirmError(`${fail} dari ${tasks.length} porsi gagal dikonfirmasi.`);
  };

  // ── Consolidated dispatch ("Kirim Bersama") — many Gudang assets → one Surat Jalan ──
  const canBatchShip = !user || user.role === "Admin" || user.role === "Logistik";
  const toggleBatchMode = () => { setBatchMode(m => !m); setBatchSel([]); };
  const toggleBatchSel = (id: string) => setBatchSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  // From the Gudang cart, "Buat Surat Jalan" opens the Surat Jalan builder (it does NOT issue yet).
  // Preserve the cart's Type + per-asset qty; only (re)generate the SJ number + reset the SJ-form fields.
  const openBatch = () => {
    if (!batchSel.length) return;
    if (!batchForm.deployMode) { setBatchError("Pilih Type Kategori (Internal / Event / Distribusi) dulu."); return; }
    const q: Record<string, string> = { ...batchQty };
    batchSel.forEach(id => { const a = assets.find(x => x.id === id); if (!q[id]) q[id] = String(a?.quantity ?? 1); });
    setBatchQty(q);
    setBatchForm(f => ({ ...f, suratJalanNo: f.suratJalanNo || genSuratJalan(), area: "", picPenerima: "", projectId: "" }));
    // PIC dropdown = the selected assets' client (a consolidated dispatch is normally one client).
    const cls = [...new Set(batchSel.map(id => assets.find(x => x.id === id)?.client).filter(Boolean))];
    void loadDirectory(cls.length === 1 ? cls[0] : null);
    setBatchError(null); setBatchOpen(true);
  };
  const submitBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onBatchShip) return;
    if (!batchForm.deployMode) return setBatchError("Pilih Type Kategori (Internal / Event / Distribusi) dulu.");
    // Tujuan/Area & driver dropped from the Gudang cart — those shipping details are filled in the
    // next phase (Surat Jalan). Dispatch here only needs Type + qty.
    if (batchForm.trackingUrl && !/^https?:\/\//i.test(batchForm.trackingUrl.trim())) return setBatchError("Link tracking harus diawali http:// atau https://.");
    const items = batchSel.map(id => ({ id, qty: Math.floor(Number(batchQty[id])) }));
    for (const it of items) {
      const a = assets.find(x => x.id === it.id);
      if (!(Number.isInteger(it.qty) && it.qty > 0 && it.qty <= (a?.quantity || 0))) return setBatchError(`Qty tidak valid untuk ${a?.name || it.id} (maks ${a?.quantity || 0}).`);
    }
    setBatchBusy(true); setBatchError(null);
    const res = await onBatchShip({
      items, deployMode: batchForm.deployMode || undefined, projectId: batchForm.projectId ? Number(batchForm.projectId) : null,
      suratJalanNo: batchForm.suratJalanNo || undefined, driverName: batchForm.driverName.trim(),
      vehiclePlate: batchForm.vehiclePlate.trim(), vendorShipping: batchForm.vendorShipping.trim(), departureTime: batchForm.departureTime.trim(),
      area: batchForm.area.trim(), picPenerima: batchForm.picPenerima.trim(),
      courier: batchForm.courier || undefined, trackingUrl: batchForm.trackingUrl.trim() || undefined, trackingNo: batchForm.trackingNo.trim() || undefined, eta: batchForm.eta.trim() || undefined,
    });
    setBatchBusy(false);
    if (!res.ok) return setBatchError(res.error || "Gagal mengirim bersama.");
    // Success → play the split animation in the cart: qty sent vs remainder kept in Gudang.
    const flashSent = items.reduce((n, it) => n + it.qty, 0);
    const flashRemained = items.reduce((n, it) => n + Math.max(0, (assets.find(x => x.id === it.id)?.quantity || 0) - it.qty), 0);
    setBatchFlash({ sent: flashSent, remained: flashRemained, count: items.length });
    setTimeout(() => setBatchFlash(null), 4200);
    const rows = items.map(it => ({ id: it.id, name: assets.find(x => x.id === it.id)?.name || it.id, qty: it.qty }));
    setBatchPrint({ suratJalanNo: res.suratJalanNo || batchForm.suratJalanNo, tanggal: new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }), projectName: batchProjects.find(p => String(p.id) === batchForm.projectId)?.name || "", area: batchForm.area.trim(), picPenerima: batchForm.picPenerima.trim(), driverName: batchForm.driverName.trim(), vehiclePlate: batchForm.vehiclePlate.trim(), rows });
    setBatchOpen(false); setBatchMode(false); setBatchSel([]); setBatchQty({}); setBatchForm(f => ({ ...f, deployMode: "" }));
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

  const types = React.useMemo(() => Array.from(new Set(assets.map(a => (a.type || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [assets]);

  // Register-eligible assets (all filters EXCEPT the flow filter) — used both for the flow legend
  // counts and, after applying the flow filter, for the rendered grid.
  const assetById = React.useMemo(() => new Map(assets.map(a => [a.id, a])), [assets]);
  // Projects offered in the Surat Jalan builder — scoped to the selected assets' client (one SJ = one client).
  const batchProjects = React.useMemo(() => {
    const cls = [...new Set(batchSel.map(id => assetById.get(id)?.client).filter(Boolean))];
    const cl = cls.length === 1 ? cls[0] : null;
    return projects.filter(p => !cl || !p.client || p.client === cl);
  }, [batchSel, projects, assetById]);
  const baseAssetsList = React.useMemo(() => {
    return assets.filter(asset => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        (asset.name || "").toLowerCase().includes(q) ||
        (asset.id || "").toLowerCase().includes(q) ||
        (asset.projectCode || "").toLowerCase().includes(q);
      const matchClient = selectedClient === "ALL" || asset.client === selectedClient;
      const matchType = filterType === "ALL" || (asset.type || "") === filterType;
      const matchStage = filterStage === "ALL" || asset.currentStage === Number(filterStage);
      // Deployment lifecycle only — Internal (custodian) assets live in the "Aset Internal" menu.
      const isDeployment = asset.peruntukan !== "Internal";
      return isDeployment && matchSearch && matchClient && matchType && matchStage;
    });
  }, [assets, searchQuery, selectedClient, filterType, filterStage]);
  const flowCounts = React.useMemo(() => {
    const c: Record<string, number> = { Belum: 0, Standard: 0, Event: 0, Distribusi: 0 };
    baseAssetsList.forEach(a => { c[flowKeyOf(projectModeOf(a))] = (c[flowKeyOf(projectModeOf(a))] || 0) + 1; });
    return c;
  }, [baseAssetsList, projectModeOf]);
  const filteredAssetsList = React.useMemo(
    () => flowFilter === "ALL" ? baseAssetsList : baseAssetsList.filter(a => flowKeyOf(projectModeOf(a)) === flowFilter),
    [baseAssetsList, flowFilter, projectModeOf]
  );

  // Group the register by shipment group: assets dispatched together (same batchId) and still in the
  // journey (Fase 4–9) render under ONE "Surat Jalan" header, in every phase view — not scattered.
  const shipmentBlocks = React.useMemo(() => {
    const byBatch = new Map<string, Asset[]>();
    const singles: Asset[] = [];
    for (const a of filteredAssetsList) {
      const bid = batchIdOf(a);
      if (bid && a.currentStage >= 4 && a.currentStage <= 9) {
        if (!byBatch.has(bid)) byBatch.set(bid, []);
        byBatch.get(bid)!.push(a);
      } else singles.push(a);
    }
    const groups: { batchId: string; members: Asset[] }[] = [];
    for (const [batchId, members] of byBatch) {
      if (members.length >= 2) groups.push({ batchId, members });
      else singles.push(...members); // a lone group member renders as a normal card
    }
    return { groups, singles };
  }, [filteredAssetsList]);

  // One asset card (reused for grouped members + standalone assets).
  const renderCard = (asset: Asset) => {
    const IconComp = STAGE_ICONS[asset.currentStage] || ClipboardList;
    // "Kirim Bersama" is the Standard courier flow only — Event/Distribusi/Internal assets ship via
    // their own start action, so they are not selectable here.
    const fmode = isInternalDeploy(asset) || asset.peruntukan === "Internal" ? "Internal" : flowKeyOf(projectModeOf(asset));
    const flow = FLOW_UI[fmode];
    const FlowIcon = flow.Icon;
    const proj = asset.projectId != null ? projects.find(p => p.id === asset.projectId) : null;
    // Courier-eligible = not committed to Event/Distribusi/Internal (Belum/unbound + Standard qualify).
    const batchable = batchMode && asset.currentStage === 3 && fmode !== "Internal";
    const picked = batchSel.includes(asset.id);
    return (
      <div
        key={asset.id}
        className={`bg-white rounded-xl border transition-all flex flex-col justify-between overflow-hidden hover:shadow-sm ${picked ? "border-blue-500 ring-2 ring-blue-500" : `border-slate-100 ${flow.ring}`}`}
      >
        {/* Flow identity bar — color signals the deployment flow at a glance */}
        <div className={`h-1.5 w-full ${flow.bar}`} />
        <div className="p-5 border-b border-slate-50 space-y-2">
          <div className="flex justify-between items-start gap-2">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider flex items-center gap-1.5">
              {batchable && <span className={`inline-flex h-4 w-4 items-center justify-center rounded border ${picked ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-300"}`}>{picked && <Check className="h-3 w-3" />}</span>}
              {asset.category}
            </span>
            <span className="font-mono text-[10px] text-blue-600 font-extrabold bg-blue-50 px-2 py-0.5 rounded border border-blue-100/30">{asset.id}</span>
          </div>
          <h4 className="font-bold text-slate-800 text-sm tracking-tight hover:text-blue-600 transition truncate" title={asset.name}>{asset.name}</h4>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border w-fit ${flow.chip}`}>
              <FlowIcon className="h-2.5 w-2.5" /> {flow.label}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 grid grid-cols-2 gap-x-2">
            <span>Client: <strong className="font-semibold text-slate-700 truncate block">{asset.client.split(" ")[1] || asset.client}</strong></span>
            <span>WO-Code: <strong className="font-mono text-slate-700 block">{asset.projectCode}</strong></span>
          </p>
          <p className="flex items-center gap-1 text-[11px] text-slate-500 truncate" title={proj ? proj.name : "Tanpa proyek"}>
            <Briefcase className="h-3 w-3 shrink-0 text-indigo-400" />
            <span className="text-slate-400">Proyek:</span>{" "}
            <strong className={`truncate ${proj ? "font-semibold text-slate-700" : "font-medium text-slate-400 italic"}`}>{proj ? proj.name : "Tanpa proyek"}</strong>
          </p>
        </div>
        <div className="px-5 py-4 bg-slate-50/50 flex justify-between items-center text-xs">
          <div>
            <p className="text-[10px] text-slate-400 uppercase font-medium">Jumlah / Biaya</p>
            <p className="font-bold text-slate-800">{asset.quantity} unit <span className="font-normal text-slate-400 text-[10px]">· {formatRupiah(asset.financials.purchaseCost)}</span></p>
          </div>
          {asset.currentStage === 6 && asset.stageDetails?.deployment?.assignments?.length ? (() => {
            const d: any = asset.stageDetails.deployment;
            const asg: any[] = d.assignments || [];
            const installed = d.installedQty != null ? Number(d.installedQty) : installedOf(asg);
            const full = installed >= asset.quantity;
            return (
              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase font-medium">Terpasang</p>
                <p className={`font-extrabold ${full ? "text-emerald-600" : "text-indigo-600"}`}>{installed}/{asset.quantity}</p>
              </div>
            );
          })() : asset.auditScore !== undefined && asset.currentStage >= 6 ? (
            <div className="text-right">
              <p className="text-[10px] text-slate-400 uppercase font-medium">Skor Audit</p>
              <p className={`font-extrabold ${asset.auditScore >= 90 ? "text-emerald-600" : asset.auditScore >= 70 ? "text-blue-600" : "text-rose-600"}`}>{asset.auditScore}/100</p>
            </div>
          ) : null}
        </div>
        <div className="p-3 border-t border-slate-50 bg-white flex items-center justify-between">
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold ${statusColors[asset.currentStage]}`}>
            <IconComp className="h-3.5 w-3.5" />
            <span>Fase {faseNo(asset.currentStage)}: {cleanLabel(asset.currentStage)}</span>
          </div>
          <div className="flex items-center text-slate-400 group hover:text-blue-600 text-xs font-semibold gap-0.5">
            <span>Detail</span>
            <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    );
  };

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
      setFormError(result.error || "Gagal menyimpan aset.");
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
    // Default the "process whole group" toggle ON when this is a groupable movement transition.
    const bId = batchIdOf(detailAsset);
    const sameStage = bId ? assets.filter(a => batchIdOf(a) === bId && a.currentStage === detailAsset.currentStage).length : 0;
    const willGroup = !!onGroupAdvance && groupActs && (TRANSITIONS[detailAsset.currentStage] || []).includes(target) && !!bId && sameStage >= 2;
    setGroupMode(willGroup);
    // Grouped AUDIT (→7): seed a SEPARATE checklist per member (each item audited on its own condition).
    if (target === 7 && willGroup) {
      const members = assets.filter(a => batchIdOf(a) === bId && a.currentStage === detailAsset.currentStage);
      const maps: Record<string, Record<string, any>> = {};
      for (const mm of members) {
        const prev = (mm.stageDetails as any)?.audit?.checklist;
        maps[mm.id] = defaultAuditMap(mm.quantity, prev && typeof prev === "object" ? prev : null);
      }
      setGroupAuditMaps(maps);
    }
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
      else if (f.type === "auditstatus") v = defaultAuditMap(detailAsset.quantity, v && typeof v === "object" ? v : null);
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
        return setGateError(`Kolom "${f.label}" wajib diisi.`);
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
            return setGateError("Setiap tujuan wajib diisi: Tujuan/Area dan PIC Penerima.");
          if (!(Number(r.qty) > 0)) return setGateError("Qty tiap tujuan harus lebih dari 0.");
        }
      }
      if (f.type === "assignments") {
        const rows = Array.isArray(raw) ? raw : [];
        if (rows.length === 0) return setGateError("Tambahkan minimal 1 Merchandiser.");
        const seen = new Set<string>();
        let tot = 0;
        for (const r of rows) {
          if (!r.merchandiserId) return setGateError("Setiap baris wajib memilih Merchandiser.");
          if (seen.has(String(r.merchandiserId))) return setGateError("Merchandiser tidak boleh dipilih lebih dari sekali.");
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

    // Grouped AUDIT (→7): each member gets its OWN per-item checklist result, applied in ONE action.
    if (transitionTarget === 7 && groupMode && onGroupAdvance && groupSameStage.length >= 2 && batchIdOf(detailAsset)) {
      if (!String(gateForm.auditorName || "").trim()) return setGateError('Kolom "Nama Auditor" wajib diisi.');
      if (!String(gateForm.lastAuditDate || "").trim()) return setGateError('Kolom "Tanggal Audit" wajib diisi.');
      const perAsset: Record<string, any> = {};
      for (const mm of groupSameStage) {
        const res = computeAudit(groupAuditMaps[mm.id] || {});
        perAsset[mm.id] = {
          ...((mm.stageDetails as any)?.audit || {}),
          auditorName: gateForm.auditorName, lastAuditDate: gateForm.lastAuditDate,
          recommendation: gateForm.recommendation || undefined,
          checklist: res.checklist, kelengkapanQty: res.kelengkapanQty, scoring: res.scoring,
          findings: res.findings, complianceStatus: res.complianceStatus
        };
      }
      const gres = await onGroupAdvance({ batchId: batchIdOf(detailAsset)!, fromStage: detailAsset.currentStage, toStage: 7, stageKey: "audit", perAsset, meta: { logAction: `Audit grup (${groupSameStage.length} aset) — kondisi per-item`, operator: "Admin Origin (Lifecycle Manager)" } });
      if (!gres.ok) return setGateError(gres.error || "Gagal memproses audit grup.");
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
      else if (f.type === "auditstatus") {
        const res = computeAudit(v && typeof v === "object" ? v : {});
        v = res.checklist;
        section.scoring = res.scoring;
        section.findings = res.findings;
        section.kelengkapanQty = res.kelengkapanQty;
        section.complianceStatus = res.complianceStatus;
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

    // Group movement: apply this gate to the WHOLE shipment group (same batchId, same stage) at once.
    if (groupMode && onGroupAdvance && (TRANSITIONS[fromStage] || []).includes(transitionTarget) && batchIdOf(detailAsset)) {
      const gres = await onGroupAdvance({ batchId: batchIdOf(detailAsset)!, fromStage, toStage: transitionTarget, stageKey: cfg.stageKey, section, meta: { logAction: meta.logAction, operator: meta.operator } });
      if (!gres.ok) { setGateError(gres.error || "Gagal memproses grup pengiriman."); return; }
      closeGate();
      return;
    }

    const result = await onUpdateAssetStage(detailAsset.id, transitionTarget as AssetStage, updatedDetails, meta);
    if (!result.ok) {
      setGateError(result.error || "Gagal memproses perpindahan fase.");
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
            {/* Always render a blank first option so a select never SILENTLY shows option[0]
                while its state is empty (a required select then correctly forces a real pick). */}
            <option value="">{f.source ? `— pilih ${roleLabel} —` : "— pilih —"}</option>
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
            title="Buat ulang nomor surat jalan"
            aria-label="Buat ulang nomor surat jalan"
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
                  {p ? "Lulus" : "Tidak"}
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
    } else if (f.type === "auditstatus") {
      control = <AuditChecklist map={val && typeof val === "object" ? val : {}} onChange={set} />;
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
              <Filter className="h-3 w-3" /> Type:
            </span>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="bg-transparent border-0 text-slate-700 font-bold text-xs select-none cursor-pointer pr-4 focus:ring-0 outline-none"
            >
              <option value="ALL">Semua</option>
              {types.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Fase filter dropdown removed — the sidebar phase nav (PHASE_NAV) drives which phase is shown. */}
          {/* Aset ditambah di menu Master Data (lahir di Gudang/Fase 3) — bukan lagi lewat wizard di sini. */}
          {/* Consolidated dispatch now happens ONLY from the Gudang view (list + selection cart);
              the old card-checkbox "Kirim Bersama" toggle/modal is retired. */}
        </div>
      </div>
      {batchMode && (
        <div className="flex items-center gap-2 text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 font-semibold">
          <Truck className="h-3.5 w-3.5 shrink-0" /> Mode <strong>Kirim Bersama</strong> — centang aset apa saja di <strong>Gudang (Fase 1)</strong> yang berangkat dalam satu kendaraan/driver ke satu tujuan (Event, Distribusi, atau tanpa proyek — semua boleh). Terbitkan satu Surat Jalan untuk seluruh aset terpilih.
        </div>
      )}

      {/* Flow legend — hidden in the Gudang view: assets no longer pre-carry a deployment flow; the
          TYPE (Event/Distribusi/Internal) is chosen at dispatch in the cart. Kept for other phases. */}
      {Number(filterStage) !== 3 && (
      <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-100 rounded-xl px-3 py-2.5 shadow-xs">
        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mr-1">Alur Deployment:</span>
        {(["Belum", "Standard", "Event", "Distribusi"] as const)
          // Only show a flow chip when it actually has cards in the current view (or it's the active
          // filter) — so the legend always matches what's on screen (e.g. no "Kurir Standar" in Gudang).
          .filter(k => (flowCounts[k] || 0) > 0 || flowFilter === k)
          .map(k => {
          const f = FLOW_UI[k]; const FIcon = f.Icon; const active = flowFilter === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFlowFilter(active ? "ALL" : k)}
              title={`Filter alur: ${f.label}`}
              className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border transition ${f.chip} ${active ? "ring-2 ring-offset-1 ring-slate-300" : "hover:brightness-95"}`}
            >
              <span className={`h-2 w-2 rounded-full ${f.bar}`} />
              <FIcon className="h-3 w-3" />
              {f.label}
              <span className="ml-0.5 rounded bg-white/70 px-1 text-[10px] tabular-nums">{flowCounts[k] || 0}</span>
            </button>
          );
        })}
        {flowFilter !== "ALL" && (
          <button type="button" onClick={() => setFlowFilter("ALL")} className="text-[11px] font-bold text-slate-500 underline underline-offset-2 hover:text-slate-800">Tampilkan semua</button>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-semibold text-violet-600">
          <span className="h-2 w-2 rounded-full bg-violet-500" /> Internal Custodian → menu <strong>Aset Internal</strong>
        </span>
      </div>
      )}

      {/* Gudang (Fase 1) = dense LIST + a selection cart (scales to thousands of assets); pick 1 or many,
          set the qty to use per asset (the remainder stays in Gudang), then issue one Surat Jalan. */}
      {Number(filterStage) === 3 ? (() => {
        const list = filteredAssetsList.filter(a => !(isInternalDeploy(a) || a.peruntukan === "Internal"));
        const CAP = 300; // render at most CAP rows (search to narrow) so a 2000-asset gudang stays snappy
        const capped = list.length > CAP ? list.slice(0, CAP) : list;
        const canDispatch = canBatchShip; // only Admin/Logistik may pick + issue Surat Jalan
        const totalUse = batchSel.reduce((s, id) => s + (Math.floor(Number(batchQty[id])) || 0), 0);
        const pickRow = (a: Asset) => {
          if (batchSel.includes(a.id)) toggleBatchSel(a.id);
          else { toggleBatchSel(a.id); setBatchQty(q => ({ ...q, [a.id]: q[a.id] || String(a.quantity || 1) })); }
        };
        const allIds = capped.map(a => a.id); // select-all covers the VISIBLE (capped/filtered) set
        const allPicked = allIds.length > 0 && allIds.every(id => batchSel.includes(id));
        const toggleAll = () => {
          if (allPicked) setBatchSel(s => s.filter(id => !allIds.includes(id)));
          else { setBatchSel(s => [...new Set([...s, ...allIds])]); setBatchQty(q => { const n = { ...q }; for (const a of capped) if (!n[a.id]) n[a.id] = String(a.quantity || 1); return n; }); }
        };
        return (
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            {/* LEFT — dense asset table: ID · Nama · Client · Peruntukan · Fase · Masuk Gudang · Stok · Aksi */}
            <div className="flex-1 min-w-0 w-full bg-white rounded-xl border border-slate-100 overflow-hidden shadow-xs">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                <span className="text-[11px] font-extrabold text-slate-600">Aset di Gudang <span className="font-bold text-slate-400">({list.length})</span></span>
                {canDispatch && <span className="text-[10px] font-semibold text-slate-400">{batchSel.length ? `${batchSel.length} dipilih` : "klik baris untuk pilih"}</span>}
              </div>
              <div className="max-h-[68vh] overflow-auto">
                {list.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 text-sm">Tidak ada aset di Gudang untuk kriteria ini.</div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-100">
                        {canDispatch && <th className="px-3 py-2.5 w-8">{list.length ? <input type="checkbox" checked={allPicked} onChange={toggleAll} title="Pilih semua" className="h-4 w-4 rounded accent-blue-600 align-middle" /> : null}</th>}
                        <th className="px-3 py-2.5 font-extrabold">Asset ID</th>
                        <th className="px-3 py-2.5 font-extrabold">Nama Aset</th>
                        <th className="px-3 py-2.5 font-extrabold">Client</th>
                        <th className="px-3 py-2.5 font-extrabold">Owner</th>
                        <th className="px-3 py-2.5 font-extrabold">Merk</th>
                        <th className="px-3 py-2.5 font-extrabold">Type</th>
                        <th className="px-3 py-2.5 font-extrabold whitespace-nowrap">Masuk Gudang</th>
                        <th className="px-3 py-2.5 font-extrabold text-right">Stok</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {capped.map(a => {
                        const picked = batchSel.includes(a.id);
                        const clientOwned = (a.owner || "Origin") === "Client";
                        return (
                          <tr key={a.id} onClick={canDispatch ? () => pickRow(a) : undefined} className={`text-[12px] transition ${canDispatch ? "cursor-pointer" : ""} ${picked ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                            {canDispatch && <td className="px-3 py-2.5"><input type="checkbox" checked={picked} readOnly tabIndex={-1} className="h-4 w-4 rounded accent-blue-600 pointer-events-none align-middle" /></td>}
                            <td className="px-3 py-2.5"><span className="font-mono text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">{a.id}</span></td>
                            <td className="px-3 py-2.5 font-bold text-slate-800">{a.name}</td>
                            <td className="px-3 py-2.5 text-slate-600">{a.client || "—"}</td>
                            <td className="px-3 py-2.5"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${clientOwned ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600"}`}>{a.owner || "Origin"}</span></td>
                            <td className="px-3 py-2.5 text-slate-600">{a.specs?.brand || "—"}</td>
                            <td className="px-3 py-2.5 text-slate-600">{a.type || "—"}</td>
                            <td className="px-3 py-2.5 text-slate-500 tabular-nums whitespace-nowrap">{a.createdAt ? new Date(a.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap"><span className="text-sm font-extrabold text-slate-700 tabular-nums">{a.quantity}</span> <span className="text-[9px] text-slate-400">unit</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {capped.length < list.length && (
                  <div className="px-4 py-2.5 text-center text-[10px] text-slate-400 bg-slate-50/50">Menampilkan {capped.length} dari {list.length} aset — persempit dengan pencarian di atas.</div>
                )}
              </div>
            </div>
            {/* RIGHT — selection cart (Admin/Logistik only): qty-to-use per asset + remainder + one Surat Jalan */}
            {canDispatch && (
            <div className="w-full lg:w-80 shrink-0">
              <div className="lg:sticky lg:top-4 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-white flex items-center gap-2">
                  <Truck className="h-4 w-4 shrink-0" /><span className="font-bold text-sm">Kirim Bersama</span>
                  <span className="ml-auto text-[11px] font-semibold bg-white/15 px-2 py-0.5 rounded-full">{batchSel.length} aset · {totalUse} unit</span>
                </div>
                {batchSel.length === 0 ? (
                  batchFlash ? (
                    <div className="p-4 animate-[fadeIn_0.25s_ease]">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                        <div className="mx-auto h-9 w-9 grid place-items-center rounded-full bg-emerald-500 text-white shadow-sm animate-[fadeIn_0.3s_ease]"><Check className="h-5 w-5" /></div>
                        <p className="mt-2 text-[12px] font-extrabold text-emerald-800">Surat Jalan diterbitkan!</p>
                        <p className="text-[10px] text-emerald-700/80">{batchFlash.count} aset diproses</p>
                        <div className="mt-3 flex items-stretch gap-2 text-left">
                          <div className="flex-1 rounded-lg bg-white border border-blue-200 p-2.5 animate-[fadeIn_0.4s_ease]">
                            <div className="flex items-center gap-1.5 text-blue-700"><Truck className="h-3.5 w-3.5" /><span className="text-[9px] font-bold uppercase tracking-wide">Berangkat</span></div>
                            <p className="mt-0.5 text-lg font-extrabold text-blue-700 tabular-nums leading-none">{batchFlash.sent}<span className="text-[10px] font-bold text-blue-400"> unit</span></p>
                          </div>
                          <div className="flex-1 rounded-lg bg-white border border-slate-200 p-2.5 animate-[fadeIn_0.55s_ease]">
                            <div className="flex items-center gap-1.5 text-slate-500"><Home className="h-3.5 w-3.5" /><span className="text-[9px] font-bold uppercase tracking-wide">Tetap di Gudang</span></div>
                            <p className="mt-0.5 text-lg font-extrabold text-slate-600 tabular-nums leading-none">{batchFlash.remained}<span className="text-[10px] font-bold text-slate-400"> unit</span></p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                  <div className="p-6 text-center text-slate-400 text-xs leading-relaxed">Centang aset di daftar untuk mulai.<br />Bisa pilih <strong>1 atau beberapa</strong>; atur <strong>qty yang dipakai</strong> di sini — sisanya tetap di gudang.</div>
                  )
                ) : (
                  <div className="p-3 space-y-2.5">
                    {/* Type Kategori — deployment TYPE is chosen HERE at dispatch (assets don't pre-carry a flow). */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 flex items-center gap-1">Type Kategori <span className="text-rose-500">*</span></label>
                      <div className="mt-1 grid grid-cols-3 gap-1.5">
                        {[
                          { v: "Event", Icon: Compass, on: "bg-amber-500 border-amber-500 text-white shadow-sm" },
                          { v: "Distribusi", Icon: Building, on: "bg-teal-600 border-teal-600 text-white shadow-sm" },
                          { v: "Internal", Icon: Briefcase, on: "bg-violet-600 border-violet-600 text-white shadow-sm" }
                        ].map(t => {
                          const sel = batchForm.deployMode === t.v;
                          return (
                            <button key={t.v} type="button" onClick={() => setBatchForm(f => ({ ...f, deployMode: t.v }))}
                              className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] font-bold transition ${sel ? t.on : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"}`}>
                              <t.Icon className="h-4 w-4" /> {t.v}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-2 max-h-[40vh] overflow-y-auto pt-1 border-t border-slate-100">
                      {batchSel.map(id => {
                        const a = assetById.get(id); if (!a) return null;
                        const q = Math.floor(Number(batchQty[id])) || 0;
                        const sisa = (a.quantity || 0) - q;
                        return (
                          <div key={id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 animate-[fadeIn_0.2s_ease]">
                            <div className="flex items-center gap-2">
                              <span className="min-w-0 flex-1"><span className="block text-[11px] font-bold text-slate-800 truncate">{a.name}</span><span className="font-mono text-[9px] text-slate-400">{a.id}</span></span>
                              <button type="button" onClick={() => toggleBatchSel(id)} className="text-slate-300 hover:text-rose-500 shrink-0"><X className="h-4 w-4" /></button>
                            </div>
                            <div className="mt-1.5 flex items-center gap-2">
                              <span className="text-[10px] text-slate-500">Dipakai</span>
                              <input type="number" min={1} max={a.quantity} value={batchQty[id] ?? ""} onChange={e => setBatchQty(qq => ({ ...qq, [id]: e.target.value }))} className="w-16 bg-white border border-slate-200 px-2 py-1 rounded text-xs text-center outline-none focus:ring-1 focus:ring-blue-500" />
                              <span className="text-[10px] text-slate-400">/ {a.quantity}</span>
                              {sisa > 0 ? <span className="ml-auto text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">sisa {sisa} tetap di gudang</span>
                                       : sisa === 0 ? <span className="ml-auto text-[9px] font-bold text-emerald-600">semua dikirim</span>
                                       : <span className="ml-auto text-[9px] font-bold text-rose-600">melebihi stok</span>}
                            </div>
                            {/* used vs remaining bar: blue = berangkat, slate = tetap di gudang */}
                            <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden flex">
                              <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.min(100, Math.max(0, (q / (a.quantity || 1)) * 100))}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {batchError && <p className="text-[10px] font-semibold text-rose-600">{batchError}</p>}
                    <button type="button" onClick={openBatch} disabled={batchBusy} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition">
                      <Truck className="h-4 w-4" /> Buat Surat Jalan
                    </button>
                    <p className="text-[9px] text-slate-400 text-center">Lanjut isi Surat Jalan (proyek, area, PIC). Qty dipakai berangkat bersama; sisanya tetap di Gudang.</p>
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        );
      })() : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAssetsList.length === 0 ? (
          <div className="col-span-full bg-white p-12 text-center rounded-xl border border-slate-100 text-slate-400">
            Tidak ada aset yang terdaftar untuk kriteria pencarian ini.
          </div>
        ) : (
          <>
            {shipmentBlocks.groups.map(g => {
              const sh: any = g.members[0].stageDetails?.shipping || {};
              const dest = Array.isArray(sh.destinations) ? sh.destinations[0] : null;
              const totalUnits = g.members.reduce((s, m) => s + (m.quantity || 0), 0);
              // ONE contained shipment box: header + all member cards nested inside, so a consolidated
              // dispatch reads as a single shipment (of N assets) — not as loose, separate-looking cards.
              const chip = "inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-white/20";
              return (
                <div key={"grp-" + g.batchId} className="col-span-full overflow-hidden rounded-2xl border border-indigo-200/70 bg-white shadow-sm">
                  {/* Gradient shipment manifest header */}
                  <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 px-4 py-3 text-white">
                    <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.10]" style={{ backgroundImage: "repeating-linear-gradient(135deg, #fff 0, #fff 2px, transparent 2px, transparent 12px)" }} />
                    <div className="relative flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25"><Truck className="h-5 w-5" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-100">Pengiriman Bersama</span>
                          <span className="font-mono text-[11px] font-bold rounded bg-white/15 px-1.5 py-0.5 ring-1 ring-white/20">{g.batchId}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className={chip}>{g.members.length} aset · {totalUnits} unit</span>
                          {sh.driverName && <span className={chip}><UserCheck className="h-3 w-3" /> {sh.driverName}</span>}
                          {sh.vehiclePlate && <span className={chip}>{sh.vehiclePlate}</span>}
                          {dest?.area && <span className={chip}><MapPin className="h-3 w-3" /> {dest.area}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => openShipView(g)}
                        title="Lihat detail pengiriman & proses ke fase berikut"
                        className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-extrabold text-blue-700 shadow-sm hover:bg-blue-50 transition"
                      >
                        <Eye className="h-3.5 w-3.5" /> Lihat &amp; Proses
                      </button>
                    </div>
                  </div>
                  {/* Members as a compact table (like the Gudang list) — one card per shipment */}
                  <div className="p-3 md:p-4">
                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-100">
                            <th className="px-3 py-2 font-extrabold">Asset ID</th>
                            <th className="px-3 py-2 font-extrabold">Nama Aset</th>
                            <th className="px-3 py-2 font-extrabold">Client</th>
                            <th className="px-3 py-2 font-extrabold">Proyek</th>
                            <th className="px-3 py-2 font-extrabold">Type</th>
                            <th className="px-3 py-2 font-extrabold text-right">Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {g.members.map(m => {
                            const proj = m.projectId != null ? projects.find(p => p.id === m.projectId) : null;
                            const projName = (m.stageDetails as any)?.deployment?.projectName || proj?.name || "";
                            return (
                              <tr key={m.id} className="text-[12px] bg-white hover:bg-slate-50 transition">
                                <td className="px-3 py-2"><span className="font-mono text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">{m.id}</span></td>
                                <td className="px-3 py-2 font-bold text-slate-800">{m.name}</td>
                                <td className="px-3 py-2 text-slate-600">{m.client || "—"}</td>
                                <td className="px-3 py-2 text-slate-600">{projName || "—"}</td>
                                <td className="px-3 py-2 text-slate-600">{m.type || "—"}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap"><span className="text-sm font-extrabold text-slate-700 tabular-nums">{m.quantity}</span> <span className="text-[9px] text-slate-400">unit</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })}
            {shipmentBlocks.singles.map(renderCard)}
          </>
        )}
      </div>
      )}

      {/* SHIPMENT VIEW + PROCESS — lihat detail pengiriman & proses seluruh grup ke fase berikut */}
      {shipView && (() => {
        const sh: any = shipView.members[0]?.stageDetails?.shipping || {};
        const dest = Array.isArray(sh.destinations) ? sh.destinations[0] : null;
        const gStage = shipView.members[0]?.currentStage ?? 4;
        const projName = (shipView.members[0]?.stageDetails as any)?.deployment?.projectName || "";
        const checkedCount = shipView.members.filter(m => podChecklist[m.id]).length;
        return (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest block">Pengiriman Bersama · Fase {faseNo(gStage)} · {cleanLabel(gStage)}</span>
                <h3 className="text-base font-bold text-slate-950">{shipView.members.length} aset · satu Surat Jalan</h3>
                <p className="font-mono text-[11px] text-slate-400 mt-0.5">{shipView.batchId}</p>
              </div>
              <button onClick={() => setShipView(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"><span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Proyek</span><span className="text-[11px] font-bold text-slate-700">{projName || "—"}</span></div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"><span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Area</span><span className="text-[11px] font-bold text-slate-700">{dest?.area || "—"}</span></div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"><span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">PIC</span><span className="text-[11px] font-bold text-slate-700">{dest?.picPenerima || "—"}</span></div>
              </div>
              <div>
                {gStage === 5 && (
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-extrabold text-slate-700 flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> Checklist Aset Diterima</span>
                    <span className={`text-[10px] font-bold ${checkedCount === shipView.members.length ? "text-emerald-600" : "text-slate-400"}`}>{checkedCount}/{shipView.members.length} dicentang</span>
                  </div>
                )}
                <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-40 overflow-y-auto">
                  {shipView.members.map(m => (
                    <label key={m.id} className={`flex items-center gap-2 px-3 py-2 ${gStage === 5 ? "cursor-pointer hover:bg-slate-50" : ""} ${gStage === 5 && podChecklist[m.id] ? "bg-emerald-50" : ""}`}>
                      {gStage === 5 && <input type="checkbox" checked={!!podChecklist[m.id]} onChange={() => setPodChecklist(c => ({ ...c, [m.id]: !c[m.id] }))} className="h-4 w-4 rounded accent-emerald-600 shrink-0" />}
                      <span className="min-w-0 flex-1"><span className="block text-[11px] font-bold text-slate-800 truncate">{m.name}</span><span className="block text-[9px] text-slate-400 font-mono">{m.id}</span></span>
                      <span className="text-right shrink-0"><span className="text-xs font-extrabold text-slate-700 tabular-nums">{m.quantity}</span><span className="text-[9px] text-slate-400"> unit</span></span>
                    </label>
                  ))}
                </div>
                {gStage === 5 && <p className="mt-1 text-[9px] text-slate-400">Centang tiap aset yang benar-benar diterima sebelum menandatangani Surat Jalan.</p>}
              </div>
              {gStage === 4 && onGroupAdvance ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 space-y-3">
                  <p className="text-[11px] font-extrabold text-blue-800 flex items-center gap-1.5"><Compass className="h-3.5 w-3.5" /> Proses ke Transit — input tracking</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><label className="font-bold text-slate-700">Kurir / Vendor <span className="text-rose-500">*</span></label>
                      <select value={shipForm.courier} onChange={e => setShipForm(f => ({ ...f, courier: e.target.value }))} className="w-full bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer">
                        <option value="">— pilih kurir —</option>{COURIERS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1"><label className="font-bold text-slate-700">No. Resi</label><input value={shipForm.trackingNo} onChange={e => setShipForm(f => ({ ...f, trackingNo: e.target.value }))} className="w-full bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-blue-500" placeholder="opsional" /></div>
                  </div>
                  <div className="space-y-1"><label className="font-bold text-slate-700">Link Tracking <span className="text-rose-500">*</span></label><input value={shipForm.trackingUrl} onChange={e => setShipForm(f => ({ ...f, trackingUrl: e.target.value }))} className="w-full bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-blue-500" placeholder="https://…" /></div>
                  <div className="space-y-1"><label className="font-bold text-slate-700">Estimasi Tiba (ETA) <span className="text-rose-500">*</span></label><input value={shipForm.eta} onChange={e => setShipForm(f => ({ ...f, eta: e.target.value }))} className="w-full bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-blue-500" placeholder="contoh: 2 hari" /></div>
                  {shipError && <p className="text-[10px] font-semibold text-rose-600">{shipError}</p>}
                  <button type="button" onClick={submitShipTransit} disabled={shipBusy} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition">{shipBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4" />} Proses ke Transit (seluruh grup)</button>
                </div>
              ) : gStage === 5 && onGroupAdvance ? (
                <div className="space-y-3">
                  {(() => { const t: any = shipView.members[0]?.stageDetails?.transit || {}; return (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                      <p className="text-[11px] font-extrabold text-slate-700 flex items-center gap-1.5"><Compass className="h-3.5 w-3.5 text-blue-600" /> Pelacakan Kiriman</p>
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        {t.courier && <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5 font-semibold text-slate-600">Kurir: {t.courier}</span>}
                        {t.trackingNo && <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5 font-semibold text-slate-600">Resi: {t.trackingNo}</span>}
                        {t.eta && <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5 font-semibold text-slate-600">ETA: {t.eta}</span>}
                      </div>
                      <div className="flex gap-2">
                        {t.trackingUrl ? <a href={t.trackingUrl} target="_blank" rel="noreferrer" className="flex-1 text-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 text-[11px] inline-flex items-center justify-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Buka Tracking</a> : <span className="flex-1 text-center text-[10px] text-slate-400 py-1.5">Link tracking belum ada</span>}
                        <button type="button" onClick={() => shareTrackingWA(shipView)} className="flex-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-3 py-1.5 text-[11px] inline-flex items-center justify-center gap-1.5"><UserCheck className="h-3.5 w-3.5" /> Share ke WA</button>
                      </div>
                    </div>
                  ); })()}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-3">
                    <p className="text-[11px] font-extrabold text-emerald-800 flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> Surat Jalan Diterima & Ditandatangani (POD)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><label className="font-bold text-slate-700">Diterima Oleh (PIC)</label><input value={dest?.picPenerima || "—"} readOnly className="w-full bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg text-slate-600" /></div>
                      <div className="space-y-1"><label className="font-bold text-slate-700">Tanggal Terima</label><input type="date" value={podForm.podTime} onChange={e => setPodForm(f => ({ ...f, podTime: e.target.value }))} className="w-full bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500" /></div>
                    </div>
                    <div className="space-y-1"><label className="font-bold text-slate-700">Kondisi Barang saat Tiba <span className="text-rose-500">*</span></label>
                      <select value={podForm.conditionOnArrival} onChange={e => setPodForm(f => ({ ...f, conditionOnArrival: e.target.value }))} className="w-full bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
                        {["Sempurna", "Bagus", "Ada Lecet", "Rusak Sebagian"].map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1"><label className="font-bold text-slate-700">Catatan (opsional)</label><textarea value={podForm.podNote} onChange={e => setPodForm(f => ({ ...f, podNote: e.target.value }))} rows={2} className="w-full bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-emerald-500" /></div>
                    <div className="space-y-1"><label className="font-bold text-slate-700">Tanda Tangan Penerima <span className="text-rose-500">*</span></label><SignaturePad onChange={setPodSig} /></div>
                    {shipError && <p className="text-[10px] font-semibold text-rose-600">{shipError}</p>}
                    <button type="button" onClick={submitShipPod} disabled={shipBusy} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition">{shipBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Konfirmasi Diterima (seluruh grup)</button>
                  </div>
                </div>
              ) : gStage === 6 && onAssignInstall ? (
                <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3 space-y-3">
                  <p className="text-[11px] font-extrabold text-violet-800 flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5" /> Penunjukan MD untuk Pemasangan</p>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Lokasi Venue <span className="text-rose-500">*</span></label>
                    <select value={shipVenue} onChange={e => setShipVenue(e.target.value)} className="w-full bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer">
                      <option value="">— pilih venue —</option>
                      {venues.map(v => <option key={v.id} value={String(v.id)}>{v.name}{v.area ? ` · ${v.area}` : ""}</option>)}
                    </select>
                    {venues.length === 0 && <p className="text-[10px] text-amber-600">Belum ada venue untuk client ini — tambahkan di menu Proyek & Lokasi.</p>}
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Merchandiser (MD) <span className="text-rose-500">*</span></label>
                    <select value={shipMd} onChange={e => setShipMd(e.target.value)} className="w-full bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer">
                      <option value="">— pilih MD —</option>
                      {merchDir.map(md => <option key={md.id} value={String(md.id)}>{md.name}{md.area ? ` · ${md.area}` : ""}</option>)}
                    </select>
                    {merchDir.length === 0 && <p className="text-[10px] text-amber-600">Belum ada MD untuk client ini — tambahkan di menu User Management.</p>}
                  </div>
                  <p className="text-[10px] text-slate-500">MD ini ditugaskan memasang seluruh {shipView.members.length} aset di pengiriman ini. MD lalu konfirmasi pemasangan (foto before/after) dari aplikasi lapangan.</p>
                  {shipError && <p className="text-[10px] font-semibold text-rose-600">{shipError}</p>}
                  <button type="button" onClick={submitAssignMD} disabled={shipBusy} className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white font-bold px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition">{shipBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />} Tugaskan Pemasangan ke MD</button>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 text-center py-2 border-t border-slate-100">Proses untuk fase ini menyusul.</p>
              )}
            </div>
          </div>
        </div>
        );
      })()}


      {/* MODAL: PENGIRIMAN GABUNGAN — satu Surat Jalan untuk banyak aset */}
      {batchOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-100">
            {/* HEADER — judul + Tanggal (read-only) + No. Surat Jalan (auto-generate) */}
            <div className="p-5 border-b border-slate-100">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest block">Pembuatan Dokumen</span>
                  <h3 className="text-base font-bold text-slate-950">Buat Surat Jalan</h3>
                </div>
                <button onClick={() => setBatchOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Tanggal</span>
                  <span className="text-xs font-bold text-slate-700 tabular-nums">{new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">No. Surat Jalan</span>
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] font-bold text-slate-700 truncate">{batchForm.suratJalanNo}</span>
                    <button type="button" onClick={() => setBatchForm(f => ({ ...f, suratJalanNo: genSuratJalan() }))} title="Generate ulang nomor" className="shrink-0 text-slate-400 hover:text-blue-600"><RefreshCw className="h-3 w-3" /></button>
                  </span>
                </div>
              </div>
            </div>
            <form onSubmit={submitBatch} className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Nama Proyek</label>
                <select value={batchForm.projectId} onChange={e => setBatchForm(f => ({ ...f, projectId: e.target.value }))} className={`${BATCH_INP} cursor-pointer`}>
                  <option value="">— tanpa proyek —</option>
                  {batchProjects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><label className="font-bold text-slate-700">Area / Tujuan</label>
                <select value={batchForm.area} onChange={e => setBatchForm(f => ({ ...f, area: e.target.value }))} className={`${BATCH_INP} cursor-pointer`}>
                  <option value="">— pilih area —</option>
                  {(batchForm.area && !areaOptions.includes(batchForm.area) ? [batchForm.area, ...areaOptions] : areaOptions).map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                {areaOptions.length === 0 && <p className="text-[10px] text-amber-600">Belum ada area. Tambahkan di menu Organisasi.</p>}
              </div>
              <div className="space-y-1.5"><label className="font-bold text-slate-700">PIC Penerima</label>
                <select value={batchForm.picPenerima} onChange={e => setBatchForm(f => ({ ...f, picPenerima: e.target.value }))} className={`${BATCH_INP} cursor-pointer`}>
                  <option value="">— pilih PIC —</option>
                  {(batchForm.picPenerima && !picOptions.includes(batchForm.picPenerima) ? [batchForm.picPenerima, ...picOptions] : picOptions).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {picOptions.length === 0 && <p className="text-[10px] text-amber-600">Belum ada PIC untuk client ini — tambahkan di menu User Management.</p>}
              </div>
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Detail Aset yang Dikirim <span className="font-normal text-slate-400">({batchSel.length} aset · {batchSel.reduce((s, id) => s + (Math.floor(Number(batchQty[id])) || 0), 0)} unit)</span></label>
                <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                  {batchSel.map(id => { const a = assetById.get(id); const use = Math.floor(Number(batchQty[id])) || 0; const stok = a?.quantity || 0; return (
                    <div key={id} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-bold text-slate-800 truncate">{a?.name || id}</span>
                        <span className="block text-[9px] text-slate-400 font-mono">{id}</span>
                      </span>
                      <span className="text-right shrink-0"><span className="text-xs font-extrabold text-slate-700 tabular-nums">{use}</span><span className="text-[9px] text-slate-400"> / {stok} unit</span></span>
                    </div>
                  ); })}
                </div>
              </div>
              {batchError && <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{batchError}</span></div>}
              <div className="pt-2 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setBatchOpen(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg">Batal</button>
                <button type="submit" disabled={batchBusy || batchSel.length === 0} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-5 py-2 rounded-lg flex items-center gap-1.5">{batchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}Terbitkan Surat Jalan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SURAT JALAN GABUNGAN — printable (report-print-host neutralizes the fixed wrapper for pagination) */}
      {batchPrint && (
        <div className="report-print-host fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[70] overflow-y-auto">
          <div className="report-print-card bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-100">
            <div className="no-print p-4 border-b border-slate-100 flex justify-between items-center">
              <p className="text-sm font-bold text-emerald-700 flex items-center gap-1.5"><Check className="h-4 w-4" /> Surat Jalan {batchPrint.suratJalanNo} · {batchPrint.rows.length} aset</p>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg"><FileText className="h-3.5 w-3.5" /> Cetak</button>
                <button onClick={() => setBatchPrint(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg">Tutup</button>
              </div>
            </div>
            <div id="printable-doc" className="p-8 text-slate-800">
              <div className="flex justify-between items-start border-b-2 border-slate-800 pb-3 mb-4">
                <div><h1 className="text-lg font-extrabold">{settings?.company_name || "PT Origin Connect"}</h1><p className="text-[11px] text-slate-500">{settings?.company_address || ""}</p></div>
                <div className="text-right"><h2 className="text-base font-extrabold tracking-widest">SURAT JALAN</h2><p className="text-[11px] font-mono">{batchPrint.suratJalanNo}</p><p className="text-[11px] text-slate-500">Tanggal: <strong className="text-slate-700">{batchPrint.tanggal}</strong></p></div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px] mb-4">
                <div>{batchPrint.projectName ? <>Proyek: <strong>{batchPrint.projectName}</strong><br /></> : null}Tujuan: <strong>{batchPrint.area || "—"}</strong>{batchPrint.picPenerima ? <> · PIC: <strong>{batchPrint.picPenerima}</strong></> : null}</div>
                <div className="text-right">{batchPrint.driverName ? <>Driver: <strong>{batchPrint.driverName}</strong>{batchPrint.vehiclePlate ? <> · {batchPrint.vehiclePlate}</> : null}</> : batchPrint.courier ? <>Kurir: <strong>{batchPrint.courier}</strong>{batchPrint.trackingNo ? <> · Resi {batchPrint.trackingNo}</> : null}</> : null}</div>
              </div>
              <table className="w-full text-[11px] border-collapse">
                <thead><tr className="bg-slate-100"><th className="border border-slate-300 px-2 py-1 text-left">No</th><th className="border border-slate-300 px-2 py-1 text-left">ID Aset</th><th className="border border-slate-300 px-2 py-1 text-left">Nama Aset</th><th className="border border-slate-300 px-2 py-1 text-right">Qty</th></tr></thead>
                <tbody>{batchPrint.rows.map((r, i) => (<tr key={r.id}><td className="border border-slate-300 px-2 py-1">{i + 1}</td><td className="border border-slate-300 px-2 py-1 font-mono">{r.id}</td><td className="border border-slate-300 px-2 py-1">{r.name}</td><td className="border border-slate-300 px-2 py-1 text-right">{r.qty}</td></tr>))}</tbody>
              </table>
              <div className="grid grid-cols-2 gap-8 mt-12 text-[11px] text-center">
                <div>Pengirim / Gudang<div className="mt-12 border-t border-slate-400 pt-1">(_______________)</div></div>
                <div>Penerima{batchPrint.picPenerima ? ` (${batchPrint.picPenerima})` : ""}<div className="mt-12 border-t border-slate-400 pt-1">(_______________)</div></div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
