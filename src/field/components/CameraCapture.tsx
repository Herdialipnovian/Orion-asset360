/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Full-screen, capture-only camera. No gallery / file picker — the only way to
 * add a photo is to take one live, which is the anti-fraud point. Each shot is
 * watermarked (Asset ID / operator / time / GPS) and compressed before it leaves.
 */
import React from "react";
import { X, Camera, RotateCcw, Check, Loader2, CameraOff } from "lucide-react";
import { openCamera, getGeo, frameToCanvas, watermark, canvasToBlob, fmtGps, fmtTime, type Captured } from "../camera";

export default function CameraCapture({
  assetId,
  operator,
  slotLabel,
  onDone,
  onCancel
}: {
  assetId: string;
  operator: string;
  slotLabel: string;
  onDone: (c: Captured) => void;
  onCancel: () => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [state, setState] = React.useState<"starting" | "live" | "busy" | "review" | "error">("starting");
  const [shot, setShot] = React.useState<Captured | null>(null);

  const stop = React.useCallback(() => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startLive = React.useCallback(async () => {
    setState("starting");
    try {
      const stream = await openCamera();
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setState("live");
    } catch {
      setState("error");
    }
  }, []);

  React.useEffect(() => {
    startLive();
    return stop;
  }, [startLive, stop]);

  async function capture() {
    if (!videoRef.current) return;
    setState("busy");
    const capturedAt = new Date().toISOString();
    const canvas = frameToCanvas(videoRef.current); // freeze frame first
    const geo = await getGeo();
    watermark(canvas, [
      `${assetId} · ${slotLabel}`,
      fmtTime(capturedAt),
      `${fmtGps(geo)} · ${operator}`
    ]);
    const blob = await canvasToBlob(canvas);
    const url = URL.createObjectURL(blob);
    setShot({ blob, url, meta: { gpsLat: geo?.lat ?? null, gpsLng: geo?.lng ?? null, capturedAt } });
    stop();
    setState("review");
  }

  function retake() {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    startLive();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <button onClick={() => { stop(); onCancel(); }} aria-label="Tutup kamera" className="tap flex w-11 items-center justify-center rounded-full bg-white/10 active:scale-95">
          <X className="h-5 w-5" />
        </button>
        <div className="text-center text-sm font-semibold">{slotLabel}</div>
        <div className="w-11" />
      </div>

      <div className="relative flex-1 overflow-hidden">
        {state !== "review" && <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />}
        {shot && state === "review" && <img src={shot.url} alt="Pratinjau foto" className="h-full w-full object-contain" />}

        {(state === "starting" || state === "busy") && (
          <div className="absolute inset-0 grid place-items-center bg-black/40 text-white">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-7 w-7 animate-spin" />
              <span className="text-sm">{state === "busy" ? "Memproses foto…" : "Menyiapkan kamera…"}</span>
            </div>
          </div>
        )}
        {state === "error" && (
          <div className="absolute inset-0 grid place-items-center px-8 text-center text-white">
            <div className="flex flex-col items-center gap-3">
              <CameraOff className="h-9 w-9 text-slate-400" />
              <p className="text-sm text-slate-300">Kamera tidak dapat diakses. Aktifkan izin kamera, lalu coba lagi.</p>
              <button onClick={startLive} className="tap rounded-xl bg-white/15 px-5 font-semibold">Coba Lagi</button>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-8 px-6 py-6">
        {state === "review" && shot ? (
          <>
            <button onClick={retake} className="tap flex flex-col items-center gap-1 text-white/90">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-white/10"><RotateCcw className="h-6 w-6" /></span>
              <span className="text-xs">Ulangi</span>
            </button>
            <button
              onClick={() => onDone(shot)}
              className="tap flex flex-col items-center gap-1 text-white"
            >
              <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500 active:scale-95"><Check className="h-7 w-7" /></span>
              <span className="text-xs font-semibold">Gunakan</span>
            </button>
          </>
        ) : (
          <button
            onClick={capture}
            disabled={state !== "live"}
            aria-label="Ambil foto"
            className="tap grid h-20 w-20 place-items-center rounded-full border-4 border-white/70 bg-white/10 active:scale-95 disabled:opacity-40"
          >
            <Camera className="h-8 w-8 text-white" />
          </button>
        )}
      </div>
    </div>
  );
}
