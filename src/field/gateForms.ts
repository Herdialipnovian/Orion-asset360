/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Schema-driven gate forms per target stage (mirror of the CMS gate fields +
 * stageDetails shape). Used to render the field commit form and to build the
 * `updatedDetails` payload for PATCH /assets/:id/stage.
 */
import type { Asset } from "../types";
import type { AuthUser } from "./fieldApi";
import { computeAudit, defaultAuditMap } from "../auditChecklist";

export type FieldType = "text" | "number" | "date" | "select" | "toggle" | "chips" | "textarea" | "auditstatus";
export interface GateField {
  k: string;
  label: string;
  type: FieldType;
  req?: boolean;
  options?: string[];
  placeholder?: string;
  min?: number;
  max?: number;
  prefillUser?: boolean; // default to the logged-in operator's name
}
export interface GateSpec {
  stageKey: keyof Asset["stageDetails"];
  fields: GateField[];
}

export const GATE: { [k: number]: GateSpec } = {
  2: {
    stageKey: "production",
    fields: [
      { k: "prodLead", label: "Kepala Produksi", type: "text", req: true },
      { k: "qcInspector", label: "Inspektur QC", type: "text", req: true, prefillUser: true },
      { k: "qcScore", label: "Skor QC (0-100)", type: "number", req: true, min: 0, max: 100 },
      { k: "productionReportCode", label: "Kode Laporan Produksi", type: "text" },
      { k: "readyDate", label: "Tanggal Siap", type: "date", req: true }
    ]
  },
  3: {
    stageKey: "inventory",
    fields: [
      { k: "warehouseName", label: "Nama Gudang", type: "text", req: true },
      { k: "shelfLoc", label: "Lokasi Rak", type: "text", req: true },
      { k: "stockCode", label: "Kode Stok", type: "text" },
      { k: "rackNumber", label: "Nomor Rak", type: "text" },
      { k: "receivedDate", label: "Tanggal Terima", type: "date", req: true }
    ]
  },
  4: {
    stageKey: "shipping",
    fields: [
      { k: "suratJalanNo", label: "No. Surat Jalan", type: "text", req: true },
      { k: "driverName", label: "Nama Sopir", type: "text", req: true },
      { k: "vehiclePlate", label: "Plat Kendaraan", type: "text", req: true },
      { k: "vendorShipping", label: "Vendor Pengiriman", type: "text" },
      { k: "departureTime", label: "Waktu Berangkat", type: "date", req: true }
    ]
  },
  6: {
    stageKey: "deployment",
    fields: [
      { k: "installTeam", label: "Tim Pemasangan", type: "text", req: true, prefillUser: true },
      { k: "installationDate", label: "Tanggal Pemasangan", type: "date", req: true },
      { k: "planogramMatched", label: "Sesuai Planogram", type: "toggle" },
      { k: "verifiedItems", label: "Item Terverifikasi (pisahkan dengan koma)", type: "chips", placeholder: "Kabel ground, Backup UPS, Braket" }
    ]
  },
  7: {
    stageKey: "audit",
    fields: [
      { k: "auditorName", label: "Nama Auditor", type: "text", req: true, prefillUser: true },
      { k: "lastAuditDate", label: "Tanggal Audit", type: "date", req: true },
      { k: "checklist", label: "Checklist Audit per Aset", type: "auditstatus" },
      { k: "recommendation", label: "Rekomendasi", type: "textarea" }
    ]
  },
  8: {
    stageKey: "maintenance",
    fields: [
      { k: "issueType", label: "Jenis Kerusakan", type: "text", req: true },
      { k: "technician", label: "Teknisi", type: "text", req: true, prefillUser: true },
      { k: "repairCost", label: "Estimasi Biaya (Rp)", type: "number", min: 0 }
    ]
  },
  9: {
    stageKey: "retrieval",
    fields: [
      { k: "reason", label: "Alasan Penarikan", type: "textarea", req: true },
      { k: "assessResult", label: "Hasil Penilaian", type: "select", req: true, options: ["REDEPLOY", "DIPINDAHKAN", "DISCARD"] },
      { k: "checkedBy", label: "Diperiksa Oleh", type: "text", req: true, prefillUser: true },
      { k: "conditionRating", label: "Rating Kondisi (1-5)", type: "select", req: true, options: ["1", "2", "3", "4", "5"] },
      { k: "requestDate", label: "Tanggal Penarikan", type: "date" }
    ]
  },
  10: {
    stageKey: "disposal",
    fields: [
      { k: "disposalMethod", label: "Metode Disposal", type: "select", req: true, options: ["SCRAP", "LELANG", "DONASI", "REFURBISH"] },
      { k: "disposalDate", label: "Tanggal Disposal", type: "date", req: true },
      { k: "approvedBy", label: "Disetujui Oleh", type: "text", req: true, prefillUser: true },
      { k: "scrapValue", label: "Nilai Sisa (Rp)", type: "number", min: 0 },
      { k: "replacedByAssetId", label: "Aset Pengganti (opsional)", type: "text" }
    ]
  }
};

