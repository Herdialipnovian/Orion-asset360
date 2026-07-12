/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Single source of truth for the Fase-7 (Audit & Kepatuhan) per-item checklist, shared by the CMS
 * (LifecycleManager) and the mobile field app so both score an audit IDENTICALLY — the server only
 * stores what the client computes. Each item has its OWN pair of statuses (good = the first/"ok"
 * state, bad = the second/"needs attention" state). The "kelengkapan" item also captures the actual
 * quantity found on the ground. The audit is recorded PER ASSET (each asset's gate → its own audit).
 */
export type AuditItem = { key: string; label: string; good: string; bad: string; qty?: boolean };

export const AUDIT_ITEMS: AuditItem[] = [
  { key: "kondisi", label: "Kondisi Fisik baik", good: "Baik", bad: "Perlu perbaikan" },
  { key: "kelengkapan", label: "Kelengkapan Qty", good: "Qty Sesuai", bad: "Qty Kurang", qty: true },
  { key: "bersih", label: "Bersih & rapi", good: "Bersih", bad: "Kotor" },
  { key: "fungsi", label: "Berfungsi normal", good: "Normal", bad: "Tidak berfungsi" },
  { key: "penempatan", label: "Penempatan sesuai", good: "Sesuai", bad: "Tidak Sesuai" },
  { key: "aman", label: "Aman digunakan", good: "Aman", bad: "Tidak aman" },
  { key: "aksesoris", label: "Aksesoris lengkap", good: "Lengkap", bad: "Tidak lengkap" },
  { key: "foto", label: "Foto dokumentasi lengkap", good: "Lengkap", bad: "Tidak lengkap" },
];

// Where the actual counted qty lives inside the checklist map.
export const QTY_ITEM_KEY = "kelengkapanQty";

// Default checklist map: every item in its "good" state, qty seeded from the asset's own quantity.
export function defaultAuditMap(quantity: number, prev?: Record<string, any> | null): Record<string, any> {
  const p = prev && typeof prev === "object" ? prev : {};
  const map: Record<string, any> = { [QTY_ITEM_KEY]: p[QTY_ITEM_KEY] ?? (quantity || 1) };
  for (const it of AUDIT_ITEMS) map[it.key] = p[it.key] !== false;
  return map;
}

// Derive the stored audit fields from a checklist map. first/"good" status = pass.
export function computeAudit(map: Record<string, any> | null | undefined): {
  checklist: Record<string, any>;
  kelengkapanQty: number;
  scoring: number;
  findings: string[];
  complianceStatus: "PATUH" | "PERLU PERBAIKAN" | "TIDAK PATUH";
} {
  const m = map && typeof map === "object" ? map : {};
  const qty = Math.max(0, Number(m[QTY_ITEM_KEY]) || 0);
  const checklist: Record<string, any> = { [QTY_ITEM_KEY]: qty };
  let passed = 0;
  for (const it of AUDIT_ITEMS) {
    const good = m[it.key] !== false;
    checklist[it.key] = good;
    if (good) passed++;
  }
  const scoring = AUDIT_ITEMS.length ? Math.round((passed / AUDIT_ITEMS.length) * 100) : 0;
  const findings = AUDIT_ITEMS.filter(it => m[it.key] === false).map(it => `${it.label}: ${it.bad}${it.qty ? ` (Qty ${qty})` : ""}`);
  const complianceStatus = scoring >= 90 ? "PATUH" : scoring >= 70 ? "PERLU PERBAIKAN" : "TIDAK PATUH";
  return { checklist, kelengkapanQty: qty, scoring, findings, complianceStatus };
}
