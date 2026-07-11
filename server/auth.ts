/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Auth: bcrypt password hashing, JWT issue/verify, and role-based middleware.
 */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const SECRET: string = process.env.JWT_SECRET || "dev-secret-change-me";

export type Role = "Admin" | "Logistik" | "PIC" | "Merchandiser";
export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: Role;
  client?: string | null; // set for PIC / Merchandiser (client-scoped); null for Admin / Logistik
}
export interface AuthedReq extends Request {
  user?: AuthUser;
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const verifyPassword = (p: string, hash: string) => bcrypt.compare(p, hash);

export const signToken = (u: AuthUser) =>
  jwt.sign({ sub: String(u.id), username: u.username, name: u.name, role: u.role, client: u.client ?? null }, SECRET, { expiresIn: "12h" });

export function requireAuth(req: AuthedReq, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Token tidak ada." });
  try {
    const p = jwt.verify(token, SECRET) as any;
    req.user = { id: Number(p.sub), username: p.username, name: p.name, role: p.role, client: p.client ?? null };
    next();
  } catch {
    return res.status(401).json({ error: "Sesi tidak valid / kedaluwarsa. Silakan login ulang." });
  }
}

// Like requireAuth, but also accepts the JWT via ?token= query param.
// Used ONLY for evidence file reads, so <img src="/api/evidence/ID?token=..."> works
// (image/media requests can't carry an Authorization header).
export function requireAuthFlexible(req: AuthedReq, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : (req.query?.token as string) || null;
  if (!token) return res.status(401).json({ error: "Token tidak ada." });
  try {
    const p = jwt.verify(token, SECRET) as any;
    req.user = { id: Number(p.sub), username: p.username, name: p.name, role: p.role, client: p.client ?? null };
    next();
  } catch {
    return res.status(401).json({ error: "Sesi tidak valid / kedaluwarsa." });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedReq, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized." });
    if (req.user.role === "Admin" || roles.includes(req.user.role)) return next();
    return res.status(403).json({ error: `Akses ditolak. Dibutuhkan role: ${roles.join(" / ")}.` });
  };
}

// Which role may move an asset INTO a given stage (Admin always allowed).
export const STAGE_ROLE: { [k: number]: Role[] } = {
  2: ["Logistik"],
  3: ["Logistik"],
  4: ["Logistik"],
  5: ["Logistik"],
  6: ["Logistik", "Merchandiser", "PIC"], // pemasangan (Merchandiser) + POD receipt (PIC) + redeploy (Logistik)
  7: ["PIC"], // audit & kepatuhan
  8: ["Merchandiser"], // maintenance
  9: ["Logistik", "PIC"], // penarikan / relokasi
  10: [] // Admin only
};
