/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Field PWA API client. Talks to the SAME backend (/api/*) as the CMS, but keeps
 * its OWN token key so an operator's field session and an admin's CMS session on
 * the same origin don't clobber each other. Adds evidence upload + field-channel
 * stage transitions (idempotency + optimistic concurrency) on top of the shared API.
 */
import type { Asset, ActivityLog } from "../types";

export type Role = "Admin" | "Logistik" | "PIC" | "Merchandiser";
export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: Role;
  client?: string | null;
  area?: string | null;
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

const TOKEN_KEY = "asset360_field_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// API base. Empty = same-origin (web PWA). In the native APK the WebView runs at
// http://localhost, so it points at the operator's server (set at runtime on login).
const BASE_KEY = "field_api_base";
export function apiBase(): string {
  try {
    return (localStorage.getItem(BASE_KEY) || "").replace(/\/+$/, "");
  } catch {
    return "";
  }
}
export function setApiBase(v: string) {
  localStorage.setItem(BASE_KEY, (v || "").trim().replace(/\/+$/, ""));
}
export function isNative(): boolean {
  const cap = (window as any).Capacitor;
  return !!(cap && (typeof cap.isNativePlatform === "function" ? cap.isNativePlatform() : cap.isNative));
}

export interface EvidenceView {
  id: string;
  assetId: string;
  stage: number | null;
  slot: string | null;
  mime: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
  gps: { lat: number; lng: number } | null;
  capturedAt: string | null;
  operator: string | null;
  note: string | null;
  createdAt: string;
  url: string;
  thumbUrl: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.code = data?.code;
    this.data = data;
  }
}

