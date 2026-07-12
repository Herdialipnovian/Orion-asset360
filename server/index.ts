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
import { q, getAssets, getAsset, insertAsset, insertLog, updateAssetStageRow, getLogs, tx, genAssetId, genSplitId, updateAssetCore, deleteAsset, setAssetProject, logHash } from "./db";
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
import { addClient, removeClient, assetChanged } from "./sse";

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
    const user = { id: u.id, username: u.username, name: u.name, role: u.role, client: u.client ?? null, area: u.area ?? null };
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
    const { rows } = await q(`select id, username, name, role, client, area, created_at from users order by id`);
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
    const area = String(req.query.area || "").trim();
    if (!["PIC", "Merchandiser"].includes(role)) return res.status(400).json({ error: "role harus PIC atau Merchandiser." });
    const conds = ["role=$1"]; const params: any[] = [role];
    if (client) { params.push(client); conds.push(`client=$${params.length}`); }
    if (area) { params.push(area); conds.push(`area=$${params.length}`); } // per-area scoping for the MD lock
    const { rows } = await q(`select id, name, client, area from users where ${conds.join(" and ")} order by name`, params);
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
    const { username, name, role, password, client, area } = req.body || {};
    if (!username || !name || !role || !password) return res.status(400).json({ error: "username, name, role, password wajib diisi." });
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: "Role tidak valid." });
    if (String(password).length < 6) return res.status(400).json({ error: "Password minimal 6 karakter." });
    const cli = CLIENT_SCOPED.includes(role) ? String(client || "").trim() : null;
    if (CLIENT_SCOPED.includes(role) && !cli) return res.status(400).json({ error: `Role ${role} wajib ditetapkan ke satu Client.` });
    // Area scope: PIC optional, but Merchandiser REQUIRES an area (per-area lock — an MD may only
    // be assigned/report installs in their own area).
    const ar = CLIENT_SCOPED.includes(role) ? String(area || "").trim() || null : null;
    if (role === "Merchandiser" && !ar) return res.status(400).json({ error: "Merchandiser wajib punya Area (penguncian per-area)." });
    try {
      const hash = await hashPassword(password);
      const { rows } = await q(
        `insert into users (username, name, password_hash, role, client, area) values ($1,$2,$3,$4,$5,$6)
         returning id, username, name, role, client, area, created_at`,
        [String(username).trim(), String(name).trim(), hash, role, cli, ar]
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
    const { name, role, password, client, area } = req.body || {};
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
    // Client + Area scope follow the (new) role: required client for PIC/Merchandiser, cleared otherwise.
    const newClient = CLIENT_SCOPED.includes(newRole)
      ? (client !== undefined ? String(client || "").trim() : target.client) || ""
      : null;
    if (CLIENT_SCOPED.includes(newRole) && !newClient) return res.status(400).json({ error: `Role ${newRole} wajib ditetapkan ke satu Client.` });
    const newArea = CLIENT_SCOPED.includes(newRole)
      ? (area !== undefined ? String(area || "").trim() || null : target.area)
      : null;
    if (newRole === "Merchandiser" && !newArea) return res.status(400).json({ error: "Merchandiser wajib punya Area (penguncian per-area)." });

    if (password) {
      if (String(password).length < 6) return res.status(400).json({ error: "Password minimal 6 karakter." });
      const hash = await hashPassword(password);
      await q(`update users set name=$2, role=$3, client=$4, area=$5, password_hash=$6 where id=$1`, [id, newName, newRole, newClient, newArea, hash]);
    } else {
      await q(`update users set name=$2, role=$3, client=$4, area=$5 where id=$1`, [id, newName, newRole, newClient, newArea]);
    }
    const { rows: out } = await q(`select id, username, name, role, client, area, created_at from users where id=$1`, [id]);
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
    owner: /klien|client/i.test(String(row.owner || "")) ? "Client" : "Origin",
    usageType:
      /consumable|habis/i.test(String(row.usageType || "")) ||
      /stiker|sticker|banner|poster|spanduk|flyer/i.test(String(row.name || ""))
        ? "Consumable"
        : "Reusable",
    peruntukan: (() => {
      const own = /klien|client/i.test(String(row.owner || "")) ? "Client" : "Origin";
      const p = row.peruntukan === "Internal" ? "Internal" : row.peruntukan === "Deployment" ? "Deployment" : derivePeruntukan(String(row.category || ""), own);
      return p === "Internal" && own !== "Origin" ? "Deployment" : p; // internal = Origin-only
    })(),
    projectId: row.projectId != null && Number.isFinite(Number(row.projectId)) ? Number(row.projectId) : null,
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

// Peruntukan: Client assets are always campaign (Deployment); Origin ops categories default Internal.
const INTERNAL_CAT_RE = /laptop|komputer|infrastruktur|kantor|keamanan|hvac|pendingin|kamera|cctv|printer|server|jaringan/i;
function derivePeruntukan(category?: string, owner?: string): "Internal" | "Deployment" {
  if ((owner || "") === "Client") return "Deployment";
  return INTERNAL_CAT_RE.test(category || "") ? "Internal" : "Deployment";
}

// --- Create asset (server generates the client-based Asset ID) ---
app.post(
  "/api/assets",
  requireAuth,
  requireRole("Logistik"),
  wrap(async (req, res) => {
    const a = req.body as Asset;
    if (!a || !a.name) return res.status(400).json({ error: "Nama aset wajib diisi." });
    // Internal Origin-owned assets have no external client → default to "Origin".
    if (!a.client) {
      if (a.owner === "Origin") a.client = "Origin";
      else return res.status(400).json({ error: "Client aset wajib diisi." });
    }
    // Peruntukan: honor an explicit override, else auto-derive from category + owner.
    if (a.peruntukan !== "Internal" && a.peruntukan !== "Deployment") a.peruntukan = derivePeruntukan(a.category, a.owner);
    if (a.peruntukan === "Internal" && a.owner !== "Origin") a.peruntukan = "Deployment"; // internal = Origin-only
    if (a.category) await q(`insert into categories (name) values ($1) on conflict (name) do nothing`, [a.category]);
    await q(`insert into clients (name) values ($1) on conflict (name) do nothing`, [a.client]);
    // Fase 1 (Request) & 2 (Produksi) removed — assets are born in Gudang (Fase 3) at the earliest.
    if (!a.currentStage || a.currentStage < 3) a.currentStage = 3;
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
    assetChanged(a.id);
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
      owner: p.owner ?? asset.owner,
      usageType: p.usageType ?? asset.usageType,
      peruntukan: (p.peruntukan === "Internal" || p.peruntukan === "Deployment") ? p.peruntukan : asset.peruntukan,
      specs: { ...asset.specs, brand: p.merk ?? asset.specs?.brand },
      financials: { ...asset.financials, purchaseCost: p.harga != null ? Number(p.harga) : asset.financials.purchaseCost }
    };
    // Enforce the partition invariant: internal = Origin-only (client assets are always Deployment).
    if (merged.peruntukan === "Internal" && merged.owner !== "Origin") merged.peruntukan = "Deployment";
    // Don't reclassify Internal while an asset is mid-deployment (would orphan it between menus).
    const wasDep: any = (asset.stageDetails as any)?.deployment || {};
    const flippingToInternal = merged.peruntukan === "Internal" && asset.peruntukan !== "Internal";
    if (flippingToInternal && (wasDep.mode === "Event" || wasDep.mode === "Distribusi" || (wasDep.legs || []).length || (wasDep.placements || []).length)) {
      return res.status(422).json({ error: "Aset sedang di alur deployment — tarik/selesaikan dulu sebelum jadikan Internal." });
    }
    await updateAssetCore(id, merged);
    assetChanged(id);
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
    assetChanged(id);
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
        // Validate projectId: must EXIST and belong to THIS client — else drop to null (no
        // dangling / cross-client project reference; assets.project_id has no DB-level FK).
        if (row.projectId != null) {
          const pn = Number(row.projectId);
          if (Number.isFinite(pn)) {
            const { rows: pr } = await c.query(`select client from projects where id=$1`, [pn]);
            row.projectId = pr[0] && (pr[0].client || "") === client ? pn : null;
          } else row.projectId = null;
        }
        await insertAsset(buildImportedAsset(id, row), exec);
        added++;
      }
      return { added, categories: cats.size, clients: clis.size };
    });
    assetChanged();
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
    assetChanged(id);
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
      assetChanged(id);
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

    assetChanged(id);
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
    // Hard area-lock (mirror distribute's toko_no_area): the venue must be tagged with an area
    // before any MD can be assigned — else the per-area lock could be silently bypassed.
    const deploymentPre: any = (asset.stageDetails as any)?.deployment || {};
    const legsPre: any[] = Array.isArray(deploymentPre.legs) ? deploymentPre.legs : [];
    const venueAreaPre: string | null = (legsPre.find((l: any) => l.status === "active") || legsPre[legsPre.length - 1])?.area || null;
    if (!venueAreaPre) return res.status(422).json({ code: "venue_no_area", error: "Venue aktif belum punya Area — set area venue dulu di Proyek & Lokasi." });

    // Server-side directory: only real Merchandisers of THIS client are assignable.
    const { rows: dir } = await q(`select id, name, area from users where role='Merchandiser' and client=$1`, [asset.client]);
    const nameById = new Map<number, string>(dir.map((r: any) => [Number(r.id), r.name]));
    const mdById = new Map<number, any>(dir.map((r: any) => [Number(r.id), r]));

    const deployment: any = (asset.stageDetails as any)?.deployment || {};
    // Area-lock (Event install is per-venue): the active leg's area is the area to match.
    const legsForArea: any[] = Array.isArray(deployment.legs) ? deployment.legs : [];
    const venueArea: string | null = (legsForArea.find((l: any) => l.status === "active") || legsForArea[legsForArea.length - 1])?.area || null;
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
      // Hard area-lock: MD must have an area, and it MUST match the venue area (guaranteed set above).
      const mdArea = mdById.get(mid)?.area || null;
      if (!mdArea) return res.status(422).json({ code: "md_no_area", error: `${nameById.get(mid)} belum punya Area — isi dulu di User Management.` });
      if (mdArea !== venueArea) return res.status(403).json({ code: "area_mismatch", error: `${nameById.get(mid)} (area ${mdArea}) tidak boleh ditugaskan di venue area ${venueArea}.` });
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

    assetChanged(id);
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
      // Defensive area-lock: a Merchandiser may only report installs in their own venue area —
      // read the CURRENT area from the DB (not the possibly-stale JWT snapshot).
      if (role === "Merchandiser") {
        const legsC: any[] = Array.isArray(deployment.legs) ? deployment.legs : [];
        const vArea: string | null = (legsC.find((l: any) => l.status === "active") || legsC[legsC.length - 1])?.area || null;
        if (vArea) {
          const { rows: mu } = await c.query(`select area from users where id=$1`, [targetId]);
          const myArea = mu[0]?.area || null;
          if (myArea !== vArea) return { http: 403, body: { error: `Venue ini di area ${vArea}, di luar area Anda (${myArea || "-"}).` } };
        }
      }

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
    assetChanged(id);
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

// --- Live updates (SSE) — long-lived stream, NOT wrap()ped (it never ends) ---
app.get("/api/events", requireAuthFlexible, (req: AuthedReq, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // don't let a reverse proxy buffer the stream
  (res as any).flushHeaders?.();
  res.write(`event: hello\ndata: {"ok":true}\n\n`);
  const client = addClient(req.user!.id, res);
  // Comment heartbeat every 25s keeps the connection alive through idle proxies.
  const hb = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      /* stream gone */
    }
  }, 25000);
  req.on("close", () => {
    clearInterval(hb);
    removeClient(client);
  });
});

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

