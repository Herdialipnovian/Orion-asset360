/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Single source of truth for pemasangan (install) progress math. Shared by the
 * server, the CMS, and the mobile PWA so installedQty/fullyInstalled are computed
 * identically everywhere. Handles legacy rows that predate `doneQty`.
 */

export interface InstallAssignment {
  merchandiserId: number;
  merchandiser: string;
  qty: number;
  doneQty?: number;
  status?: "pending" | "partial" | "done";
  completedAt?: string;
  lastReportAt?: string;
  signature?: string;
  note?: string;
  reports?: { doneQty: number; at: string; signature?: string; note?: string; by: string; key?: string }[];
}

// Units installed for one assignment. Legacy rows (no doneQty) fall back to their
// qty when they were marked "done", else 0.
export function doneOf(a: InstallAssignment): number {
  if (a.doneQty != null) return Number(a.doneQty) || 0;
  return a.status === "done" ? Number(a.qty) || 0 : 0;
}

// Total installed across all assignments = sum of doneQty (legacy-aware).
export function installedOf(assignments?: InstallAssignment[] | null): number {
  if (!Array.isArray(assignments)) return 0;
  return assignments.reduce((s, a) => s + doneOf(a), 0);
}

// Total assigned across all assignments (informational: assigned vs asset qty).
export function assignedOf(assignments?: InstallAssignment[] | null): number {
  if (!Array.isArray(assignments)) return 0;
  return assignments.reduce((s, a) => s + (Number(a.qty) || 0), 0);
}

// Derive an assignment's status from its progress.
export function statusOf(qty: number, doneQty: number): "pending" | "partial" | "done" {
  if (doneQty >= qty) return "done";
  if (doneQty > 0) return "partial";
  return "pending";
}

// Recompute the deployment-level install rollup after any mutation.
export function recomputeInstall(
  assignments: InstallAssignment[] | undefined,
  quantity: number
): { installedQty: number; fullyInstalled: boolean } {
  const installedQty = installedOf(assignments);
  return { installedQty, fullyInstalled: installedQty >= quantity };
}