async function req(path: string, opts: RequestInit = {}): Promise<any> {
  const token = getToken();
  const res = await fetch(`${apiBase()}/api${path}`, {
    ...opts,
    cache: "no-store", // always read live data (never a stale cached /api response)
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
  if (!res.ok) throw new ApiError(body?.error || `HTTP ${res.status}`, res.status, body);
  return body;
}

export interface TransitionMeta {
  logAction?: string;
  operator?: string;
  channel?: "field";
  baseUpdatedAt?: string;
  maintenanceStatus?: string;
  auditScore?: number;
  force?: boolean;
}

export const fieldApi = {
  async login(username: string, password: string): Promise<{ token: string; user: AuthUser }> {
    const r = await req("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
    setToken(r.token);
    return r;
  },
  async me(): Promise<AuthUser> {
    return (await req("/auth/me")).user;
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
  // Evidence for one asset (optionally scoped to a stage).
  async listEvidence(assetId: string, stage?: number): Promise<EvidenceView[]> {
    const qs = stage != null ? `?stage=${stage}` : "";
    return (await req(`/assets/${encodeURIComponent(assetId)}/evidence${qs}`)).evidence;
  },
  // Upload N photos for one slot. `files` are Blobs/Files. Returns stored views.
  async uploadEvidence(
    assetId: string,
    slot: string,
    stage: number,
    files: Blob[],
    extra: { gpsLat?: number; gpsLng?: number; capturedAt?: string; note?: string; idempotencyKey?: string } = {}
  ): Promise<EvidenceView[]> {
    const fd = new FormData();
    fd.append("slot", slot);
    fd.append("stage", String(stage));
    if (extra.gpsLat != null) fd.append("gpsLat", String(extra.gpsLat));
    if (extra.gpsLng != null) fd.append("gpsLng", String(extra.gpsLng));
    if (extra.capturedAt) fd.append("capturedAt", extra.capturedAt);
    if (extra.note) fd.append("note", extra.note);
    files.forEach((f, i) => fd.append("files", f, (f as File).name || `photo_${i}.jpg`));
    const token = getToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    if (extra.idempotencyKey) headers["Idempotency-Key"] = extra.idempotencyKey;
    const res = await fetch(`${apiBase()}/api/assets/${encodeURIComponent(assetId)}/evidence`, { method: "POST", headers, body: fd });
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* no-op */
    }
    if (!res.ok) throw new ApiError(body?.error || `HTTP ${res.status}`, res.status, body);
    return body.evidence;
  },
  // Advance/branch stage through the field channel (server enforces evidence gate).
  async transition(
    assetId: string,
    nextStage: number,
    updatedDetails: any,
    meta: TransitionMeta,
    idempotencyKey?: string
  ): Promise<{ asset: Asset; log: ActivityLog }> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return req(`/assets/${encodeURIComponent(assetId)}/stage`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ nextStage, updatedDetails, meta: { channel: "field", ...meta } })
    });
  },
  // Merchandiser reports install progress for THEIR portion (Fase 6). Incremental
  // (doneQty), signature optional; before/after photos (fresh) must already be uploaded.
  // Idempotency-Key makes offline replay safe.
  async completeInstall(
    assetId: string,
    body: { doneQty?: number; signatureBase64?: string; note?: string },
    idempotencyKey?: string
  ): Promise<{ asset: Asset; installedQty: number; fullyInstalled: boolean }> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return req(`/assets/${encodeURIComponent(assetId)}/install/complete`, { method: "POST", headers, body: JSON.stringify(body) });
  },
  // Merchandiser reports a Distribusi placement at THEIR assigned toko (doneQty + GPS,
  // signature optional; before/after photos uploaded separately). Idempotency-Key makes
  // offline replay safe.
  async placeAtToko(
    assetId: string,
    body: { locationId: number; doneQty?: number; gpsLat?: number; gpsLng?: number; signatureBase64?: string; note?: string },
    idempotencyKey?: string
  ): Promise<{ asset: Asset; installedQty: number; fullyInstalled: boolean }> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return req(`/assets/${encodeURIComponent(assetId)}/place`, { method: "POST", headers, body: JSON.stringify(body) });
  },
  // PIC assigns / re-assigns install portions (online-only for now).
  async assignInstall(assetId: string, body: { assignments: { merchandiserId: number; qty: number }[]; baseUpdatedAt?: string }): Promise<any> {
    return req(`/assets/${encodeURIComponent(assetId)}/install/assign`, { method: "POST", body: JSON.stringify(body) });
  },
  // Merchandisers of a client (assign dropdown source).
  async usersDirectory(role: "PIC" | "Merchandiser", client?: string): Promise<{ id: number; name: string; client: string | null }[]> {
    return req(`/users/directory?role=${encodeURIComponent(role)}${client ? `&client=${encodeURIComponent(client)}` : ""}`);
  },
  // Locations (Venue / Toko / Internal) — dropdown source for the mobile venue-leg flow.
  async locations(params: { type?: string; client?: string } = {}): Promise<{ id: number; name: string; area: string | null }[]> {
    const qs = new URLSearchParams(params as any).toString();
    return req(`/locations${qs ? "?" + qs : ""}`);
  },
  // Master toko fleksibel — field staff add a Toko/Venue on the spot (GPS auto-filled).
  async addLocation(body: { name: string; type?: "Toko" | "Venue"; client?: string; area?: string; address?: string; gpsLat?: number; gpsLng?: number }): Promise<{ id: number; name: string; type: string; area: string | null }> {
    return req(`/locations`, { method: "POST", body: JSON.stringify(body) });
  },
  // PIC sets up / relocates a venue leg (Fase 2 Event roadshow) from the field (online-only).
  async deployVenue(assetId: string, body: { locationId: number; pic?: string; setupDate?: string; note?: string; signatureBase64?: string }): Promise<{ asset: Asset }> {
    return req(`/assets/${encodeURIComponent(assetId)}/deploy-venue`, { method: "POST", body: JSON.stringify(body) });
  },
  // In-app notifications.
  async notifications(): Promise<{ items: NotifItem[]; unread: number }> {
    return req("/notifications");
  },
  async markNotifRead(id: number): Promise<{ unread: number }> {
    return req(`/notifications/${id}/read`, { method: "POST" });
  },
  async markAllNotifsRead(): Promise<{ unread: number }> {
    return req("/notifications/read-all", { method: "POST" });
  }
};

// Build a token-bearing URL for <img>/<a> (image requests can't set headers).
export function evidenceSrc(idOrUrl: string, thumb = false): string {
  const token = getToken() || "";
  const path = idOrUrl.startsWith("/api/") ? idOrUrl : `/api/evidence/${idOrUrl}${thumb ? "/thumb" : ""}`;
  const base = `${apiBase()}${path}`;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}
