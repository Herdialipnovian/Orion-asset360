/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Postgres data layer for ORIGIN Asset360. Maps DB rows <-> the shared
 * frontend types (src/types.ts) so the API returns exactly what the app expects.
 */
import { Pool, type PoolClient } from "pg";
import dotenv from "dotenv";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Asset, ActivityLog } from "../src/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const q = (text: string, params?: any[]) => pool.query(text, params);

// Run a set of queries in a single transaction (used for cascade renames).
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

const iso = (v: any) => (v instanceof Date ? v.toISOString() : v);

export function rowToAsset(r: any): Asset {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    client: r.client,
    projectCode: r.project_code,
    quantity: r.quantity,
    currentStage: r.current_stage,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    currentLocation: r.current_location,
    specs: r.specs || {},
    qrcode: r.qrcode,
    financials: r.financials || { purchaseCost: 0, maintenanceCost: 0, disposalValue: 0 },
    auditScore: r.audit_score ?? undefined,
    maintenanceStatus: r.maintenance_status ?? undefined,
    warna: r.warna ?? undefined,
    type: r.asset_type ?? undefined,
    serialNumber: r.serial_number ?? undefined,
    fisik: r.fisik ?? undefined,
    tglBeli: r.tgl_beli ?? undefined,
    owner: r.owner ?? "Origin",
    usageType: r.usage_type ?? "Reusable",
    projectId: r.project_id ?? null,
    stageDetails: r.stage_details
  };
}

export function rowToLog(r: any): ActivityLog {
  return {
    id: r.id,
    timestamp: iso(r.timestamp),
    assetId: r.asset_id,
    assetName: r.asset_name,
    stage: r.stage,
    action: r.action,
    operator: r.operator,
    type: r.type
  };
}

export async function getAssets(): Promise<Asset[]> {
  const { rows } = await q(`select * from assets order by updated_at desc`);
  return rows.map(rowToAsset);
}

export async function getAsset(id: string): Promise<Asset | null> {
  const { rows } = await q(`select * from assets where id = $1`, [id]);
  return rows[0] ? rowToAsset(rows[0]) : null;
}

type Exec = (text: string, params?: any[]) => Promise<any>;

// Generate an Asset ID: 3 letters from the client name (after a leading "PT") + running number.
// e.g. "PT Dinamika Sinergi Nusantara" -> DIN00001, "Kaluli" -> KAL00001.
export async function genAssetId(client: string, exec: Exec = q): Promise<string> {
  const base = String(client || "").replace(/^PT\.?\s+/i, "").replace(/[^A-Za-z]/g, "");
  let prefix = base.slice(0, 3).toUpperCase();
  if (prefix.length < 3) prefix = (prefix + "XXX").slice(0, 3);
  const { rows } = await exec(`select id from assets where id like $1`, [prefix + "%"]);
  let max = 0;
  for (const r of rows) {
    if (/-SJ\d+$/.test(String(r.id))) continue; // ignore partial-shipment split children
    const m = String(r.id).match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return prefix + String(max + 1).padStart(5, "0");
}

// Generate a child ID for a partial-shipment split, e.g. DIN00001 -> DIN00001-SJ1.
export async function genSplitId(originalId: string, exec: Exec = q): Promise<string> {
  const { rows } = await exec(`select id from assets where id like $1`, [originalId + "-SJ%"]);
  let max = 0;
  for (const r of rows) {
    const m = String(r.id).match(/-SJ(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${originalId}-SJ${max + 1}`;
}

export async function insertAsset(a: Asset, exec: Exec = q): Promise<void> {
  await exec(
    `insert into assets
       (id, name, category, client, project_code, quantity, current_stage, current_location,
        qrcode, audit_score, maintenance_status, warna, asset_type, serial_number, fisik, tgl_beli,
        owner, usage_type, project_id, specs, financials, stage_details, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21::jsonb,$22::jsonb,$23,$24)
     on conflict (id) do nothing`,
    [
      a.id, a.name, a.category, a.client, a.projectCode, a.quantity, a.currentStage, a.currentLocation,
      a.qrcode, a.auditScore ?? null, a.maintenanceStatus ?? null,
      a.warna ?? null, a.type ?? null, a.serialNumber ?? null, a.fisik ?? null, a.tglBeli ?? null,
      a.owner ?? "Origin", a.usageType ?? "Reusable", a.projectId ?? null,
      JSON.stringify(a.specs || {}), JSON.stringify(a.financials || {}), JSON.stringify(a.stageDetails || {}),
      a.createdAt, a.updatedAt
    ]
  );
}

// Update editable core/physical fields of an asset (from the Master Data table).
export async function updateAssetCore(id: string, a: Asset): Promise<void> {
  await q(
    `update assets set
       name=$2, category=$3, client=$4, quantity=$5,
       warna=$6, asset_type=$7, serial_number=$8, fisik=$9, tgl_beli=$10,
       owner=$11, usage_type=$12, specs=$13::jsonb, financials=$14::jsonb, updated_at=now()
     where id=$1`,
    [
      id, a.name, a.category, a.client, a.quantity,
      a.warna ?? null, a.type ?? null, a.serialNumber ?? null, a.fisik ?? null, a.tglBeli ?? null,
      a.owner ?? "Origin", a.usageType ?? "Reusable",
      JSON.stringify(a.specs || {}), JSON.stringify(a.financials || {})
    ]
  );
}

export async function deleteAsset(id: string): Promise<void> {
  await q(`delete from assets where id=$1`, [id]);
}

// Assign (or clear) an asset's current deployment project.
export async function setAssetProject(id: string, projectId: number | null, exec: Exec = q): Promise<void> {
  await exec(`update assets set project_id=$2, updated_at=now() where id=$1`, [id, projectId]);
}

export async function updateAssetStageRow(
  id: string,
  p: { currentStage: number; currentLocation: string; stageDetails: any; auditScore?: number; maintenanceStatus?: string }
): Promise<void> {
  await q(
    `update assets set
       current_stage = $2,
       current_location = $3,
       stage_details = $4::jsonb,
       audit_score = $5,
       maintenance_status = $6,
       updated_at = now()
     where id = $1`,
    [id, p.currentStage, p.currentLocation, JSON.stringify(p.stageDetails || {}), p.auditScore ?? null, p.maintenanceStatus ?? null]
  );
}

// Deterministic per-entry hash for the tamper-evident audit chain.
export function logHash(
  prev: string | null,
  l: { id: string; assetId: string; stage: number; action: string; operator: string; type: string; timestamp: string }
): string {
  return crypto
    .createHash("sha256")
    .update([prev || "", l.id, l.assetId, l.stage, l.action, l.operator, l.type, l.timestamp].join("|"))
    .digest("hex");
}

export async function insertLog(l: ActivityLog): Promise<void> {
  // Chain each entry to the previous one's hash → append-only, tamper-evident.
  const { rows } = await q(`select hash from activity_logs order by seq desc limit 1`);
  const prev = rows[0]?.hash || null;
  const hash = logHash(prev, l);
  await q(
    `insert into activity_logs (id, asset_id, asset_name, stage, action, operator, type, timestamp, prev_hash, hash)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (id) do nothing`,
    [l.id, l.assetId, l.assetName, l.stage, l.action, l.operator, l.type, l.timestamp, prev, hash]
  );
}

export async function getLogs(limit = 200): Promise<ActivityLog[]> {
  const { rows } = await q(`select * from activity_logs order by timestamp desc limit $1`, [limit]);
  return rows.map(rowToLog);
}
