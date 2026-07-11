/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Idempotent schema creation + seed (users always; demo assets only if empty).
 */
import { q, insertAsset, insertLog, logHash } from "./db";
import { hashPassword } from "./auth";
import { INITIAL_ASSETS, INITIAL_ACTIVITY_LOGS, SAMPLE_CLIENTS } from "../src/data/initialData";

const SCHEMA = `
create table if not exists users (
  id serial primary key,
  username text unique not null,
  name text not null,
  password_hash text not null,
  role text not null,
  created_at timestamptz not null default now()
);
create table if not exists assets (
  id text primary key,
  name text not null,
  category text,
  client text,
  project_code text,
  quantity int not null default 1,
  current_stage int not null default 1,
  current_location text,
  qrcode text,
  audit_score int,
  maintenance_status text,
  specs jsonb not null default '{}',
  financials jsonb not null default '{}',
  stage_details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists activity_logs (
  id text primary key,
  asset_id text,
  asset_name text,
  stage int,
  action text,
  operator text,
  type text,
  timestamp timestamptz not null default now()
);
create table if not exists categories (
  id serial primary key,
  name text unique not null,
  created_at timestamptz not null default now()
);
create table if not exists clients (
  id serial primary key,
  name text unique not null,
  created_at timestamptz not null default now()
);
create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
create table if not exists evidence (
  id text primary key,
  asset_id text not null,
  stage int,
  slot text,
  filename text not null,
  thumb_filename text not null,
  mime text not null,
  bytes int not null default 0,
  sha256 text not null,
  width int,
  height int,
  gps_lat double precision,
  gps_lng double precision,
  captured_at timestamptz,
  operator text,
  note text,
  created_at timestamptz not null default now()
);
create table if not exists idempotency_keys (
  key text primary key,
  scope text,
  response jsonb,
  created_at timestamptz not null default now()
);
create table if not exists notifications (
  id bigserial primary key,
  user_id int not null,
  type text not null,
  title text not null,
  body text,
  asset_id text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_user on notifications(user_id, read, created_at desc);
create index if not exists idx_assets_stage on assets(current_stage);
create index if not exists idx_logs_ts on activity_logs(timestamp desc);
create index if not exists idx_evidence_asset on evidence(asset_id);
create index if not exists idx_evidence_asset_stage on evidence(asset_id, stage);
`;

// Demo accounts — one per role. Change passwords in production.
const SEED_USERS = [
  { username: "admin", name: "Admin Origin", password: "admin123", role: "Admin", client: null },
  { username: "logistik", name: "Hendra Wijaya", password: "logistik123", role: "Logistik", client: null },
  // Example client-scoped users (PIC & Merchandiser) so per-client dropdowns have data.
  { username: "pic_garuda", name: "Yudi Prasetyo", password: "pic123", role: "PIC", client: "Garuda Food" },
  { username: "merch_garuda", name: "Sandi Pratama", password: "merch123", role: "Merchandiser", client: "Garuda Food" }
];

const SEED_CATEGORIES = [
  "Display & Kiosk", "Infrastruktur IT", "Komputer & Laptop", "HVAC & Pendingin",
  "Peralatan Retail", "Peralatan Kantor", "Sistem Keamanan", "Seragam & Atribut",
  "Perlengkapan Event", "Tas Pengantaran", "Kamera & IT", "Peralatan Khusus"
];

// System settings (key-value). Defaults are inserted-if-missing on every migrate.
export const SEED_SETTINGS: { [k: string]: string } = {
  company_name: "PT Origin Connect",
  company_address: "Kawasan Industri Cikarang, Jawa Barat",
  company_email: "support@origin.co.id",
  depreciation_pct: "15",
  sla_target_pct: "90",
  default_timeline_weeks: "4"
};

// Compute (or recompute) the append-only hash chain over all existing logs.
// Runs once when the hash columns are first added (existing rows have null hash).
async function backfillLogChain() {
  const { rows } = await q(
    `select seq, id, asset_id, stage, action, operator, type, timestamp, hash from activity_logs order by seq asc`
  );
  if (!rows.length || rows.every(r => r.hash)) return;
  let prev: string | null = null;
  for (const r of rows) {
    const h = logHash(prev, {
      id: r.id,
      assetId: r.asset_id,
      stage: r.stage,
      action: r.action,
      operator: r.operator,
      type: r.type,
      timestamp: new Date(r.timestamp).toISOString()
    });
    await q(`update activity_logs set prev_hash=$2, hash=$3 where seq=$1`, [r.seq, prev, h]);
    prev = h;
  }
  console.log(`[migrate] backfilled tamper-evident hash chain over ${rows.length} logs`);
}

export async function migrate({ seedAssets = true }: { seedAssets?: boolean } = {}) {
  await q(SCHEMA);

  // Additive columns for the physical-asset master table (idempotent).
  await q(`
    alter table assets add column if not exists warna text;
    alter table assets add column if not exists asset_type text;
    alter table assets add column if not exists serial_number text;
    alter table assets add column if not exists fisik text;
    alter table assets add column if not exists tgl_beli text;
  `);

  // Fase 5 hardening: tamper-evident audit chain + evidence integrity fields.
  await q(`
    alter table activity_logs add column if not exists seq bigserial;
    alter table activity_logs add column if not exists prev_hash text;
    alter table activity_logs add column if not exists hash text;
    alter table evidence add column if not exists phash text;
    alter table evidence add column if not exists flags text[] not null default '{}';
  `);
  await backfillLogChain();

  // Role model → 4 roles (Admin / Logistik / PIC / Merchandiser); PIC & Merchandiser are client-scoped.
  await q(`alter table users add column if not exists client text;`);
  await q(`
    update users set role='Admin' where role='Super Admin';
    update users set role='Logistik' where role='Logistic Supervisor';
    update users set role='PIC' where role='Field Inspector';
    update users set role='Merchandiser' where role='Field Technician';
  `);

  for (const u of SEED_USERS) {
    const hash = await hashPassword(u.password);
    await q(
      `insert into users (username, name, password_hash, role, client)
       values ($1,$2,$3,$4,$5) on conflict (username) do nothing`,
      [u.username, u.name, hash, u.role, u.client]
    );
  }

  const { rows } = await q(`select count(*)::int as n from assets`);
  if (seedAssets && rows[0].n === 0) {
    for (const a of INITIAL_ASSETS) await insertAsset(a);
    for (const l of INITIAL_ACTIVITY_LOGS) await insertLog(l);
    console.log(`[migrate] seeded ${INITIAL_ASSETS.length} assets + ${INITIAL_ACTIVITY_LOGS.length} logs`);
  }

  const { rows: catN } = await q(`select count(*)::int as n from categories`);
  if (catN[0].n === 0) {
    for (const name of SEED_CATEGORIES) await q(`insert into categories (name) values ($1) on conflict (name) do nothing`, [name]);
  }
  const { rows: cliN } = await q(`select count(*)::int as n from clients`);
  if (cliN[0].n === 0) {
    for (const name of SAMPLE_CLIENTS) await q(`insert into clients (name) values ($1) on conflict (name) do nothing`, [name]);
  }

  for (const [k, v] of Object.entries(SEED_SETTINGS)) {
    await q(`insert into settings (key, value) values ($1, $2) on conflict (key) do nothing`, [k, v]);
  }
}

// Allow running standalone: `tsx server/migrate.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => {
      console.log("[migrate] done");
      process.exit(0);
    })
    .catch(e => {
      console.error("[migrate] failed", e);
      process.exit(1);
    });
}
