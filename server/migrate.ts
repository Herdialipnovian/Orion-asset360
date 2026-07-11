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
  { username: "admin", name: "Admin Origin", password: "admin123", role: "Admin", client: null, area: null },
  { username: "logistik", name: "Hendra Wijaya", password: "logistik123", role: "Logistik", client: null, area: null },
  // Event client (Garuda Food): PIC & Merchandiser client-scoped, no fixed area (PIC follows the venue/leg).
  { username: "pic_garuda", name: "Yudi Prasetyo", password: "pic123", role: "PIC", client: "Garuda Food", area: null },
  { username: "merch_garuda", name: "Sandi Pratama", password: "sandi123", role: "Merchandiser", client: "Garuda Food", area: null },
  // Distribution client (AICE): Area → PIC Area → Merchandiser(s). Shows the client+area scope.
  { username: "pic_aice_aceh", name: "Fajar Nugraha", password: "pic123", role: "PIC", client: "AICE", area: "Aceh" },
  { username: "merch_aice_aceh1", name: "Rudi Hartanto", password: "merch123", role: "Merchandiser", client: "AICE", area: "Aceh" },
  { username: "merch_aice_aceh2", name: "Dewi Lestari", password: "merch123", role: "Merchandiser", client: "AICE", area: "Aceh" },
  { username: "pic_aice_medan", name: "Sinta Maharani", password: "pic123", role: "PIC", client: "AICE", area: "Medan" },
  { username: "merch_aice_medan1", name: "Bagas Saputra", password: "merch123", role: "Merchandiser", client: "AICE", area: "Medan" }
];

// Geographic areas (distribution zones / event regions). PIC & Merchandiser scope to Client + Area.
const SEED_AREAS = ["Aceh", "Medan", "Jakarta", "Bandung", "Surabaya", "Makassar"];

// Internal-asset custodians (Origin staff who hold company assets like laptops). NOT login users.
const SEED_EMPLOYEES = [
  { code: "ORG-IT-01", name: "Rian Hidayat", department: "IT", position: "IT Support" },
  { code: "ORG-FIN-02", name: "Sari Melati", department: "Finance", position: "Staff Finance" },
  { code: "ORG-OPS-03", name: "Andi Wijaya", department: "Operasional", position: "Koordinator Lapangan" },
  { code: "ORG-HR-04", name: "Putri Ananda", department: "HR", position: "HR Generalist" }
];

