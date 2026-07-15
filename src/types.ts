/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum AssetStage {
  REQUEST = 1,
  PRODUCTION = 2,
  INVENTORY = 3,
  SHIPPING = 4,
  TRANSIT = 5,
  DEPLOYED = 6,
  AUDITING = 7,
  MAINTENANCE = 8,
  RETRIEVAL = 9,
  DISPOSED = 10,
}

export interface StageUpdate {
  stage: AssetStage;
  timestamp: string;
  status: string;
  operator: string;
  notes: string;
  documents?: {
    title: string;
    code: string;
    url?: string;
    details: { [key: string]: any };
  }[];
}

export interface Asset {
  id: string; // e.g., AST-902-01
  name: string; // e.g., LED Videowall Outdoor
  category: string; // e.g., Display, IT Hardware, HVAC, Furniture, Machinery
  client: string; // e.g., Kopi Kenangan Group
  projectCode: string; // e.g., WO-PRJ-2026-A1
  quantity: number;
  currentStage: AssetStage;
  createdAt: string;
  updatedAt: string;
  currentLocation: string;
  specs: {
    sku?: string;
    brand?: string;
    dimensions?: string;
    powerWeight?: string;
    [key: string]: string | undefined;
  };
  qrcode: string;
  financials: {
    purchaseCost: number;
    maintenanceCost: number;
    disposalValue: number;
  };
  auditScore?: number; // scale 0-100
  maintenanceStatus?: "NONE" | "PENDING" | "REPAIRING" | "RESOLVED";

  // Physical asset attributes (Master Data flat table / Excel import)
  warna?: string;
  type?: string; // material/type, e.g. PVC, Flexy
  serialNumber?: string;
  fisik?: string; // "Baru" | "Second"
  tglBeli?: string; // purchase date, YYYY-MM-DD
  // Ownership & nature (Phase 0 foundation for multi-pattern deployment)
  owner?: "Origin" | "Client"; // who owns it — drives depreciation (Origin) vs client billing
  usageType?: "Reusable" | "Consumable"; // reusable cycles back (Fase 9); consumable ends at disposal (Fase 10)
  // Peruntukan (permanent partition): "Internal" = Origin operational asset held by a karyawan
  // (custodian menu, no shipping); "Deployment" = campaign asset (event/distribusi lifecycle).
  // Client-owned assets are always Deployment.
  peruntukan?: "Internal" | "Deployment";
  // Deployment context: the Proyek/Episode this asset is currently deployed under (drives the
  // context-aware Fase 6/7/9 behaviour — Internal custodian vs Event venue vs Distribusi toko).
  projectId?: number | null;

