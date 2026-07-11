/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ORIGIN Asset360 API — Express + Postgres + JWT auth.
 */
import express from "express";
import type { Response, NextFunction } from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { q, getAssets, getAsset, insertAsset, insertLog, updateAssetStageRow, getLogs, tx, genAssetId, genSplitId, updateAssetCore, deleteAsset, logHash } from "./db";
import { requireAuth, requireAuthFlexible, requireRole, signToken, verifyPassword, hashPassword, STAGE_ROLE, type AuthedReq } from "./auth";
import { migrate, SEED_SETTINGS } from "./migrate";
import { computeLocation, DEFAULT_LOG, TRANSITIONS, isLegalTransition, EVIDENCE_REQUIRED } from "./lifecycle";
import {
  upload, processImage, makeThumb, aHash, hamming, newEvidenceId, insertEvidence, evidenceView, listEvidence,
  getEvidenceById, presentSlots, writeEvidenceFiles, absPath, getIdempotent, saveIdempotent
} from "./evidence";
import fs from "node:fs";
import type { Asset, ActivityLog } from "../src/types";
import { recomputeInstall, statusOf } from "../src/installProgress";
import { listNotifications, unreadCount, markRead, markAllRead, notifyNewAssignments, notifyInstallCompleted } from "./notifications";

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

// Serve the built frontend in production (single service on :3201).
// In dev, Vite (:3200) serves the app and proxies /api here instead.
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
app.use(express.static(DIST));

// Field PWA is a second SPA entry (field.html). Serve it for /field and any
// in-app path under it (the app uses in-memory navigation, no deep links).
app.get(["/field", "/field/*"], (_req, res) => res.sendFile(path.join(DIST, "field.html")));

const wrap =
  (fn: (req: AuthedReq, res: Response, next: NextFunction) => Promise<any>) =>
  (req: AuthedReq, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "asset360-api" }));

// --- Auth ---
app.post(
  "/api/auth/login",
  wrap(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Username & password wajib diisi." });
    const { rows } = await q(`select * from users where username = $1`, [username]);
    const u = rows[0];
    if (!u || !(await verifyPassword(password, u.password_hash))) {
      return res.status(401).json({ error: "Username atau password salah." });
    }
    const user = { id: u.id, username: u.username, name: u.name, role: u.role, client: u.client ?? null };
    res.json({ token: signToken(user), user });
  })
);

app.get("/api/auth/me", requireAuth, (req: AuthedReq, res) => res.json({ user: req.user }));

// --- Reads (any authenticated user) ---
app.get("/api/assets", requireAuth, wrap(async (_req, res) => res.json(await getAssets())));
app.get("/api/activity", requireAuth, wrap(async (_req, res) => res.json(await getLogs(200))));

// Verify the tamper-evident audit chain: recompute every link and report the first break.
app.get(
  "/api/activity/verify",
  requireAuth,
  wrap(async (_req, res) => {
    const { rows } = await q(
      `select seq, id, asset_id, stage, action, operator, type, timestamp, prev_hash, hash from activity_logs order by seq asc`
    );
    let prev: string | null = null;
    let brokenAt: number | null = null;
    for (const r of rows) {
      const expect = logHash(prev, {
        id: r.id, assetId: r.asset_id, stage: r.stage, action: r.action,
        operator: r.operator, type: r.type, timestamp: new Date(r.timestamp).toISOString()
      });
      if (r.hash !== expect || (r.prev_hash || null) !== (prev || null)) {
        brokenAt = Number(r.seq);
        break;
      }
      prev = r.hash;
    }
    res.json({ ok: brokenAt === null, count: rows.length, brokenAt });
  })
);
app.get(
  "/api/users",
  requireAuth,
  requireRole("Admin"),
  wrap(async (_req, res) => {
    const { rows } = await q(`select id, username, name, role, client, created_at from users order by id`);
    res.json(rows);
  })
);

// Lightweight directory for dropdowns (any authed user): PIC / Merchandiser of a client.
app.get(
  "/api/users/directory",
  requireAuth,
  wrap(async (req, res) => {
    const role = String(req.query.role || "");
    const client = String(req.query.client || "");
    if (!["PIC", "Merchandiser"].includes(role)) return res.status(400).json({ error: "role harus PIC atau Merchandiser." });
    const { rows } = client
      ? await q(`select id, name, client from users where role=$1 and client=$2 order by name`, [role, client])
      : await q(`select id, name, client from users where role=$1 order by name`, [role]);
    res.json(rows);
  })
);

const VALID_ROLES = ["Admin", "Logistik", "PIC", "Merchandiser"];
const CLIENT_SCOPED = ["PIC", "Merchandiser"];

// Create user
app.post(
  "/api/users",
  requireAuth,
  requireRole("Admin"),
  wrap(async (req, res) => {
    const { username, name, role, password, client } = req.body || {};
    if (!username || !name || !role || !password) return res.status(400).json({ error: "username, name, role, password wajib diisi." });
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: "Role tidak valid." });
    if (String(password).length < 6) return res.status(400).json({ error: "Password minimal 6 karakter." });
    const cli = CLIENT_SCOPED.includes(role) ? String(client || "").trim() : null;
    if (CLIENT_SCOPED.includes(role) && !cli) return res.status(400).json({ error: `Role ${role} wajib ditetapkan ke satu Client.` });
    try {
      const hash = await hashPassword(password);
      const { rows } = await q(
        `insert into users (username, name, password_hash, role, client) values ($1,$2,$3,$4,$5)
         returning id, username, name, role, client, created_at`,
        [String(username).trim(), String(name).trim(), hash, role, cli]
      );
      res.status(201).json(rows[0]);
    } catch (e: any) {
      if (e?.code === "23505") return res.status(409).json({ error: "Username sudah dipakai." });
      throw e;
    }
  })
);