// --- Areas master (geographic zones; PIC/Merchandiser scope to Client + Area) ---
// GET any authed (dropdown source); mutations Admin. In-use check is against users.area.
app.get("/api/areas", requireAuth, wrap(async (_req, res) => {
  const { rows } = await q(`select id, name from areas order by name`);
  res.json(rows);
}));
app.post("/api/areas", requireAuth, requireRole("Admin"), wrap(async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Nama area wajib diisi." });
  try {
    const { rows } = await q(`insert into areas (name) values ($1) returning id, name`, [name]);
    res.status(201).json(rows[0]);
  } catch (e: any) {
    if (e?.code === "23505") return res.status(409).json({ error: "Area sudah terdaftar." });
    throw e;
  }
}));
app.patch("/api/areas/:id", requireAuth, requireRole("Admin"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Nama area wajib diisi." });
  const { rows } = await q(`select name from areas where id=$1`, [id]);
  if (!rows[0]) return res.status(404).json({ error: "Area tidak ditemukan." });
  try {
    await tx(async c => {
      await c.query(`update areas set name=$1 where id=$2`, [name, id]);
      await c.query(`update users set area=$1 where area=$2`, [name, rows[0].name]); // cascade to scoped users
    });
  } catch (e: any) {
    if (e?.code === "23505") return res.status(409).json({ error: "Area sudah terdaftar." });
    throw e;
  }
  res.json({ id, name });
}));
app.delete("/api/areas/:id", requireAuth, requireRole("Admin"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await q(`select name from areas where id=$1`, [id]);
  if (!rows[0]) return res.status(404).json({ error: "Area tidak ditemukan." });
  const { rows: used } = await q(`select count(*)::int as n from users where area=$1`, [rows[0].name]);
  if (used[0].n > 0) return res.status(409).json({ error: `Tidak bisa dihapus — masih dipakai ${used[0].n} user.` });
  await q(`delete from areas where id=$1`, [id]);
  res.json({ ok: true, id });
}));