// POD (Proof of Delivery) gate for the Standard courier 5→6 receipt — the PIC RECEIVES the goods
// (distinct from installing them). Mirrors the CMS POD_GATE shape (stored in the transit section);
// the receiver's signature is captured as the "signature" evidence photo. The install/assign of
// Merchandisers is a SEPARATE in-place Fase-6 task afterwards.
const POD_GATE_SPEC: GateSpec = {
  stageKey: "transit",
  fields: [
    { k: "podRecipient", label: "Diterima Oleh (PIC)", type: "text", req: true, prefillUser: true },
    { k: "podTime", label: "Tanggal Terima", type: "date", req: true },
    { k: "conditionOnArrival", label: "Kondisi Barang saat Tiba", type: "select", req: true, options: ["Sempurna", "Bagus", "Ada Lecet", "Rusak Sebagian"] },
    { k: "podNote", label: "Catatan Penerimaan", type: "textarea" },
  ],
};

// Source-aware gate: entering Fase 6 FROM Transit (5) is a POD receipt; any other entry (install /
// redeploy) uses the deployment gate.
export function resolveGate(target: number, fromStage: number): GateSpec | undefined {
  if (target === 6 && fromStage === 5) return POD_GATE_SPEC;
  return GATE[target];
}

const today = () => new Date().toISOString().slice(0, 10);

export function initForm(target: number, asset: Asset, user: AuthUser): Record<string, any> {
  const spec = resolveGate(target, asset.currentStage);
  if (!spec) return {};
  const existing: any = (asset.stageDetails as any)?.[spec.stageKey] || {};
  const form: Record<string, any> = {};
  for (const f of spec.fields) {
    let v = existing[f.k];
    if (f.type === "chips") v = Array.isArray(v) ? v.join(", ") : v || "";
    else if (f.type === "toggle") v = !!v;
    else if (f.type === "auditstatus") { form[f.k] = defaultAuditMap(asset.quantity, v && typeof v === "object" ? v : null); continue; }
    else if (v == null) v = "";
    if (v === "" && f.type === "date") v = today();
    if ((v === "" || v == null) && f.prefillUser) v = user.name;
    form[f.k] = v;
  }
  return form;
}

export function missingFields(target: number, form: Record<string, any>, fromStage = 0): string[] {
  const spec = resolveGate(target, fromStage);
  if (!spec) return [];
  return spec.fields
    .filter(f => f.req)
    .filter(f => {
      const v = form[f.k];
      if (f.type === "toggle") return false;
      return v == null || String(v).trim() === "";
    })
    .map(f => f.label);
}

// Build the updatedDetails payload: merge form values into the right stageDetails slice.
export function buildDetails(target: number, asset: Asset, form: Record<string, any>): any {
  const spec = resolveGate(target, asset.currentStage);
  if (!spec) return JSON.parse(JSON.stringify(asset.stageDetails || {}));
  const d: any = JSON.parse(JSON.stringify(asset.stageDetails || {}));
  const slice: any = { ...(d[spec.stageKey] || {}) };
  for (const f of spec.fields) {
    let v = form[f.k];
    if (f.type === "number") v = v === "" || v == null ? 0 : Number(v);
    else if (f.type === "toggle") v = !!v;
    else if (f.type === "chips") v = String(v || "").split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    else if (f.type === "auditstatus") {
      // Auto-derive score/status/findings from the per-item map (same logic as the CMS).
      const res = computeAudit(v && typeof v === "object" ? v : {});
      slice[f.k] = res.checklist;
      slice.scoring = res.scoring;
      slice.findings = res.findings;
      slice.complianceStatus = res.complianceStatus;
      slice.kelengkapanQty = res.kelengkapanQty;
      continue;
    }
    slice[f.k] = v;
  }
  // stage-specific derived fields mirroring the CMS
  if (target === 8 && !slice.activeTicketId) slice.activeTicketId = `MT-${asset.id}-${Date.now().toString(36).toUpperCase()}`;
  if (target === 8) slice.reportedAt = new Date().toISOString();
  d[spec.stageKey] = slice;
  return d;
}