// Update user (name / role / optional password reset)
app.patch(
  "/api/users/:id",
  requireAuth,
  requireRole("Admin"),
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const { name, role, password, client } = req.body || {};
    const { rows } = await q(`select * from users where id = $1`, [id]);
    const target = rows[0];
    if (!target) return res.status(404).json({ error: "User tidak ditemukan." });
    if (role && !VALID_ROLES.includes(role)) return res.status(400).json({ error: "Role tidak valid." });

    // Guard: never demote the last Admin
    if (role && role !== "Admin" && target.role === "Admin") {
      const { rows: sa } = await q(`select count(*)::int as n from users where role = 'Admin'`);
      if (sa[0].n <= 1) return res.status(409).json({ error: "Tidak bisa menurunkan Admin terakhir." });
    }

    const newName = name?.trim() || target.name;
    const newRole = role || target.role;
    // Client scope follows the (new) role: required for PIC/Merchandiser, cleared otherwise.
    const newClient = CLIENT_SCOPED.includes(newRole)
      ? (client !== undefined ? String(client || "").trim() : target.client) || ""
      : null;
    if (CLIENT_SCOPED.includes(newRole) && !newClient) return res.status(400).json({ error: `Role ${newRole} wajib ditetapkan ke satu Client.` });

    if (password) {
      if (String(password).length < 6) return res.status(400).json({ error: "Password minimal 6 karakter." });
      const hash = await hashPassword(password);
      await q(`update users set name=$2, role=$3, client=$4, password_hash=$5 where id=$1`, [id, newName, newRole, newClient, hash]);
    } else {
      await q(`update users set name=$2, role=$3, client=$4 where id=$1`, [id, newName, newRole, newClient]);
    }
    const { rows: out } = await q(`select id, username, name, role, client, created_at from users where id=$1`, [id]);
    res.json(out[0]);
  })
);

// Delete user
app.delete(
  "/api/users/:id",
  requireAuth,
  requireRole("Admin"),
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user!.id) return res.status(409).json({ error: "Tidak bisa menghapus akun sendiri." });
    const { rows } = await q(`select * from users where id = $1`, [id]);
    const target = rows[0];
    if (!target) return res.status(404).json({ error: "User tidak ditemukan." });
    if (target.role === "Admin") {
      const { rows: sa } = await q(`select count(*)::int as n from users where role = 'Admin'`);
      if (sa[0].n <= 1) return res.status(409).json({ error: "Tidak bisa menghapus Admin terakhir." });
    }
    await q(`delete from users where id = $1`, [id]);
    res.json({ ok: true, id });
  })
);

// Build a stage-3 (Inventory/Gudang) asset from an imported Excel row.
function buildImportedAsset(id: string, row: any): Asset {
  const now = new Date().toISOString();
  const harga = Number(row.harga) || 0;
  const qty = Number(row.qty) || 1;
  const tgl = row.tglBeli ? String(row.tglBeli).slice(0, 10) : "";
  return {
    id,
    name: String(row.name || "").trim(),
    category: String(row.category || "").trim(),
    client: String(row.client || "").trim(),
    projectCode: `WO-${id}`,
    quantity: qty,
    currentStage: 3, // belum bergerak → Inventory/Gudang
    createdAt: now,
    updatedAt: now,
    currentLocation: "Gudang / Inventory (Belum Bergerak)",
    specs: { brand: String(row.merk || "").trim() || "Custom", sku: id },
    qrcode: `ASETIFY-${id}`,
    financials: { purchaseCost: harga, maintenanceCost: 0, disposalValue: Math.round(harga * 0.15) },
    auditScore: 100,
    maintenanceStatus: "NONE",
    warna: String(row.warna || "").trim(),
    type: String(row.type || "").trim(),
    serialNumber: String(row.serialNumber || "").trim(),
    fisik: String(row.fisik || "").trim(),
    tglBeli: tgl,
    stageDetails: {
      request: { reqId: `REQ-${id}`, timelineWeeks: 0, specsRequired: "Registrasi aset fisik (master data)", vendorName: "-", picName: "-", approvalDate: tgl || now.slice(0, 10) },
      production: { prodLead: "-", qcInspector: "-", qcScore: 100, productionReportCode: "-", evidencePhoto: "", readyDate: tgl || "" },
      inventory: { warehouseName: "Gudang Origin", shelfLoc: "-", stockCode: id, receivedDate: tgl || now.slice(0, 10), rackNumber: "-" },
      shipping: { suratJalanNo: "", driverName: "", vehiclePlate: "", vendorShipping: "", departureTime: "" },
      transit: { currentLat: 0, currentLng: 0, eta: "" },
      deployment: { installTeam: "", installationDate: "", planogramMatched: false, verifiedItems: [], photoBefore: "", photoAfter: "" },
      audit: { lastAuditDate: "", auditorName: "", findings: [], scoring: 100, recommendation: "" },
      maintenance: { logHistory: [] },
      retrieval: {},
      disposal: {}
    }
  };
}

// A complete, empty stageDetails skeleton — every consumer (CMS detail modal,
// docs, field app) assumes all 10 sub-objects exist, so we never store a partial one.
function emptyStageDetails() {
  return {
    request: { reqId: "", timelineWeeks: 0, specsRequired: "", vendorName: "", picName: "", approvalDate: "" },
    production: { prodLead: "", qcInspector: "", qcScore: 0, productionReportCode: "", evidencePhoto: "", readyDate: "" },
    inventory: { warehouseName: "", shelfLoc: "", stockCode: "", receivedDate: "", rackNumber: "" },
    shipping: { suratJalanNo: "", driverName: "", vehiclePlate: "", vendorShipping: "", departureTime: "" },
    transit: { currentLat: 0, currentLng: 0, eta: "" },
    deployment: { installTeam: "", installationDate: "", planogramMatched: false, verifiedItems: [], photoBefore: "", photoAfter: "" },
    audit: { lastAuditDate: "", auditorName: "", findings: [], scoring: 0, recommendation: "" },
    maintenance: { logHistory: [] },
    retrieval: {},
    disposal: {}
  };
}

