/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Thin API client for the ORIGIN Asset360 backend. Handles the JWT token and
 * always talks to /api/* (Vite proxies that to the Express server in dev).
 */
import type { Asset, ActivityLog } from "./types";

const TOKEN_KEY = "asset360_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: string;
  client?: string | null;
  area?: string | null;
}

export interface UserRow {
  id: number;
  username: string;
  name: string;
  role: string;
  client?: string | null;
  area?: string | null;
  created_at: string;
}

export interface Employee {
  id: number;
  code: string | null;
  name: string;
  department: string | null;
  position: string | null;
  active: boolean;
}

export type DeploymentType = "Internal" | "Event" | "Distribusi";
export interface Client {
  id: number;
  name: string;
  deploymentTypes: DeploymentType[];
  hasStoreList: boolean;
}

export type ProjectMode = "Internal" | "Event" | "Distribusi";
export interface Project {
  id: number;
  name: string;
  client: string | null;
  mode: ProjectMode;
  status: "active" | "done";
  area: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  assetCount?: number;
}
export type LocationType = "Venue" | "Toko" | "Internal";
export interface Loc {
  id: number;
  name: string;
  type: LocationType;
  client: string | null;
  area: string | null;
  address: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  pic: string | null;
  code: string | null;
  source: "list" | "field";
  active: boolean;
}

export interface NotifItem {
  id: number;
  type: string;
  title: string;
  body: string | null;
  assetId: string | null;
  read: boolean;
  createdAt: string;
}

export interface MasterItem {
  id: number;
  name: string;
}
export type MasterKind = "categories" | "clients";

export interface EvidenceView {
  id: string;
  assetId: string;
  stage: number | null;
  slot: string | null;
  gps: { lat: number; lng: number } | null;
  capturedAt: string | null;
  operator: string | null;
  createdAt: string;
  url: string;
  thumbUrl: string;
}
// Token-bearing evidence URL for <img> (image requests can't send an Authorization header).
export function evidenceThumb(id: string): string {
  return `/api/evidence/${encodeURIComponent(id)}/thumb?token=${encodeURIComponent(getToken() || "")}`;
}

