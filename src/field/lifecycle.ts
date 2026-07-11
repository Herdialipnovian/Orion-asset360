/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Client mirror of the server lifecycle rules (server/lifecycle.ts + auth.ts).
 * Kept small and in-sync so the field app can show ONLY the actions a given
 * role may legally perform on a given stage. The server remains authoritative.
 */
import type { Role } from "./fieldApi";
import type { Asset } from "../types";

// A merchandiser's OWN not-yet-finished install assignment on a Fase-6 asset (or null).
// Pending + partial both qualify (doneQty < qty); hidden once done or off Fase 6.
export function myInstallTask(
  asset: Asset,
  userId: number
): { merchandiserId: number; merchandiser: string; qty: number; doneQty: number; remaining: number } | null {
  if (asset?.currentStage !== 6) return null;
  const dep = (asset?.stageDetails as any)?.deployment;
  if (dep?.mode === "Distribusi") return null; // distribusi uses per-toko placements, not install assignments
  const asg = dep?.assignments;
  if (!Array.isArray(asg)) return null;
  const a = asg.find((x: any) => Number(x.merchandiserId) === Number(userId));
  if (!a) return null;
  const done = Number(a.doneQty ?? (a.status === "done" ? a.qty : 0)) || 0;
  if (done >= Number(a.qty)) return null; // finished
  return { merchandiserId: a.merchandiserId, merchandiser: a.merchandiser, qty: Number(a.qty), doneQty: done, remaining: Number(a.qty) - done };
}

// A merchandiser's OWN unfinished Distribusi placements on a Fase-6 asset (one row per toko).
// Reads deployment.placements (NOT .assignments) and only when mode === "Distribusi".
export function myPlacementTasks(
  asset: Asset,
  userId: number
): { locationId: number; toko: string; qty: number; doneQty: number; remaining: number }[] {
  if (asset?.currentStage !== 6) return [];
  const dep = (asset?.stageDetails as any)?.deployment;
  if (dep?.mode !== "Distribusi" || !Array.isArray(dep?.placements)) return [];
  return dep.placements
    .filter((p: any) => p?.merchandiserId != null && Number(p.merchandiserId) === Number(userId))
    .map((p: any) => {
      const done = Number(p.doneQty ?? (p.status === "done" ? p.qty : 0)) || 0;
      return { locationId: Number(p.locationId), toko: p.toko, qty: Number(p.qty), doneQty: done, remaining: Number(p.qty) - done };
    })
    .filter((p: { remaining: number }) => p.remaining > 0);
}

// Can this user assign/manage install tasks on this asset? (Admin any, PIC own client, Fase 6.)
export function canAssignInstall(asset: Asset, user: { role: Role; client?: string | null }): boolean {
  if (asset?.currentStage !== 6) return false;
  if (user.role === "Admin") return true;
  if (user.role === "PIC") return (user.client || null) === (asset.client || null);
  return false;
}

// The active roadshow leg (or null) + total legs — for the mobile venue action's context.
export function currentLeg(asset: Asset): { venue: string; area?: string; seq: number; count: number } | null {
  const legs = (asset?.stageDetails as any)?.deployment?.legs;
  if (!Array.isArray(legs) || !legs.length) return null;
  const active = legs.find((l: any) => l.status === "active") || [...legs].sort((a: any, b: any) => (b.seq || 0) - (a.seq || 0))[0];
  return active ? { venue: active.venue, area: active.area, seq: active.seq, count: legs.length } : null;
}

// Can this user set up / relocate a venue leg from the field? Event roadshow in progress
// (deployment.mode === "Event"), Fase 6, PIC (own client) or Admin. First leg starts in the CMS.
export function canDeployVenue(asset: Asset, user: { role: Role; client?: string | null }): boolean {
  if (asset?.currentStage !== 6) return false;
  if ((asset?.stageDetails as any)?.deployment?.mode !== "Event") return false;
  if (user.role === "Admin") return true;
  if (user.role === "PIC") return (user.client || null) === (asset.client || null);
  return false;
}

export const STAGE_LABELS: { [k: number]: string } = {
  1: "Request",
  2: "Produksi",
  3: "Gudang",
  4: "Surat Jalan",
  5: "Transit",
  6: "Terpasang",
  7: "Audit",
  8: "Maintenance",
  9: "Penarikan",
  10: "Disposal"
};

// Full stage name for detail headers.
export const STAGE_FULL: { [k: number]: string } = {
  1: "Fase 1 — Request / Pengadaan",
  2: "Fase 2 — Produksi / Perakitan",
  3: "Fase 3 — Inventory & Gudang",
  4: "Fase 4 — Pengiriman / Surat Jalan",
  5: "Fase 5 — Transit",
  6: "Fase 6 — Terpasang / Deployed",
  7: "Fase 7 — Audit & Kepatuhan",
  8: "Fase 8 — Maintenance",
  9: "Fase 9 — Penarikan / Relokasi",
  10: "Fase 10 — Disposal"
};

// Verb shown on the action button that moves an asset INTO the target stage.
export const TRANSITION_VERB: { [k: number]: string } = {
  2: "Kirim ke Produksi",
  3: "Terima di Gudang",
  4: "Terbitkan Surat Jalan",
  5: "Kirim ke Transit",
  6: "Konfirmasi Pemasangan",
  7: "Lakukan Audit",
  8: "Buka Tiket Maintenance",
  9: "Tarik / Relokasi Aset",
  10: "Disposal / Retire Aset"
};