// --- Create asset (server generates the client-based Asset ID) ---
app.post(
  "/api/assets",
  requireAuth,
  requireRole("Logistik"),
  wrap(async (req, res) => {
    const a = req.body as Asset;
    if (!a || !a.name || !a.client) return res.status(400).json({ error: "Nama & client aset wajib diisi." });
    if (a.category) await q(`insert into categories (name) values ($1) on conflict (name) do nothing`, [a.category]);
    await q(`insert into clients (name) values ($1) on conflict (name) do nothing`, [a.client]);
    a.id = await genAssetId(a.client);
    a.qrcode = `ASETIFY-${a.id}`;
    a.createdAt = a.createdAt || new Date().toISOString();
    a.updatedAt = new Date().toISOString();
    a.projectCode = a.projectCode || `WO-${a.id}`; // never null (search/UX rely on it)
    a.stageDetails = { ...emptyStageDetails(), ...(a.stageDetails || {}) } as Asset["stageDetails"]; // never store a partial shape
    await insertAsset(a);
    const log: ActivityLog = {
      id: `LOG-ADD-${Date.now()}`,
      timestamp: new Date().toISOString(),
      assetId: a.id,
      assetName: a.name,
      stage: a.currentStage || 1,
      action: `Aset baru terdaftar: ${a.name} (${a.id}).`,
      operator: req.user!.name,
      type: "success"
    };
    await insertLog(log);
    res.status(201).json({ asset: await getAsset(a.id), log });
  })
);

// --- Edit asset core/physical fields ---
app.patch(
  "/api/assets/:id",
  requireAuth,
  requireRole("Logistik"),
  wrap(async (req, res) => {
    const id = req.params.id;
    const asset = await getAsset(id);
    if (!asset) return res.status(404).json({ error: "Aset tidak ditemukan." });
    const p = req.body || {};
    if (p.category && p.category !== asset.category) await q(`insert into categories (name) values ($1) on conflict (name) do nothing`, [p.category]);
    if (p.client && p.client !== asset.client) await q(`insert into clients (name) values ($1) on conflict (name) do nothing`, [p.client]);
    const merged: Asset = {
      ...asset,
      name: p.name ?? asset.name,
      category: p.category ?? asset.category,
      client: p.client ?? asset.client,
      quantity: p.quantity != null ? Number(p.quantity) : asset.quantity,
      warna: p.warna ?? asset.warna,
      type: p.type ?? asset.type,
      serialNumber: p.serialNumber ?? asset.serialNumber,
      fisik: p.fisik ?? asset.fisik,
      tglBeli: p.tglBeli ?? asset.tglBeli,
      specs: { ...asset.specs, brand: p.merk ?? asset.specs?.brand },
      financials: { ...asset.financials, purchaseCost: p.harga != null ? Number(p.harga) : asset.financials.purchaseCost }
    };
    await updateAssetCore(id, merged);
    res.json({ asset: await getAsset(id) });
  })
);

// --- Delete asset (Admin) ---
app.delete(
  "/api/assets/:id",
  requireAuth,
  requireRole("Admin"),
  wrap(async (req, res) => {
    const id = req.params.id;
    const asset = await getAsset(id);
    if (!asset) return res.status(404).json({ error: "Aset tidak ditemukan." });
    await deleteAsset(id);
    await insertLog({
      id: `LOG-DEL-${Date.now()}`,
      timestamp: new Date().toISOString(),
      assetId: id,
      assetName: asset.name,
      stage: asset.currentStage,
      action: `Aset dihapus dari master: ${asset.name} (${id}).`,
      operator: req.user!.name,
      type: "error"
    });
    res.json({ ok: true, id });
  })
);

// --- Bulk import assets from Excel rows (auto-add master, default Fase 3) ---
app.post(
  "/api/assets/import",
  requireAuth,
  requireRole("Logistik"),
  wrap(async (req, res) => {
    const mode = req.body?.mode;
    if (mode !== "append" && mode !== "replace") return res.status(400).json({ error: "mode harus 'append' atau 'replace'." });
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: "File tidak berisi baris aset." });
    const result = await tx(async c => {
      const exec = (t: string, p?: any[]) => c.query(t, p);
      if (mode === "replace") await c.query(`delete from assets`);
      let added = 0;
      const cats = new Set<string>();
      const clis = new Set<string>();
      for (const row of rows) {
        const client = String(row.client || "").trim();
        const category = String(row.category || "").trim();
        const name = String(row.name || "").trim();
        if (!name || !client) continue;
        if (category) {
          await c.query(`insert into categories (name) values ($1) on conflict (name) do nothing`, [category]);
          cats.add(category);
        }
        await c.query(`insert into clients (name) values ($1) on conflict (name) do nothing`, [client]);
        clis.add(client);
        const id = await genAssetId(client, exec);
        await insertAsset(buildImportedAsset(id, row), exec);
        added++;
      }
      return { added, categories: cats.size, clients: clis.size };
    });
    res.json({ ok: true, mode, ...result });
  })
);

