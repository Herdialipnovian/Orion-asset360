/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * In-app notifications (poll-based; no web-push). Merchandisers are notified when
 * assigned an install task; the client's PIC(s) are notified as portions get done.
 * All generators are best-effort — a notify failure must never roll back the
 * transition/completion that triggered it (callers wrap in try/catch).
 */
import { q } from "./db";
import { broadcastUser } from "./sse";

export interface NotifRow {
  id: number;
  userId: number;
  type: string;
  title: string;
  body: string | null;
  assetId: string | null;
  read: boolean;
  createdAt: string;
}

function rowToNotif(r: any): NotifRow {
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    type: r.type,
    title: r.title,
    body: r.body,
    assetId: r.asset_id,
    read: r.read,
    createdAt: new Date(r.created_at).toISOString()
  };
}

export async function insertNotification(n: { userId: number; type: string; title: string; body?: string; assetId?: string }): Promise<void> {
  await q(
    `insert into notifications (user_id, type, title, body, asset_id) values ($1,$2,$3,$4,$5)`,
    [n.userId, n.type, n.title, n.body ?? null, n.assetId ?? null]
  );
  // Push to the recipient's live streams so their bell updates instantly.
  broadcastUser(n.userId, "notif", { at: new Date().toISOString() });
}

export async function listNotifications(userId: number, limit = 30): Promise<NotifRow[]> {
  const { rows } = await q(`select * from notifications where user_id=$1 order by created_at desc limit $2`, [userId, limit]);
  return rows.map(rowToNotif);
}

export async function unreadCount(userId: number): Promise<number> {
  const { rows } = await q(`select count(*)::int as c from notifications where user_id=$1 and read=false`, [userId]);
  return rows[0]?.c || 0;
}

// Scoped to the owner so a user can only mark THEIR OWN notifications read.
export async function markRead(id: number, userId: number): Promise<boolean> {
  const { rowCount } = await q(`update notifications set read=true where id=$1 and user_id=$2`, [id, userId]);
  return (rowCount || 0) > 0;
}

export async function markAllRead(userId: number): Promise<void> {
  await q(`update notifications set read=true where user_id=$1 and read=false`, [userId]);
}

export async function getClientPICs(client: string | null | undefined): Promise<number[]> {
  if (!client) return [];
  const { rows } = await q(`select id from users where role='PIC' and client=$1`, [client]);
  return rows.map((r: any) => Number(r.id));
}

// Notify each NEWLY-added merchandiser (diff-by-id done by the caller).
export async function notifyNewAssignments(
  newRows: { merchandiserId: number; qty: number }[],
  asset: { id: string; name: string }
): Promise<void> {
  try {
    for (const r of newRows) {
      await insertNotification({
        userId: r.merchandiserId,
        type: "install_assigned",
        title: "Tugas pemasangan baru",
        body: `Kamu ditugaskan memasang ${r.qty} unit "${asset.name}".`,
        assetId: asset.id
      });
    }
  } catch {
    /* best-effort */
  }
}

// Notify the asset's client PIC(s) that a portion was installed.
export async function notifyInstallCompleted(
  asset: { id: string; name: string; client: string; quantity: number },
  merchandiser: string,
  applied: number,
  installedQty: number,
  fullyInstalled: boolean
): Promise<void> {
  try {
    const pics = await getClientPICs(asset.client);
    for (const uid of pics) {
      await insertNotification({
        userId: uid,
        type: "install_progress",
        title: fullyInstalled ? "Pemasangan selesai penuh" : "Progres pemasangan",
        body: `${merchandiser} memasang ${applied} unit "${asset.name}" (${installedQty}/${asset.quantity} terpasang)${fullyInstalled ? " — PENUH" : ""}.`,
        assetId: asset.id
      });
    }
  } catch {
    /* best-effort */
  }
}
