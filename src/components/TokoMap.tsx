/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Distribusi toko map — plots each placement as a colored pin (done / partial / pending, with an
 * audit ring when sampled). Coordinates come from the placement's captured GPS, falling back to the
 * toko's stored location GPS. Uses Leaflet imperatively with HTML DivIcons (no external marker
 * images) + bundled CSS; OSM tiles load when online, otherwise pins render on a plain backdrop.
 */
import React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { X, MapPin, Store } from "lucide-react";

type Placement = {
  locationId: number;
  toko: string;
  area?: string;
  merchandiser?: string;
  qty: number;
  doneQty?: number;
  status?: string;
  gpsLat?: number;
  gpsLng?: number;
  audited?: boolean;
  auditCompliant?: boolean;
};

const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
// Fill by placement progress; ring by audit result.
function pinColors(p: Placement) {
  const dq = Number(p.doneQty) || 0;
  const done = dq >= (Number(p.qty) || 0) && dq > 0;
  const fill = done ? "#10b981" : dq > 0 ? "#f59e0b" : "#94a3b8";
  const ring = p.audited ? (p.auditCompliant ? "#059669" : "#e11d48") : "#ffffff";
  return { fill, ring };
}

export default function TokoMap({
  placements,
  locGps,
  quantity,
  onClose
}: {
  placements: Placement[];
  locGps: Record<number, { lat: number; lng: number }>;
  quantity: number;
  onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const layerRef = React.useRef<L.LayerGroup | null>(null);
  const didFit = React.useRef(false);

  // Resolve each toko's coordinate (captured GPS first, then the stored location GPS).
  // A pin needs a REAL in-range coordinate — reject NaN/out-of-range/null-island (0,0) so one
  // bad value can't stretch fitBounds and squash the legitimate pins.
  const rows = React.useMemo(
    () =>
      placements.map(p => {
        const lat = p.gpsLat != null ? Number(p.gpsLat) : locGps[p.locationId]?.lat;
        const lng = p.gpsLng != null ? Number(p.gpsLng) : locGps[p.locationId]?.lng;
        const okLat = Number.isFinite(lat) && (lat as number) >= -90 && (lat as number) <= 90;
        const okLng = Number.isFinite(lng) && (lng as number) >= -180 && (lng as number) <= 180;
        const pinned = okLat && okLng && !((lat as number) === 0 && (lng as number) === 0);
        return { p, lat, lng, pinned };
      }),
    [placements, locGps]
  );
  const pinned = rows.filter(r => r.pinned);
  const installed = placements.reduce((s, p) => s + (Number(p.doneQty) || 0), 0);

  // (A) Create the map ONCE; tear it down on unmount (clearing pending resize timers so they
  // can't fire on a removed map → no TypeError on fast close).
  React.useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { zoomControl: true, attributionControl: true }).setView([-2.5, 118], 4); // Indonesia
    mapRef.current = map;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    const t1 = setTimeout(() => mapRef.current?.invalidateSize(), 60);
    const t2 = setTimeout(() => mapRef.current?.invalidateSize(), 350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // (B) (Re)build markers whenever the data changes — keeps pins in sync with the list/header,
  // and correctly renders fallback-GPS pins that only resolve after loadTokos lands.
  React.useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const latlngs: L.LatLngExpression[] = [];
    for (const r of pinned) {
      const { fill, ring } = pinColors(r.p);
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:18px;height:18px;border-radius:9999px;background:${fill};border:3px solid ${ring};box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -10]
      });
      const dq = Number(r.p.doneQty) || 0;
      const auditLine = r.p.audited ? `<div>Audit: <b style="color:${r.p.auditCompliant ? "#059669" : "#e11d48"}">${r.p.auditCompliant ? "Patuh" : "Temuan"}</b></div>` : "";
      const m = L.marker([r.lat as number, r.lng as number], { icon });
      m.bindPopup(
        `<div style="font-size:12px;line-height:1.5;min-width:150px">
          <div style="font-weight:800">${esc(r.p.toko)}</div>
          ${r.p.area ? `<div style="color:#64748b">${esc(r.p.area)}</div>` : ""}
          <div>Terpasang: <b>${esc(dq)}/${esc(r.p.qty)}</b></div>
          <div>Merchandiser: ${esc(r.p.merchandiser || "—")}</div>
          ${auditLine}
          <div style="color:#94a3b8;font-size:10px">${(r.lat as number).toFixed(5)}, ${(r.lng as number).toFixed(5)}</div>
        </div>`
      );
      layer.addLayer(m);
      latlngs.push([r.lat as number, r.lng as number]);
    }
    // Auto-frame only the FIRST time we have pins — later data updates keep the operator's view.
    if (!didFit.current && latlngs.length) {
      if (latlngs.length === 1) map.setView(latlngs[0], 15);
      else map.fitBounds(L.latLngBounds(latlngs).pad(0.25));
      didFit.current = true;
    }
    map.invalidateSize();
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="bg-white rounded-2xl w-full max-w-5xl h-[88vh] shadow-2xl border border-slate-100 flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
          <MapPin className="h-4 w-4 text-teal-600" />
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Peta Sebaran Toko</h3>
            <p className="text-[10px] text-slate-400">{pinned.length}/{placements.length} toko ter-pin · terpasang {installed}/{quantity} unit</p>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-3 text-[10px] font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Selesai</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Sebagian</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Menunggu</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-white border-2 border-rose-600" /> Audit temuan</span>
          </div>
          <button onClick={onClose} aria-label="Tutup" className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <div ref={ref} className="flex-1 min-h-[240px] bg-slate-100" style={{ zIndex: 0 }} />
          <div className="lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-slate-100 overflow-y-auto max-h-[30vh] lg:max-h-none">
            {rows.length === 0 ? (
              <div className="p-5 text-center text-xs text-slate-400">Belum ada toko.</div>
            ) : (
              <ul className="divide-y divide-slate-100 text-xs">
                {rows.map(r => {
                  const dq = Number(r.p.doneQty) || 0;
                  const { fill } = pinColors(r.p);
                  return (
                    <li key={r.p.locationId} className="flex items-center gap-2 px-4 py-2.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: fill }} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-slate-800 truncate flex items-center gap-1"><Store className="h-3 w-3 text-slate-400" />{r.p.toko}</span>
                        <span className="block text-[10px] text-slate-400">{[r.p.area, r.p.merchandiser].filter(Boolean).join(" · ") || "—"}{!r.pinned ? " · belum ada GPS" : ""}</span>
                      </span>
                      <span className="shrink-0 text-[10px] font-bold text-slate-500">{dq}/{r.p.qty}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
