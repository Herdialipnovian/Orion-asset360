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
}

export interface UserRow {
  id: number;
  username: string;
  name: string;
  role: string;
  client?: string | null;
  created_at: string;
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
  reset(): Promise<{ ok: boolean; assets: Asset[]; logs: ActivityLog[] }> {
    return req("/reset", { method: "POST" });
  },
  getUsers(): Promise<UserRow[]> {
    return req("/users");
  },
  createUser(p: { username: string; name: string; role: string; password: string; client?: string }): Promise<UserRow> {
    return req("/users", { method: "POST", body: JSON.stringify(p) });
  },
  updateUser(id: number, p: { name?: string; role?: string; password?: string; client?: string }): Promise<UserRow> {
    return req(`/users/${id}`, { method: "PATCH", body: JSON.stringify(p) });
  },
  // Directory of PIC / Merchandiser for a client (dropdown sources).
  usersDirectory(role: "PIC" | "Merchandiser", client?: string): Promise<{ id: number; name: string; client: string | null }[]> {
    return req(`/users/directory?role=${encodeURIComponent(role)}${client ? `&client=${encodeURIComponent(client)}` : ""}`);
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