// --- Advance / branch lifecycle stage (server-authoritative) ---
app.patch(
  "/api/assets/:id/stage",
  requireAuth,
  wrap(async (req, res) => {
    const id = req.params.id;
    const { nextStage, updatedDetails, meta } = req.body || {};
    const ns = Number(nextStage);
    if (!Number.isInteger(ns) || ns < 1 || ns > 10) return res.status(400).json({ error: "nextStage tidak valid (1-10)." });

    const asset = await getAsset(id);
    if (!asset) return res.status(404).json({ error: "Aset tidak ditemukan." });

    // Idempotent replay (safe offline retry): same key -> same response, never double-apply.
    const idemKey = String(req.headers["idempotency-key"] || "");
    const cached = await getIdempotent(idemKey);
    if (cached) return res.status(200).json(cached);

    // Role gate for the target stage (Admin always allowed)
    const allowed = STAGE_ROLE[ns] || [];
    if (req.user!.role !== "Admin" && !allowed.includes(req.user!.role)) {
      return res.status(403).json({ error: `Role '${req.user!.role}' tidak berwenang memproses aset ke Fase ${ns}.` });
    }

    // Lifecycle graph guard: block illegal jumps. Admin may override with meta.force=true.
    const cur = asset.currentStage;
    if (ns !== cur && !isLegalTransition(cur, ns)) {
      if (!(req.user!.role === "Admin" && meta?.force === true)) {
        return res.status(422).json({
          code: "illegal_transition",
          error: `Transisi tidak sah: Fase ${cur} → Fase ${ns}. Lanjutan sah dari Fase ${cur}: ${(TRANSITIONS[cur] || []).join(", ") || "—"}.`
        });
      }
    }

    // Pemasangan is now advisory (soft gate): 6->7 (Audit) is allowed even if some
    // assigned portions are still pending — the CMS shows the honest installed/total.

    // Optimistic concurrency: reject a write built on a stale view of the asset.
    if (meta?.baseUpdatedAt && new Date(meta.baseUpdatedAt).getTime() !== new Date(asset.updatedAt).getTime()) {
      return res.status(409).json({
        code: "stale",
        error: "Aset sudah berubah di server sejak terakhir dibuka. Muat ulang aset lalu ulangi aksi.",
        currentUpdatedAt: asset.updatedAt,
        currentStage: asset.currentStage
      });
    }

    // Evidence gate (field channel only, so the legacy CMS form flow is unaffected):
    // every required photo slot for the target stage must already have >=1 upload.
    if (meta?.channel === "field") {
      const required = EVIDENCE_REQUIRED[ns] || [];
      if (required.length) {
        const present = await presentSlots(id, ns);
        const missing = required.filter(r => !present.has(r.slot));
        if (missing.length) {
          return res.status(422).json({
            code: "evidence_required",
            error: `Foto bukti wajib belum lengkap untuk Fase ${ns}.`,
            missing: missing.map(m => ({ slot: m.slot, label: m.label }))
          });
        }
      }
    }

    let details = updatedDetails || asset.stageDetails;
    // Entering Fase 6 (POD 5->6 or redeploy 7/8/9->6) starts a FRESH install cycle —
    // never carry a prior cycle's assignments/progress into the new deployment.
    if (ns === 6 && cur !== 6) {
      const dep: any = { ...((details as any)?.deployment || {}) };
      delete dep.assignments;
      delete dep.installedQty;
      delete dep.fullyInstalled;
      details = { ...details, deployment: dep };
    }
    const location = computeLocation(ns, details?.inventory?.warehouseName, asset.client, asset.currentLocation);

    let maintenanceStatus = asset.maintenanceStatus;
    if (ns === 8) maintenanceStatus = "REPAIRING";
    else if (asset.currentStage === 8) maintenanceStatus = "RESOLVED";
    else if (ns === 9 || ns === 10) maintenanceStatus = "NONE";
    if (meta?.maintenanceStatus) maintenanceStatus = meta.maintenanceStatus;

    const auditScore = meta?.auditScore ?? (ns === 7 ? details?.audit?.scoring ?? asset.auditScore : asset.auditScore);

    await updateAssetStageRow(id, { currentStage: ns, currentLocation: location, stageDetails: details, auditScore, maintenanceStatus });

    const log: ActivityLog = {
      id: `LOG-STAGE-${Date.now()}`,
      timestamp: new Date().toISOString(),
      assetId: asset.id,
      assetName: asset.name,
      stage: ns,
      action: meta?.logAction || DEFAULT_LOG[ns] || `Aset dipindahkan ke Fase ${ns}.`,
      operator: meta?.operator || req.user!.name,
      type: ns === 10 ? "error" : ns === 8 ? "warning" : "success"
    };
    await insertLog(log);

    const out = { asset: await getAsset(id), log };
    await saveIdempotent(idemKey, `stage:${id}`, out);
    res.json(out);
  })
);

// --- Issue Surat Jalan (Fase 4) with partial-shipment SPLIT ---
// Shipped qty (sum of destinations) < stock -> split off a child record at Fase 4,
// keep the remainder in Gudang (Fase 3) with qty + financials reduced proportionally.
app.post(
  "/api/assets/:id/ship",
  requireAuth,
  wrap(async (req: AuthedReq, res) => {
    const id = req.params.id;
    const asset = await getAsset(id);
    if (!asset) return res.status(404).json({ error: "Aset tidak ditemukan." });

    const allowed = STAGE_ROLE[4] || [];
    if (req.user!.role !== "Admin" && !allowed.includes(req.user!.role)) {
      return res.status(403).json({ error: `Role '${req.user!.role}' tidak berwenang menerbitkan Surat Jalan.` });
    }
    if (!isLegalTransition(asset.currentStage, 4)) {
      return res.status(422).json({ code: "illegal_transition", error: `Surat Jalan hanya dari Fase 3 (Gudang). Aset ini di Fase ${asset.currentStage}.` });
    }

    const { updatedDetails, meta } = req.body || {};
    const shipping = (updatedDetails && updatedDetails.shipping) || {};
    const dests = Array.isArray(shipping.destinations) ? shipping.destinations : [];
    const shipQty = dests.reduce((s: number, d: any) => s + (Number(d.qty) || 0), 0);
    if (shipQty <= 0) return res.status(400).json({ error: "Qty pengiriman harus lebih dari 0." });
    if (shipQty > asset.quantity) return res.status(422).json({ code: "qty_exceeds", error: `Qty kirim (${shipQty}) melebihi stok di gudang (${asset.quantity}).` });

    const now = new Date().toISOString();
    const location = computeLocation(4, undefined, asset.client, asset.currentLocation);
    const details = updatedDetails || asset.stageDetails;
    const operator = meta?.operator || req.user!.name;

    // Ship ALL -> whole record moves to Fase 4 (no split)
    if (shipQty === asset.quantity) {
      await updateAssetStageRow(id, { currentStage: 4, currentLocation: location, stageDetails: details, auditScore: asset.auditScore, maintenanceStatus: asset.maintenanceStatus });
      const log: ActivityLog = {
        id: `LOG-SHIP-${Date.now()}`, timestamp: now, assetId: id, assetName: asset.name, stage: 4,
        action: meta?.logAction || `Surat Jalan terbit: ${shipQty} unit dikirim.`, operator, type: "success"
      };
      await insertLog(log);
      return res.json({ mode: "full", original: await getAsset(id), child: null });
    }

    // Ship PARTIAL -> split off a child at Fase 4, keep the remainder at Fase 3
    const perUnit = (asset.financials?.purchaseCost || 0) / asset.quantity;
    const perDisposal = (asset.financials?.disposalValue || 0) / asset.quantity;
    const remaining = asset.quantity - shipQty;

    const childId = await tx(async c => {
      const exec = (t: string, p?: any[]) => c.query(t, p);
      const cid = await genSplitId(id, exec);
      const child: Asset = {
        ...asset,
        id: cid,
        quantity: shipQty,
        currentStage: 4,
        currentLocation: location,
        qrcode: `ASETIFY-${cid}`,
        createdAt: now,
        updatedAt: now,
        specs: { ...(asset.specs || {}), splitFrom: id },
        financials: {
          ...(asset.financials || { purchaseCost: 0, maintenanceCost: 0, disposalValue: 0 }),
          purchaseCost: Math.round(perUnit * shipQty),
          disposalValue: Math.round(perDisposal * shipQty)
        },
        stageDetails: { ...asset.stageDetails, shipping }
      };
      await insertAsset(child, exec);
      await exec(`update assets set quantity=$2, financials=$3::jsonb, updated_at=now() where id=$1`, [
        id,
        remaining,
        JSON.stringify({ ...(asset.financials || {}), purchaseCost: Math.round(perUnit * remaining), disposalValue: Math.round(perDisposal * remaining) })
      ]);
      return cid;
    });

    const shipLog: ActivityLog = {
      id: `LOG-SHIP-${Date.now()}`, timestamp: now, assetId: childId, assetName: asset.name, stage: 4,
      action: `${meta?.logAction || "Surat Jalan terbit"}: ${shipQty} unit dikirim (dipisah dari ${id}).`, operator, type: "success"
    };
    await insertLog(shipLog);
    const splitLog: ActivityLog = {
      id: `LOG-SPLIT-${Date.now()}`, timestamp: now, assetId: id, assetName: asset.name, stage: asset.currentStage,
      action: `${shipQty} unit dikirim via ${childId}; sisa ${remaining} unit tetap di Gudang.`, operator, type: "info"
    };
    await insertLog(splitLog);

    res.json({ mode: "split", original: await getAsset(id), child: await getAsset(childId) });
  })
);

