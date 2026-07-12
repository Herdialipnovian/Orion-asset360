/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Client deliverable: per-toko distribution report for a Distribusi asset — coverage + compliance
 * summary and a per-toko table (status, qty, GPS, audit, placement photo). Prints via window.print()
 * using the shared #printable-doc / .no-print convention (@media print in index.css → PDF).
 */
import React from "react";
import { X, Printer, MapPin, ShieldCheck } from "lucide-react";
import type { Asset } from "../types";
import { type EvidenceView, evidenceThumb } from "../api";

type Placement = {
  locationId: number; toko: string; area?: string; merchandiser?: string;
  qty: number; doneQty?: number; status?: string; gpsLat?: number; gpsLng?: number;
  audited?: boolean; auditCompliant?: boolean;
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "—"; }
};

export default function ReportDistribusi({
  asset,
  evidence,
  locGps,
  company,
  today,
  onClose
}: {
  asset: Asset;
  evidence: EvidenceView[];
  locGps: Record<number, { lat: number; lng: number }>;
  company?: string;
  today: string;
  onClose: () => void;
}) {
  const dep: any = (asset.stageDetails as any)?.deployment || {};
  const placements: Placement[] = Array.isArray(dep.placements) ? dep.placements : [];
  const cov = dep.coverage;
  const installed = placements.reduce((s, p) => s + (Number(p.doneQty) || 0), 0);
  // newest placement photo per toko (slot tagged `pasang-<locationId>`).
  const photoByLoc = React.useMemo(() => {
    const m: Record<number, EvidenceView> = {};
    for (const e of evidence) {
      const mt = /^pasang-(\d+)$/.exec(e.slot || "");
      if (!mt) continue;
      const lid = Number(mt[1]);
      if (!m[lid] || new Date(e.createdAt) > new Date(m[lid].createdAt)) m[lid] = e;
    }
    return m;
  }, [evidence]);
  const coord = (p: Placement) => {
    const lat = p.gpsLat ?? locGps[p.locationId]?.lat;
    const lng = p.gpsLng ?? locGps[p.locationId]?.lng;
    return Number.isFinite(lat) && Number.isFinite(lng) ? `${(lat as number).toFixed(5)}, ${(lng as number).toFixed(5)}` : "—";
  };
  const statusLabel = (p: Placement) => {
    const dq = Number(p.doneQty) || 0;
    return dq >= (Number(p.qty) || 0) && dq > 0 ? "Selesai" : dq > 0 ? "Sebagian" : "Menunggu";
  };

  return (
    <div className="report-print-host fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-3 sm:p-6">
      <div className="report-print-card bg-white rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-100 my-2">
        <div className="no-print bg-slate-900 text-white px-5 py-3 flex items-center justify-between rounded-t-2xl">
          <div>
            <h3 className="font-bold text-sm">Laporan Distribusi — Klien</h3>
            <p className="text-[10px] text-slate-400">{asset.name} · {asset.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3 py-2 rounded-lg"><Printer className="h-4 w-4" /> Cetak / PDF</button>
            <button onClick={onClose} aria-label="Tutup" className="text-slate-300 hover:text-white p-1 rounded-full hover:bg-white/10"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div id="printable-doc" className="p-6 sm:p-8 text-slate-800">
          {/* Letterhead */}
          <div className="flex items-start justify-between border-b-2 border-slate-800 pb-3">
            <div>
              <div className="text-lg font-extrabold tracking-tight">{company || "PT Origin Connect"}</div>
              <div className="text-[11px] text-slate-500">Laporan Sebaran &amp; Kepatuhan Distribusi</div>
            </div>
            <div className="text-right text-[11px] text-slate-500">
              <div>Tanggal: <strong className="text-slate-700">{today}</strong></div>
              <div>Ref: <span className="font-mono">DIST/{asset.id}</span></div>
            </div>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mt-4">
            <div>Client: <strong>{asset.client || "—"}</strong></div>
            <div>Proyek: <strong>{dep.projectName || "—"}</strong></div>
            <div>Aset: <strong>{asset.name}</strong> ({asset.id})</div>
            <div>Total Qty: <strong>{asset.quantity}</strong> unit</div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            {[
              { label: "Total Toko", value: String(placements.length) },
              { label: "Terpasang", value: `${installed}/${asset.quantity}` },
              { label: "Coverage Audit", value: cov ? `${cov.auditedToko}/${cov.totalToko} (${cov.coveragePct}%)` : "—" },
              { label: "Kepatuhan", value: cov ? `${cov.compliancePct}%` : "—" }
            ].map(c => (
              <div key={c.label} className="border border-slate-200 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">{c.label}</div>
                <div className="text-base font-extrabold text-slate-800 mt-0.5">{c.value}</div>
              </div>
            ))}
          </div>

          {/* Per-area coverage — compliance per-area, bukan satu skor global */}
          {cov?.byArea && cov.byArea.length > 0 && (
            <div className="mt-5">
              <div className="text-[11px] font-extrabold text-slate-700 mb-1.5">Kepatuhan per Area</div>
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    <th className="text-left font-extrabold px-2 py-1.5 border border-slate-200">Area</th>
                    <th className="text-left font-extrabold px-2 py-1.5 border border-slate-200">Toko</th>
                    <th className="text-left font-extrabold px-2 py-1.5 border border-slate-200">Diaudit</th>
                    <th className="text-left font-extrabold px-2 py-1.5 border border-slate-200">Coverage</th>
                    <th className="text-left font-extrabold px-2 py-1.5 border border-slate-200">Kepatuhan</th>
                  </tr>
                </thead>
                <tbody>
                  {cov.byArea.map(a => (
                    <tr key={a.area}>
                      <td className="px-2 py-1.5 border border-slate-200 font-bold">{a.area}</td>
                      <td className="px-2 py-1.5 border border-slate-200 tabular-nums">{a.totalToko}</td>
                      <td className="px-2 py-1.5 border border-slate-200 tabular-nums">{a.auditedToko}/{a.totalToko}</td>
                      <td className="px-2 py-1.5 border border-slate-200 tabular-nums">{a.coveragePct}%</td>
                      <td className="px-2 py-1.5 border border-slate-200 tabular-nums font-bold">{a.auditedToko ? `${a.compliancePct}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Per-toko table */}
          <table className="w-full text-[11px] mt-6 border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-600">
                <th className="text-left font-extrabold px-2 py-1.5 border border-slate-200">#</th>
                <th className="text-left font-extrabold px-2 py-1.5 border border-slate-200">Toko</th>
                <th className="text-left font-extrabold px-2 py-1.5 border border-slate-200">Area</th>
                <th className="text-left font-extrabold px-2 py-1.5 border border-slate-200">Merchandiser</th>
                <th className="text-left font-extrabold px-2 py-1.5 border border-slate-200">Terpasang</th>
                <th className="text-left font-extrabold px-2 py-1.5 border border-slate-200">Status</th>
                <th className="text-left font-extrabold px-2 py-1.5 border border-slate-200">Koordinat</th>
                <th className="text-left font-extrabold px-2 py-1.5 border border-slate-200">Audit</th>
                <th className="text-left font-extrabold px-2 py-1.5 border border-slate-200">Foto</th>
              </tr>
            </thead>
            <tbody>
              {placements.length === 0 ? (
                <tr><td colSpan={9} className="px-2 py-6 text-center text-slate-400 border border-slate-200">Belum ada distribusi ke toko.</td></tr>
              ) : placements.map((p, i) => {
                const photo = photoByLoc[p.locationId];
                return (
                  <tr key={p.locationId} className="align-top">
                    <td className="px-2 py-1.5 border border-slate-200 tabular-nums">{i + 1}</td>
                    <td className="px-2 py-1.5 border border-slate-200 font-bold">{p.toko}</td>
                    <td className="px-2 py-1.5 border border-slate-200">{p.area || "—"}</td>
                    <td className="px-2 py-1.5 border border-slate-200">{p.merchandiser || "—"}</td>
                    <td className="px-2 py-1.5 border border-slate-200 tabular-nums">{Number(p.doneQty) || 0}/{p.qty}</td>
                    <td className="px-2 py-1.5 border border-slate-200">{statusLabel(p)}</td>
                    <td className="px-2 py-1.5 border border-slate-200 font-mono text-[10px]">{coord(p)}</td>
                    <td className="px-2 py-1.5 border border-slate-200">{p.audited ? (p.auditCompliant ? "Patuh" : "Temuan") : "—"}</td>
                    <td className="px-2 py-1.5 border border-slate-200">
                      {photo ? <img src={evidenceThumb(photo.id)} alt={`Foto ${p.toko}`} className="h-14 w-14 object-cover rounded border border-slate-200" /> : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex items-center gap-4 mt-4 text-[10px] text-slate-400">
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Koordinat dari GPS pemasangan / lokasi toko</span>
            {cov?.method && <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Audit = {cov.method === "auto" ? `sampling acak otomatis${cov.samplePct ? ` ${cov.samplePct}%` : ""}` : "hasil sampling oleh PIC"}</span>}
          </div>
          <div className="mt-8 grid grid-cols-2 gap-8 text-[11px]">
            <div className="text-center"><div className="h-14" /><div className="border-t border-slate-400 pt-1">Origin Connect</div></div>
            <div className="text-center"><div className="h-14" /><div className="border-t border-slate-400 pt-1">{asset.client || "Klien"}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
