/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Evidence storage pipeline for ORIGIN Asset360 field ops.
 * Photos are uploaded via multipart, EXIF-stripped + auto-oriented, hashed (sha256),
 * thumbnailed, and written to disk OUTSIDE the public dist/ (served only via authed API).
 * Also holds the lifecycle transition graph + required-evidence rules used to gate stages.
 */
import multer from "multer";
import sharp from "sharp";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { q } from "./db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STORE_DIR = path.join(__dirname, "..", "evidence-store");
export const THUMB_DIR = path.join(STORE_DIR, "thumb");
fs.mkdirSync(THUMB_DIR, { recursive: true });

// Accept images only (photos + on-screen signature PNG). ~12 MB raw per shot.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype))
});

export interface ProcessedImage {
  buffer: Buffer;
  ext: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
}

/**
 * Normalize an uploaded photo: auto-orient from EXIF then STRIP all metadata
 * (privacy + tamper-resistance — geotag lives in the DB row + burned-in watermark,
 * never in silent EXIF), cap the long edge, and re-encode to JPEG (PNG kept for
 * signatures so the transparent stroke survives).
 */
export async function processImage(input: Buffer, mime: string): Promise<ProcessedImage> {
  const isPng = /png/i.test(mime);
  const pipeline = sharp(input, { failOn: "none" }).rotate(); // rotate() bakes EXIF orientation, output drops metadata
  const resized = pipeline.resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true });
  const out = isPng
    ? await resized.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
    : await resized.jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const sha256 = crypto.createHash("sha256").update(out.data).digest("hex");
  return {
    buffer: out.data,
    ext: isPng ? "png" : "jpg",
    mime: isPng ? "image/png" : "image/jpeg",
    width: out.info.width,
    height: out.info.height,
    bytes: out.data.length,
    sha256
  };
}

export async function makeThumb(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
}