// --- PIC assigns / re-assigns install portions (Fase 6, in-place) ---
// Single source of truth for creating AND editing assignments. Merges by merchandiserId:
// existing done/partial rows keep their progress; new/edited rows are validated. Under-
// assignment (Σqty < quantity) is allowed; over-assignment is rejected.
app.post(
  "/api/assets/:id/install/assign",
  requireAuth,
  wrap(async (req: AuthedReq, res) => {
    const id = req.params.id;
    const asset = await getAsset(id);
    if (!asset) return res.status(404).json({ error: "Aset tidak ditemukan." });
    if (asset.currentStage !== 6) return res.status(422).json({ error: `Penugasan pemasangan hanya untuk aset di Fase 6. Aset ini di Fase ${asset.currentStage}.` });

    // Role: Admin (any) or PIC scoped to the asset's client.
    const role = req.user!.role;
    if (role !== "Admin" && role !== "PIC") return res.status(403).json({ error: "Hanya PIC atau Admin yang boleh menugaskan pemasangan." });
    if (role === "PIC" && (req.user!.client || null) !== (asset.client || null)) {
      return res.status(403).json({ error: "PIC hanya bisa menugaskan aset milik client-nya sendiri." });
    }

    // Optimistic concurrency vs a concurrent completion/edit.
    if (req.body?.baseUpdatedAt && new Date(req.body.baseUpdatedAt).getTime() !== new Date(asset.updatedAt).getTime()) {
      return res.status(409).json({ code: "stale", error: "Aset sudah berubah di server. Muat ulang lalu ulangi." });
    }

    const incoming: any[] = Array.isArray(req.body?.assignments) ? req.body.assignments : [];
    if (!incoming.length) return res.status(400).json({ error: "Minimal 1 Merchandiser harus ditugaskan." });

    // Server-side directory: only real Merchandisers of THIS client are assignable.
    const { rows: dir } = await q(`select id, name from users where role='Merchandiser' and client=$1`, [asset.client]);
    const nameById = new Map<number, string>(dir.map((r: any) => [Number(r.id), r.name]));

    const deployment: any = (asset.stageDetails as any)?.deployment || {};
    const existing: any[] = Array.isArray(deployment.assignments) ? deployment.assignments : [];
    const existingById = new Map<number, any>(existing.map(a => [Number(a.merchandiserId), a]));

    const merged: any[] = [];
    const seen = new Set<number>();
    for (const r of incoming) {
      const mid = Number(r.merchandiserId);
      const qty = Math.floor(Number(r.qty));
      if (!Number.isInteger(mid) || !nameById.has(mid)) return res.status(400).json({ error: "Merchandiser tidak valid untuk client ini." });
      if (seen.has(mid)) return res.status(400).json({ error: "Merchandiser tidak boleh dobel." });
      seen.add(mid);
      if (!Number.isInteger(qty) || qty <= 0) return res.status(400).json({ error: "Qty tiap Merchandiser harus bilangan bulat > 0." });
      const prev = existingById.get(mid);
      const done = prev ? Number(prev.doneQty ?? (prev.status === "done" ? prev.qty : 0)) || 0 : 0;
      if (qty < done) return res.status(422).json({ code: "qty_below_done", error: `Qty ${nameById.get(mid)} tidak boleh di bawah yang sudah dikerjakan (${done}).` });
      merged.push(
        prev
          ? { ...prev, qty, doneQty: done, status: statusOf(qty, done), merchandiser: nameById.get(mid)! }
          : { merchandiserId: mid, merchandiser: nameById.get(mid)!, qty, doneQty: 0, status: "pending", reports: [] }
      );
    }

    const totalQty = merged.reduce((s, a) => s + a.qty, 0);
    if (totalQty > asset.quantity) return res.status(422).json({ code: "assign_exceeds", error: `Total tugas (${totalQty}) melebihi qty aset (${asset.quantity}).` });

    const { installedQty, fullyInstalled } = recomputeInstall(merged, asset.quantity);
    const details = { ...asset.stageDetails, deployment: { ...deployment, assignments: merged, installedQty, fullyInstalled } };
    await updateAssetStageRow(id, { currentStage: 6, currentLocation: asset.currentLocation, stageDetails: details, auditScore: asset.auditScore, maintenanceStatus: asset.maintenanceStatus });

    const now = new Date().toISOString();
    await insertLog({
      id: `LOG-ASSIGN-${Date.now()}`, timestamp: now, assetId: id, assetName: asset.name, stage: 6,
      action: `Pemasangan ditugaskan ke ${merged.length} merchandiser (total ${totalQty}/${asset.quantity} unit).`,
      operator: req.body?.operator || req.user!.name, type: "info"
    });

    // Notify only the newly-added merchandisers (diff-by-id).
    const added = merged.filter(a => !existingById.has(a.merchandiserId)).map(a => ({ merchandiserId: a.merchandiserId, qty: a.qty }));
    await notifyNewAssignments(added, { id, name: asset.name });

    res.json({ asset: await getAsset(id), installedQty, fullyInstalled });
  })
);

