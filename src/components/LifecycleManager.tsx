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
  6: "Terpasang",
  7: "Audit",
  8: "Pemeliharaan",
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
  onAssignInstall: (assetId: string, assignments: { merchandiserId: number; qty: number }[], baseUpdatedAt?: string) => Promise<{ ok: boolean; error?: string }>;
  onHandoverInternal?: (assetId: string, p: { custodianId: number; handoverDate?: string; signatureBase64?: string; note?: string; projectId?: number | null }) => Promise<{ ok: boolean; error?: string }>;
  onDeployVenue?: (assetId: string, p: { locationId: number; pic?: string; setupDate?: string; note?: string; signatureBase64?: string; projectId?: number | null; suratJalanNo?: string; courier?: string; trackingUrl?: string; trackingNo?: string; eta?: string }) => Promise<{ ok: boolean; error?: string }>;
  onArriveVenue?: (assetId: string) => Promise<{ ok: boolean; error?: string }>;
  onShipReturn?: (assetId: string, p: { suratJalanNo?: string; courier?: string; trackingUrl?: string; trackingNo?: string; eta?: string }) => Promise<{ ok: boolean; error?: string }>;
  onArriveWarehouse?: (assetId: string) => Promise<{ ok: boolean; error?: string }>;
  onBatchShip?: (p: { items: { id: string; qty: number }[]; deployMode?: string; suratJalanNo?: string; driverName: string; vehiclePlate?: string; vendorShipping?: string; departureTime?: string; area: string; picPenerima?: string; courier?: string; trackingUrl?: string; trackingNo?: string; eta?: string }) => Promise<{ ok: boolean; error?: string; suratJalanNo?: string }>;
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
  const [filterCategory, setFilterCategory] = React.useState("ALL");
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
  const [batchForm, setBatchForm] = React.useState({ suratJalanNo: "", deployMode: "", driverName: "", vehiclePlate: "", vendorShipping: "", departureTime: "", area: "", picPenerima: "", courier: "", trackingUrl: "", trackingNo: "", eta: "" });
  const [batchBusy, setBatchBusy] = React.useState(false);
  const [batchError, setBatchError] = React.useState<string | null>(null);
  const [batchPrint, setBatchPrint] = React.useState<{ suratJalanNo: string; area: string; picPenerima: string; driverName: string; vehiclePlate: string; courier?: string; trackingNo?: string; rows: { id: string; name: string; qty: number }[] } | null>(null);

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
  const openBatch = () => {
    const q: Record<string, string> = {};
    batchSel.forEach(id => { const a = assets.find(x => x.id === id); q[id] = String(a?.quantity ?? 1); });
    setBatchQty(q);
    setBatchForm({ suratJalanNo: genSuratJalan(), driverName: "", vehiclePlate: "", vendorShipping: "", departureTime: "", area: "", picPenerima: "", courier: "", trackingUrl: "", trackingNo: "", eta: "" });
    // PIC dropdown = the selected assets' client (a consolidated dispatch is normally one client).
    const cls = [...new Set(batchSel.map(id => assets.find(x => x.id === id)?.client).filter(Boolean))];
    void loadDirectory(cls.length === 1 ? cls[0] : null);
    setBatchError(null); setBatchOpen(true);
  };
  const submitBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onBatchShip) return;
    if (!batchForm.deployMode) return setBatchError("Pilih Type Kategori (Internal / Event / Distribusi) dulu.");
    if (!batchForm.area.trim()) return setBatchError("Tujuan pengiriman (area) wajib diisi.");
    if (!batchForm.driverName.trim()) return setBatchError("Nama driver wajib diisi.");
    if (batchForm.trackingUrl && !/^https?:\/\//i.test(batchForm.trackingUrl.trim())) return setBatchError("Link tracking harus diawali http:// atau https://.");
    const items = batchSel.map(id => ({ id, qty: Math.floor(Number(batchQty[id])) }));
    for (const it of items) {
      const a = assets.find(x => x.id === it.id);
      if (!(Number.isInteger(it.qty) && it.qty > 0 && it.qty <= (a?.quantity || 0))) return setBatchError(`Qty tidak valid untuk ${a?.name || it.id} (maks ${a?.quantity || 0}).`);
    }
    setBatchBusy(true); setBatchError(null);
    const res = await onBatchShip({
      items, deployMode: batchForm.deployMode || undefined, suratJalanNo: batchForm.suratJalanNo || undefined, driverName: batchForm.driverName.trim(),
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
    setBatchPrint({ suratJalanNo: res.suratJalanNo || batchForm.suratJalanNo, area: batchForm.area.trim(), picPenerima: batchForm.picPenerima.trim(), driverName: batchForm.driverName.trim(), vehiclePlate: batchForm.vehiclePlate.trim(), rows });
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

  const categories = React.useMemo(() => Array.from(new Set(assets.map(a => a.category))), [assets]);

  // Register-eligible assets (all filters EXCEPT the flow filter) — used both for the flow legend
  // counts and, after applying the flow filter, for the rendered grid.
  const assetById = React.useMemo(() => new Map(assets.map(a => [a.id, a])), [assets]);
  const baseAssetsList = React.useMemo(() => {
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
        onClick={() => { if (batchMode) { if (batchable) toggleBatchSel(asset.id); } else setDetailAssetId(asset.id); }}
        className={`bg-white rounded-xl border transition-all flex flex-col justify-between overflow-hidden ${batchMode && !batchable ? "border-slate-100 opacity-60 cursor-not-allowed" : "cursor-pointer hover:shadow-md"} ${picked ? "border-blue-500 ring-2 ring-blue-500" : `border-slate-100 ${flow.ring}`}`}
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
            <span className="text-[10px] text-slate-500 font-bold px-1 uppercase tracking-wider">Fase:</span>
            <select
              value={filterStage}
              onChange={e => setFilterStage(e.target.value)}
              className="bg-transparent border-0 text-slate-700 font-bold text-xs select-none cursor-pointer pr-4 focus:ring-0 outline-none"
            >
              <option value="ALL">Semua Alur (1 s/d 8)</option>
              {[3, 4, 5, 6, 7, 8, 9, 10].map(s => (
                <option key={s} value={s}>
                  Fase {faseNo(s)} - {cleanLabel(s)}
                </option>
              ))}
            </select>
          </div>

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
                        <th className="px-3 py-2.5 font-extrabold">Peruntukan</th>
                        <th className="px-3 py-2.5 font-extrabold">Fase</th>
                        <th className="px-3 py-2.5 font-extrabold whitespace-nowrap">Masuk Gudang</th>
                        <th className="px-3 py-2.5 font-extrabold text-right">Stok</th>
                        <th className="px-3 py-2.5 font-extrabold text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {capped.map(a => {
                        const picked = batchSel.includes(a.id);
                        const internal = (a.peruntukan || "Deployment") === "Internal";
                        return (
                          <tr key={a.id} onClick={canDispatch ? () => pickRow(a) : undefined} className={`text-[12px] transition ${canDispatch ? "cursor-pointer" : ""} ${picked ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                            {canDispatch && <td className="px-3 py-2.5"><input type="checkbox" checked={picked} readOnly tabIndex={-1} className="h-4 w-4 rounded accent-blue-600 pointer-events-none align-middle" /></td>}
                            <td className="px-3 py-2.5"><span className="font-mono text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">{a.id}</span></td>
                            <td className="px-3 py-2.5 font-bold text-slate-800">{a.name}</td>
                            <td className="px-3 py-2.5 text-slate-600">{a.client || "—"}</td>
                            <td className="px-3 py-2.5"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${internal ? "bg-slate-800 text-white" : "bg-blue-50 text-blue-700"}`}>{internal ? "Internal" : "Deployment"}</span></td>
                            <td className="px-3 py-2.5"><span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200 whitespace-nowrap">{faseNo(a.currentStage)} · {cleanLabel(a.currentStage)}</span></td>
                            <td className="px-3 py-2.5 text-slate-500 tabular-nums whitespace-nowrap">{a.createdAt ? new Date(a.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap"><span className="text-sm font-extrabold text-slate-700 tabular-nums">{a.quantity}</span> <span className="text-[9px] text-slate-400">unit</span></td>
                            <td className="px-3 py-2.5 text-right"><button type="button" onClick={e => { e.stopPropagation(); setDetailAssetId(a.id); }} className="text-[11px] font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md transition inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> Detail</button></td>
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
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-600">Tujuan / Area <span className="text-rose-500">*</span></label>
                        <select value={batchForm.area} onChange={e => setBatchForm(f => ({ ...f, area: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 cursor-pointer">
                          <option value="">— pilih area —</option>
                          {(batchForm.area && !areaOptions.includes(batchForm.area) ? [batchForm.area, ...areaOptions] : areaOptions).map(ar => <option key={ar} value={ar}>{ar}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-600">Nama Driver <span className="text-rose-500">*</span></label>
                        <input value={batchForm.driverName} onChange={e => setBatchForm(f => ({ ...f, driverName: e.target.value }))} placeholder="nama driver" className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs outline-none focus:bg-white focus:ring-1 focus:ring-blue-500" />
                      </div>
                    </div>
                    {batchError && <p className="text-[10px] font-semibold text-rose-600">{batchError}</p>}
                    <button type="button" onClick={e => submitBatch(e as any)} disabled={batchBusy} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition">
                      {batchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} Terbitkan Surat Jalan
                    </button>
                    <p className="text-[9px] text-slate-400 text-center">Qty dipakai berangkat bersama (satu Surat Jalan); sisanya tetap tercatat di Gudang.</p>
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
                        onClick={() => openGroupProcess(g)}
                        title="Proses seluruh aset dalam pengiriman ini sekaligus"
                        className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-extrabold text-blue-700 shadow-sm hover:bg-blue-50 transition"
                      >
                        <Truck className="h-3.5 w-3.5" /> Proses Grup ({g.members.length}) →
                      </button>
                    </div>
                  </div>
                  {/* Member cards tray */}
                  <div className="bg-gradient-to-b from-blue-50/70 to-transparent p-3 md:p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {g.members.map(renderCard)}
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

      {/* MODAL 2: LIFECYCLE DETAIL + TRANSITION CONTROL */}
      {detailAsset && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100">
            {/* LEFT: specs / QR / financials */}
            <div className="p-6 md:w-5/12 space-y-5 flex-shrink-0 bg-slate-50/50">
              <div className="flex justify-between items-start gap-2">
                <span className="font-mono text-xs bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded border border-blue-200">{hasGroup ? `${groupSameStage.length} ASET` : detailAsset.id}</span>
                <button onClick={() => setDetailAssetId(null)} className="md:hidden text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Grouped shipment → present the whole SHIPMENT as the subject (not one asset). */}
              {hasGroup ? (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-blue-600 font-bold">Pengiriman Bersama</p>
                  <h3 className="font-bold text-slate-950 text-base leading-snug">{groupSameStage.length} aset · satu Surat Jalan</h3>
                  {detailBatchId && <p className="text-slate-400 text-xs font-mono">{detailBatchId}</p>}
                </div>
              ) : (
                <div className="space-y-1">
                  <h3 className="font-bold text-slate-950 text-base leading-snug">{detailAsset.name}</h3>
                  <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold">{detailAsset.category}</p>
                </div>
              )}

              {(() => {
                // Identity + live status card (replaces the old non-functional QR placeholder block).
                // Shows the asset's ID, which of the 4 flows it's in, its current phase, and location.
                const St = STAGE_ICONS[detailAsset.currentStage] || ClipboardList;
                const fmode = isInternalDeploy(detailAsset) || detailAsset.peruntukan === "Internal" ? "Internal" : flowKeyOf(projectModeOf(detailAsset));
                const flow = FLOW_UI[fmode]; const FlowIcon = flow.Icon;
                return (
                  <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className={`h-1.5 w-full ${flow.bar}`} />
                    <div className="bg-gradient-to-br from-slate-50 to-white p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-extrabold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{detailAsset.id}</span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${flow.chip}`}><FlowIcon className="h-3 w-3" /> {flow.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`shrink-0 p-2.5 rounded-xl border ${statusColors[detailAsset.currentStage] || "bg-slate-100 text-slate-500 border-slate-200"}`}>
                        <St className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Fase Saat Ini</p>
                        <p className="font-extrabold text-slate-900 text-sm leading-tight">Fase {faseNo(detailAsset.currentStage)} · {cleanLabel(detailAsset.currentStage)}</p>
                        {STAGE_SUBTITLES[detailAsset.currentStage] && <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{STAGE_SUBTITLES[detailAsset.currentStage]}</p>}
                      </div>
                    </div>
                    {detailAsset.currentLocation && (
                      <div className="flex items-start gap-1.5 text-[11px] text-slate-500 border-t border-slate-100 pt-2.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
                        <span className="min-w-0">{detailAsset.currentLocation}</span>
                      </div>
                    )}
                    </div>
                  </div>
                );
              })()}

              {/* Assets travelling TOGETHER in this shipment — the detail renders one, so list all
                  members here; click a row to open that member's detail. */}
              {hasGroup && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/40 overflow-hidden">
                  <div className="flex items-center gap-2 bg-blue-600 px-3 py-2 text-white">
                    <Truck className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-[11px] font-bold">Berangkat bersama · {groupSameStage.length} aset</span>
                    {detailBatchId && <span className="ml-auto font-mono text-[9px] rounded bg-white/15 px-1.5 py-0.5 ring-1 ring-white/20">{detailBatchId}</span>}
                  </div>
                  <div className="space-y-1 p-2">
                    {groupSameStage.map(mm => {
                      const open = mm.id === detailAsset.id;
                      return (
                        <button
                          key={mm.id}
                          type="button"
                          onClick={() => setDetailAssetId(mm.id)}
                          className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition ${open ? "bg-blue-600 text-white" : "bg-white text-slate-700 border border-blue-100 hover:bg-blue-50"}`}
                        >
                          <span className={`font-mono text-[10px] shrink-0 ${open ? "text-blue-100" : "text-blue-600"}`}>{mm.id}</span>
                          <span className="min-w-0 flex-1 truncate text-[11px] font-bold">{mm.name}</span>
                          <span className={`shrink-0 text-[9px] ${open ? "text-blue-100" : "text-slate-400"}`}>{mm.quantity} unit{open ? " · dibuka" : ""}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Spesifikasi — only rows that are actually filled (no "—" clutter); whole block hides if empty. */}
              {!hasGroup && (() => {
                const s: any = detailAsset.specs || {};
                const rows: { label: string; val?: string; mono?: boolean }[] = [
                  { label: "Merk / Brand", val: s.brand },
                  { label: "SKU Code", val: s.sku, mono: true },
                  { label: "Dimensi Fisik", val: s.dimensions },
                  { label: "Daya / Berat", val: s.powerWeight },
                ].filter(r => r.val);
                if (!rows.length) return null;
                return (
                  <div className="space-y-3 text-xs">
                    <h5 className="font-extrabold text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-1">Spesifikasi Komponen:</h5>
                    <div className="space-y-2 text-slate-600">
                      {rows.map(r => (
                        <div key={r.label} className="flex justify-between">
                          <span className="text-slate-400 font-medium">{r.label}:</span> <strong className={`${r.mono ? "font-mono" : "font-bold"} text-slate-800`}>{r.val}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Keuangan — only non-zero rows; whole block hides when the asset has no book value. */}
              {!hasGroup && (() => {
                const f: any = detailAsset.financials || {};
                const rows: { label: string; val: number; accent?: boolean }[] = [
                  { label: "Harga Pengadaan", val: Number(f.purchaseCost) || 0 },
                  { label: "Biaya Servis", val: Number(f.maintenanceCost) || 0 },
                  { label: "Estimasi Sisa Scrap", val: Number(f.disposalValue) || 0, accent: true },
                ].filter(r => r.val > 0);
                if (!rows.length) return null;
                return (
                  <div className="space-y-3 text-xs pt-2">
                    <h5 className="font-extrabold text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-1">Catatan Keuangan &amp; Nilai Buku:</h5>
                    <div className="space-y-2 text-slate-600">
                      {rows.map(r => (
                        <div key={r.label} className="flex justify-between">
                          <span className="text-slate-400 font-medium">{r.label}:</span> <strong className={`font-bold ${r.accent ? "text-blue-600" : "text-slate-800"}`}>{formatRupiah(r.val)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* RIGHT: transition control + timeline */}
            <div className="p-6 md:w-7/12 flex flex-col justify-between max-h-[85vh] overflow-y-auto">
              <div className="space-y-5">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-base">Lifecycle Aset (Fase 1–{TOTAL_FASE})</h4>
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
                  const d: any = detailAsset.stageDetails?.deployment || {};
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
                                <p className="text-[9px] text-slate-400">{dq}/{a.qty} unit{done && a.completedAt ? ` · selesai ${new Date(a.completedAt).toLocaleDateString("id-ID")}` : partial && a.lastReportAt ? ` · diperbarui ${new Date(a.lastReportAt).toLocaleDateString("id-ID")}` : ""}</p>
                              </div>
                              {a.signature && (done || partial) && <img src={a.signature} alt="TTD" className="h-7 bg-white border border-slate-200 rounded" />}
                              <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full ${pill}`}>{done ? "Selesai" : partial ? `Sebagian ${dq}/${a.qty}` : "Menunggu"}</span>
                              {!done && canConfirmInstall && onCompleteInstall && a.merchandiserId != null && (
                                <button
                                  onClick={() => doConfirmInstall(Number(a.merchandiserId), a.merchandiser || "Merchandiser")}
                                  disabled={confirmBusy === `a${a.merchandiserId}`}
                                  className="shrink-0 text-[9px] font-extrabold px-2 py-1 rounded-md border border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50 disabled:opacity-50"
                                >
                                  {confirmBusy === `a${a.merchandiserId}` ? "…" : "Konfirmasi"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {canConfirmInstall && onCompleteInstall && !full && (
                        <p className="text-[9px] text-slate-500 leading-snug">Merchandiser melapor dari aplikasi mobile. Sebagai {user?.role}, kamu bisa <strong>Konfirmasi</strong> pemasangan di sini (foto lapangan tidak wajib untuk konfirmasi kantor).</p>
                      )}
                      {hasGroup && groupActs && canConfirmInstall && onCompleteInstall && !full && (
                        <button onClick={doConfirmInstallGroup} disabled={confirmBusy === "group"}
                          className="w-full flex items-center justify-center gap-1.5 text-[10px] font-extrabold px-3 py-2 rounded-lg border border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50 disabled:opacity-50">
                          <MapPin className="h-3.5 w-3.5" />{confirmBusy === "group" ? "Memproses…" : `Konfirmasi Pemasangan Seluruh Grup (${groupSameStage.length} aset)`}
                        </button>
                      )}
                      {confirmError && <p className="text-[10px] font-semibold text-rose-600">{confirmError}</p>}
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
                  const d: any = detailAsset.stageDetails?.deployment || {};
                  return (
                    <div className="rounded-xl p-4 space-y-2 border border-indigo-200 bg-indigo-50">
                      <div className="flex items-center gap-2">
                        <span className="bg-indigo-500 text-white p-1.5 rounded-lg"><MapPin className="h-3.5 w-3.5" /></span>
                        <div>
                          <p className="text-xs font-extrabold text-slate-800">Pemasangan / Instalasi (BAST)</p>
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
                      {d.bastSignature && <img src={d.bastSignature} alt="Tanda tangan BAST pemasangan" className="h-16 bg-white border border-slate-200 rounded" />}
                    </div>
                  );
                })() : null}

                {/* Internal (Fase 1) — custodian handover panel */}
                {isInternalDeploy(detailAsset) && detailAsset.stageDetails?.deployment?.custodianName && (() => {
                  const d: any = detailAsset.stageDetails?.deployment || {};
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
                      {d.handoverSignature && <img src={d.handoverSignature} alt="Tanda tangan BAST serah-terima" className="h-16 bg-white border border-slate-200 rounded" />}
                    </div>
                  );
                })()}

                {/* Event (Fase 2) — roadshow timeline (ordered venue legs) */}
                {Array.isArray(detailAsset.stageDetails?.deployment?.legs) && (detailAsset.stageDetails?.deployment?.legs?.length || 0) > 0 && (() => {
                  const d: any = detailAsset.stageDetails?.deployment || {};
                  const legs = [...d.legs].sort((a: any, b: any) => (a.seq || 0) - (b.seq || 0));
                  return (
                    <div className="rounded-xl p-4 space-y-3 border border-amber-200 bg-amber-50/60">
                      <div className="flex items-center gap-2">
                        <span className="bg-amber-500 text-white p-1.5 rounded-lg"><Compass className="h-3.5 w-3.5" /></span>
                        <div>
                          <p className="text-xs font-extrabold text-slate-800">Linimasa Roadshow / Venue</p>
                          <p className="text-[10px] text-slate-500">{legs.length} venue · sekarang di <strong className="text-amber-700">venue ke-{d.currentLegSeq || legs[legs.length - 1]?.seq}</strong></p>
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
                                {lg.pic ? `PIC: ${lg.pic}` : "PIC: —"}{lg.status === "transit" && lg.shipping?.shippedAt ? ` · dikirim ${lg.shipping.shippedAt}${lg.shipping.eta ? ` · ETA ${lg.shipping.eta}` : ""}` : ""}{lg.setupDate ? ` · setup ${lg.setupDate}` : ""}{lg.teardownDate ? ` · bongkar ${lg.teardownDate}` : ""}
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
                          <p className="text-xs font-extrabold text-slate-800">Pelacakan Kiriman {toGudang ? "ke Gudang" : "ke Venue"}</p>
                          <p className="text-[10px] text-slate-500">
                            {ship?.suratJalanNo ? <>No. Surat Jalan: <strong className="text-slate-700 font-mono">{ship.suratJalanNo}</strong> · </> : null}Tujuan: <strong className="text-slate-700">{destName}</strong>
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
                      <button type="button" onClick={() => setBatchPrint({ suratJalanNo: ship?.suratJalanNo || "-", area: destName, picPenerima: pic, driverName: "", vehiclePlate: "", courier: ship?.courier, trackingNo: ship?.trackingNo, rows: [{ id: detailAsset.id, name: detailAsset.name, qty: detailAsset.quantity }] })} className="w-full flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded-lg transition">
                        <FileText className="h-3.5 w-3.5" /> Cetak Surat Jalan
                      </button>
                    </div>
                  );
                })()}

                {/* Distribusi (Fase 3) — placement monitor + coverage */}
                {Array.isArray(detailAsset.stageDetails?.deployment?.placements) && (detailAsset.stageDetails?.deployment?.placements?.length || 0) > 0 && (() => {
                  const d: any = detailAsset.stageDetails?.deployment || {};
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
                              {!done && canConfirmPlacement && onPlaceToko && (
                                <button
                                  onClick={() => doConfirmPlacement(Number(p.locationId), p.toko || "toko")}
                                  disabled={confirmBusy === `p${p.locationId}`}
                                  className="shrink-0 text-[9px] font-extrabold px-2 py-1 rounded-md border border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50 disabled:opacity-50"
                                >
                                  {confirmBusy === `p${p.locationId}` ? "…" : "Konfirmasi"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {canConfirmPlacement && onPlaceToko && installed < (detailAsset.quantity || 0) && (
                        <p className="text-[9px] text-slate-500 leading-snug">Merchandiser melapor per toko dari aplikasi mobile. Sebagai Admin kamu bisa <strong>Konfirmasi</strong> pemasangan toko di sini.</p>
                      )}
                      {confirmError && <p className="text-[10px] font-semibold text-rose-600">{confirmError}</p>}
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
                      {au.kelengkapanQty != null && (
                        <div className="text-[11px] text-slate-600"><span className="text-slate-400">Qty tercatat:</span> <strong className="text-slate-700">{au.kelengkapanQty}</strong></div>
                      )}
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
                      <p className="text-[10px] text-slate-500">Pilih langkah berikutnya untuk aset ini</p>
                    </div>
                  </div>

                  {/* Shipment group — dispatched together (Kirim Bersama). One toggle makes EVERY action
                      (pindah lokasi / balik gudang / konfirmasi tiba / audit / maintenance / penarikan)
                      apply to all members at this stage at once, sharing one Surat Jalan. */}
                  {hasGroup && detailAsset.currentStage >= 4 && detailAsset.currentStage <= 9 && (
                    <label className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5 text-[11px] text-blue-800 cursor-pointer">
                      <input type="checkbox" checked={groupActs} onChange={e => setGroupActs(e.target.checked)} className="mt-0.5 h-4 w-4 rounded accent-blue-600 shrink-0" />
                      <span className="min-w-0">
                        <span className="block font-bold flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 shrink-0" /> Proses untuk seluruh grup ({groupSameStage.length} aset)</span>
                        <span className="block text-[10px] text-blue-600/90 leading-snug">Grup {detailBatchId} — semua aset yang berangkat bersama &amp; masih di fase ini ikut pindah sekaligus (satu Surat Jalan). Matikan untuk memproses aset ini saja.</span>
                      </span>
                    </label>
                  )}

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

                  {/* Location chain — ANY deployed (non-Internal) asset at a location (Fase 6): relocate to the
                      NEXT location or ship back to Gudang. Every hop carries a Surat Jalan + tracking. The FIRST
                      ship-out from Gudang uses the courier ladder (Surat Jalan→Transit→POD) below. */}
                  {onDeployVenue && !(isInternalDeploy(detailAsset) || detailAsset.peruntukan === "Internal") && detailAsset.currentStage === 6 && (() => {
                    const dep: any = detailAsset.stageDetails?.deployment || {};
                    const legs: any[] = Array.isArray(dep.legs) ? dep.legs : [];
                    const transitLeg = legs.find(l => l.status === "transit");
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
                              <span className="block text-[11px] font-bold leading-tight">Konfirmasi Kedatangan di Gudang</span>
                              <span className="block text-[9px] text-emerald-50 leading-tight">Aset kembali ke Fase 1 ({cleanLabel(3)}) — perjalanan selesai</span>
                            </span>
                          </button>
                        ) : (
                          <div className="w-full flex items-center gap-2 bg-cyan-50 border border-cyan-200 text-cyan-700 rounded-lg px-3 py-2.5 text-[11px] font-semibold"><Home className="h-4 w-4 shrink-0" /><span>Dalam pengiriman kembali ke gudang — menunggu <strong>Logistik/Admin</strong> mengonfirmasi kedatangan.</span></div>
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
                            <span className="block text-[11px] font-bold leading-tight">Konfirmasi Kedatangan di Lokasi</span>
                            <span className="block text-[9px] text-emerald-50 leading-tight">{transitLeg.venue}{transitLeg.area ? ` · ${transitLeg.area}` : ""} — aset menjadi aktif di lokasi</span>
                          </span>
                        </button>
                      </>
                    );
                    // Arrived (or fresh) → ship to (next) venue; and if at a venue, ship back to gudang (Logistik/Admin).
                    return (
                      <>
                        {errBanner}
                        <button onClick={openVenue}
                          className="w-full flex items-center gap-2 text-left bg-blue-600 hover:bg-blue-700 text-white border border-blue-600 rounded-lg px-3 py-2.5 transition shadow-sm">
                          <Truck className="h-4 w-4 shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-[11px] font-bold leading-tight">Kirim ke Lokasi Berikutnya</span>
                            <span className="block text-[9px] text-blue-100 leading-tight">Kirim aset + Surat Jalan &amp; tracking ke lokasi/venue berikutnya</span>
                          </span>
                        </button>
                        {onShipReturn && gudangRole && (
                          <button onClick={openReturn} title="Tidak ada tujuan lagi — kirim aset + Surat Jalan balik ke gudang (perlu konfirmasi)"
                            className="w-full flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 transition">
                            <Home className="h-3.5 w-3.5 shrink-0" /> Kirim Kembali ke Gudang
                          </button>
                        )}
                      </>
                    );
                  })()}

                  {/* Distribusi — START from Gudang (Fase 3) or MANAGE placements once fanned out (Fase 6). */}
                  {onDistribute && projectModeOf(detailAsset) === "Distribusi" && (detailAsset.currentStage === 3 || detailAsset.currentStage === 6) && (() => {
                    const hasPls = (detailAsset.stageDetails?.deployment?.placements?.length || 0) > 0;
                    return (
                      <button
                        onClick={openDistribute}
                        className="w-full flex items-center gap-2 text-left bg-teal-600 hover:bg-teal-700 text-white border border-teal-600 rounded-lg px-3 py-2.5 transition shadow-sm"
                      >
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-bold leading-tight">{hasPls ? "Kelola Distribusi Toko" : "Distribusi ke Toko"}</span>
                          <span className="block text-[9px] text-teal-50 leading-tight">{hasPls ? "Tambah atau ubah pembagian per-toko (progres tetap aman)" : "Bagi qty ke toko dan merchandiser; mereka memasang di lapangan"}</span>
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
                        <span className="block text-[9px] text-teal-600 leading-tight">Cek sebagian toko (10–20%) untuk cakupan dan kepatuhan</span>
                      </span>
                    </button>
                  )}

                  {detailAsset.currentStage === 6 && !detailAsset.stageDetails?.deployment?.fullyInstalled && !isInternalDeploy(detailAsset) && detailAsset.peruntukan !== "Internal" && projectModeOf(detailAsset) !== "Distribusi" && (() => {
                    const hasAsg = (detailAsset.stageDetails?.deployment?.assignments?.length || 0) > 0;
                    return (
                      <button
                        onClick={() => openGate(6)}
                        className="w-full flex items-center gap-2 text-left bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg px-3 py-2.5 transition shadow-sm"
                      >
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-bold leading-tight">{hasAsg ? "Kelola Penugasan Pemasangan" : "Tugaskan Pemasangan"}</span>
                          <span className="block text-[9px] text-slate-500 leading-tight">{hasAsg ? "Tambah atau ubah pembagian Merchandiser (progres tetap aman)" : "Bagi qty ke Merchandiser; mereka melapor melalui aplikasi mobile"}</span>
                        </span>
                      </button>
                    );
                  })()}

                  {(() => {
                    // Every non-Internal asset ships out of Gudang via the courier ladder (3→4 Surat Jalan →
                    // Transit → POD). Internal (custodian) assets are held by an employee, not shipped — they
                    // start via their own handover action. Post-deployment branches are common to all.
                    const emode = isInternalDeploy(detailAsset) || detailAsset.peruntukan === "Internal" ? "Internal" : projectModeOf(detailAsset);
                    return emode === "Internal" && detailAsset.currentStage === 3;
                  })() ? null : TRANSITIONS[detailAsset.currentStage]?.length ? (() => {
                    const targets = TRANSITIONS[detailAsset.currentStage];
                    // One legal next step ⇒ that step IS the primary action (filled). Several ⇒ they're
                    // follow-ups: audit stays a normal secondary, maintenance/penarikan drop to muted.
                    const single = targets.length === 1;
                    return (
                      <div className="space-y-2">
                        {!single && <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Lanjutan</p>}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {targets.map(t => {
                            const Icon = STAGE_ICONS[t];
                            const dep: any = detailAsset.stageDetails?.deployment || {};
                            const asg: any[] = dep.assignments || [];
                            const installed = installedOf(asg);
                            // Audit (6->7) with pending install portions is ALLOWED (soft gate), flagged amber.
                            const installPartial = t === 7 && detailAsset.currentStage === 6 && asg.length > 0 && !dep.fullyInstalled;
                            const muted = !single && (t === 8 || t === 9); // maintenance / penarikan = rare
                            const cls = installPartial
                              ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                              : single
                              ? "bg-blue-600 border-blue-600 text-white hover:bg-blue-700 sm:col-span-2"
                              : muted
                              ? "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                              : "bg-white border-slate-200 text-slate-800 hover:bg-slate-50";
                            const subCls = installPartial ? "text-amber-600" : single ? "text-blue-100" : "text-slate-400";
                            return (
                              <button
                                key={t}
                                onClick={() => { if ((t === 9 || t === 10) && !window.confirm(`${verbFor(t, detailAsset.currentStage, detailAsset)} untuk ${groupMode && groupSameStage.length >= 2 ? `${groupSameStage.length} aset grup` : "aset"} ini?`)) return; openGate(t); }}
                                title={installPartial ? `Pemasangan baru ${installed}/${detailAsset.quantity} terpasang — Audit tetap boleh, progres sisanya tercatat.` : ""}
                                className={`flex items-center gap-2 text-left border rounded-lg px-3 py-2 transition shadow-xs ${cls}`}
                              >
                                <Icon className="h-4 w-4 shrink-0" />
                                <span className="min-w-0">
                                  <span className="block text-[11px] font-bold leading-tight">{verbFor(t, detailAsset.currentStage, detailAsset)}</span>
                                  <span className={`block text-[9px] leading-tight ${subCls}`}>
                                    {installPartial ? `⚠ baru ${installed}/${detailAsset.quantity} terpasang` : `Fase ${faseNo(t)} · ${cleanLabel(t)}`}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })() : (
                    <div className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-500" />
                      Aset sudah di fase akhir (Disposal). Data diarsipkan permanen — tidak ada perpindahan fase lanjutan.
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
                          {faseNo(stepNumber)}
                        </span>

                        <div className="pl-3 space-y-1 text-xs">
                          <h5 className={`flex items-center gap-1.5 ${textClass}`}>
                            <IconComponent className="h-3.5 w-3.5" />
                            {cleanLabel(stepNumber)}
                            {isActive && (
                              <span className="bg-blue-50 text-blue-600 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold uppercase animate-pulse">Sedang Berjalan</span>
                            )}
                            {isCompleted && <span className="text-emerald-500 font-bold text-[10px]">✓ Selesai</span>}
                          </h5>

                          {(isActive || isCompleted) && (
                            <div className="mt-1 bg-slate-50 rounded-lg p-2.5 border border-slate-200/50 space-y-1.5 text-[11px] text-slate-600">
                              {stepNumber === 3 && (
                                <p>
                                  Gudang: <strong>{detailAsset.stageDetails.inventory?.warehouseName || "—"}</strong>
                                  <br />
                                  Rak: <strong>{detailAsset.stageDetails.inventory?.shelfLoc || "—"}</strong> · Stok:{" "}
                                  <strong className="font-mono">{detailAsset.stageDetails.inventory?.stockCode || "—"}</strong>
                                </p>
                              )}
                              {stepNumber === 4 && (
                                <p>
                                  Surat Jalan: <strong className="font-mono text-slate-800">{detailAsset.stageDetails.shipping?.suratJalanNo || "—"}</strong>
                                  <br />
                                  Driver: <strong>{detailAsset.stageDetails.shipping?.driverName || "—"}</strong> · Plat:{" "}
                                  <strong className="font-mono">{detailAsset.stageDetails.shipping?.vehiclePlate || "—"}</strong>
                                </p>
                              )}
                              {stepNumber === 5 && (
                                <p>
                                  Kurir: <strong>{detailAsset.stageDetails.transit?.courier || "—"}</strong> · Resi: <strong className="font-mono">{detailAsset.stageDetails.transit?.trackingNo || "—"}</strong>
                                  <br />
                                  ETA: <strong>{detailAsset.stageDetails.transit?.eta || "—"}</strong>
                                </p>
                              )}
                              {stepNumber === 6 && (() => {
                                const d: any = detailAsset.stageDetails?.deployment || {};
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
                                  Auditor: <strong>{detailAsset.stageDetails.audit?.auditorName || "—"}</strong>
                                  <br />
                                  Tgl: <strong>{detailAsset.stageDetails.audit?.lastAuditDate || "—"}</strong> · Skor:{" "}
                                  <strong className="text-emerald-600">{detailAsset.stageDetails.audit?.scoring || detailAsset.auditScore || 0}/100</strong>
                                </p>
                              )}
                              {stepNumber === 8 && (
                                <p>
                                  Status: <strong className="text-rose-600">🛠 {detailAsset.maintenanceStatus === "REPAIRING" ? "Perbaikan Berjalan" : detailAsset.maintenanceStatus === "RESOLVED" ? "Selesai Diperbaiki" : "Tiket Menunggu"}</strong>
                                  <br />
                                  Isu: <strong>{detailAsset.stageDetails.maintenance?.issueType || "—"}</strong> · Tiket:{" "}
                                  <strong className="font-mono">{detailAsset.stageDetails.maintenance?.activeTicketId || "—"}</strong>
                                </p>
                              )}
                              {stepNumber === 9 && (
                                <p>
                                  Alasan: <strong>{detailAsset.stageDetails.retrieval?.reason || "—"}</strong>
                                  <br />
                                  Keputusan: <strong className="text-blue-600 bg-blue-50 px-1 rounded">{detailAsset.stageDetails.retrieval?.assessResult || "—"}</strong>
                                </p>
                              )}
                              {stepNumber === 10 && (
                                <p>
                                  Metode: <strong>{detailAsset.stageDetails.disposal?.disposalMethod || "—"}</strong> · Tgl: {detailAsset.stageDetails.disposal?.disposalDate || "—"}
                                  <br />
                                  Sisa Scrap: <strong className="text-emerald-600">{formatRupiah(detailAsset.stageDetails.disposal?.scrapValue || 0)}</strong>
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
                  Fase {faseNo(detailAsset.currentStage)} <ArrowRight className="h-3 w-3" /> Fase {faseNo(transitionTarget)}
                </span>
                <h3 className="text-base font-bold text-slate-950">{gateFor(transitionTarget, detailAsset.currentStage, detailAsset).title}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{detailAsset.name}</p>
              </div>
              <button onClick={closeGate} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submitGate} className="p-5 space-y-4">
              {groupable && (
                <label className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={groupMode} onChange={e => setGroupMode(e.target.checked)} className="mt-0.5 h-4 w-4 rounded accent-blue-600" />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-blue-800 flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Proses untuk seluruh grup pengiriman ({groupSameStage.length} aset)</span>
                    <span className="block text-[10px] text-blue-600/90 leading-snug">Surat Jalan {detailBatchId} — semua aset yang dikirim bersama & masih di fase ini ikut pindah sekaligus. Data di form ini dipakai untuk semua.</span>
                  </span>
                </label>
              )}
              {(() => {
                const cfg = gateFor(transitionTarget!, detailAsset.currentStage, detailAsset);
                // Grouped AUDIT → one shared header (auditor/date/note) + a checklist PER member.
                const groupAudit = transitionTarget === 7 && groupMode && groupSameStage.length >= 2;
                if (groupAudit) {
                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">{cfg.fields.filter(f => f.type !== "auditstatus").map(renderField)}</div>
                      <div className="space-y-2.5">
                        <p className="text-xs font-bold text-slate-700">Checklist Audit per Aset ({groupSameStage.length}) — isi kondisi tiap barang</p>
                        {groupSameStage.map(mm => (
                          <div key={mm.id} className="rounded-xl border border-slate-200 overflow-hidden">
                            <div className="flex items-center gap-2 bg-slate-100 px-3 py-2">
                              <span className="font-mono text-[10px] text-blue-700">{mm.id}</span>
                              <span className="text-[11px] font-bold text-slate-800 truncate">{mm.name}</span>
                              <span className="ml-auto text-[9px] text-slate-400 shrink-0">{mm.quantity} unit</span>
                            </div>
                            <div className="p-3">
                              <AuditChecklist map={groupAuditMaps[mm.id] || defaultAuditMap(mm.quantity)} onChange={mp => setGroupAuditMaps(prev => ({ ...prev, [mm.id]: mp }))} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return <div className="grid grid-cols-2 gap-4">{cfg.fields.map(renderField)}</div>;
              })()}

              {gateError && (
                <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2 text-xs font-semibold">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{gateError}</span>
                </div>
              )}

              <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-lg text-[10.5px] text-slate-500 flex items-start gap-2">
                <FileText className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                <span>Menyimpan akan memindahkan aset ke <strong className="text-slate-700">Fase {faseNo(transitionTarget)} · {cleanLabel(transitionTarget)}</strong>, mencatat log aktivitas, dan memperbarui dashboard secara real-time.</span>
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
                <span className="text-[10px] font-bold text-slate-700 uppercase tracking-widest block flex items-center gap-1">Serah-Terima Internal <ArrowRight className="h-3 w-3" /> Fase {faseNo(6)} · {cleanLabel(6)}</span>
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
                {employees.length === 0 && <p className="text-[10px] text-amber-600">Belum ada karyawan. Tambahkan dulu di menu Organisasi, bagian Karyawan.</p>}
              </div>
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Tanggal Serah-Terima</label>
                <input type="date" value={handoverForm.handoverDate} onChange={e => setHandoverForm({ ...handoverForm, handoverDate: e.target.value })} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Catatan (opsional)</label>
                <textarea value={handoverForm.note} onChange={e => setHandoverForm({ ...handoverForm, note: e.target.value })} rows={2} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 resize-none" placeholder="contoh: Laptop Lenovo, charger, dan tas" />
              </div>
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Tanda Tangan BAST (opsional)</label>
                <SignaturePad value={handoverForm.signature} onChange={v => setHandoverForm({ ...handoverForm, signature: v })} />
              </div>
              {handoverError && <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 flex-shrink-0" /><span>{handoverError}</span></div>}
              <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-lg text-[10.5px] text-slate-500 flex items-start gap-2">
                <FileText className="h-3.5 w-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                <span>Aset akan pindah ke <strong className="text-slate-700">Fase {faseNo(6)} · {cleanLabel(6)}</strong> dengan custodian tercatat (melewati surat jalan dan transit untuk aset internal).</span>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setHandoverOpen(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg transition">Batal</button>
                <button type="submit" disabled={handoverBusy} className="bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white font-bold px-5 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"><UserCheck className="h-4 w-4" />Serah-Terima</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: SHIP TO NEXT LOCATION (venue/relocation leg) */}
      {detailAsset && venueOpen && (() => {
        return (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest block">Kirim ke Lokasi · Tracking</span>
                <h3 className="text-base font-bold text-slate-950">Kirim ke Lokasi Berikutnya</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{detailAsset.name}</p>
              </div>
              <button onClick={() => setVenueOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitVenue} className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Nomor Surat Jalan</label>
                <div className="flex gap-2">
                  <input value={venueForm.suratJalanNo} readOnly className="flex-1 bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg font-mono text-slate-700" />
                  <button type="button" onClick={() => setVenueForm({ ...venueForm, suratJalanNo: genSuratJalan() })} className="px-2.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Lokasi / Venue Tujuan <span className="text-rose-500">*</span></label>
                <select value={venueForm.locationId} onChange={e => setVenueForm({ ...venueForm, locationId: e.target.value })} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-amber-500 cursor-pointer">
                  <option value="">— pilih lokasi/venue —</option>
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
                <div className="space-y-1.5"><label className="font-bold text-slate-700">Rencana Pemasangan</label><input type="date" value={venueForm.setupDate} onChange={e => setVenueForm({ ...venueForm, setupDate: e.target.value })} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-amber-500" /></div>
              </div>
              {/* Tracking kiriman (seperti Fase 5 Pengiriman) — aset dikirim ke venue tujuan */}
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2.5">
                <p className="text-[11px] font-extrabold text-blue-800 flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Tracking Pengiriman ke Lokasi</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><label className="font-bold text-slate-700">Kurir / Vendor</label>
                    <select value={venueForm.courier} onChange={e => setVenueForm({ ...venueForm, courier: e.target.value })} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer">
                      <option value="">— pilih kurir —</option>
                      {COURIERS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5"><label className="font-bold text-slate-700">ETA (estimasi tiba)</label><input value={venueForm.eta} onChange={e => setVenueForm({ ...venueForm, eta: e.target.value })} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500" placeholder="contoh: 2 hari / 25 Jul" /></div>
                </div>
                <div className="space-y-1.5"><label className="font-bold text-slate-700">Link Tracking (tempel dari kurir)</label><input value={venueForm.trackingUrl} onChange={e => setVenueForm({ ...venueForm, trackingUrl: e.target.value })} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500" placeholder="https://… link resi/tracking" /></div>
                <div className="space-y-1.5"><label className="font-bold text-slate-700">Nomor Resi (opsional)</label><input value={venueForm.trackingNo} onChange={e => setVenueForm({ ...venueForm, trackingNo: e.target.value })} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500" placeholder="contoh: JX1234567890" /></div>
              </div>
              <div className="space-y-1.5"><label className="font-bold text-slate-700">Catatan (opsional)</label><textarea value={venueForm.note} onChange={e => setVenueForm({ ...venueForm, note: e.target.value })} rows={2} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-amber-500 resize-none" placeholder="contoh: tenda, sound, dan booth" /></div>
              {venueError && <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 flex-shrink-0" /><span>{venueError}</span></div>}
              <div className="p-2.5 bg-amber-50 border border-amber-200/70 rounded-lg text-[10.5px] text-amber-700 flex items-start gap-2">
                <Truck className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>Lokasi aktif ditutup dan aset dikirim ke lokasi berikutnya beserta Surat Jalan &amp; tracking. Konfirmasi “Kedatangan di Lokasi” saat aset sampai.</span>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setVenueOpen(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg transition">Batal</button>
                <button type="submit" disabled={venueBusy} className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-bold px-5 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"><Truck className="h-4 w-4" />Kirim ke Lokasi</button>
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
                <h3 className="text-base font-bold text-slate-950">Kirim Kembali ke Gudang</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{detailAsset.name}</p>
              </div>
              <button onClick={() => setReturnOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitReturn} className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Nomor Surat Jalan</label>
                <div className="flex gap-2">
                  <input value={returnForm.suratJalanNo} readOnly className="flex-1 bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg font-mono text-slate-700" />
                  <button type="button" onClick={() => setReturnForm({ ...returnForm, suratJalanNo: genSuratJalan() })} className="px-2.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2.5">
                <p className="text-[11px] font-extrabold text-blue-800 flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Tracking Pengiriman ke Gudang</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><label className="font-bold text-slate-700">Kurir / Vendor</label>
                    <select value={returnForm.courier} onChange={e => setReturnForm({ ...returnForm, courier: e.target.value })} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer">
                      <option value="">— pilih kurir —</option>
                      {COURIERS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5"><label className="font-bold text-slate-700">ETA (estimasi tiba)</label><input value={returnForm.eta} onChange={e => setReturnForm({ ...returnForm, eta: e.target.value })} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500" placeholder="contoh: 2 hari / 25 Jul" /></div>
                </div>
                <div className="space-y-1.5"><label className="font-bold text-slate-700">Link Tracking (tempel dari kurir)</label><input value={returnForm.trackingUrl} onChange={e => setReturnForm({ ...returnForm, trackingUrl: e.target.value })} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500" placeholder="https://… link resi/tracking" /></div>
                <div className="space-y-1.5"><label className="font-bold text-slate-700">Nomor Resi (opsional)</label><input value={returnForm.trackingNo} onChange={e => setReturnForm({ ...returnForm, trackingNo: e.target.value })} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500" placeholder="contoh: JX1234567890" /></div>
              </div>
              {returnError && <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 flex-shrink-0" /><span>{returnError}</span></div>}
              <div className="p-2.5 bg-cyan-50 border border-cyan-200/70 rounded-lg text-[10.5px] text-cyan-700 flex items-start gap-2">
                <Home className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>Venue aktif ditutup dan aset dikirim kembali ke gudang. Konfirmasi “Kedatangan di Gudang” saat aset sampai — aset kembali ke Fase 3.</span>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setReturnOpen(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg transition">Batal</button>
                <button type="submit" disabled={returnBusy} className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 text-white font-bold px-5 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"><Truck className="h-4 w-4" />Kirim Kembali</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Kirim Bersama — floating action bar */}
      {batchMode && batchSel.length > 0 && !batchOpen && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white rounded-full shadow-2xl pl-5 pr-2 py-2 flex items-center gap-4">
          <span className="text-xs font-bold">{batchSel.length} aset dipilih</span>
          <button onClick={openBatch} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-full transition"><Truck className="h-3.5 w-3.5" /> Kirim Bersama</button>
        </div>
      )}

      {/* MODAL: PENGIRIMAN GABUNGAN — satu Surat Jalan untuk banyak aset */}
      {batchOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-100">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest block">Pengiriman · Kirim Bersama</span>
                <h3 className="text-base font-bold text-slate-950">Satu Surat Jalan untuk {batchSel.length} Aset</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Satu kendaraan/driver menuju satu tujuan.</p>
              </div>
              <button onClick={() => setBatchOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitBatch} className="p-5 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Aset &amp; Qty Kirim</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {batchSel.map(id => { const a = assets.find(x => x.id === id); const max = a?.quantity || 1; return (
                    <div key={id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-bold text-slate-800 truncate">{a?.name || id}</span>
                        <span className="block text-[9px] text-slate-400 font-mono">{id} · stok {max}</span>
                      </span>
                      <input type="number" min={1} max={max} value={batchQty[id] ?? ""} onChange={e => setBatchQty(q => ({ ...q, [id]: e.target.value }))} className="w-16 bg-white border border-slate-200 px-2 py-1 rounded-md text-xs text-right outline-none focus:ring-1 focus:ring-blue-500" />
                      <button type="button" onClick={() => { toggleBatchSel(id); setBatchQty(q => { const n = { ...q }; delete n[id]; return n; }); }} className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ); })}
                </div>
              </div>
              <div className="space-y-1.5"><label className="font-bold text-slate-700">Nomor Surat Jalan</label>
                <div className="flex gap-2">
                  <input value={batchForm.suratJalanNo} readOnly className="flex-1 bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg font-mono text-slate-700 text-xs" />
                  <button type="button" onClick={() => setBatchForm(f => ({ ...f, suratJalanNo: genSuratJalan() }))} className="px-2.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><label className="font-bold text-slate-700">Nama Driver <span className="text-rose-500">*</span></label><input value={batchForm.driverName} onChange={e => setBatchForm(f => ({ ...f, driverName: e.target.value }))} className={BATCH_INP} placeholder="contoh: Budi" /></div>
                <div className="space-y-1.5"><label className="font-bold text-slate-700">Plat Kendaraan</label><input value={batchForm.vehiclePlate} onChange={e => setBatchForm(f => ({ ...f, vehiclePlate: e.target.value }))} className={BATCH_INP} placeholder="B 1234 XYZ" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><label className="font-bold text-slate-700">Vendor Logistik</label>
                  <select value={batchForm.vendorShipping} onChange={e => setBatchForm(f => ({ ...f, vendorShipping: e.target.value }))} className={`${BATCH_INP} cursor-pointer`}>
                    <option value="">— pilih vendor —</option>
                    {(batchForm.vendorShipping && !COURIERS.includes(batchForm.vendorShipping) ? [batchForm.vendorShipping, ...COURIERS] : COURIERS).map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5"><label className="font-bold text-slate-700">Waktu Berangkat</label><input type="time" value={batchForm.departureTime} onChange={e => setBatchForm(f => ({ ...f, departureTime: e.target.value }))} className={BATCH_INP} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><label className="font-bold text-slate-700">Tujuan (Area) <span className="text-rose-500">*</span></label>
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
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2.5">
                <p className="text-[11px] font-extrabold text-blue-800 flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Tracking (opsional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><label className="font-bold text-slate-700">Kurir / Vendor</label>
                    <select value={batchForm.courier} onChange={e => setBatchForm(f => ({ ...f, courier: e.target.value }))} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer">
                      <option value="">— pilih kurir —</option>{COURIERS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5"><label className="font-bold text-slate-700">ETA</label><input value={batchForm.eta} onChange={e => setBatchForm(f => ({ ...f, eta: e.target.value }))} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500" placeholder="contoh: 2 hari" /></div>
                </div>
                <div className="space-y-1.5"><label className="font-bold text-slate-700">Link Tracking</label><input value={batchForm.trackingUrl} onChange={e => setBatchForm(f => ({ ...f, trackingUrl: e.target.value }))} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-1 focus:ring-blue-500" placeholder="https://…" /></div>
              </div>
              {batchError && <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{batchError}</span></div>}
              <div className="pt-2 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={() => setBatchOpen(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg">Batal</button>
                <button type="submit" disabled={batchBusy || batchSel.length === 0} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-5 py-2 rounded-lg flex items-center gap-1.5">{batchBusy && <Loader2 className="h-4 w-4 animate-spin" />}Terbitkan Surat Jalan</button>
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
                <div className="text-right"><h2 className="text-base font-extrabold tracking-widest">SURAT JALAN</h2><p className="text-[11px] font-mono">{batchPrint.suratJalanNo}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px] mb-4">
                <div>Tujuan: <strong>{batchPrint.area}</strong>{batchPrint.picPenerima ? <> · PIC: <strong>{batchPrint.picPenerima}</strong></> : null}</div>
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
                    {tokoNoArea && <p className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" /> Toko ini belum punya Area — tetapkan area toko dulu di Proyek &amp; Lokasi.</p>}
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