// --- Employees / Karyawan master (internal-asset custodians; NOT login users) ---
function empRow(r: any) {
  return { id: Number(r.id), code: r.code, name: r.name, department: r.department, position: r.position, active: r.active };
}
app.get("/api/employees", requireAuth, wrap(async (_req, res) => {
  const { rows } = await q(`select id, code, name, department, position, active from employees order by name`);
  res.json(rows.map(empRow));
}));
app.post("/api/employees", requireAuth, requireRole("Admin"), wrap(async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  if (!name) return res.status(400).json({ error: "Nama karyawan wajib diisi." });
  const { rows } = await q(
    `insert into employees (code, name, department, position) values ($1,$2,$3,$4)
     returning id, code, name, department, position, active`,
    [String(b.code || "").trim() || null, name, String(b.department || "").trim() || null, String(b.position || "").trim() || null]
  );
  res.status(201).json(empRow(rows[0]));
}));
app.patch("/api/employees/:id", requireAuth, requireRole("Admin"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { rows: ex } = await q(`select * from employees where id=$1`, [id]);
  if (!ex[0]) return res.status(404).json({ error: "Karyawan tidak ditemukan." });
  const b = req.body || {};
  const t = ex[0];
  const name = b.name !== undefined ? String(b.name || "").trim() || t.name : t.name;
  const { rows } = await q(
    `update employees set code=$2, name=$3, department=$4, position=$5, active=$6 where id=$1
     returning id, code, name, department, position, active`,
    [
      id,
      b.code !== undefined ? String(b.code || "").trim() || null : t.code,
      name,
      b.department !== undefined ? String(b.department || "").trim() || null : t.department,
      b.position !== undefined ? String(b.position || "").trim() || null : t.position,
      b.active !== undefined ? !!b.active : t.active
    ]
  );
  res.json(empRow(rows[0]));
}));
app.delete("/api/employees/:id", requireAuth, requireRole("Admin"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { rowCount } = await q(`delete from employees where id=$1`, [id]);
  if (!rowCount) return res.status(404).json({ error: "Karyawan tidak ditemukan." });
  res.json({ ok: true, id });
}));

// --- Clients (rich): name + deployment-type tags + store-list flag. GET any authed; mutations Admin.
// A client may run SEVERAL patterns (Event AND Distribusi), so deploymentTypes is a multi-value tag,
// not a single category. /api/master/clients stays as the name-only source for dropdowns/filter.
const VALID_DEPLOY_TYPES = ["Internal", "Event", "Distribusi"];
const cleanTypes = (v: any) => (Array.isArray(v) ? [...new Set(v.map(String))].filter(t => VALID_DEPLOY_TYPES.includes(t)) : []);
function clientRow(r: any) {
  return { id: Number(r.id), name: r.name, deploymentTypes: r.deployment_types ?? [], hasStoreList: !!r.has_store_list };
}
app.get("/api/clients", requireAuth, wrap(async (_req, res) => {
  const { rows } = await q(`select id, name, deployment_types, has_store_list from clients order by name`);
  res.json(rows.map(clientRow));
}));
app.post("/api/clients", requireAuth, requireRole("Admin"), wrap(async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  if (!name) return res.status(400).json({ error: "Nama client wajib diisi." });
  try {
    const { rows } = await q(
      `insert into clients (name, deployment_types, has_store_list) values ($1,$2,$3)
       returning id, name, deployment_types, has_store_list`,
      [name, cleanTypes(b.deploymentTypes), !!b.hasStoreList]
    );
    res.status(201).json(clientRow(rows[0]));
  } catch (e: any) {
    if (e?.code === "23505") return res.status(409).json({ error: "Client sudah terdaftar." });
    throw e;
  }
}));
app.patch("/api/clients/:id", requireAuth, requireRole("Admin"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { rows: ex } = await q(`select name, deployment_types, has_store_list from clients where id=$1`, [id]);
  if (!ex[0]) return res.status(404).json({ error: "Client tidak ditemukan." });
  const b = req.body || {};
  const oldName = ex[0].name;
  const name = b.name !== undefined ? String(b.name || "").trim() || oldName : oldName;
  const types = b.deploymentTypes !== undefined ? cleanTypes(b.deploymentTypes) : ex[0].deployment_types ?? [];
  const storeList = b.hasStoreList !== undefined ? !!b.hasStoreList : !!ex[0].has_store_list;
  try {
    await tx(async c => {
      await c.query(`update clients set name=$1, deployment_types=$2, has_store_list=$3 where id=$4`, [name, types, storeList, id]);
      if (name !== oldName) await c.query(`update assets set client=$1 where client=$2`, [name, oldName]); // cascade rename
    });
  } catch (e: any) {
    if (e?.code === "23505") return res.status(409).json({ error: "Client sudah terdaftar." });
    throw e;
  }
  res.json({ id, name, deploymentTypes: types, hasStoreList: storeList });
}));
app.delete("/api/clients/:id", requireAuth, requireRole("Admin"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await q(`select name from clients where id=$1`, [id]);
  if (!rows[0]) return res.status(404).json({ error: "Client tidak ditemukan." });
  const { rows: used } = await q(`select count(*)::int as n from assets where client=$1`, [rows[0].name]);
  if (used[0].n > 0) return res.status(409).json({ error: `Tidak bisa dihapus — masih dipakai ${used[0].n} aset.` });
  await q(`delete from clients where id=$1`, [id]);
  res.json({ ok: true, id });
}));

// ── Deployment foundation: Proyek/Campaign + Lokasi (Venue/Toko/Internal target). ──
// Both are operational planning → Admin + Logistik manage from the CMS; GET for any authed
// (dropdown sources). Field staff (PIC/Merchandiser) can ADD a location on the spot (mobile).
const VALID_MODES = ["Internal", "Event", "Distribusi"];
const VALID_LOC_TYPES = ["Venue", "Toko", "Internal"];
function projRow(r: any) {
  return { id: Number(r.id), name: r.name, client: r.client, mode: r.mode, status: r.status, area: r.area, startDate: r.start_date, endDate: r.end_date, notes: r.notes, assetCount: r.asset_count != null ? Number(r.asset_count) : undefined };
}
function locRow(r: any) {
  return { id: Number(r.id), name: r.name, type: r.type, client: r.client, area: r.area, address: r.address, gpsLat: r.gps_lat, gpsLng: r.gps_lng, pic: r.pic, code: r.code, source: r.source, active: r.active };
}

