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
