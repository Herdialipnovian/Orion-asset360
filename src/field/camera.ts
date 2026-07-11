/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Camera + evidence pipeline (client side): live capture only (no gallery),
 * burn-in watermark (Asset ID / operator / time / GPS), and on-device compress
 * so field uploads stay small on weak signal.
 */

export interface CaptureMeta {
  gpsLat: number | null;
  gpsLng: number | null;
  capturedAt: string;
}

export interface Captured {
  blob: Blob;
  url: string; // object URL for preview
  meta: CaptureMeta;
}

export async function openCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false
  });
}

// Best-effort geolocation; resolves null on denial/timeout so capture never blocks.
export function getGeo(timeoutMs = 4000): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!("geolocation" in navigator)) return resolve(null);
    let done = false;
    const finish = (v: { lat: number; lng: number } | null) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      p => {
        clearTimeout(timer);
        finish({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        finish(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15000 }
    );
  });
}

// Grab the current video frame into a canvas, downscaling the long edge.
export function frameToCanvas(video: HTMLVideoElement, maxEdge = 1600): HTMLCanvasElement {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const scale = Math.min(1, maxEdge / Math.max(vw, vh));
  const w = Math.max(1, Math.round(vw * scale));
  const h = Math.max(1, Math.round(vh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(video, 0, 0, w, h);
  return canvas;
}

// Burn a legible, tamper-evident caption onto the bottom of the frame.
export function watermark(canvas: HTMLCanvasElement, lines: string[]): void {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  const pad = Math.round(W * 0.025);
  const fontSize = Math.max(13, Math.round(W * 0.028));
  const lh = Math.round(fontSize * 1.35);
  const boxH = lines.length * lh + pad * 1.4;
  ctx.save();
  // dark gradient scrim for contrast in any lighting
  const grad = ctx.createLinearGradient(0, H - boxH * 1.6, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.62)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, H - boxH * 1.6, W, boxH * 1.6);
  // accent tick (ORIGIN yellow)
  ctx.fillStyle = "#FFCD00";
  ctx.fillRect(pad, H - boxH, Math.round(W * 0.012), lines.length * lh);
  ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 3;
  lines.forEach((ln, i) => {
    ctx.fillStyle = i === 0 ? "#ffffff" : "rgba(255,255,255,0.9)";
    ctx.fillText(ln, pad + Math.round(W * 0.032), H - boxH + i * lh);
  });
  ctx.restore();
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Gagal encode foto."))), "image/jpeg", quality);
  });
}

export function fmtGps(g: { lat: number; lng: number } | null): string {
  return g ? `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}` : "GPS tidak tersedia";
}

export function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}