// Projects
app.get("/api/projects", requireAuth, wrap(async (req, res) => {
  const { client, mode } = req.query as any;
  const where: string[] = [], args: any[] = [];
  if (client) { args.push(client); where.push(`p.client = $${args.length}`); }
  if (mode) { args.push(mode); where.push(`p.mode = $${args.length}`); }
  const { rows } = await q(
    `select p.*, (select count(*) from assets a where a.project_id = p.id)::int as asset_count
     from projects p ${where.length ? "where " + where.join(" and ") : ""} order by p.created_at desc`,
    args
  );
  res.json(rows.map(projRow));
}));
app.post("/api/projects", requireAuth, requireRole("Admin", "Logistik"), wrap(async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  if (!name) return res.status(400).json({ error: "Nama proyek wajib diisi." });
  const mode = VALID_MODES.includes(b.mode) ? b.mode : "Distribusi";
  const { rows } = await q(
    `insert into projects (name, client, mode, status, area, start_date, end_date, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [name, b.client ? String(b.client).trim() : null, mode, b.status === "done" ? "done" : "active",
     b.area ? String(b.area).trim() : null, b.startDate || null, b.endDate || null, b.notes ? String(b.notes).trim() : null]
  );
  res.status(201).json(projRow(rows[0]));
}));
app.patch("/api/projects/:id", requireAuth, requireRole("Admin", "Logistik"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { rows: ex } = await q(`select * from projects where id=$1`, [id]);
  if (!ex[0]) return res.status(404).json({ error: "Proyek tidak ditemukan." });
  const t = ex[0], b = req.body || {};
  const name = b.name !== undefined ? String(b.name || "").trim() || t.name : t.name;
  const mode = b.mode !== undefined ? (VALID_MODES.includes(b.mode) ? b.mode : t.mode) : t.mode;
  const status = b.status !== undefined ? (b.status === "done" ? "done" : "active") : t.status;
  const { rows } = await q(
    `update projects set name=$2, client=$3, mode=$4, status=$5, area=$6, start_date=$7, end_date=$8, notes=$9 where id=$1 returning *`,
    [id, name,
     b.client !== undefined ? (b.client ? String(b.client).trim() : null) : t.client,
     mode, status,
     b.area !== undefined ? (b.area ? String(b.area).trim() : null) : t.area,
     b.startDate !== undefined ? (b.startDate || null) : t.start_date,
     b.endDate !== undefined ? (b.endDate || null) : t.end_date,
     b.notes !== undefined ? (b.notes ? String(b.notes).trim() : null) : t.notes]
  );
  res.json(projRow(rows[0]));
}));
app.delete("/api/projects/:id", requireAuth, requireRole("Admin"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { rows: used } = await q(`select count(*)::int as n from assets where project_id=$1`, [id]);
  if (used[0].n > 0) return res.status(409).json({ error: `Tidak bisa dihapus — masih dipakai ${used[0].n} aset.` });
  const { rowCount } = await q(`delete from projects where id=$1`, [id]);
  if (!rowCount) return res.status(404).json({ error: "Proyek tidak ditemukan." });
  res.json({ ok: true, id });
}));

// Locations (Venue / Toko / Internal target)
app.get("/api/locations", requireAuth, wrap(async (req, res) => {
  const { client, type, area } = req.query as any;
  const where: string[] = [], args: any[] = [];
  if (client) { args.push(client); where.push(`client = $${args.length}`); }
  if (type) { args.push(type); where.push(`type = $${args.length}`); }
  if (area) { args.push(area); where.push(`area = $${args.length}`); }
  const { rows } = await q(`select * from locations ${where.length ? "where " + where.join(" and ") : ""} order by name`, args);
  res.json(rows.map(locRow));
}));
// Field staff may add a location on the spot → requireAuthFlexible (mobile token) + broad roles.
app.post("/api/locations", requireAuthFlexible, requireRole("Admin", "Logistik", "PIC", "Merchandiser"), wrap(async (req: AuthedReq, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  if (!name) return res.status(400).json({ error: "Nama lokasi wajib diisi." });
  const type = VALID_LOC_TYPES.includes(b.type) ? b.type : "Toko";
  const fieldAdded = req.user!.role === "PIC" || req.user!.role === "Merchandiser";
  // BAC: client-scoped field roles may only create locations for THEIR OWN client — never trust
  // body.client from them. Admin/Logistik (global) may set any client from the body.
  const owningClient = fieldAdded
    ? (req.user!.client || null)
    : (b.client ? String(b.client).trim() : null);
  const { rows } = await q(
    `insert into locations (name, type, client, area, address, gps_lat, gps_lng, pic, code, source)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
    [name, type, owningClient, b.area ? String(b.area).trim() : null,
     b.address ? String(b.address).trim() : null,
     b.gpsLat != null ? Number(b.gpsLat) : null, b.gpsLng != null ? Number(b.gpsLng) : null,
     b.pic ? String(b.pic).trim() : null, b.code ? String(b.code).trim() : null,
     fieldAdded ? "field" : "list"]
  );
  res.status(201).json(locRow(rows[0]));
}));
app.patch("/api/locations/:id", requireAuth, requireRole("Admin", "Logistik"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { rows: ex } = await q(`select * from locations where id=$1`, [id]);
  if (!ex[0]) return res.status(404).json({ error: "Lokasi tidak ditemukan." });
  const t = ex[0], b = req.body || {};
  const name = b.name !== undefined ? String(b.name || "").trim() || t.name : t.name;
  const type = b.type !== undefined ? (VALID_LOC_TYPES.includes(b.type) ? b.type : t.type) : t.type;
  const { rows } = await q(
    `update locations set name=$2, type=$3, client=$4, area=$5, address=$6, gps_lat=$7, gps_lng=$8, pic=$9, code=$10, active=$11 where id=$1 returning *`,
    [id, name, type,
     b.client !== undefined ? (b.client ? String(b.client).trim() : null) : t.client,
     b.area !== undefined ? (b.area ? String(b.area).trim() : null) : t.area,
     b.address !== undefined ? (b.address ? String(b.address).trim() : null) : t.address,
     b.gpsLat !== undefined ? (b.gpsLat != null ? Number(b.gpsLat) : null) : t.gps_lat,
     b.gpsLng !== undefined ? (b.gpsLng != null ? Number(b.gpsLng) : null) : t.gps_lng,
     b.pic !== undefined ? (b.pic ? String(b.pic).trim() : null) : t.pic,
     b.code !== undefined ? (b.code ? String(b.code).trim() : null) : t.code,
     b.active !== undefined ? !!b.active : t.active]
  );
  res.json(locRow(rows[0]));
}));
app.delete("/api/locations/:id", requireAuth, requireRole("Admin", "Logistik"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { rowCount } = await q(`delete from locations where id=$1`, [id]);
  if (!rowCount) return res.status(404).json({ error: "Lokasi tidak ditemukan." });
  res.json({ ok: true, id });
}));