async function req(path: string, opts: RequestInit = {}): Promise<any> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {})
    }
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* no-op */
  }
  if (!res.ok) {
    const err: any = new Error(body?.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

export const api = {
  async login(username: string, password: string): Promise<{ token: string; user: AuthUser }> {
    const r = await req("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
    setToken(r.token);
    return r;
  },
  async me(): Promise<AuthUser> {
    const r = await req("/auth/me");
    return r.user;
  },
  logout() {
    clearToken();
  },
  getAssets(): Promise<Asset[]> {
    return req("/assets");
  },
  getActivity(): Promise<ActivityLog[]> {
    return req("/activity");
  },
  createAsset(a: Asset): Promise<{ asset: Asset; log: ActivityLog }> {
    return req("/assets", { method: "POST", body: JSON.stringify(a) });
  },
  updateStage(id: string, nextStage: number, updatedDetails: any, meta?: any): Promise<{ asset: Asset; log: ActivityLog }> {
    return req(`/assets/${encodeURIComponent(id)}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ nextStage, updatedDetails, meta })
    });
  },
  // Issue Surat Jalan (Fase 4). Server splits the asset when shipping a partial qty.
  shipAsset(id: string, updatedDetails: any, meta?: any): Promise<any> {
    return req(`/assets/${encodeURIComponent(id)}/ship`, {
      method: "POST",
      body: JSON.stringify({ updatedDetails, meta })
    });
  },
  // Consolidated dispatch: many assets → one Surat Jalan / driver / destination (qty per asset).
  batchShip(p: {
    items: { id: string; qty: number }[];
    suratJalanNo?: string; driverName: string; vehiclePlate?: string; vendorShipping?: string; departureTime?: string;
    area: string; picPenerima?: string; courier?: string; trackingUrl?: string; trackingNo?: string; eta?: string;
  }): Promise<{ ok: boolean; suratJalanNo: string; count: number; assets: Asset[] }> {
    return req(`/assets/batch-ship`, { method: "POST", body: JSON.stringify(p) });
  },
  // Move ALL members of a shipment group (same batchId) at one stage to the next, together.
  groupAdvance(p: { batchId: string; fromStage: number; toStage: number; stageKey?: string; section?: any; meta?: { logAction?: string; operator?: string } }): Promise<{ ok: boolean; count: number; assets: Asset[] }> {
    return req(`/assets/group-advance`, { method: "POST", body: JSON.stringify(p) });
  },
  reset(): Promise<{ ok: boolean; assets: Asset[]; logs: ActivityLog[] }> {
    return req("/reset", { method: "POST" });
  },
  // Data mode (demo vs production) + destructive wipe — Admin only.
  dbStatus(): Promise<{ seedMode: "demo" | "production"; assets: number; activity: number }> {
    return req("/db/status");
  },
  setDbMode(mode: "demo" | "production"): Promise<{ seedMode: "demo" | "production"; assets: number; activity: number }> {
    return req("/db/mode", { method: "POST", body: JSON.stringify({ mode }) });
  },
  wipeData(confirm: string): Promise<{ ok: boolean; seedMode: "demo" | "production"; assets: number; activity: number }> {
    return req("/db/wipe", { method: "POST", body: JSON.stringify({ confirm }) });
  },
  getUsers(): Promise<UserRow[]> {
    return req("/users");
  },
  createUser(p: { username: string; name: string; role: string; password: string; client?: string; area?: string }): Promise<UserRow> {
    return req("/users", { method: "POST", body: JSON.stringify(p) });
  },
  updateUser(id: number, p: { name?: string; role?: string; password?: string; client?: string; area?: string }): Promise<UserRow> {
    return req(`/users/${id}`, { method: "PATCH", body: JSON.stringify(p) });
  },
  // Areas master (geographic zones for user scoping / distribution).
  getAreas(): Promise<MasterItem[]> {
    return req("/areas");
  },
  createArea(name: string): Promise<MasterItem> {
    return req("/areas", { method: "POST", body: JSON.stringify({ name }) });
  },
  updateArea(id: number, name: string): Promise<MasterItem> {
    return req(`/areas/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
  },
  deleteArea(id: number): Promise<{ ok: boolean; id: number }> {
    return req(`/areas/${id}`, { method: "DELETE" });
  },
  // Employees / Karyawan master (internal-asset custodians).
  getEmployees(): Promise<Employee[]> {
    return req("/employees");
  },
  createEmployee(p: { code?: string; name: string; department?: string; position?: string }): Promise<Employee> {
    return req("/employees", { method: "POST", body: JSON.stringify(p) });
  },
  updateEmployee(id: number, p: { code?: string; name?: string; department?: string; position?: string; active?: boolean }): Promise<Employee> {
    return req(`/employees/${id}`, { method: "PATCH", body: JSON.stringify(p) });
  },
  deleteEmployee(id: number): Promise<{ ok: boolean; id: number }> {
    return req(`/employees/${id}`, { method: "DELETE" });
  },
  // Clients (rich): name + deployment-type tags + store-list flag.
  getClients(): Promise<Client[]> {
    return req("/clients");
  },
  createClient(p: { name: string; deploymentTypes?: DeploymentType[]; hasStoreList?: boolean }): Promise<Client> {
    return req("/clients", { method: "POST", body: JSON.stringify(p) });
  },
  updateClient(id: number, p: { name?: string; deploymentTypes?: DeploymentType[]; hasStoreList?: boolean }): Promise<Client> {
    return req(`/clients/${id}`, { method: "PATCH", body: JSON.stringify(p) });
  },
  deleteClient(id: number): Promise<{ ok: boolean; id: number }> {
    return req(`/clients/${id}`, { method: "DELETE" });
  },
  // Projects (Proyek/Campaign) — deployment container + mode.
  getProjects(filter?: { client?: string; mode?: ProjectMode }): Promise<Project[]> {
    const qs = new URLSearchParams(filter as any).toString();
    return req(`/projects${qs ? "?" + qs : ""}`);
  },
  createProject(p: Partial<Project> & { name: string }): Promise<Project> {
    return req("/projects", { method: "POST", body: JSON.stringify(p) });
  },
  updateProject(id: number, p: Partial<Project>): Promise<Project> {
    return req(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(p) });
  },
  deleteProject(id: number): Promise<{ ok: boolean; id: number }> {
    return req(`/projects/${id}`, { method: "DELETE" });
  },
  // Locations (Venue / Toko / Internal target).
  getLocations(filter?: { client?: string; type?: LocationType; area?: string }): Promise<Loc[]> {
    const qs = new URLSearchParams(filter as any).toString();
    return req(`/locations${qs ? "?" + qs : ""}`);
  },
  createLocation(p: Partial<Loc> & { name: string }): Promise<Loc> {
    return req("/locations", { method: "POST", body: JSON.stringify(p) });
  },
  updateLocation(id: number, p: Partial<Loc>): Promise<Loc> {
    return req(`/locations/${id}`, { method: "PATCH", body: JSON.stringify(p) });
  },
  deleteLocation(id: number): Promise<{ ok: boolean; id: number }> {
    return req(`/locations/${id}`, { method: "DELETE" });
  },
  // Assign / clear an asset's current deployment project.
  setAssetProject(id: string, projectId: number | null): Promise<{ ok: boolean; id: string; projectId: number | null }> {
    return req(`/assets/${encodeURIComponent(id)}/project`, { method: "POST", body: JSON.stringify({ projectId }) });
  },
  // Fase 1 Internal: serah-terima aset Origin ke Karyawan (custodian) — moves asset to Fase 6.
  handoverInternal(id: string, p: { custodianId: number; handoverDate?: string; signatureBase64?: string; note?: string; projectId?: number | null }): Promise<{ asset: Asset }> {
    return req(`/assets/${encodeURIComponent(id)}/handover`, { method: "POST", body: JSON.stringify(p) });
  },
  // Internal stock-opname (record only, no stage change) + return-to-Gudang.
  opnameInternal(id: string, p: { condition: string; note?: string; date?: string }): Promise<{ asset: Asset }> {
    return req(`/assets/${encodeURIComponent(id)}/opname`, { method: "POST", body: JSON.stringify(p) });
  },
  returnInternal(id: string): Promise<{ asset: Asset }> {
    return req(`/assets/${encodeURIComponent(id)}/return-internal`, { method: "POST", body: JSON.stringify({}) });
  },
  // Fase 2 Event: SHIP the asset to a venue leg (transit); call again to relocate to the next venue.
  // Carries courier tracking (like Fase 5). arriveVenue() then confirms it landed (transit→active).
  deployVenue(id: string, p: { locationId: number; pic?: string; setupDate?: string; note?: string; signatureBase64?: string; projectId?: number | null; suratJalanNo?: string; courier?: string; trackingUrl?: string; trackingNo?: string; eta?: string }): Promise<{ asset: Asset }> {
    return req(`/assets/${encodeURIComponent(id)}/deploy-venue`, { method: "POST", body: JSON.stringify(p) });
  },
  arriveVenue(id: string): Promise<{ asset: Asset }> {
    return req(`/assets/${encodeURIComponent(id)}/arrive-venue`, { method: "POST", body: JSON.stringify({}) });
  },
  // End of roadshow: ship back to warehouse (tracked) then confirm arrival (→ Fase 3 Gudang).
  shipReturn(id: string, p: { suratJalanNo?: string; courier?: string; trackingUrl?: string; trackingNo?: string; eta?: string }): Promise<{ asset: Asset }> {
    return req(`/assets/${encodeURIComponent(id)}/ship-return`, { method: "POST", body: JSON.stringify(p) });
  },
  arriveWarehouse(id: string, p?: { warehouse?: string }): Promise<{ asset: Asset }> {
    return req(`/assets/${encodeURIComponent(id)}/arrive-warehouse`, { method: "POST", body: JSON.stringify(p || {}) });
  },
  // Fase 3 Distribusi: fan-out placement per toko / report a placement / sampling audit.
  distribute(id: string, p: { placements: { locationId: number; merchandiserId?: number; qty: number }[]; projectId?: number | null }): Promise<{ asset: Asset }> {
    return req(`/assets/${encodeURIComponent(id)}/distribute`, { method: "POST", body: JSON.stringify(p) });
  },
  placeAtToko(id: string, p: { locationId: number; doneQty?: number; gpsLat?: number; gpsLng?: number; signatureBase64?: string; note?: string }): Promise<{ asset: Asset; installedQty: number; fullyInstalled: boolean }> {
    return req(`/assets/${encodeURIComponent(id)}/place`, { method: "POST", body: JSON.stringify(p) });
  },
  // Confirm an Event/Standard install portion done (Admin/PIC from the CMS, on behalf of a Merchandiser).
  completeInstall(id: string, p: { merchandiserId: number; doneQty?: number; note?: string }): Promise<{ asset: Asset; installedQty: number; fullyInstalled: boolean }> {
    return req(`/assets/${encodeURIComponent(id)}/install/complete`, { method: "POST", body: JSON.stringify(p) });
  },
  // Apply a location-chain action to a WHOLE shipment group at once (one Surat Jalan).
  groupVenue(p: { batchId: string; op: "deploy" | "arrive-venue" | "ship-return" | "arrive-warehouse"; locationId?: number; pic?: string; suratJalanNo?: string; courier?: string; trackingUrl?: string; trackingNo?: string; eta?: string; setupDate?: string }): Promise<{ ok: boolean; count: number; skipped: number; suratJalanNo?: string; assets: Asset[] }> {
    return req(`/assets/group-venue`, { method: "POST", body: JSON.stringify(p) });
  },
  auditSample(id: string, samples: { locationId: number; compliant: boolean }[], meta?: { method?: "manual" | "auto"; samplePct?: number }): Promise<{ asset: Asset; coverage: any }> {
    return req(`/assets/${encodeURIComponent(id)}/audit-sample`, { method: "POST", body: JSON.stringify({ samples, ...(meta || {}) }) });
  },
  // Utilisasi & riwayat deploy per aset (dari activity-log penuh).
  getUtilization(): Promise<{ assetId: string; deployments: number; movements: number; lastActiveAt: string | null }[]> {
    return req("/analytics/utilization");
  },
  // Evidence for one asset (client report photos).
  async getEvidence(assetId: string): Promise<EvidenceView[]> {
    return (await req(`/assets/${encodeURIComponent(assetId)}/evidence`)).evidence;
  },
  // Directory of PIC / Merchandiser for a client (dropdown sources). Optional area filter (MD lock).
  usersDirectory(role: "PIC" | "Merchandiser", client?: string, area?: string): Promise<{ id: number; name: string; client: string | null; area: string | null }[]> {
    return req(`/users/directory?role=${encodeURIComponent(role)}${client ? `&client=${encodeURIComponent(client)}` : ""}${area ? `&area=${encodeURIComponent(area)}` : ""}`);
  },
  // Assign / re-assign Merchandiser install portions (Fase 6, in-place, server-merged).
  assignInstall(id: string, p: { assignments: { merchandiserId: number; qty: number }[]; baseUpdatedAt?: string; operator?: string }): Promise<any> {
    return req(`/assets/${encodeURIComponent(id)}/install/assign`, { method: "POST", body: JSON.stringify(p) });
  },
  // In-app notifications (poll-based).
  getNotifications(): Promise<{ items: NotifItem[]; unread: number }> {
    return req("/notifications");
  },
  markNotificationRead(id: number): Promise<{ ok: boolean; unread: number }> {
    return req(`/notifications/${id}/read`, { method: "POST" });
  },
  markAllNotificationsRead(): Promise<{ ok: boolean; unread: number }> {
    return req("/notifications/read-all", { method: "POST" });
  },
  deleteUser(id: number): Promise<{ ok: boolean; id: number }> {
    return req(`/users/${id}`, { method: "DELETE" });
  },
  getMaster(kind: MasterKind): Promise<MasterItem[]> {
    return req(`/master/${kind}`);
  },
  createMaster(kind: MasterKind, name: string): Promise<MasterItem> {
    return req(`/master/${kind}`, { method: "POST", body: JSON.stringify({ name }) });
  },
  updateMaster(kind: MasterKind, id: number, name: string): Promise<MasterItem> {
    return req(`/master/${kind}/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
  },
  deleteMaster(kind: MasterKind, id: number): Promise<{ ok: boolean; id: number }> {
    return req(`/master/${kind}/${id}`, { method: "DELETE" });
  },
  getSettings(): Promise<Record<string, string>> {
    return req("/settings");
  },
  updateSettings(patch: Record<string, string>): Promise<Record<string, string>> {
    return req("/settings", { method: "PUT", body: JSON.stringify(patch) });
  },
  importMaster(mode: "replace" | "append", categories: string[], clients: string[]): Promise<any> {
    return req("/master/import", { method: "POST", body: JSON.stringify({ mode, categories, clients }) });
  },
  updateAsset(id: string, patch: Record<string, any>): Promise<{ asset: Asset }> {
    return req(`/assets/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  deleteAsset(id: string): Promise<{ ok: boolean; id: string }> {
    return req(`/assets/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  importAssets(mode: "append" | "replace", rows: any[]): Promise<any> {
    return req("/assets/import", { method: "POST", body: JSON.stringify({ mode, rows }) });
  }
};