  // Specific Stage Documents & Output Data
  stageDetails: {
    request: {
      reqId: string;
      timelineWeeks: number;
      specsRequired: string;
      vendorName: string;
      picName: string;
      approvalDate: string;
    };
    production: {
      prodLead: string;
      qcInspector: string;
      qcScore: number;
      productionReportCode: string;
      evidencePhoto: string;
      readyDate: string;
    };
    inventory: {
      warehouseName: string;
      shelfLoc: string;
      stockCode: string;
      receivedDate: string;
      rackNumber: string;
    };
    shipping: {
      suratJalanNo: string;
      driverName: string;
      vehiclePlate: string;
      vendorShipping: string;
      departureTime: string;
      // Multi-destination delivery: split the shipment across 2+ drop points.
      destinations?: { area: string; picPenerima: string; qty: number }[];
      // Consolidated dispatch: many assets on ONE Surat Jalan / driver / destination share this id
      // (= the shared suratJalanNo). Optional courier tracking for the whole load.
      batchId?: string;
      courier?: string;
      trackingUrl?: string;
      trackingNo?: string;
      eta?: string;
    };
    transit: {
      currentLat: number;
      currentLng: number;
      eta: string;
      // Vendor-courier tracking (Shopee/JNE/J&T/Lalamove/…): logistik just pastes the link.
      courier?: string;
      trackingUrl?: string;
      trackingNo?: string;
      podTime?: string;
      podRecipient?: string;
      signatureBase64?: string;
      conditionOnArrival?: "Sempurna" | "Bagus" | "Ada Lecet" | "Rusak Sebagian";
      podNote?: string;
      claimFlag?: boolean; // true when condition-on-arrival indicates damage → needs courier claim
    };
    deployment: {
      installTeam: string; // legacy single-team field (kept for old records)
      installationDate: string;
      planogramMatched: boolean;
      verifiedItems: string[]; // e.g., ["Kabel ground", "Backup UPS", "Braket dinabolt"]
      photoBefore: string;
      photoAfter: string;
      bastSignature?: string; // legacy single BAST TTD
      // PIC divides the install qty across Merchandisers; each reports their own progress
      // (mobile, in increments) with before/after photos + an optional BAST signature.
      assignments?: {
        merchandiserId: number;
        merchandiser: string; // name, resolved SERVER-side from the users table
        qty: number; // jatah for this merchandiser (invariant: qty >= doneQty)
        doneQty?: number; // 0..qty, CUMULATIVE units reported — authoritative progress
        status: "pending" | "partial" | "done"; // DERIVED from doneQty, never hand-set
        completedAt?: string; // set only when status flips to done
        lastReportAt?: string; // most-recent report — gates FRESH evidence per report
        signature?: string; // latest report TTD (dataURL), optional
        note?: string;
        reports?: { doneQty: number; at: string; signature?: string; note?: string; by: string; key?: string }[]; // per-report INCREMENT trail
      }[];
      installedQty?: number; // = sum(doneQty) across ALL assignments
      fullyInstalled?: boolean; // installedQty >= asset.quantity (advisory only)

      // ── Multi-pattern deployment context (Fase 1/2/3). `mode` picks which structure below is live.
      mode?: "Internal" | "Event" | "Distribusi";
      projectId?: number; // the Proyek/Campaign this deployment belongs to
      projectName?: string;

      // Internal / Fixed — serah-terima ke Karyawan (custodian) + BAST.
      custodianId?: number; // employees.id
      custodianName?: string;
      custodianDept?: string;
      handoverDate?: string;
      handoverSignature?: string; // BAST TTD (dataURL)
      handoverNote?: string;
      // Internal stock-opname trail (periodic custodian checks; does NOT change stage).
      lastOpnameAt?: string;
      opnameHistory?: { date: string; by: string; condition: string; note?: string }[];

      // Event / Roadshow — asset(-package) deployed at a Venue as a Leg; roadshow = ordered legs.
      legs?: {
        locationId: number;
        venue: string; // resolved name
        area?: string;
        pic?: string; // PIC per-leg (changes each venue)
        seq: number; // order in the roadshow (1,2,3…)
        // transit = shipped to this venue, not yet arrived · active = arrived & set up · done = relocated away
        status: "planned" | "transit" | "active" | "done";
        // Fine-grained cycle for a NEW venue hop (Venue Berikutnya): transit→pemasangan→terpasang→audit→active.
        // The coarse `status` above stays "transit" while a hop is mid-cycle, flips to "active" once audited.
        subStatus?: "transit" | "pemasangan" | "terpasang" | "audit" | "active";
        install?: { merchandiserId?: number; merchandiser?: string; installedAt?: string }; // per-venue MD install
        audit?: { auditedBy?: string; auditedAt?: string; validated?: boolean }; // per-venue PIC audit
        setupDate?: string;
        teardownDate?: string;
        signature?: string;
        note?: string;
        // Inbound shipment tracking (asset shipped TO this venue) — mirrors Fase-5 transit tracking.
        // Every venue shipment carries its own Surat Jalan number.
        shipping?: { suratJalanNo?: string; courier?: string; trackingUrl?: string; trackingNo?: string; eta?: string; shippedAt?: string };
        arrivedAt?: string; // set when transit→active is confirmed
      }[];
      currentLegSeq?: number; // which leg the asset is physically at now
      // Return-to-warehouse shipment at the end of a roadshow (venue → Gudang), also has a Surat Jalan.
      returnShipment?: { suratJalanNo?: string; courier?: string; trackingUrl?: string; trackingNo?: string; eta?: string; shippedAt?: string; arrivedAt?: string; status?: "transit" | "done" };

      // Distribusi — fan-out placement per toko (GPS + foto), driven by merchandisers.
      placements?: {
        locationId: number;
        toko: string; // resolved name
        area?: string;
        merchandiserId?: number;
        merchandiser?: string;
        qty: number; // planned units at this toko
        doneQty?: number; // 0..qty installed
        status: "pending" | "partial" | "done";
        gpsLat?: number;
        gpsLng?: number;
        placedAt?: string;
        signature?: string;
        note?: string;
        audited?: boolean; // marked when sampled in a Fase-7 audit
        auditCompliant?: boolean;
      }[];
      coverage?: {
        totalToko: number;
        auditedToko: number;
        compliantToko: number;
        coveragePct: number;
        compliancePct: number;
        byArea?: { area: string; totalToko: number; auditedToko: number; compliantToko: number; coveragePct: number; compliancePct: number }[];
        method?: "manual" | "auto";
        samplePct?: number;
        sampledAt?: string;
      };
    };
    audit: {
      lastAuditDate: string;
      auditorName: string;
      findings: string[];
      scoring: number; // 0-100 (auto-computed from the compliance checklist)
      recommendation: string;
      checklist?: { [item: string]: boolean }; // per-item pass/fail
      complianceStatus?: "PATUH" | "PERLU PERBAIKAN" | "TIDAK PATUH";
    };
    maintenance: {
      activeTicketId?: string;
      issueType?: string;
      reportedAt?: string;
      technician?: string;
      repairCost?: number;
      repairedParts?: string[];
      logHistory: {
        date: string;
        act: string;
        cost: number;
      }[];
    };
    retrieval: {
      requestDate?: string;
      reason?: string;
      assessResult?: "REDEPLOY" | "DIPINDAHKAN" | "DISCARD";
      checkedBy?: string;
      conditionRating?: number; // 1 to 5
    };
    disposal: {
      disposalDate?: string;
      disposalMethod?: "SCRAP" | "LELANG" | "DONASI" | "REFURBISH";
      approvedBy?: string;
      scrapValue?: number;
      replacedByAssetId?: string;
    };
  };
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  assetId: string;
  assetName: string;
  stage: AssetStage;
  action: string;
  operator: string;
  type: "info" | "success" | "warning" | "error";
}

export interface ProjectStats {
  totalAssets: number;
  activeRequests: number;
  inProduction: number;
  inWarehouse: number;
  inTransit: number;
  deployedCount: number;
  auditedCount: number;
  inMaintenance: number;
  complianceRate: number; // calculated index
  operationalEfficiency: number; // percentage
  savedCost: number; // Rupiah or general amount
}