// --- Merchandiser reports install progress for their assigned portion (Fase 6) ---
// Incremental (doneQty), repeatable, evidence-gated per report, signature OPTIONAL.
// Row-locked so concurrent partial reports can't drop an increment. Idempotency-Key
// makes offline replay safe (each queued report = one unique key).
app.post(
  "/api/assets/:id/install/complete",
  requireAuthFlexible,
  wrap(async (req: AuthedReq, res) => {
    const id = req.params.id;
    const idemKey = String(req.headers["idempotency-key"] || "");
    const cached = await getIdempotent(idemKey);
    if (cached) return res.status(200).json(cached);

    // Pre-checks that don't need the lock (fail fast).
    const pre = await getAsset(id);
    if (!pre) return res.status(404).json({ error: "Aset tidak ditemukan." });
    if (pre.currentStage !== 6) return res.status(422).json({ error: `Pemasangan hanya untuk aset di Fase 6. Aset ini di Fase ${pre.currentStage}.` });

    const role = req.user!.role;
    let targetId: number;
    if (role === "Merchandiser") targetId = req.user!.id;
    else if (role === "Admin") targetId = Number(req.body?.merchandiserId);
    else return res.status(403).json({ error: "Hanya Merchandiser (atau Admin) yang bisa melaporkan pemasangan." });
    if (!Number.isInteger(targetId)) return res.status(400).json({ error: "merchandiserId wajib." });

    const { signatureBase64, note } = req.body || {};
    // Signature OPTIONAL — stored only if a real one is provided.
    const sig = signatureBase64 && String(signatureBase64).length >= 50 ? String(signatureBase64) : null;

    // Row-lock the asset, re-read assignments, apply the increment atomically.
    const result = await tx(async c => {
      const { rows } = await c.query(`select stage_details, quantity from assets where id=$1 for update`, [id]);
      if (!rows.length) return { http: 404, body: { error: "Aset tidak ditemukan." } };
      const sd: any = rows[0].stage_details || {};
      const quantity = Number(rows[0].quantity) || 0;
      const deployment: any = sd.deployment || {};
      const assignments: any[] = Array.isArray(deployment.assignments) ? deployment.assignments : [];
      if (!assignments.length) return { http: 422, body: { error: "Belum ada penugasan pemasangan pada aset ini." } };
      const a = assignments.find(x => Number(x.merchandiserId) === targetId);
      if (!a) return { http: 403, body: { error: "Kamu tidak ditugaskan untuk pemasangan aset ini." } };

      const cap = Number(a.qty) || 0;
      const cur = Number(a.doneQty) || 0;
      const remaining = cap - cur;
      if (remaining <= 0) return { http: 422, body: { error: "Porsi ini sudah selesai." } };

      const inc = req.body?.doneQty == null ? remaining : Math.floor(Number(req.body.doneQty));
      if (!Number.isInteger(inc) || inc < 1) return { http: 400, body: { error: "doneQty harus bilangan bulat >= 1." } };
      const applied = Math.min(inc, remaining);

      // Fresh evidence gate: before + after uploaded by THIS caller AFTER the last report.
      const { rows: ev } = await c.query(`select slot, operator, captured_at, created_at from evidence where asset_id=$1 and stage=6`, [id]);
      const since = a.lastReportAt ? new Date(a.lastReportAt).getTime() : 0;
      const fresh = new Set(
        ev
          .filter((e: any) => (e.operator || "") === req.user!.name && new Date(e.captured_at || e.created_at).getTime() > since)
          .map((e: any) => e.slot)
      );
      const missing = ["before", "after"].filter(s => !fresh.has(s));
      if (missing.length) return { http: 422, body: { code: "evidence_required", error: "Foto before & after (baru) wajib sebelum melapor.", missing } };

      const now = new Date().toISOString();
      const newDone = cur + applied;
      a.doneQty = newDone;
      a.status = statusOf(cap, newDone);
      a.lastReportAt = now;
      if (sig) a.signature = sig;
      if (note) a.note = String(note);
      if (newDone >= cap) a.completedAt = now;
      a.reports = [...(Array.isArray(a.reports) ? a.reports : []), { doneQty: applied, at: now, signature: sig || undefined, note: note ? String(note) : undefined, by: a.merchandiser, key: idemKey || undefined }];

      const { installedQty, fullyInstalled } = recomputeInstall(assignments, quantity);
      const details = { ...sd, deployment: { ...deployment, assignments, installedQty, fullyInstalled } };
      await c.query(`update assets set stage_details=$2::jsonb, updated_at=now() where id=$1`, [id, JSON.stringify(details)]);
      return { ok: true, merchandiser: a.merchandiser, applied, newDone, cap, installedQty, fullyInstalled, quantity };
    });

    if ((result as any).http) return res.status((result as any).http).json((result as any).body);
    const r = result as any;

    const now = new Date().toISOString();
    await insertLog({
      id: `LOG-INSTALL-${Date.now()}`, timestamp: now, assetId: id, assetName: pre.name, stage: 6,
      action: `${r.merchandiser} melapor +${r.applied} unit pemasangan (porsi ${r.newDone}/${r.cap}; total ${r.installedQty}/${r.quantity} terpasang)${r.fullyInstalled ? " — PENUH" : ""}.`,
      operator: r.merchandiser, type: "success"
    });
    await notifyInstallCompleted({ id, name: pre.name, client: pre.client, quantity: r.quantity }, r.merchandiser, r.applied, r.installedQty, r.fullyInstalled);

    const out = { asset: await getAsset(id), installedQty: r.installedQty, fullyInstalled: r.fullyInstalled };
    await saveIdempotent(idemKey, `install:${id}`, out);
    res.json(out);
  })
);