// Assign / clear an asset's current deployment project.
app.post("/api/assets/:id/project", requireAuth, requireRole("Admin", "Logistik"), wrap(async (req, res) => {
  const asset = await getAsset(req.params.id);
  if (!asset) return res.status(404).json({ error: "Aset tidak ditemukan." });
  const raw = req.body?.projectId;
  let pid: number | null = null;
  if (raw != null) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) return res.status(400).json({ error: "projectId tidak valid." });
    const { rows } = await q(`select 1 from projects where id=$1`, [n]);
    if (!rows[0]) return res.status(400).json({ error: "Proyek tidak ditemukan." });
    pid = n;
  }
  await setAssetProject(asset.id, pid);
  assetChanged(asset.id);
  res.json({ ok: true, id: asset.id, projectId: pid });
}));

// ── Fase 1 Internal: serah-terima aset Origin ke Karyawan (custodian) + BAST. Jumps to Fase 6
// (internal deploy skips surat-jalan/transit — no venue). Admin + Logistik. ──
app.post("/api/assets/:id/handover", requireAuth, requireRole("Admin", "Logistik"), wrap(async (req: AuthedReq, res) => {
  const asset = await getAsset(req.params.id);
  if (!asset) return res.status(404).json({ error: "Aset tidak ditemukan." });
  if (asset.peruntukan !== "Internal") return res.status(422).json({ error: "Serah-terima custodian hanya untuk aset ber-peruntukan Internal." });
  if (asset.currentStage < 3 || asset.currentStage > 6) return res.status(422).json({ error: "Serah-terima internal hanya dari Fase 3–6 (gudang → dipegang karyawan)." });
  const b = req.body || {};
  const empId = Number(b.custodianId);
  if (!empId) return res.status(400).json({ error: "Custodian (karyawan) wajib dipilih." });
  const { rows: er } = await q(`select id, name, department from employees where id=$1 and active=true`, [empId]);
  if (!er[0]) return res.status(400).json({ error: "Karyawan tidak ditemukan / non-aktif." });
  const emp = er[0];
  let projectName: string | null = null, projectId: number | null = null;
  if (b.projectId != null) {
    const { rows: pr } = await q(`select id, name from projects where id=$1`, [Number(b.projectId)]);
    if (pr[0]) { projectName = pr[0].name; projectId = pr[0].id; }
  }
  const deployment = {
    ...((asset.stageDetails as any).deployment || {}),
    mode: "Internal",
    projectId: projectId ?? undefined,
    projectName: projectName ?? undefined,
    custodianId: emp.id,
    custodianName: emp.name,
    custodianDept: emp.department || undefined,
    handoverDate: b.handoverDate || new Date().toISOString().slice(0, 10),
    handoverSignature: b.signatureBase64 || undefined,
    handoverNote: b.note ? String(b.note).trim() : undefined
  };
  const stageDetails = { ...asset.stageDetails, deployment };
  const location = `Custodian: ${emp.name}`;
  await updateAssetStageRow(asset.id, { currentStage: 6, currentLocation: location, stageDetails });
  if (projectId != null) await setAssetProject(asset.id, projectId);
  await insertLog({
    id: `LOG-HANDOVER-${Date.now()}`,
    timestamp: new Date().toISOString(),
    assetId: asset.id,
    assetName: asset.name,
    stage: 6,
    action: `Serah-terima internal ke ${emp.name}${emp.department ? ` (${emp.department})` : ""}`,
    operator: req.user!.name,
    type: "success"
  });
  assetChanged(asset.id);
  res.json({ asset: await getAsset(asset.id) });
}));

// ── Internal stock-opname: record a periodic custodian check (does NOT change the stage). ──
app.post("/api/assets/:id/opname", requireAuth, requireRole("Admin", "Logistik"), wrap(async (req: AuthedReq, res) => {
  const asset = await getAsset(req.params.id);
  if (!asset) return res.status(404).json({ error: "Aset tidak ditemukan." });
  const dep: any = { ...((asset.stageDetails as any).deployment || {}) };
  if (dep.mode !== "Internal" || !dep.custodianName) return res.status(422).json({ error: "Opname hanya untuk aset internal yang sedang dipegang karyawan." });
  const b = req.body || {};
  const rec = { date: b.date || new Date().toISOString().slice(0, 10), by: req.user!.name, condition: String(b.condition || "Baik"), note: b.note ? String(b.note).trim() : undefined };
  dep.opnameHistory = [...(Array.isArray(dep.opnameHistory) ? dep.opnameHistory : []), rec];
  dep.lastOpnameAt = rec.date;
  const stageDetails = { ...asset.stageDetails, deployment: dep };
  await updateAssetStageRow(asset.id, { currentStage: asset.currentStage, currentLocation: asset.currentLocation, stageDetails });
  await insertLog({ id: `LOG-OPNAME-${Date.now()}`, timestamp: new Date().toISOString(), assetId: asset.id, assetName: asset.name, stage: asset.currentStage, action: `Stock-opname (${rec.condition}) oleh ${req.user!.name} — custodian ${dep.custodianName}`, operator: req.user!.name, type: rec.condition && /rusak/i.test(rec.condition) ? "warning" : "info" });
  assetChanged(asset.id);
  res.json({ asset: await getAsset(asset.id) });
}));

// ── Internal return: a held asset comes back to Gudang (Fase 6 → 3, custodian cleared). ──
app.post("/api/assets/:id/return-internal", requireAuth, requireRole("Admin", "Logistik"), wrap(async (req: AuthedReq, res) => {
  const asset = await getAsset(req.params.id);
  if (!asset) return res.status(404).json({ error: "Aset tidak ditemukan." });
  const dep: any = { ...((asset.stageDetails as any).deployment || {}) };
  if (asset.peruntukan !== "Internal") return res.status(422).json({ error: "Hanya aset ber-peruntukan Internal yang bisa ditarik lewat menu ini." });
  if (!dep.custodianName) return res.status(422).json({ error: "Aset ini tidak sedang dipegang karyawan." });
  const who = dep.custodianName;
  // Clear the active custodian + mode (opname history kept). mode cleared so a later legitimate
  // reclassification to Deployment isn't blocked by a stale mode='Internal'.
  dep.mode = undefined;
  dep.custodianId = undefined; dep.custodianName = undefined; dep.custodianDept = undefined; dep.handoverDate = undefined; dep.handoverSignature = undefined; dep.handoverNote = undefined;
  const stageDetails = { ...asset.stageDetails, deployment: dep };
  await updateAssetStageRow(asset.id, { currentStage: 3, currentLocation: "Gudang Utama Origin", stageDetails });
  await insertLog({ id: `LOG-RETURN-${Date.now()}`, timestamp: new Date().toISOString(), assetId: asset.id, assetName: asset.name, stage: 3, action: `Aset internal ditarik dari ${who} → kembali ke Gudang`, operator: req.user!.name, type: "success" });
  assetChanged(asset.id);
  res.json({ asset: await getAsset(asset.id) });
}));

