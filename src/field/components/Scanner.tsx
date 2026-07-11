/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * QR scanner: live camera via BarcodeDetector when available, with a manual
 * Asset ID fallback that is ALWAYS present (QR damaged / no camera / offline).
 */
import React from "react";
import { QrCode, Keyboard, CameraOff, CornerDownLeft } from "lucide-react";
import type { Asset } from "../../types";

// "ASETIFY-DIN00001" -> "DIN00001"; also accepts a raw id typed manually.
export function parseAssetId(text: string): string {
  const t = (text || "").trim();
  const m = t.match(/^ASETIFY-(.+)$/i);
  return (m ? m[1] : t).trim().toUpperCase();
}

export default function Scanner({ assets, onOpen }: { assets: Asset[]; onOpen: (id: string) => void }) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [camState, setCamState] = React.useState<"idle" | "on" | "unsupported" | "denied">("idle");
  const [manual, setManual] = React.useState("");
  const [err, setErr] = React.useState("");

  const resolve = React.useCallback(
    (raw: string) => {
      const id = parseAssetId(raw);
      if (!id) return setErr("Kode kosong.");
      const found = assets.find(a => a.id.toUpperCase() === id);
      if (!found) return setErr(`Aset "${id}" tidak ditemukan.`);
      setErr("");
      onOpen(found.id);
    },
    [assets, onOpen]
  );

  React.useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const AnyWin = window as any;

    async function start() {
      if (!("BarcodeDetector" in window)) {
        setCamState("unsupported");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCamState("on");
        const detector = new AnyWin.BarcodeDetector({ formats: ["qr_code"] });
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length) {
              resolve(codes[0].rawValue);
              return; // stop looping; navigation happens
            }
          } catch {
            /* frame not ready */
          }
          raf = requestAnimationFrame(() => setTimeout(tick, 250) as unknown as number);
        };
        tick();
      } catch {
        setCamState("denied");
      }
    }
    start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [resolve]);

  return (
    <div className="flex flex-col gap-5 px-4 pb-28 pt-3">
      <h1 className="flex items-center gap-2 text-lg font-bold text-white">
        <QrCode className="h-5 w-5 text-[#ffcd00]" /> Scan QR Aset
      </h1>

      {/* Camera viewport */}
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-[#1e2b45] bg-black">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {camState === "on" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="reticle h-52 w-52 border-2 border-white/70" />
            <span className="absolute bottom-4 text-xs font-medium text-white/80">Arahkan ke QR aset</span>
          </div>
        )}
        {camState !== "on" && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <CameraOff className="h-8 w-8" />
              <p className="text-sm">
                {camState === "unsupported"
                  ? "Kamera scan tidak didukung browser ini."
                  : camState === "denied"
                  ? "Akses kamera ditolak."
                  : "Menyiapkan kamera…"}
              </p>
              <p className="text-xs text-slate-500">Gunakan input manual di bawah.</p>
            </div>
          </div>
        )}
      </div>

      {/* Manual fallback — always available */}
      <form
        onSubmit={e => {
          e.preventDefault();
          resolve(manual);
        }}
        className="flex flex-col gap-2"
      >
        <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          <Keyboard className="h-4 w-4" /> Input Asset ID manual
        </label>
        <div className="flex gap-2">
          <input
            value={manual}
            onChange={e => setManual(e.target.value)}
            placeholder="mis. DIN00001"
            autoCapitalize="characters"
            autoCorrect="off"
            className="tap flex-1 rounded-xl border border-[#1e2b45] bg-[#0f1728] px-4 font-mono text-base uppercase text-white outline-none placeholder:font-sans placeholder:normal-case placeholder:text-slate-600 focus:border-[#4d8bff]"
          />
          <button type="submit" aria-label="Buka aset" className="tap flex w-14 items-center justify-center rounded-xl bg-[#4d8bff] text-white active:scale-95">
            <CornerDownLeft className="h-5 w-5" />
          </button>
        </div>
        {err && <div className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{err}</div>}
      </form>
    </div>
  );
}