// --- In-app notifications (poll-based) ---
app.get("/api/notifications", requireAuthFlexible, wrap(async (req: AuthedReq, res) => {
  const [items, unread] = await Promise.all([listNotifications(req.user!.id), unreadCount(req.user!.id)]);
  res.json({ items, unread });
}));
app.post("/api/notifications/:id/read", requireAuthFlexible, wrap(async (req: AuthedReq, res) => {
  const okd = await markRead(Number(req.params.id), req.user!.id);
  if (!okd) return res.status(404).json({ error: "Notifikasi tidak ditemukan." });
  res.json({ ok: true, unread: await unreadCount(req.user!.id) });
}));
app.post("/api/notifications/read-all", requireAuthFlexible, wrap(async (req: AuthedReq, res) => {
  await markAllRead(req.user!.id);
  res.json({ ok: true, unread: 0 });
}));

// --- Master data: categories & clients (GET for any authed user; mutations Admin) ---
function registerMaster(pathName: string, table: string, assetCol: string) {
  app.get(
    `/api/master/${pathName}`,
    requireAuth,
    wrap(async (_req, res) => {
      const { rows } = await q(`select id, name from ${table} order by name`);
      res.json(rows);
    })
  );
  app.post(
    `/api/master/${pathName}`,
    requireAuth,
    requireRole("Admin"),
    wrap(async (req, res) => {
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ error: "Nama wajib diisi." });
      try {
        const { rows } = await q(`insert into ${table} (name) values ($1) returning id, name`, [name]);
        res.status(201).json(rows[0]);
      } catch (e: any) {
        if (e?.code === "23505") return res.status(409).json({ error: "Nama sudah terdaftar." });
        throw e;
      }
    })
  );
  app.patch(
    `/api/master/${pathName}/:id`,
    requireAuth,
    requireRole("Admin"),
    wrap(async (req, res) => {
      const id = Number(req.params.id);
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ error: "Nama wajib diisi." });
      const { rows } = await q(`select name from ${table} where id = $1`, [id]);
      if (!rows[0]) return res.status(404).json({ error: "Data tidak ditemukan." });
      const oldName = rows[0].name;
      try {
        // Rename + cascade to assets referencing the old value (keeps data consistent).
        await tx(async c => {
          await c.query(`update ${table} set name = $1 where id = $2`, [name, id]);
          await c.query(`update assets set ${assetCol} = $1 where ${assetCol} = $2`, [name, oldName]);
        });
      } catch (e: any) {
        if (e?.code === "23505") return res.status(409).json({ error: "Nama sudah terdaftar." });
        throw e;
      }
      res.json({ id, name });
    })
  );
  app.delete(
    `/api/master/${pathName}/:id`,
    requireAuth,
    requireRole("Admin"),
    wrap(async (req, res) => {
      const id = Number(req.params.id);
      const { rows } = await q(`select name from ${table} where id = $1`, [id]);
      if (!rows[0]) return res.status(404).json({ error: "Data tidak ditemukan." });
      const name = rows[0].name;
      const { rows: used } = await q(`select count(*)::int as n from assets where ${assetCol} = $1`, [name]);
      if (used[0].n > 0) return res.status(409).json({ error: `Tidak bisa dihapus — masih dipakai oleh ${used[0].n} aset.` });
      await q(`delete from ${table} where id = $1`, [id]);
      res.json({ ok: true, id });
    })
  );
}
registerMaster("categories", "categories", "category");
registerMaster("clients", "clients", "client");

// Bulk import one master list. mode 'append' = add new only; 'replace' = delete old
// EXCEPT rows still used by assets (those are kept, to never orphan an asset).
async function applyImport(c: any, table: string, assetCol: string, rawNames: string[], mode: string) {
  const names = [...new Set((rawNames || []).map(n => String(n).trim()).filter(Boolean))];
  if (names.length === 0) return { skipped: true, added: 0, deleted: 0, kept: [] as { name: string; assets: number }[] };
  const { rows: ex } = await c.query(`select name from ${table}`);
  const existing = new Set<string>(ex.map((r: any) => r.name as string));
  const kept: { name: string; assets: number }[] = [];
  let added = 0;
  let deleted = 0;
  if (mode === "replace") {
    const keep = new Set(names);
    for (const name of existing) {
      if (keep.has(name)) continue;
      const { rows: u } = await c.query(`select count(*)::int as n from assets where ${assetCol} = $1`, [name]);
      if (u[0].n > 0) {
        kept.push({ name: name as string, assets: u[0].n }); // in-use → keep, don't orphan assets
        continue;
      }
      await c.query(`delete from ${table} where name = $1`, [name]);
      deleted++;
    }
  }
  for (const name of names) {
    if (existing.has(name)) continue;
    await c.query(`insert into ${table} (name) values ($1) on conflict (name) do nothing`, [name]);
    added++;
  }
  return { added, deleted, kept, total: names.length };
}

app.post(
  "/api/master/import",
  requireAuth,
  requireRole("Admin"),
  wrap(async (req, res) => {
    const mode = req.body?.mode;
    if (mode !== "replace" && mode !== "append") return res.status(400).json({ error: "mode harus 'replace' atau 'append'." });
    const categories = Array.isArray(req.body?.categories) ? req.body.categories : [];
    const clients = Array.isArray(req.body?.clients) ? req.body.clients : [];
    if (!categories.length && !clients.length) return res.status(400).json({ error: "Tidak ada data kategori/client yang bisa diimpor dari file." });
    const result = await tx(async c => ({
      categories: await applyImport(c, "categories", "category", categories, mode),
      clients: await applyImport(c, "clients", "client", clients, mode)
    }));
    res.json({ ok: true, mode, result });
  })
);