// ── Fase 2 Event/Roadshow: deploy asset(-package) at a Venue as a Leg. Called again to RELOCATE
// to the next venue (closes the active leg, opens a new one) — builds the roadshow timeline on
// one asset. Admin + Logistik + PIC. First call jumps 3–5→6; later calls stay Fase 6. ──
app.post("/api/assets/:id/deploy-venue", requireAuth, requireRole("Admin", "Logistik", "PIC"), wrap(async (req: AuthedReq, res) => {
  const id = req.params.id;
  const pre = await getAsset(id);
  if (!pre) return res.status(404).json({ error: "Aset tidak ditemukan." });
  if (pre.currentStage < 3 || pre.currentStage > 6) return res.status(422).json({ error: "Setup/relokasi venue hanya dari Fase 3–6." });
  if (pre.peruntukan === "Internal") return res.status(422).json({ error: "Aset Internal tidak masuk alur deployment (event/distribusi)." });
  // Client-scoped roles can only touch their own client's asset (mirrors /place).
  if (req.user!.role === "PIC" && (req.user!.client || null) !== (pre.client || null)) return res.status(403).json({ error: "Aset ini di luar client Anda." });
  // Mode invariant: don't corrupt a Distribusi asset into a hybrid.
  const preDep: any = (pre.stageDetails as any)?.deployment || {};
  if (preDep.mode && preDep.mode !== "Event") return res.status(422).json({ error: "Aset bukan mode Event." });
  if (Array.isArray(preDep.placements) && preDep.placements.length) return res.status(422).json({ error: "Aset sudah mode Distribusi (ada placement)." });
  const b = req.body || {};
  const locId = Number(b.locationId);
  if (!locId) return res.status(400).json({ error: "Venue wajib dipilih." });
  const { rows: lr } = await q(`select id, name, area from locations where id=$1`, [locId]);
  if (!lr[0]) return res.status(400).json({ error: "Venue tidak ditemukan." });
  const loc = lr[0];
  const now = new Date().toISOString().slice(0, 10);
  let projectId: number | null = null, projectName: string | null = null;
  if (b.projectId != null) {
    const { rows: pr } = await q(`select id, name from projects where id=$1`, [Number(b.projectId)]);
    if (pr[0]) { projectId = pr[0].id; projectName = pr[0].name; }
  }
  // Row-lock so concurrent relocations can't drop a leg / collide on seq.
  const result = await tx(async c => {
    const { rows } = await c.query(`select stage_details from assets where id=$1 for update`, [id]);
    if (!rows.length) return { http: 404, body: { error: "Aset tidak ditemukan." } };
    const sd: any = rows[0].stage_details || {};
    const dep: any = { ...(sd.deployment || {}) };
    const legs: any[] = Array.isArray(dep.legs) ? dep.legs.map((l: any) => ({ ...l })) : [];
    for (const lg of legs) if (lg.status === "active") { lg.status = "done"; lg.teardownDate = lg.teardownDate || now; }
    const seq = legs.reduce((m, l) => Math.max(m, l.seq || 0), 0) + 1;
    legs.push({ locationId: loc.id, venue: loc.name, area: loc.area || undefined, pic: b.pic ? String(b.pic).trim() : undefined, seq, status: "active", setupDate: b.setupDate || now, signature: b.signatureBase64 || undefined, note: b.note ? String(b.note).trim() : undefined });
    dep.legs = legs; dep.currentLegSeq = seq; dep.mode = "Event";
    if (projectId != null) { dep.projectId = projectId; dep.projectName = projectName ?? undefined; }
    const details = { ...sd, deployment: dep };
    await c.query(`update assets set current_stage=6, current_location=$2, stage_details=$3::jsonb, updated_at=now() where id=$1`, [id, `Venue: ${loc.name}${loc.area ? ` (${loc.area})` : ""}`, JSON.stringify(details)]);
    return { ok: true, seq, venue: loc.name };
  });
  if ((result as any).http) return res.status((result as any).http).json((result as any).body);
  const r = result as any;
  if (projectId != null) await setAssetProject(id, projectId);
  await insertLog({
    id: `LOG-VENUE-${Date.now()}`,
    timestamp: new Date().toISOString(),
    assetId: id,
    assetName: pre.name,
    stage: 6,
    action: r.seq > 1 ? `Relokasi ke venue ${r.venue} (leg ${r.seq})` : `Setup di venue ${r.venue}`,
    operator: req.user!.name,
    type: "success"
  });
  assetChanged(id);
  res.json({ asset: await getAsset(id) });
}));

// ── Fase 3 Distribusi helpers + endpoints: fan-out placement per toko, per-toko reporting, sampling audit. ──
function recomputePlacements(dep: any, quantity: number) {
  const pls: any[] = Array.isArray(dep.placements) ? dep.placements : [];
  for (const p of pls) {
    const dq = Number(p.doneQty) || 0;
    p.status = dq <= 0 ? "pending" : dq >= (Number(p.qty) || 0) ? "done" : "partial";
  }
  dep.installedQty = pls.reduce((s, p) => s + (Number(p.doneQty) || 0), 0);
  dep.fullyInstalled = dep.installedQty >= quantity;
  return dep;
}

