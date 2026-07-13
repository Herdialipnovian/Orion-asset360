/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  FileText,
  Printer,
  FileCheck,
  ShieldCheck,
  Download,
  AlertCircle,
  Clock,
  CheckCircle,
  Award,
  Lock
} from "lucide-react";
import { Asset } from "../types";
import { ALL_STEPS_FLOW } from "../data/initialData";
import { faseNo } from "../faseDisplay";

// Real, scannable CODE39 barcode (no external lib) — replaces the old decorative QR icon so the
// "Kartu Kendali Barcode" actually encodes the asset code that the QR scanner reads.
const C39: Record<string, string> = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw",
  "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn",
  "A": "wnnnnwnnw", "B": "nnwnnwnnw", "C": "wnwnnwnnn", "D": "nnnnwwnnw", "E": "wnnnwwnnn",
  "F": "nnwnwwnnn", "G": "nnnnnwwnw", "H": "wnnnnwwnn", "I": "nnwnnwwnn", "J": "nnnnwwwnn",
  "K": "wnnnnnnww", "L": "nnwnnnnww", "M": "wnwnnnnwn", "N": "nnnnwnnww", "O": "wnnnwnnwn",
  "P": "nnwnwnnwn", "Q": "nnnnnnwww", "R": "wnnnnnwwn", "S": "nnwnnnwwn", "T": "nnnnwnwwn",
  "U": "wwnnnnnnw", "V": "nwwnnnnnw", "W": "wwwnnnnnn", "X": "nwnnwnnnw", "Y": "wwnnwnnnn",
  "Z": "nwwnwnnnn", "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "*": "nwnnwnwnn",
};
function Barcode39({ value, height = 96 }: { value: string; height?: number }) {
  const code = "*" + String(value || "").toUpperCase().replace(/[^0-9A-Z\-. ]/g, "") + "*";
  const unit = 2, gap = 2;
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (const ch of code) {
    const pat = C39[ch];
    if (!pat) continue;
    for (let i = 0; i < 9; i++) {
      const w = (pat[i] === "w" ? 3 : 1) * unit;
      if (i % 2 === 0) bars.push({ x, w }); // even index = bar
      x += w;
    }
    x += gap; // inter-character narrow space
  }
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${x} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Barcode ${value}`} className="mx-auto block max-w-[240px]">
      {bars.map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#0f172a" />)}
    </svg>
  );
}

interface OperationsDocsProps {
  assets: Asset[];
  settings: Record<string, string>;
}

const DOC_TITLES: { [k: number]: string } = {
  1: "SURAT WORK ORDER & PROJECT BRIEF",
  2: "LAPORAN QUALITY CONTROL DISETUJUI",
  3: "KARTU KENDALI BARCODE / QR-CODE",
  4: "SURAT JALAN DIGITAL & MANIFEST PENGIRIMAN",
  5: "POD (PROOF OF DELIVERY) - TANDA TERIMA ELEKTRONIK",
  6: "BERITA ACARA & REKAP PEMASANGAN",
  7: "LEMBAR AUDIT RUTIN RESMI & INDEKS PENILAIAN",
  8: "TIKET PEMELIHARAAN AKTIF & INVOICE PERBAIKAN",
  9: "FORMULIR PENARIKAN & PERSETUJUAN RELOKASI",
  10: "BERITA ACARA PEMUSNAHAN ASET"
};

// Short document code prefix per step (used in the letterhead reference number)
const DOC_CODE: { [k: number]: string } = {
  1: "WO",
  2: "QC",
  3: "TAG",
  4: "SJ",
  5: "POD",
  6: "BAST",
  7: "AUD",
  8: "TKT",
  9: "RTV",
  10: "DSP"
};

export default function OperationsDocs({ assets, settings }: OperationsDocsProps) {
  const [selectedStep, setSelectedStep] = React.useState<number>(3); // Fase 1 & 2 removed from flow
  const [selectedAssetId, setSelectedAssetId] = React.useState<string>("");

  // POD signature pad (step 5)
  const [isSignedClient, setIsSignedClient] = React.useState<boolean>(false);
  const [signatureName, setSignatureName] = React.useState<string>("");

  // Deployment-lifecycle documents only (Surat Jalan/POD/BAST) — Internal custodian assets excluded.
  const docAssets = React.useMemo(() => assets.filter(a => a.peruntukan !== "Internal"), [assets]);

  // Default to the first asset once
  React.useEffect(() => {
    if (!selectedAssetId && docAssets[0]) setSelectedAssetId(docAssets[0].id);
  }, [docAssets, selectedAssetId]);

  const activeAssetObj = React.useMemo(
    () => docAssets.find(a => a.id === selectedAssetId) || docAssets[0],
    [docAssets, selectedAssetId]
  );

  // A document for step N is only "issued" once the asset has reached that stage.
  const isIssued = !!activeAssetObj && activeAssetObj.currentStage >= selectedStep;
  const isCurrent = !!activeAssetObj && activeAssetObj.currentStage === selectedStep;

  const handlePrint = () => {
    if (!isIssued) return;
    window.print();
  };

  const formatRupiah = (val: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val);

  // Reference number + issue date shown in the letterhead
  const docRef = activeAssetObj ? `${DOC_CODE[selectedStep]}/${activeAssetObj.projectCode}/${selectedStep}` : "—";
  const issueDate = activeAssetObj
    ? new Date(activeAssetObj.updatedAt || activeAssetObj.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })
    : "—";

  const statusBadge = !activeAssetObj
    ? { label: "—", cls: "bg-slate-100 text-slate-500 border-slate-200" }
    : !isIssued
    ? { label: "BELUM TERBIT", cls: "bg-amber-50 text-amber-700 border-amber-200" }
    : isCurrent
    ? { label: "AKTIF", cls: "bg-blue-50 text-blue-700 border-blue-200" }
    : { label: "VALID / TERBIT", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };

  return (
    <div id="operations-docs-view" className="space-y-6">
      {/* Intro banner */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-600" />
            Dokumen &amp; Output Terintegrasi
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Setiap langkah dalam alur kerja menerbitkan dokumen digital. Pilih aset dan langkah yang diinginkan, lalu <strong>Cetak / Simpan PDF</strong>. Dokumen hanya terbit
            setelah aset benar-benar mencapai tahap tersebut.
          </p>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left rail */}
        <div className="lg:col-span-4 space-y-4">
          {/* Asset selector (all assets) */}
          {activeAssetObj && (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3">
              <label htmlFor="target-asset-doc" className="text-xs font-extrabold text-slate-800 uppercase tracking-widest block">
                Pilih Aset Target
              </label>
              <select
                id="target-asset-doc"
                value={selectedAssetId}
                onChange={e => {
                  setSelectedAssetId(e.target.value);
                  setIsSignedClient(false);
                  setSignatureName("");
                }}
                className="w-full bg-slate-50 border border-slate-200 p-2 text-xs rounded-lg outline-none font-medium cursor-pointer"
              >
                {docAssets.map(a => (
                  <option key={a.id} value={a.id}>
                    [{a.id}] {a.name.slice(0, 22)} · Fase {faseNo(a.currentStage)}
                  </option>
                ))}
              </select>
              <div className="flex items-center justify-between text-[10px] bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2">
                <span className="text-slate-400 font-semibold uppercase">Posisi aset</span>
                <span className="font-bold text-slate-700">Fase {faseNo(activeAssetObj.currentStage)} dari 8</span>
              </div>
            </div>
          )}

          {/* Step selector */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3">
            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-2">Pilih Dokumen / Langkah</h4>
            <div className="flex flex-col gap-1.5 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
              {ALL_STEPS_FLOW.filter(fStep => fStep.step >= 3).map(fStep => {
                const isActive = fStep.step === selectedStep;
                const reached = !!activeAssetObj && activeAssetObj.currentStage >= fStep.step;
                return (
                  <button
                    key={fStep.step}
                    onClick={() => {
                      setSelectedStep(fStep.step);
                      setIsSignedClient(false);
                    }}
                    className={`w-full text-left font-semibold text-xs p-2.5 rounded-lg border transition-all flex items-center gap-2.5 ${
                      isActive ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200/60"
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        isActive ? "bg-white text-indigo-600" : reached ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {faseNo(fStep.step)}
                    </span>
                    <span className="truncate flex-1">{fStep.title.split(". ")[1]}</span>
                    {!reached && <Lock className={`h-3 w-3 shrink-0 ${isActive ? "text-indigo-200" : "text-slate-400"}`} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right document viewer */}
        <div id="document-viewer" className="lg:col-span-8 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden min-h-[500px] flex flex-col justify-between">
          {/* Dark header bar */}
          <div className="no-print bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <FileCheck className="h-5 w-5 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <h4 className="font-bold text-sm tracking-tight truncate">{DOC_TITLES[selectedStep]}</h4>
                <p className="text-[10px] text-slate-400 truncate">
                  Kontrol: <strong className="font-mono text-white">{activeAssetObj?.projectCode || "—"}</strong> · ID: {activeAssetObj?.id}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[9px] font-extrabold uppercase px-2 py-1 rounded-full border ${statusBadge.cls}`}>{statusBadge.label}</span>
              <button
                onClick={handlePrint}
                disabled={!isIssued}
                title={isIssued ? "Cetak / Simpan sebagai PDF" : "Dokumen belum terbit"}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Printer className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Paper sheet */}
          <div className="p-8 bg-slate-50/50 flex-1 flex justify-center">
            <div
              id="printable-doc"
              className="bg-white w-full max-w-2xl shadow-md border border-slate-200 rounded-lg p-6 md:p-8 space-y-6 relative overflow-hidden font-sans text-xs text-slate-800"
            >
              {/* Letterhead */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-5">
                <div>
                  <h3 className="font-extrabold text-blue-600 text-base tracking-tight uppercase">ORIGIN Asset360</h3>
                  <p className="text-[10px] text-slate-400 font-mono">SISTEM MANAJEMEN ASET · VER 1.2</p>
                </div>
                <div className="text-right text-[10px] text-slate-500">
                  <p className="font-bold">{(settings.company_name || "PT Origin Connect").toUpperCase()}</p>
                  <p>{settings.company_address || "Kawasan Industri Cikarang, Jawa Barat"}</p>
                  <p>{settings.company_email || "support@origin.co.id"}</p>
                </div>
              </div>

              {/* Reference row */}
              <div className="flex flex-wrap justify-between gap-2 text-[10px] -mt-2">
                <span className="text-slate-500">
                  No. Dokumen: <strong className="font-mono text-slate-800">{docRef}</strong>
                </span>
                <span className="text-slate-500">
                  Tanggal Terbit: <strong className="text-slate-800">{isIssued ? issueDate : "—"}</strong>
                </span>
              </div>

              {isIssued ? (
                <>
                  {/* STEP 1 — WORK ORDER */}
                  {selectedStep === 1 && (
                    <div className="space-y-4">
                      <div className="bg-blue-50 border-l-4 border-blue-600 p-3 text-blue-900 rounded">
                        <p className="font-bold text-xs uppercase flex items-center gap-1.5">
                          <Clock className="h-4 w-4" /> Kebutuhan proyek disetujui
                        </p>
                        <p className="text-[10px] text-blue-700 mt-1">
                          Dokumen ini dibuat otomatis setelah persetujuan pengadaan dari client dialihkan ke fase produksi.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] text-slate-400">NOMOR WORK ORDER:</p>
                          <p className="font-mono font-bold text-slate-900 border-b border-slate-100 pb-1">{activeAssetObj?.stageDetails?.request?.reqId || "WO-2026-A1"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">CLIENT PEMILIK:</p>
                          <p className="font-bold text-slate-900 border-b border-slate-100 pb-1">{activeAssetObj?.client}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">NAMA OPERASIONAL ASET:</p>
                          <p className="font-bold text-indigo-700 border-b border-slate-100 pb-1">{activeAssetObj?.name}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">PIC PENUGASAN:</p>
                          <p className="font-bold text-slate-900 border-b border-slate-100 pb-1">{activeAssetObj?.stageDetails?.request?.picName || "Iwan Setiawan"}</p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">PERSYARATAN TEKNIS DILAMPIRKAN:</p>
                        <div className="p-3 bg-slate-50 border border-slate-100 rounded leading-relaxed text-slate-600 italic">
                          &quot;{activeAssetObj?.stageDetails?.request?.specsRequired || "Spesifikasi standar operasional unit penunjang proyek."}&quot;
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 2 — QC REPORT */}
                  {selectedStep === 2 && (
                    <div className="space-y-4">
                      <div className="text-center space-y-1">
                        <h5 className="font-extrabold text-slate-900 text-sm">LAPORAN QUALITY CONTROL (QC)</h5>
                        <p className="text-[10px] text-slate-400">Ref: {activeAssetObj?.stageDetails?.production?.productionReportCode || "LQC-901-T"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] text-slate-400">KEPALA FABRIKASI:</p>
                          <p className="font-bold text-slate-800">{activeAssetObj?.stageDetails?.production?.prodLead || "Anton Hermawan"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">SKOR KELAYAKAN QC:</p>
                          <p className="font-extrabold text-emerald-600 flex items-center gap-1">
                            <Award className="h-4 w-4" /> {activeAssetObj?.stageDetails?.production?.qcScore || 96}/100 Layak Jalan
                          </p>
                        </div>
                      </div>
                      <div className="border border-slate-150 rounded-lg p-3.5 space-y-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Rekap checklist uji kelayakan fisik:</p>
                        <div className="space-y-1 text-slate-600 font-medium">
                          <p className="flex items-center gap-1.5 text-emerald-600">✓ [Lolos] Kalibrasi Sensor Sensitivitas Voltan &amp; Amperage Arus Listrik</p>
                          <p className="flex items-center gap-1.5 text-emerald-600">✓ [Lolos] Uji Durabilitas Operasional Panas Selama 72 Jam Non-stop</p>
                          <p className="flex items-center gap-1.5 text-emerald-600">✓ [Lolos] Cacat Fisik Kosmetik Eksterior Alumunium-Chassis</p>
                          <p className="flex items-center gap-1.5 text-emerald-600">✓ [Lolos] Segel Proteksi Barcode Serial terpasang utuh</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 3 — BARCODE */}
                  {selectedStep === 3 && (
                    <div className="space-y-6 text-center py-6">
                      <h5 className="font-extrabold text-slate-900 text-xs uppercase tracking-widest">KARTU KENDALI BARCODE / QR-CODE</h5>
                      <div className="border-2 border-dashed border-slate-300 p-6 max-w-sm mx-auto rounded-xl space-y-4 bg-slate-50">
                        <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200">
                          <Barcode39 value={activeAssetObj?.qrcode || activeAssetObj?.id || ""} />
                          <p className="mt-1 font-mono text-[10px] tracking-widest text-slate-700">{activeAssetObj?.qrcode || activeAssetObj?.id}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[11px] font-bold text-slate-800">{activeAssetObj?.name}</p>
                          <p className="text-[10px] font-mono text-slate-500">ID: {activeAssetObj?.id}</p>
                          <p className="text-[9px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 inline-block rounded">
                            TERDAFTAR RESMI - {activeAssetObj?.stageDetails?.inventory?.shelfLoc || "BI-A3-MAIN"}
                          </p>
                        </div>
                      </div>
                      <div className="text-slate-400 text-[10px] max-w-xs mx-auto leading-relaxed">
                        Stiker di atas dicetak oleh operator Gudang untuk ditempelkan pada bodi fisik aset sebelum dikirim ke lokasi kegiatan.
                      </div>
                    </div>
                  )}

                  {/* STEP 4 — SURAT JALAN */}
                  {selectedStep === 4 && (
                    <div className="space-y-4">
                      <div className="text-center space-y-1">
                        <h5 className="font-extrabold text-slate-900 text-sm">SURAT JALAN ELEKTRONIK (MANIFEST PENGIRIMAN)</h5>
                        <p className="text-[10px] text-slate-400 font-mono">No: {activeAssetObj?.stageDetails?.shipping?.suratJalanNo || "SJ-2026-9012"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4 border border-slate-100 p-3 rounded-lg bg-slate-50/50">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">NAMA SUPIR:</span>
                          <strong className="text-slate-800 font-bold">{activeAssetObj?.stageDetails?.shipping?.driverName || "Dedi Sumantri"}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">PLAT NOMOR ARMADA:</span>
                          <strong className="text-slate-800 font-mono">{activeAssetObj?.stageDetails?.shipping?.vehiclePlate || "B 9102 TXS"}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">REKANAN LOGISTIK:</span>
                          <strong className="text-slate-800">{activeAssetObj?.stageDetails?.shipping?.vendorShipping || "PT Logistik Jaya Express"}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">JAM BERANGKAT GUDANG:</span>
                          <strong className="text-slate-800 font-mono">{activeAssetObj?.stageDetails?.shipping?.departureTime || "07:15 WIB"}</strong>
                        </div>
                      </div>
                      {Array.isArray(activeAssetObj?.stageDetails?.shipping?.destinations) &&
                      activeAssetObj!.stageDetails.shipping.destinations!.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-[10px] text-slate-400 font-bold uppercase">
                            TUJUAN PENGANTARAN ({activeAssetObj!.stageDetails.shipping.destinations!.length}):
                          </p>
                          <table className="w-full border rounded bg-white overflow-hidden text-left">
                            <thead>
                              <tr className="bg-slate-50 text-[9px] uppercase text-slate-400">
                                <th className="px-2 py-1 font-semibold">Tujuan / Area</th>
                                <th className="px-2 py-1 font-semibold">PIC Penerima</th>
                                <th className="px-2 py-1 font-semibold text-right">Qty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeAssetObj!.stageDetails.shipping.destinations!.map((d, i) => (
                                <tr key={i} className="border-t">
                                  <td className="px-2 py-1.5 font-bold text-slate-800">📍 {d.area || "—"}</td>
                                  <td className="px-2 py-1.5 text-slate-700">{d.picPenerima || "—"}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-slate-800">{d.qty}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-[10px] text-slate-400 font-bold uppercase">ALAMAT TUJUAN PENGANTARAN CLIENT:</p>
                          <p className="font-bold text-slate-800 leading-relaxed border p-2.5 rounded bg-white">📍 {activeAssetObj?.currentLocation || "Kantor Cabang Client Utama"}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* STEP 5 — POD */}
                  {selectedStep === 5 && (
                    <div className="space-y-4">
                      {activeAssetObj?.stageDetails?.transit?.podRecipient && (
                        <div className="bg-white border-2 border-emerald-500 rounded-xl p-4 space-y-3">
                          <p className="font-extrabold text-slate-900 text-sm text-center">BERITA ACARA PENERIMAAN (POD)</p>
                          <div className="grid grid-cols-2 gap-3 text-[11px]">
                            <div><span className="text-slate-400 block">Diterima Oleh:</span><strong className="text-slate-800">{activeAssetObj.stageDetails.transit.podRecipient}</strong></div>
                            <div><span className="text-slate-400 block">Tanggal Terima:</span><strong className="text-slate-800">{activeAssetObj.stageDetails.transit.podTime || "-"}</strong></div>
                            <div><span className="text-slate-400 block">Kondisi saat Tiba:</span><strong className="text-slate-800">{activeAssetObj.stageDetails.transit.conditionOnArrival || "-"}</strong></div>
                            <div><span className="text-slate-400 block">Status Klaim:</span><strong className={activeAssetObj.stageDetails.transit.claimFlag ? "text-rose-600" : "text-emerald-600"}>{activeAssetObj.stageDetails.transit.claimFlag ? "Perlu klaim kurir" : "Tidak ada"}</strong></div>
                          </div>
                          {activeAssetObj.stageDetails.transit.podNote && (
                            <p className="text-[11px] text-slate-500">Catatan: {activeAssetObj.stageDetails.transit.podNote}</p>
                          )}
                          {activeAssetObj.stageDetails.transit.signatureBase64 && (
                            <div className="text-center">
                              <span className="text-[9px] text-slate-400 uppercase tracking-wider block">Tanda Tangan Penerima</span>
                              <img src={activeAssetObj.stageDetails.transit.signatureBase64} alt="Tanda tangan penerima" className="mx-auto h-20 bg-white border border-slate-200 rounded" />
                            </div>
                          )}
                        </div>
                      )}
                      <div className="bg-amber-50 border-l-4 border-amber-600 p-3 text-amber-950 rounded">
                        <p className="font-bold text-xs uppercase flex items-center gap-1.5">
                          <AlertCircle className="h-4 w-4 text-amber-700" /> BUKTI PENERIMAAN POD DI LOKASI
                        </p>
                        <p className="text-[10px] text-amber-800 mt-1">
                          Bukti penerimaan wajib diisi oleh perwakilan client saat armada tiba dan melakukan serah terima fisik aset.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] text-slate-400 font-medium">PENERIMA PERWAKILAN CLIENT:</p>
                          <input
                            type="text"
                            placeholder="Ketik nama penerima..."
                            value={signatureName}
                            onChange={e => {
                              setSignatureName(e.target.value);
                              setIsSignedClient(true);
                            }}
                            className="w-full bg-slate-50 border border-slate-200 px-2 py-1 rounded outline-none focus:bg-white text-xs text-slate-800 font-bold mt-1"
                          />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-medium">KONDISI FISIK SAAT TIBA:</p>
                          <select className="w-full bg-slate-50 border border-slate-200 px-2 py-1 rounded outline-none focus:bg-white text-xs text-slate-800 font-bold mt-1 cursor-pointer">
                            <option>Bagus &amp; Segel Utuh (Sempurna)</option>
                            <option>Ada Sedikit Lecet Wajar</option>
                            <option>Rusak/Cacat Kurir (Perlu Pengembalian Vendor)</option>
                          </select>
                        </div>
                      </div>
                      <div className="border border-slate-200 p-4 rounded-xl text-center space-y-2 bg-slate-50">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Area Tanda-Tangan Elektronik Client:</p>
                        <div className="bg-white border border-slate-300 h-24 rounded-lg flex items-center justify-center relative">
                          {isSignedClient && signatureName ? (
                            <div className="text-center font-serif text-slate-700 italic text-lg select-none">
                              <p className="text-sm text-slate-400 not-italic font-mono text-[9px] mb-1">SIGNED DIGITAL SECURITIES</p>
                              {signatureName}
                              <p className="text-[8px] text-slate-400 not-italic font-mono mt-1">ID Hash: MD5-AS-9801A</p>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px] no-print">Ketik nama penerima di atas untuk membubuhkan tanda tangan otomatis...</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 6 — DEPLOYMENT / BAST */}
                  {selectedStep === 6 && (
                    <div className="space-y-4">
                      <div className="flex border-b border-slate-100 pb-3 items-center gap-3">
                        <div className="bg-indigo-100 text-indigo-700 p-2 rounded-lg">
                          <CheckCircle className="h-5 w-5" />
                        </div>
                        <div>
                          <h5 className="font-extrabold text-slate-800 text-xs uppercase tracking-wide">Berita Acara Pemasangan Selesai (BAST)</h5>
                          <p className="text-[10px] text-slate-400">Instalasi &amp; Kalibrasi di Lokasi Client</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-slate-600">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">TIM INSTALATUR PIC:</span>
                          <strong className="text-slate-800 font-bold">{activeAssetObj?.stageDetails?.deployment?.installTeam || "Sinergi Tech Team"}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">TANGGAL BERITA ACARA (BAST):</span>
                          <strong className="text-slate-800 font-mono font-bold">{activeAssetObj?.stageDetails?.deployment?.installationDate || "Standard SLA - Selesai"}</strong>
                        </div>
                      </div>
                      <div className="space-y-2 border border-slate-150 rounded-lg p-3.5 bg-slate-50/40">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Komponen yang diverifikasi tim teknisi di cabang:</p>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-semibold text-slate-700 pl-1.5">
                          {(activeAssetObj?.stageDetails?.deployment?.verifiedItems?.length
                            ? activeAssetObj.stageDetails.deployment.verifiedItems
                            : ["Braket Mount Terpasang Kokoh", "UPS Backup Power Terhubung", "Kabel Network LAN Teruji", "Grounding Tegangan Sasis Lolos"]
                          ).map((it, i) => (
                            <p key={i} className="flex items-center gap-1">✓ {it}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 7 — AUDIT */}
                  {selectedStep === 7 && (
                    <div className="space-y-4">
                      <div className="text-center space-y-1">
                        <h5 className="font-extrabold text-slate-900 text-sm">LEMBAR AUDIT EVALUASI KEPATUHAN</h5>
                        <p className="text-[10px] text-slate-400">Auditor: {activeAssetObj?.stageDetails?.audit?.auditorName || "Siti Amelia"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-center py-2">
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <p className="text-[10px] text-slate-400 block font-medium">SKOR SLA:</p>
                          <strong className="text-2xl font-extrabold text-emerald-600">{activeAssetObj?.stageDetails?.audit?.scoring || activeAssetObj?.auditScore || 94}/100</strong>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <p className="text-[10px] text-slate-400 block font-medium">TANGGAL LAPORAN AUDIT:</p>
                          <strong className="text-sm font-bold text-slate-800">{activeAssetObj?.stageDetails?.audit?.lastAuditDate || "Periodic Audit 2026"}</strong>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Rekomendasi audit:</p>
                        <p className="p-3 bg-indigo-50 border border-indigo-150 rounded leading-relaxed text-slate-700 italic">
                          &quot;{activeAssetObj?.stageDetails?.audit?.recommendation || "Lakukan pembersihan berkala, pastikan AC ruangan penempatan berfungsi normal untuk menjaga kestabilan suhu perangkat."}&quot;
                        </p>
                      </div>
                    </div>
                  )}

                  {/* STEP 8 — MAINTENANCE */}
                  {selectedStep === 8 && (
                    <div className="space-y-4">
                      <div className="bg-rose-50 border-l-4 border-rose-600 p-3 text-rose-950 rounded">
                        <p className="font-bold text-xs uppercase flex items-center gap-1.5">
                          <AlertCircle className="h-4 w-4 text-rose-600" /> TIKET PERAWATAN &amp; TROUBLESHOOTING AKTIF
                        </p>
                        <p className="text-[10px] text-rose-800 mt-1">Mencatat riwayat perbaikan, biaya penggantian suku cadang, dan teknisi penanggung jawab.</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] text-slate-400">ID TIKET PERBAIKAN:</p>
                          <p className="font-mono font-bold text-slate-900 border-b border-slate-100 pb-1">{activeAssetObj?.stageDetails?.maintenance?.activeTicketId || "TKT-2026-001"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">TEKNISI YANG DITUGASKAN:</p>
                          <p className="font-bold text-slate-900 border-b border-slate-100 pb-1">{activeAssetObj?.stageDetails?.maintenance?.technician || "Aditia (AC Specialist)"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">JENIS KERUSAKAN:</p>
                          <p className="font-bold text-rose-600 border-b border-slate-100 pb-1">{activeAssetObj?.stageDetails?.maintenance?.issueType || "Descaling standard fan / software glitch"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">ESTIMASI BIAYA SUKU CADANG:</p>
                          <p className="font-bold text-slate-900 border-b border-slate-100 pb-1">{formatRupiah(activeAssetObj?.stageDetails?.maintenance?.repairCost || 500000)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 9 — RETRIEVAL */}
                  {selectedStep === 9 && (
                    <div className="space-y-4">
                      <h5 className="font-extrabold text-slate-800 text-xs uppercase tracking-wide border-b border-slate-150 pb-2">FORMULIR RELOKASI &amp; PENARIKAN ASET</h5>
                      <div className="grid grid-cols-2 gap-4 text-slate-600">
                        <div>
                          <p className="text-[10px] text-slate-400">TANGGAL PENGAJUAN PENARIKAN:</p>
                          <p className="font-bold text-slate-800">{activeAssetObj?.stageDetails?.retrieval?.requestDate || "Baru saja diajukan"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">REKOMENDASI KELAYAKAN:</p>
                          <p className="font-bold text-indigo-700 uppercase">{activeAssetObj?.stageDetails?.retrieval?.assessResult || "REDEPLOY (Suku Cadang Bagus)"}</p>
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded leading-relaxed border border-slate-100 text-slate-600">
                        Alasan Penarikan: <strong className="text-slate-800 font-bold">{activeAssetObj?.stageDetails?.retrieval?.reason || "Unit dipindahkan ke cabang karena penutupan area / renovasi massal."}</strong>
                      </div>
                    </div>
                  )}

                  {/* STEP 10 — DISPOSAL */}
                  {selectedStep === 10 && (
                    <div className="space-y-4 text-slate-600">
                      <div className="text-center py-2 border-b border-slate-100">
                        <ShieldCheck className="h-8 w-8 text-slate-700 mx-auto mb-1.5" />
                        <h5 className="font-extrabold text-slate-900 text-xs uppercase tracking-widest">SERTIFIKAT PEMUSNAHAN ASET RESMI</h5>
                        <p className="text-[10px] text-slate-400">Aset Lifecycle Retirement Protocol</p>
                      </div>
                      <p className="leading-relaxed text-slate-600 text-center px-4">
                        Dengan ini dinyatakan secara sah bahwa perangkat dengan Serial ID <strong className="font-mono text-slate-800">{activeAssetObj?.id || "AST-2026-X"}</strong> telah resmi dimusnahkan (scrap logam) atau dilelang karena biaya perawatannya tidak lagi efisien secara finansial.
                      </p>
                      <div className="border border-slate-200/60 rounded-lg p-3 bg-slate-50/50 flex justify-between items-center">
                        <div>
                          <p className="text-[10px] text-slate-400 font-medium">NILAI PEMULIHAN SCRAP:</p>
                          <strong className="text-emerald-600 text-sm font-extrabold">{formatRupiah(activeAssetObj?.stageDetails?.disposal?.scrapValue || 2500000)}</strong>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 font-medium">TANGGAL DISPOSAL:</p>
                          <strong className="text-slate-800 text-xs font-mono font-bold">{activeAssetObj?.stageDetails?.disposal?.disposalDate || "Telah Diproses"}</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Footer seal */}
                  <div className="pt-6 border-t border-slate-200 flex justify-between items-end text-[9px] text-slate-400">
                    <div>
                      <p>Keabsahan data diverifikasi oleh sistem ORIGIN Asset360.</p>
                      <p className="font-mono">Host: origin-asset360 · Fase {faseNo(selectedStep)}/8</p>
                    </div>
                    <div className="bg-slate-100 border px-2 py-1 rounded text-center text-[10px] font-bold text-slate-700 uppercase font-mono tracking-widest">{statusBadge.label}</div>
                  </div>
                </>
              ) : (
                /* NOT ISSUED */
                <div className="py-16 text-center space-y-3">
                  <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
                    <Lock className="h-6 w-6 text-amber-500" />
                  </div>
                  <h4 className="font-extrabold text-slate-800 text-sm">Dokumen Belum Diterbitkan</h4>
                  <p className="text-slate-500 text-xs max-w-sm mx-auto leading-relaxed">
                    <strong className="text-slate-700">{activeAssetObj?.name}</strong> masih berada di <strong>Fase {faseNo(activeAssetObj?.currentStage ?? 0)}</strong>. Dokumen{" "}
                    <strong>{DOC_TITLES[selectedStep]}</strong> (Fase {faseNo(selectedStep)}) baru tersedia setelah aset mencapai tahap tersebut dalam siklus hidup.
                  </p>
                  <p className="text-[10px] text-slate-400">Proses aset melalui menu <strong>Asset Register</strong> untuk menerbitkan dokumen ini.</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer bar */}
          <div className="no-print bg-slate-50 px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span className="text-slate-500 text-xs font-medium">
              {isIssued ? (
                <>Dokumen ini diekspor secara dinamis dari arsip client {activeAssetObj?.client}.</>
              ) : (
                <>Dokumen terkunci hingga aset mencapai Fase {faseNo(selectedStep)}.</>
              )}
            </span>
            <button
              onClick={handlePrint}
              disabled={!isIssued}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-5 rounded-lg transition shadow-sm flex items-center justify-center gap-1.5 self-end sm:self-auto disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4" />
              <span>Cetak / Simpan PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