// Legal transitions, keyed by CURRENT stage (mirror of server TRANSITIONS).
export const TRANSITIONS: { [k: number]: number[] } = {
  3: [4], 4: [5], 5: [6], 6: [7, 8, 9], 7: [6, 8, 9], 8: [6, 9], 9: [3, 6, 10], 10: []
};

// Which role may move an asset INTO a stage (mirror of server STAGE_ROLE). [] = Admin only.
export const STAGE_ROLE: { [k: number]: Role[] } = {
  2: ["Logistik"],
  3: ["Logistik"],
  4: ["Logistik"],
  5: ["Logistik"],
  6: ["Logistik", "Merchandiser", "PIC"],
  7: ["PIC"],
  8: ["Merchandiser"],
  9: ["Logistik", "PIC"],
  10: []
};

export interface EvidenceSlot {
  slot: string;
  label: string;
  optional?: boolean;
}

// Photo evidence per target stage. WAJIB ones (optional!==true) gate the transition
// server-side (field channel). Optional ones are captured when relevant.
export const EVIDENCE_SLOTS: { [k: number]: EvidenceSlot[] } = {
  2: [
    { slot: "production_result", label: "Foto unit hasil produksi / rakit" },
    { slot: "qc", label: "Foto lembar / label hasil QC" },
    { slot: "qr_serial", label: "Foto QR / serial menempel di unit" },
    { slot: "packaging", label: "Foto kondisi / kemasan siap kirim", optional: true }
  ],
  3: [
    { slot: "placement", label: "Foto aset terpasang di rak" },
    { slot: "qr_label", label: "Foto close-up label QR / barcode" },
    { slot: "condition_in", label: "Foto kondisi aset saat terima" },
    { slot: "handover_doc", label: "Foto dokumen serah-terima / segel", optional: true }
  ],
  4: [
    { slot: "surat_jalan", label: "Foto Surat Jalan (dokumen fisik)" },
    { slot: "load_vehicle", label: "Foto muatan + kendaraan (plat jelas)" },
    { slot: "condition_out", label: "Foto kondisi aset saat serah-terima", optional: true }
  ],
  6: [
    { slot: "before", label: "Foto BEFORE pemasangan" },
    { slot: "after", label: "Foto AFTER (terpasang)" },
    { slot: "signature", label: "TTD BAST penerima" },
    { slot: "label", label: "Foto label / QR aset terpasang", optional: true }
  ],
  7: [
    { slot: "overview", label: "Foto kondisi aset (overview)" },
    { slot: "finding", label: "Foto per temuan audit", optional: true },
    { slot: "nameplate", label: "Foto nameplate / QR", optional: true }
  ],
  8: [
    { slot: "damage_before", label: "Foto kerusakan (before)" },
    { slot: "repair_after", label: "Foto hasil perbaikan (after)", optional: true },
    { slot: "part", label: "Foto sparepart diganti", optional: true }
  ],
  9: [
    { slot: "condition_retrieval", label: "Foto kondisi aset saat ditarik" },
    { slot: "qr_serial", label: "Foto tag QR + serial (closeup)", optional: true },
    { slot: "damage_detail", label: "Foto kerusakan detail", optional: true }
  ],
  10: [
    { slot: "bap", label: "Foto Berita Acara Pemusnahan (BAP)" },
    { slot: "condition_before", label: "Foto kondisi sebelum disposal" },
    { slot: "disposal_proof", label: "Foto bukti pemusnahan / serah-terima" }
  ]
};

// Stages the MOBILE app handles (Udin: all except 1 Request & 5 Transit).
export const FIELD_STAGES = [2, 3, 4, 6, 7, 8, 9, 10];

export function canRoleDoStage(role: Role, target: number): boolean {
  if (role === "Admin") return true;
  return (STAGE_ROLE[target] || []).includes(role);
}

export interface FieldAction {
  target: number;
  verb: string;
  requiredSlots: EvidenceSlot[];
  allSlots: EvidenceSlot[];
}

// The legal next actions for this asset that THIS role may perform in the field.
// Excludes Transit (5), which is not a field action.
export function eligibleActions(currentStage: number, role: Role): FieldAction[] {
  const nexts = TRANSITIONS[currentStage] || [];
  return nexts
    .filter(t => t !== 5 && FIELD_STAGES.includes(t) && canRoleDoStage(role, t))
    .map(t => {
      const all = EVIDENCE_SLOTS[t] || [];
      return { target: t, verb: TRANSITION_VERB[t] || `Ke Fase ${t}`, requiredSlots: all.filter(s => !s.optional), allSlots: all };
    });
}

// Next actions that are legal but blocked for this role (need a handoff to another role).
export function handoffActions(currentStage: number, role: Role): { target: number; verb: string; roles: Role[] }[] {
  if (role === "Admin") return [];
  const nexts = TRANSITIONS[currentStage] || [];
  return nexts
    .filter(t => t !== 5 && FIELD_STAGES.includes(t) && !canRoleDoStage(role, t))
    .map(t => ({ target: t, verb: TRANSITION_VERB[t] || `Ke Fase ${t}`, roles: STAGE_ROLE[t] || [] }));
}

export const STAGE_TONE: { [k: number]: string } = {
  1: "slate", 2: "violet", 3: "sky", 4: "amber", 5: "slate",
  6: "emerald", 7: "blue", 8: "orange", 9: "rose", 10: "zinc"
};