// PIC/Admin/Logistik assigns placements (fan-out qty across toko, optional merchandiser per toko).
// Merges by locationId (preserves doneQty). Σqty ≤ asset.quantity. First call jumps 3–5→6.
app.post("/api/assets/:id/distribute", requireAuth, requireRole("Admin", "Logistik", "PIC"), wrap(async (req: AuthedReq, res) => {
  const asset = await getAsset(req.params.id);
  if (!asset) return res.status(404).json({ error: "Aset tidak ditemukan." });
  if (asset.currentStage < 3 || asset.currentStage > 6) return res.status(422).json({ error: "Distribusi hanya dari Fase 3–6." });
  if (asset.peruntukan === "Internal") return res.status(422).json({ error: "Aset Internal tidak masuk alur distribusi." });
  // Client-scope (mirrors /place) + mode invariant (don't corrupt an Event asset into a hybrid).
  if (req.user!.role === "PIC" && (req.user!.client || null) !== (asset.client || null)) return res.status(403).json({ error: "Aset ini di luar client Anda." });
  const curDep: any = (asset.stageDetails as any)?.deployment || {};
  if (curDep.mode && curDep.mode !== "Distribusi") return res.status(422).json({ error: "Aset bukan mode Distribusi." });
  if (Array.isArray(curDep.legs) && curDep.legs.length) return res.status(422).json({ error: "Aset sudah mode Event (ada venue leg)." });
  const rows: any[] = Array.isArray(req.body?.placements) ? req.body.placements : [];
  if (!rows.length) return res.status(400).json({ error: "Minimal 1 toko." });
  // resolve toko + merchandiser names
  const locIds = [...new Set(rows.map(r => Number(r.locationId)).filter(Boolean))];
  const { rows: locs } = locIds.length ? await q(`select id, name, area from locations where id = any($1)`, [locIds]) : { rows: [] };
  const locMap = new Map(locs.map((l: any) => [l.id, l]));
  const merchIds = [...new Set(rows.map(r => Number(r.merchandiserId)).filter(Boolean))];
  // Client-scope the assignable MDs (mirror install/assign) — no cross-client assignment.
  const { rows: ms } = merchIds.length ? await q(`select id, name, area from users where id = any($1) and role='Merchandiser' and client=$2`, [merchIds, asset.client]) : { rows: [] };
  const merchMap = new Map(ms.map((m: any) => [m.id, m.name]));
  const merchAreaMap = new Map(ms.map((m: any) => [m.id, m.area]));

  const dep: any = { ...((asset.stageDetails as any).deployment || {}) };
  const existing: any[] = Array.isArray(dep.placements) ? dep.placements.map((p: any) => ({ ...p })) : [];
  const byLoc = new Map(existing.map(p => [Number(p.locationId), p]));
  const seen = new Set<number>();
  let total = 0;
  for (const r of rows) {
    const lid = Number(r.locationId);
    if (!lid || !locMap.has(lid)) return res.status(400).json({ error: "Toko tidak ditemukan." });
    if (seen.has(lid)) return res.status(400).json({ error: "Toko duplikat dalam satu distribusi." });
    seen.add(lid);
    const qty = Math.max(0, Number(r.qty) || 0);
    total += qty;
    const loc: any = locMap.get(lid);
    const prev = byLoc.get(lid);
    const dq = prev ? Number(prev.doneQty) || 0 : 0;
    if (qty < dq) return res.status(422).json({ error: `Qty toko ${loc.name} (${qty}) < yang sudah terpasang (${dq}).` });
    const mid = Number(r.merchandiserId) || undefined;
    // Hard area-lock: an assigned MD must belong to THIS client, have an area, and match the toko's area.
    if (mid) {
      if (!merchMap.has(mid)) return res.status(400).json({ error: "Merchandiser tidak valid untuk client ini." });
      const mdArea = merchAreaMap.get(mid) || null;
      if (!mdArea) return res.status(422).json({ code: "md_no_area", error: `${merchMap.get(mid)} belum punya Area — isi dulu di User Management.` });
      if (loc.area && mdArea !== loc.area) return res.status(403).json({ code: "area_mismatch", error: `${merchMap.get(mid)} (area ${mdArea}) tidak boleh ditugaskan ke toko ${loc.name} (area ${loc.area}).` });
      if (!loc.area) return res.status(422).json({ code: "toko_no_area", error: `Toko ${loc.name} belum punya Area — set area toko dulu di Proyek & Lokasi.` });
    }
    byLoc.set(lid, {
      ...(prev || {}),
      locationId: lid, toko: loc.name, area: loc.area || undefined,
      merchandiserId: mid, merchandiser: mid ? merchMap.get(mid) : undefined,
      qty, doneQty: dq
    });
  }
  if (total > (asset.quantity || 0)) return res.status(422).json({ error: `Total distribusi (${total}) melebihi qty aset (${asset.quantity}).` });
  dep.placements = [...byLoc.values()];
  dep.mode = "Distribusi";
  recomputePlacements(dep, asset.quantity || 0);
  let projectId: number | null = null;
  if (req.body?.projectId != null) {
    const { rows: pr } = await q(`select id, name from projects where id=$1`, [Number(req.body.projectId)]);
    if (pr[0]) { projectId = pr[0].id; dep.projectId = pr[0].id; dep.projectName = pr[0].name; }
  }
  const stageDetails = { ...asset.stageDetails, deployment: dep };
  await updateAssetStageRow(asset.id, { currentStage: 6, currentLocation: `Distribusi · ${dep.placements.length} toko`, stageDetails });
  if (projectId != null) await setAssetProject(asset.id, projectId);
  await insertLog({ id: `LOG-DIST-${Date.now()}`, timestamp: new Date().toISOString(), assetId: asset.id, assetName: asset.name, stage: 6, action: `Distribusi ke ${dep.placements.length} toko (total ${total} unit)`, operator: req.user!.name, type: "success" });
  assetChanged(asset.id);
  res.json({ asset: await getAsset(asset.id) });
}));

// Merchandiser (or PIC/Admin) reports a placement at a toko: doneQty increment + GPS + optional
// signature. Row-locked (concurrent per-toko reports can't drop an increment) + Idempotency-Key
// (offline replay safe) + stage guard, mirroring /install/complete.
app.post("/api/assets/:id/place", requireAuthFlexible, requireRole("Admin", "Logistik", "PIC", "Merchandiser"), wrap(async (req: AuthedReq, res) => {
  const id = req.params.id;
  const idemKey = String(req.headers["idempotency-key"] || "");
  const cached = await getIdempotent(idemKey);
  if (cached) return res.status(200).json(cached);

  const pre = await getAsset(id);
  if (!pre) return res.status(404).json({ error: "Aset tidak ditemukan." });
  if (pre.currentStage !== 6) return res.status(422).json({ error: `Pemasangan hanya untuk aset di Fase 6. Aset ini di Fase ${pre.currentStage}.` });
  if (pre.peruntukan === "Internal") return res.status(422).json({ error: "Aset Internal tidak masuk alur distribusi." });
  // Client-scoped roles can only touch their own client's asset.
  if ((req.user!.role === "PIC" || req.user!.role === "Merchandiser") && (req.user!.client || null) !== (pre.client || null)) {
    return res.status(403).json({ error: "Aset ini di luar client Anda." });
  }
  const lid = Number(req.body?.locationId);
  if (!Number.isInteger(lid)) return res.status(400).json({ error: "locationId wajib." });

  const result = await tx(async c => {
    const { rows } = await c.query(`select stage_details, quantity, current_location from assets where id=$1 for update`, [id]);
    if (!rows.length) return { http: 404, body: { error: "Aset tidak ditemukan." } };
    const sd: any = rows[0].stage_details || {};
    const quantity = Number(rows[0].quantity) || 0;
    const dep: any = sd.deployment || {};
    const pls: any[] = Array.isArray(dep.placements) ? dep.placements : [];
    const p = pls.find((x: any) => Number(x.locationId) === lid);
    if (!p) return { http: 404, body: { error: "Placement toko tidak ditemukan." } };
    // A Merchandiser may only report a placement that is assigned to THEM (unassigned → deny).
    if (req.user!.role === "Merchandiser" && Number(p.merchandiserId) !== req.user!.id) {
      return { http: 403, body: { error: "Placement ini bukan tugas Anda." } };
    }
    // Defensive area-lock: a Merchandiser may only report in their own area — read the CURRENT
    // area from the DB (not the 12h JWT snapshot, which can be stale after an area change).
    if (req.user!.role === "Merchandiser" && p.area) {
      const { rows: mu } = await c.query(`select area from users where id=$1`, [req.user!.id]);
      const myArea = mu[0]?.area || null;
      if (myArea !== p.area) return { http: 403, body: { error: `Toko ini di area ${p.area}, di luar area Anda (${myArea || "-"}).` } };
    }
    const cap = Number(p.qty) || 0;
    const cur = Number(p.doneQty) || 0;
    const remaining = cap - cur;
    if (remaining <= 0) return { http: 422, body: { error: "Toko ini sudah selesai." } };
    const inc = req.body?.doneQty == null ? remaining : Math.floor(Number(req.body.doneQty));
    if (!Number.isInteger(inc) || inc < 1) return { http: 400, body: { error: "doneQty harus bilangan bulat >= 1." } };
    const applied = Math.min(inc, remaining);

    const now = new Date().toISOString();
    p.doneQty = cur + applied;
    if (req.body?.gpsLat != null && Number.isFinite(Number(req.body.gpsLat))) p.gpsLat = Number(req.body.gpsLat);
    if (req.body?.gpsLng != null && Number.isFinite(Number(req.body.gpsLng))) p.gpsLng = Number(req.body.gpsLng);
    if (req.body?.signatureBase64 && String(req.body.signatureBase64).length >= 50) p.signature = String(req.body.signatureBase64);
    if (req.body?.note) p.note = String(req.body.note).trim();
    p.placedAt = now;
    dep.placements = pls;
    recomputePlacements(dep, quantity);
    const details = { ...sd, deployment: dep };
    await c.query(`update assets set stage_details=$2::jsonb, updated_at=now() where id=$1`, [id, JSON.stringify(details)]);
    return { ok: true, toko: p.toko, applied, newDone: p.doneQty, cap, quantity, installedQty: dep.installedQty, fullyInstalled: dep.fullyInstalled };
  });

  if ((result as any).http) return res.status((result as any).http).json((result as any).body);
  const r = result as any;
  await insertLog({ id: `LOG-PLACE-${Date.now()}`, timestamp: new Date().toISOString(), assetId: id, assetName: pre.name, stage: 6, action: `Pemasangan di ${r.toko}: +${r.applied} unit (${r.newDone}/${r.cap}; total ${r.installedQty}/${r.quantity} terpasang)${r.fullyInstalled ? " — PENUH" : ""}`, operator: req.user!.name, type: "success" });
  const out = { asset: await getAsset(id), installedQty: r.installedQty, fullyInstalled: r.fullyInstalled };
  await saveIdempotent(idemKey, `place:${id}`, out);
  assetChanged(id);
  res.json(out);
}));