// --- System settings (key-value; GET any authed, PUT Admin) ---
async function readSettings(): Promise<Record<string, string>> {
  const { rows } = await q(`select key, value from settings`);
  const obj: Record<string, string> = {};
  for (const r of rows) obj[r.key] = r.value;
  return obj;
}
app.get("/api/settings", requireAuth, wrap(async (_req, res) => res.json(await readSettings())));
app.put(
  "/api/settings",
  requireAuth,
  requireRole("Admin"),
  wrap(async (req, res) => {
    const body = req.body || {};
    const allowed = Object.keys(SEED_SETTINGS);
    for (const [k, v] of Object.entries(body)) {
      if (!allowed.includes(k)) continue; // ignore unknown keys
      await q(
        `insert into settings (key, value) values ($1, $2)
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [k, String(v)]
      );
    }
    res.json(await readSettings());
  })
);

// --- Reset demo data (Admin) ---
app.post(
  "/api/reset",
  requireAuth,
  requireRole("Admin"),
  wrap(async (_req, res) => {
    await q(`truncate assets, activity_logs`);
    await migrate({ seedAssets: true });
    res.json({ ok: true, assets: await getAssets(), logs: await getLogs(200) });
  })
);

// --- Evidence: upload photos for an asset (field ops). Any authed user may attach. ---
// multipart: files[] (image/*), + fields: slot, stage, gpsLat, gpsLng, capturedAt, note.
// Idempotency-Key header makes an offline retry return the same result instead of dup rows.
app.post(
  "/api/assets/:id/evidence",
  requireAuth,
  upload.array("files", 12),
  wrap(async (req: AuthedReq, res) => {
    const id = req.params.id;
    const asset = await getAsset(id);
    if (!asset) return res.status(404).json({ error: "Aset tidak ditemukan." });

    const idemKey = String(req.headers["idempotency-key"] || "");
    const cached = await getIdempotent(idemKey);
    if (cached) return res.status(200).json(cached);

    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) return res.status(400).json({ error: "Tidak ada file foto yang diunggah." });

    const b = req.body || {};
    const stage = b.stage != null && b.stage !== "" ? Number(b.stage) : null;
    const slot = b.slot ? String(b.slot) : null;
    const gpsLat = b.gpsLat !== undefined && b.gpsLat !== "" ? Number(b.gpsLat) : null;
    const gpsLng = b.gpsLng !== undefined && b.gpsLng !== "" ? Number(b.gpsLng) : null;
    const capturedAt = b.capturedAt ? new Date(b.capturedAt).toISOString() : null;
    const note = b.note ? String(b.note) : null;

    // Existing perceptual hashes to check reuse against (small table; fine to scan).
    const { rows: priorHashes } = await q(`select asset_id, phash from evidence where phash is not null`);

    const saved = [];
    for (const f of files) {
      const img = await processImage(f.buffer, f.mimetype);
      const thumb = await makeThumb(f.buffer);
      const phash = await aHash(img.buffer);

      // Integrity flags (advisory — never block a legit field capture).
      const flags: string[] = [];
      if (capturedAt && new Date(capturedAt).getTime() > Date.now() + 5 * 60 * 1000) flags.push("future_timestamp");
      for (const p of priorHashes) {
        if (hamming(phash, p.phash) <= 5) {
          flags.push(p.asset_id === id ? "reused_same_asset" : "reused_other_asset");
          break;
        }
      }

      const eid = newEvidenceId();
      const { filename, thumbFilename } = await writeEvidenceFiles(eid, img, thumb);
      const row = await insertEvidence({
        id: eid, assetId: id, stage, slot, filename, thumbFilename,
        mime: img.mime, bytes: img.bytes, sha256: img.sha256, width: img.width, height: img.height,
        gpsLat, gpsLng, capturedAt, operator: req.user!.name, note, phash, flags
      });
      priorHashes.push({ asset_id: id, phash }); // so multi-file batches self-check too
      saved.push(evidenceView(row));
    }
    const out = { ok: true, evidence: saved };
    await saveIdempotent(idemKey, `evidence:${id}`, out);
    res.status(201).json(out);
  })
);

// List evidence for an asset (optionally filtered by ?stage=).
app.get(
  "/api/assets/:id/evidence",
  requireAuth,
  wrap(async (req, res) => {
    const stage = req.query.stage != null ? Number(req.query.stage) : undefined;
    const rows = await listEvidence(req.params.id, Number.isFinite(stage as number) ? (stage as number) : undefined);
    res.json({ evidence: rows.map(evidenceView) });
  })
);

// Stream an evidence file (full or thumbnail). Auth via header OR ?token= (for <img>).
async function streamEvidence(req: AuthedReq, res: Response, thumb: boolean) {
  const e = await getEvidenceById(req.params.id);
  if (!e) return res.status(404).json({ error: "Evidence tidak ditemukan." });
  const file = absPath(thumb ? e.thumbFilename : e.filename, thumb);
  if (!fs.existsSync(file)) return res.status(410).json({ error: "File evidence hilang dari penyimpanan." });
  res.setHeader("Content-Type", thumb ? "image/jpeg" : e.mime);
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  fs.createReadStream(file).pipe(res);
}
app.get("/api/evidence/:id", requireAuthFlexible, wrap((req, res) => streamEvidence(req, res, false)));
app.get("/api/evidence/:id/thumb", requireAuthFlexible, wrap((req, res) => streamEvidence(req, res, true)));

// Error handler
app.use((err: any, _req: AuthedReq, res: Response, _next: NextFunction) => {
  console.error("[api error]", err);
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Ukuran foto melebihi 12 MB." });
  res.status(500).json({ error: "Terjadi kesalahan server.", detail: String(err?.message || err) });
});

const PORT = Number(process.env.PORT || 3201);
migrate()
  .then(() => app.listen(PORT, () => console.log(`[asset360-api] listening on http://localhost:${PORT}`)))
  .catch(e => {
    console.error("[asset360-api] startup/migrate failed:", e);
    process.exit(1);
  });
