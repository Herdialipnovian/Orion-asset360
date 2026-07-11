/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Server-Sent Events (SSE) hub for live CMS updates. Keeps an in-memory set of
 * open client streams and pushes events on any data change — so the CMS reflects
 * changes made elsewhere (mobile merchandiser, another operator) without a manual
 * refresh. Single-instance for now; swap the fan-out for Redis pub/sub when the
 * API scales horizontally (the call sites stay identical).
 */
import type { Response } from "express";

interface Client {
  id: number;
  userId: number;
  res: Response;
}

const clients = new Set<Client>();
let seq = 0;

export function addClient(userId: number, res: Response): Client {
  const c: Client = { id: ++seq, userId, res };
  clients.add(c);
  return c;
}

export function removeClient(c: Client): void {
  clients.delete(c);
}

export function clientCount(): number {
  return clients.size;
}

function write(c: Client, event: string, data: unknown): void {
  try {
    c.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    clients.delete(c);
  }
}

// Broadcast to every connected client (e.g. an asset changed — all operators care).
export function broadcastAll(event: string, data: unknown = {}): void {
  for (const c of clients) write(c, event, data);
}

// Send only to a specific user's streams (e.g. a notification meant for them).
export function broadcastUser(userId: number, event: string, data: unknown = {}): void {
  for (const c of clients) if (c.userId === userId) write(c, event, data);
}

// Shorthand: an asset (card / monitor / lifecycle) changed.
export function assetChanged(assetId?: string): void {
  broadcastAll("asset", { assetId: assetId ?? null, at: new Date().toISOString() });
}