// Sampling audit (Fase 7): PIC marks a SUBSET of toko audited + compliant. Returns coverage.
app.post("/api/assets/:id/audit-sample", requireAuth, requireRole("Admin", "Logistik", "PIC"), wrap(async (req: AuthedReq, res) => {
  const asset = await getAsset(req.params.id);
  if (!asset) return res.status(404).json({ error: "Aset tidak ditemukan." });
  const dep: any = { ...((asset.stageDetails as any).deployment || {}) };
  const pls: any[] = Array.isArray(dep.placements) ? dep.placements.map((p: any) => ({ ...p })) : [];
  if (!pls.length) return res.status(422).json({ error: "Belum ada placement untuk diaudit." });
  const samples: any[] = Array.isArray(req.body?.samples) ? req.body.samples : [];
  if (!samples.length) return res.status(400).json({ error: "Minimal 1 toko sampel." });
  for (const s of samples) {
    const p = pls.find(x => Number(x.locationId) === Number(s.locationId));
    if (p) { p.audited = true; p.auditCompliant = !!s.compliant; }
  }
  dep.placements = pls;
  const auditedList = pls.filter(p => p.audited);
  const compliant = auditedList.filter(p => p.auditCompliant).length;
  // Per-area breakdown (compliance per-area, not just one global score).
  const areaMap = new Map<string, { area: string; totalToko: number; auditedToko: number; compliantToko: number }>();
  for (const p of pls) {
    const area = (p.area && String(p.area).trim()) || "— tanpa area —";
    let row = areaMap.get(area);
    if (!row) { row = { area, totalToko: 0, auditedToko: 0, compliantToko: 0 }; areaMap.set(area, row); }
    row.totalToko++;
    if (p.audited) { row.auditedToko++; if (p.auditCompliant) row.compliantToko++; }
  }
  const byArea = [...areaMap.values()]
    .map(r => ({ ...r, coveragePct: Math.round((r.auditedToko / r.totalToko) * 100), compliancePct: r.auditedToko ? Math.round((r.compliantToko / r.auditedToko) * 100) : 0 }))
    .sort((a, b) => a.area.localeCompare(b.area));
  const method = req.body?.method === "auto" ? "auto" : "manual";
  const samplePct = method === "auto" && Number(req.body?.samplePct) > 0 ? Math.round(Number(req.body.samplePct)) : undefined;
  const coverage = {
    totalToko: pls.length, auditedToko: auditedList.length, compliantToko: compliant,
    coveragePct: Math.round((auditedList.length / pls.length) * 100),
    compliancePct: auditedList.length ? Math.round((compliant / auditedList.length) * 100) : 0,
    byArea, method, samplePct, sampledAt: new Date().toISOString()
  };
  dep.coverage = coverage;
  const stageDetails = { ...asset.stageDetails, deployment: dep };
  await updateAssetStageRow(asset.id, { currentStage: asset.currentStage, currentLocation: asset.currentLocation, stageDetails });
  await insertLog({ id: `LOG-SAMPLE-${Date.now()}`, timestamp: new Date().toISOString(), assetId: asset.id, assetName: asset.name, stage: 7, action: `Audit sampling ${method === "auto" ? `auto-random${samplePct ? ` ${samplePct}%` : ""} ` : ""}${auditedList.length}/${pls.length} toko · ${coverage.compliancePct}% patuh`, operator: req.user!.name, type: "success" });
  assetChanged(asset.id);
  res.json({ asset: await getAsset(asset.id), coverage });
}));

// Utilisasi & Riwayat aset: deployment history aggregated from the FULL activity-log table
// (survives redeploys that overwrite legs/placements). Book value / age computed client-side.
app.get("/api/analytics/utilization", requireAuth, wrap(async (_req, res) => {
  const { rows } = await q(
    `select asset_id,
       count(*) filter (where action ~* '(Distribusi ke|Setup di venue|Serah-terima internal|Pemasangan ditugaskan)')::int as deployments,
       count(*) filter (where action ~* '(Relokasi ke venue|melapor|Pemasangan di )')::int as movements,
       max(timestamp) filter (where action ~* '(Distribusi ke|Setup di venue|Serah-terima internal|Pemasangan ditugaskan|Relokasi ke venue|melapor|Pemasangan di )') as last_active
     from activity_logs where asset_id is not null group by asset_id`
  );
  res.json(rows.map((r: any) => ({
    assetId: r.asset_id,
    deployments: Number(r.deployments) || 0,
    movements: Number(r.movements) || 0,
    lastActiveAt: r.last_active ? new Date(r.last_active).toISOString() : null
  })));
}));

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