// Perceptual average-hash (8x8 grayscale → 64-bit → 16 hex chars). Lets the
// server detect the SAME photo being reused across assets/slots (anti-fraud).
export async function aHash(input: Buffer): Promise<string> {
  const buf = await sharp(input, { failOn: "none" }).grayscale().resize(8, 8, { fit: "fill" }).raw().toBuffer();
  let sum = 0;
  for (const b of buf) sum += b;
  const mean = sum / buf.length;
  let bits = "";
  for (const b of buf) bits += b >= mean ? "1" : "0";
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hamming(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

export function newEvidenceId(): string {
  return `EV-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export interface EvidenceRow {
  id: string;
  assetId: string;
  stage: number | null;
  slot: string | null;
  filename: string;
  thumbFilename: string;
  mime: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
  gpsLat: number | null;
  gpsLng: number | null;
  capturedAt: string | null;
  operator: string | null;
  note: string | null;
  phash: string | null;
  flags: string[];
  createdAt: string;
}

export async function insertEvidence(r: Omit<EvidenceRow, "createdAt">): Promise<EvidenceRow> {
  const { rows } = await q(
    `insert into evidence
       (id, asset_id, stage, slot, filename, thumb_filename, mime, bytes, sha256, width, height,
        gps_lat, gps_lng, captured_at, operator, note, phash, flags)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     returning *`,
    [
      r.id, r.assetId, r.stage, r.slot, r.filename, r.thumbFilename, r.mime, r.bytes, r.sha256,
      r.width, r.height, r.gpsLat, r.gpsLng, r.capturedAt, r.operator, r.note, r.phash, r.flags
    ]
  );
  return rowToEvidence(rows[0]);
}

export function rowToEvidence(r: any): EvidenceRow {
  return {
    id: r.id,
    assetId: r.asset_id,
    stage: r.stage,
    slot: r.slot,
    filename: r.filename,
    thumbFilename: r.thumb_filename,
    mime: r.mime,
    bytes: r.bytes,
    sha256: r.sha256,
    width: r.width,
    height: r.height,
    gpsLat: r.gps_lat != null ? Number(r.gps_lat) : null,
    gpsLng: r.gps_lng != null ? Number(r.gps_lng) : null,
    capturedAt: r.captured_at instanceof Date ? r.captured_at.toISOString() : r.captured_at,
    operator: r.operator,
    note: r.note,
    phash: r.phash ?? null,
    flags: r.flags || [],
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at
  };
}

// Public-facing shape (adds URLs the client can render). Never leaks the disk path.
export function evidenceView(e: EvidenceRow) {
  return {
    id: e.id,
    assetId: e.assetId,
    stage: e.stage,
    slot: e.slot,
    mime: e.mime,
    bytes: e.bytes,
    sha256: e.sha256,
    width: e.width,
    height: e.height,
    gps: e.gpsLat != null && e.gpsLng != null ? { lat: e.gpsLat, lng: e.gpsLng } : null,
    capturedAt: e.capturedAt,
    operator: e.operator,
    note: e.note,
    flags: e.flags || [],
    createdAt: e.createdAt,
    url: `/api/evidence/${e.id}`,
    thumbUrl: `/api/evidence/${e.id}/thumb`
  };
}

export async function getEvidenceById(id: string): Promise<EvidenceRow | null> {
  const { rows } = await q(`select * from evidence where id = $1`, [id]);
  return rows[0] ? rowToEvidence(rows[0]) : null;
}

export async function listEvidence(assetId: string, stage?: number): Promise<EvidenceRow[]> {
  const { rows } =
    stage == null
      ? await q(`select * from evidence where asset_id = $1 order by created_at asc`, [assetId])
      : await q(`select * from evidence where asset_id = $1 and stage = $2 order by created_at asc`, [assetId, stage]);
  return rows.map(rowToEvidence);
}

// Distinct slots that already have >=1 photo for a given asset+stage.
export async function presentSlots(assetId: string, stage: number): Promise<Set<string>> {
  const { rows } = await q(
    `select distinct slot from evidence where asset_id = $1 and stage = $2 and slot is not null`,
    [assetId, stage]
  );
  return new Set(rows.map((r: any) => r.slot as string));
}

export function absPath(filename: string, thumb = false): string {
  return path.join(thumb ? THUMB_DIR : STORE_DIR, path.basename(filename));
}

export async function writeEvidenceFiles(id: string, img: ProcessedImage, thumb: Buffer): Promise<{ filename: string; thumbFilename: string }> {
  const filename = `${id}.${img.ext}`;
  const thumbFilename = `${id}.jpg`;
  await fs.promises.writeFile(absPath(filename), img.buffer);
  await fs.promises.writeFile(absPath(thumbFilename, true), thumb);
  return { filename, thumbFilename };
}

// Delete ALL stored evidence image files (used by the destructive DB wipe, after the DB rows are
// truncated — so no orphaned photos/PII are left on disk). Keeps the directories. Bounded strictly
// to the evidence-store dir + its thumb subdir; only removes plain files.
export async function purgeEvidenceFiles(): Promise<number> {
  let removed = 0;
  for (const dir of [THUMB_DIR, STORE_DIR]) {
    let entries: string[] = [];
    try { entries = await fs.promises.readdir(dir); } catch { continue; }
    for (const e of entries) {
      const p = path.join(dir, e);
      try {
        const st = await fs.promises.stat(p);
        if (st.isFile()) { await fs.promises.unlink(p); removed++; }
      } catch { /* ignore individual file errors */ }
    }
  }
  return removed;
}

// --- Idempotency (safe offline retries): remember a key -> the response we already sent. ---
export async function getIdempotent(key: string): Promise<any | null> {
  if (!key) return null;
  const { rows } = await q(`select response from idempotency_keys where key = $1`, [key]);
  return rows[0] ? rows[0].response : null;
}
export async function saveIdempotent(key: string, scope: string, response: any): Promise<void> {
  if (!key) return;
  await q(
    `insert into idempotency_keys (key, scope, response) values ($1,$2,$3::jsonb)
     on conflict (key) do nothing`,
    [key, scope, JSON.stringify(response)]
  );
}
