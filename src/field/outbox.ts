/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Offline-first mutation outbox. Every field commit (photos + stage transition)
 * is queued in IndexedDB (Dexie) and drained when online. Idempotency keys make
 * retries safe (no double-apply); the ORIGINAL capture timestamp is preserved in
 * each evidence item, never the sync time.
 */
import Dexie, { type Table } from "dexie";
import type { CaptureMeta } from "./camera";
import { fieldApi } from "./fieldApi";

export interface EvidenceItem {
  slot: string;
  label: string;
  blob: Blob;
  meta: CaptureMeta;
}

export type CommitStatus = "pending" | "syncing" | "conflict" | "error";

export interface CommitRecord {
  id: string;
  assetId: string;
  assetName: string;
  currentStage: number;
  target: number;
  verb: string;
  evidence: EvidenceItem[];
  details: any;
  operator: string;
  baseUpdatedAt: string;
  status: CommitStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
  // Discriminator: absent/"transition" = stage move; "install" = a Fase-6 install
  // progress report; "placement" = a Fase-3 distribusi drop at an assigned toko.
  kind?: "transition" | "install" | "placement";
  doneQty?: number; // install/placement: units reported this commit
  signature?: string; // install/placement: optional BAST TTD (-> signatureBase64)
  locationId?: number; // placement: the assigned toko/location id
  gpsLat?: number; // placement: drop coordinates (best-effort)
  gpsLng?: number; // placement: drop coordinates
  note?: string; // placement: optional free-text note
}

class OutboxDB extends Dexie {
  commits!: Table<CommitRecord, string>;
  constructor() {
    super("origin-field-outbox");
    this.version(1).stores({ commits: "id, assetId, status, createdAt" });
  }
}
export const odb = new OutboxDB();

// --- tiny pub/sub so React can re-read on any outbox change ---
const listeners = new Set<() => void>();
export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const notify = () => listeners.forEach(l => l());

let syncing = false;
export const isSyncing = () => syncing;

export async function enqueueCommit(rec: CommitRecord): Promise<void> {
  await odb.commits.add(rec);
  notify();
}
export async function listCommits(): Promise<CommitRecord[]> {
  return odb.commits.orderBy("createdAt").toArray();
}
export async function discardCommit(id: string): Promise<void> {
  await odb.commits.delete(id);
  notify();
}

// Drain the queue. `force` also retries items parked in conflict/error.
export async function syncAll({ force = false }: { force?: boolean } = {}): Promise<{ synced: number; conflicts: number; errors: number }> {
  const out = { synced: 0, conflicts: 0, errors: 0 };
  if (syncing) return out;
  if (!navigator.onLine && !force) return out;
  syncing = true;
  notify();
  try {
    const items = await odb.commits.orderBy("createdAt").toArray();
    for (const c of items) {
      if ((c.status === "conflict" || c.status === "error") && !force) continue;
      await odb.commits.update(c.id, { status: "syncing" });
      notify();
      try {
        // 1) upload each evidence photo (idempotent per slot + original capture time)
        for (const e of c.evidence) {
          const file = new File([e.blob], `${e.slot}.jpg`, { type: "image/jpeg" });
          await fieldApi.uploadEvidence(c.assetId, e.slot, c.target, [file], {
            gpsLat: e.meta.gpsLat ?? undefined,
            gpsLng: e.meta.gpsLng ?? undefined,
            capturedAt: e.meta.capturedAt,
            idempotencyKey: `${c.assetId}:ev:${c.target}:${e.slot}:${e.meta.capturedAt}`
          });
        }
        // 2) commit: install progress report OR stage transition (idempotent per commit id)
        if (c.kind === "install") {
          await fieldApi.completeInstall(c.assetId, { doneQty: c.doneQty, signatureBase64: c.signature }, `${c.id}:ic`);
        } else if (c.kind === "placement") {
          await fieldApi.placeAtToko(
            c.assetId,
            { locationId: c.locationId!, doneQty: c.doneQty, gpsLat: c.gpsLat, gpsLng: c.gpsLng, signatureBase64: c.signature, note: c.note },
            `${c.id}:pl`
          );
        } else {
          await fieldApi.transition(
            c.assetId,
            c.target,
            c.details,
            { logAction: c.verb, operator: c.operator, baseUpdatedAt: c.baseUpdatedAt },
            `${c.id}:tr`
          );
        }
        await odb.commits.delete(c.id);
        out.synced++;
        notify();
      } catch (err: any) {
        const status = err?.status;
        const code = err?.code;
        const patch = { attempts: (c.attempts || 0) + 1, lastError: err?.message || "gagal" };
        if (status === 409 || code === "stale") {
          await odb.commits.update(c.id, { ...patch, status: "conflict" });
          out.conflicts++;
        } else if (typeof status === "number" && status >= 400 && status < 500) {
          // 4xx = won't fix itself (bad transition / evidence rejected) -> needs attention
          await odb.commits.update(c.id, { ...patch, status: "error" });
          out.errors++;
        } else {
          // network / offline / 5xx -> keep pending, retry next time
          await odb.commits.update(c.id, { ...patch, status: "pending" });
        }
        notify();
      }
    }
  } finally {
    syncing = false;
    notify();
  }
  return out;
}