// Example deployment projects (one per pattern) + a few locations — demonstrable out of the box.
const SEED_PROJECTS = [
  { name: "Aset Kantor Origin 2026", client: null, mode: "Internal", area: "Jakarta", notes: "Serah-terima aset perusahaan ke karyawan (laptop, dll)." },
  { name: "AICE Roadshow Ramadan 2026", client: "AICE", mode: "Event", area: "Aceh", notes: "Roadshow multi-kota: Aceh → Medan." },
  { name: "AICE Sebar Stiker MT 2026", client: "AICE", mode: "Distribusi", area: "Jakarta", notes: "Distribusi stiker ke toko Modern Trade." }
];
const SEED_LOCATIONS = [
  { name: "Lapangan Merdeka Banda Aceh", type: "Venue", client: "AICE", area: "Aceh", address: "Jl. Merdeka, Banda Aceh", pic: "Yudi Prasetyo", code: "VN-ACE-01" },
  { name: "Lapangan Benteng Medan", type: "Venue", client: "AICE", area: "Medan", address: "Jl. Pengadilan, Medan", pic: "", code: "VN-MDN-01" },
  { name: "Indomaret Sudirman", type: "Toko", client: "AICE", area: "Jakarta", address: "Jl. Sudirman Kav. 10, Jakarta", pic: "", code: "TK-JKT-01" },
  { name: "Alfamart Gatot Subroto", type: "Toko", client: "AICE", area: "Jakarta", address: "Jl. Gatot Subroto, Jakarta", pic: "", code: "TK-JKT-02" },
  { name: "Superindo Kelapa Gading", type: "Toko", client: "AICE", area: "Jakarta", address: "Kelapa Gading, Jakarta", pic: "", code: "TK-JKT-03" }
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

  // Phase 0 foundation — Area scope on users + owner/usage on assets + Area & Employee masters.
  await q(`
    create table if not exists areas (
      id serial primary key,
      name text unique not null,
      created_at timestamptz not null default now()
    );
    create table if not exists employees (
      id serial primary key,
      code text,
      name text not null,
      department text,
      position text,
      active boolean not null default true,
      created_at timestamptz not null default now()
    );
    alter table users add column if not exists area text;
    alter table assets add column if not exists owner text not null default 'Origin';
    alter table assets add column if not exists usage_type text not null default 'Reusable';
    alter table clients add column if not exists deployment_types text[] not null default '{}';
    alter table clients add column if not exists has_store_list boolean not null default false;
  `);

  // Deployment foundation (multi-pattern): Proyek/Campaign (wadah kerjaan + mode) + Lokasi (Venue/Toko/Internal).
  await q(`
    create table if not exists projects (
      id serial primary key,
      name text not null,
      client text,
      mode text not null default 'Distribusi',
      status text not null default 'active',
      area text,
      start_date text,
      end_date text,
      notes text,
      created_at timestamptz not null default now()
    );
    create table if not exists locations (
      id serial primary key,
      name text not null,
      type text not null default 'Toko',
      client text,
      area text,
      address text,
      gps_lat double precision,
      gps_lng double precision,
      pic text,
      code text,
      source text not null default 'list',
      active boolean not null default true,
      created_at timestamptz not null default now()
    );
    alter table assets add column if not exists project_id integer;
  `);

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
      `insert into users (username, name, password_hash, role, client, area)
       values ($1,$2,$3,$4,$5,$6) on conflict (username) do nothing`,
      [u.username, u.name, hash, u.role, u.client, u.area ?? null]
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
  // Ensure the clients referenced by the seed users exist (idempotent).
  for (const c of ["Garuda Food", "AICE"]) await q(`insert into clients (name) values ($1) on conflict (name) do nothing`, [c]);

  // Seed Area & Employee masters (once).
  const { rows: arN } = await q(`select count(*)::int as n from areas`);
  if (arN[0].n === 0) for (const name of SEED_AREAS) await q(`insert into areas (name) values ($1) on conflict (name) do nothing`, [name]);
  const { rows: empN } = await q(`select count(*)::int as n from employees`);
  if (empN[0].n === 0) for (const e of SEED_EMPLOYEES) await q(`insert into employees (code, name, department, position) values ($1,$2,$3,$4)`, [e.code, e.name, e.department, e.position]);

  // Seed example Proyek + Lokasi (once).
  const { rows: prjN } = await q(`select count(*)::int as n from projects`);
  if (prjN[0].n === 0) for (const p of SEED_PROJECTS) await q(`insert into projects (name, client, mode, area, notes) values ($1,$2,$3,$4,$5)`, [p.name, p.client, p.mode, p.area, p.notes]);
  const { rows: locN } = await q(`select count(*)::int as n from locations`);
  if (locN[0].n === 0) for (const l of SEED_LOCATIONS) await q(`insert into locations (name, type, client, area, address, pic, code) values ($1,$2,$3,$4,$5,$6,$7)`, [l.name, l.type, l.client, l.area, l.address, l.pic, l.code]);

  for (const [k, v] of Object.entries(SEED_SETTINGS)) {
    await q(`insert into settings (key, value) values ($1, $2) on conflict (key) do nothing`, [k, v]);
  }

  // One-time heuristic: tag existing dummy assets with owner + usage_type (consumables = stickers/banners).
  const { rows: p0 } = await q(`select 1 from settings where key='phase0_asset_backfill'`);
  if (!p0.length) {
    await q(
      `update assets set usage_type='Consumable', owner='Client'
       where name ilike '%stiker%' or name ilike '%sticker%' or name ilike '%banner%' or name ilike '%poster%' or name ilike '%spanduk%' or name ilike '%flyer%'`
    );
    await q(`insert into settings (key, value) values ('phase0_asset_backfill','done') on conflict (key) do nothing`);
  }

  // One-time: Fase 1 (Request/WO) & 2 (Produksi) removed from the flow — assets are added directly
  // in Master Data (born in Gudang/Fase 3). Bump any existing/seeded asset out of 1/2 into Gudang.
  const { rows: nrp } = await q(`select 1 from settings where key='flow_no_request_prod'`);
  if (!nrp.length) {
    await q(`update assets set current_stage=3, current_location='Gudang Utama Origin' where current_stage in (1,2)`);
    await q(`insert into settings (key, value) values ('flow_no_request_prod','done') on conflict (key) do nothing`);
  }

  // One-time: seed example client deployment-type tags (a client may run several patterns).
  const { rows: p0c } = await q(`select 1 from settings where key='phase0_client_backfill'`);
  if (!p0c.length) {
    await q(`update clients set deployment_types='{Event,Distribusi}', has_store_list=true  where name='AICE'`);
    await q(`update clients set deployment_types='{Distribusi}',       has_store_list=false where name='Garuda Food'`);
    await q(`insert into settings (key, value) values ('phase0_client_backfill','done') on conflict (key) do nothing`);
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
