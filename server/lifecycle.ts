/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Server-authoritative lifecycle helpers (location + default log per stage).
 */
export function computeLocation(nextStage: number, warehouseName: string | undefined, client: string, prev: string): string {
  switch (nextStage) {
    case 2:
      return "Lini Perakitan Fabrikasi Vendor";
    case 3:
      return warehouseName || "Gudang Utama JKT Cikarang";
    case 4:
      return "Dalam Perjalanan - Berangkat dari Gudang Hub";
    case 5:
      return "Dalam Perjalanan - Jalur Tol Logistik Trans-Jawa";
    case 6:
      return `Terpasang di Cabang Client (${client})`;
    case 7:
      return `Dalam Inspeksi Audit Kepatuhan Cabang (${client})`;
    case 8:
      return "Gedung Cabang - Sedang Diperbaiki Teknisi Ahli";
    case 9:
      return "Kantor Pusat / Gudang Retur Cikarang";
    case 10:
      return "Aset Non-Aktif (Telah di-Scrap & di-Retire Resmi)";
    default:
      return prev;
  }
}

export const DEFAULT_LOG: { [k: number]: string } = {
  2: "Aset dialihkan ke lini perakitan fabrikasi vendor.",
  3: "Aset masuk ke Gudang dan dilabeli QR Code.",
  4: "Surat Jalan & Manifest terbit. Driver ditugaskan.",
  5: "Truk kargo terpantau aktif di pelacakan GPS.",
  6: "Instalasi rampung. Berita Acara (BAST) ditandatangani.",
  7: "Pemeriksaan kepatuhan audit diselesaikan.",
  8: "Tiket perawatan dibuka setelah dilaporkan ada gangguan.",
  9: "Aset ditarik untuk penilaian relokasi / retur.",
  10: "Aset resmi di-disposal, nilai sisa diamankan."
};

// Legal lifecycle transitions, keyed by the asset's CURRENT stage -> allowed next stages.
// Mirrors the CMS graph; enforced server-side so no client can jump an illegal step.
// Fase 1 (Request/WO) & 2 (Produksi) removed from the flow — assets are born in Gudang (Fase 3)
// via Master Data, so 3 is the start state (only re-entered from 9→3 retrieval).
export const TRANSITIONS: { [k: number]: number[] } = {
  3: [4],
  4: [5],
  5: [6],
  6: [7, 8, 9],
  7: [6, 8, 9],
  8: [6, 9],
  9: [3, 6, 10],
  10: []
};

// Required photo-evidence slots per TARGET stage (the "WAJIB foto per aksi" rule).
// Each slot must have >=1 uploaded photo (asset_id, stage, slot) before the field
// channel is allowed to commit the transition. Conditional/optional slots are NOT here.
export interface EvidenceSlot {
  slot: string;
  label: string;
}
export const EVIDENCE_REQUIRED: { [k: number]: EvidenceSlot[] } = {
  2: [
    { slot: "production_result", label: "Foto unit hasil produksi / rakit" },
    { slot: "qc", label: "Foto lembar / label hasil QC" },
    { slot: "qr_serial", label: "Foto QR / serial menempel di unit" }
  ],
  3: [
    { slot: "placement", label: "Foto aset terpasang di rak (proof-of-placement)" },
    { slot: "qr_label", label: "Foto close-up label QR / barcode" },
    { slot: "condition_in", label: "Foto kondisi aset saat terima" }
  ],
  4: [
    { slot: "surat_jalan", label: "Foto Surat Jalan (dokumen fisik)" },
    { slot: "load_vehicle", label: "Foto muatan + kendaraan (plat jelas)" }
  ],
  6: [
    { slot: "before", label: "Foto BEFORE pemasangan" },
    { slot: "after", label: "Foto AFTER (terpasang sesuai planogram)" },
    { slot: "signature", label: "TTD BAST penerima" }
  ],
  7: [{ slot: "overview", label: "Foto kondisi aset keseluruhan (overview)" }],
  8: [{ slot: "damage_before", label: "Foto kerusakan (before)" }],
  9: [{ slot: "condition_retrieval", label: "Foto kondisi aset saat ditarik" }],
  10: [
    { slot: "bap", label: "Foto Berita Acara Pemusnahan (BAP)" },
    { slot: "condition_before", label: "Foto kondisi aset sebelum disposal" }
  ]
};

export function isLegalTransition(current: number, next: number): boolean {
  return (TRANSITIONS[current] || []).includes(next);
}
