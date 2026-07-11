/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Asset, AssetStage, ActivityLog } from "../types";

export const SAMPLE_CLIENTS = [
  "PT Origin Connect (Internal)",
  "Radu Food",
  "AICE & Kaluli (Event Sampling & Selling)",
  "Garudafood (Event Campus Sampling)",
  "Scarlett (Mystery Shopper)"
];

export const INITIAL_ASSETS: Asset[] = [
  {
    id: "ASSET-ORIGIN-001",
    name: "Paket Seragam Crew Origin Connect",
    category: "Seragam & Atribut",
    client: "PT Origin Connect (Internal)",
    projectCode: "WO-ORG-001",
    quantity: 30,
    currentStage: AssetStage.INVENTORY,
    createdAt: "2026-05-10T08:00:00Z",
    updatedAt: "2026-06-02T10:15:00Z",
    currentLocation: "Gudang Utama Origin Jakarta - Shelf A3",
    specs: {
      brand: "Convection Custom",
      sku: "ORG-CWS-030",
      dimensions: "Standar Ukuran Campuran (M, L, XL)",
      powerWeight: "Bahan Katun Premium / 9 Kg"
    },
    qrcode: "ASETIFY-ASSET-ORIGIN-001",
    financials: {
      purchaseCost: 4500000,
      maintenanceCost: 0,
      disposalValue: 500000
    },
    auditScore: 100,
    maintenanceStatus: "NONE",
    stageDetails: {
      request: {
        reqId: "REQ-ORG-771",
        timelineWeeks: 2,
        specsRequired: "Bordir logo Origin depan-belakang, bahan dingin polo kemeja premium",
        vendorName: "PT Sandang Mulia Abadi",
        picName: "Siti Rahma",
        approvalDate: "2026-05-12T09:00:00Z"
      },
      production: {
        prodLead: "Admin Produksi",
        qcInspector: "Iwan Setiawan",
        qcScore: 99,
        productionReportCode: "LPROD-SNDG-01",
        evidencePhoto: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=500&auto=format&fit=crop&q=60",
        readyDate: "2026-05-28T14:00:00Z"
      },
      inventory: {
        warehouseName: "Gudang Utama Origin Jakarta",
        shelfLoc: "Blok Seragam - Rak B",
        stockCode: "STK-ORG-CWS-POLO",
        receivedDate: "2026-06-01T11:00:00Z",
        rackNumber: "RACK-SERAGAM-02"
      },
      shipping: {
        suratJalanNo: "",
        driverName: "",
        vehiclePlate: "",
        vendorShipping: "",
        departureTime: ""
      },
      transit: {
        currentLat: 0,
        currentLng: 0,
        eta: ""
      },
      deployment: {
        installTeam: "",
        installationDate: "",
        planogramMatched: false,
        verifiedItems: [],
        photoBefore: "",
        photoAfter: ""
      },
      audit: {
        lastAuditDate: "",
        auditorName: "",
        findings: [],
        scoring: 100,
        recommendation: ""
      },
      maintenance: {
        logHistory: []
      },
      retrieval: {},
      disposal: {}
    }
  },
  {
    id: "ASSET-ORIGIN-002",
    name: "Laptop Lenovo Thinkpad L14 Gen 4 Core i5",
    category: "Komputer & Laptop",
    client: "PT Origin Connect (Internal)",
    projectCode: "WO-ORG-002",
    quantity: 4,
    currentStage: AssetStage.DEPLOYED,
    createdAt: "2026-04-12T08:00:00Z",
    updatedAt: "2026-06-05T16:00:00Z",
    currentLocation: "Kantor Pusat Origin Connect - Divisi Operational",
    specs: {
      brand: "Lenovo",
      sku: "THK-L14-I5",
      dimensions: "32.5cm x 22cm x 1.9cm",
      powerWeight: "Adaptor 65W / 1.6 Kg"
    },
    qrcode: "ASETIFY-ASSET-ORIGIN-002",
    financials: {
      purchaseCost: 62000000, // 15.5jt per unit
      maintenanceCost: 1200000,
      disposalValue: 12000000
    },
    auditScore: 98,
    maintenanceStatus: "NONE",
    stageDetails: {
      request: {
        reqId: "REQ-ORG-611",
        timelineWeeks: 3,
        specsRequired: "Prosesor Core i5, RAM 16GB, SSD 512GB, Garansi Resmi Lenovo Indonesia",
        vendorName: "PT Metrodata Electronics",
        picName: "Hendra Wijaya",
        approvalDate: "2026-04-15T11:00:00Z"
      },
      production: {
        prodLead: "Distributor Lenovo JKT",
        qcInspector: "Feri",
        qcScore: 100,
        productionReportCode: "LPROD-IT-901",
        evidencePhoto: "https://images.unsplash.com/photo-1588508065123-287b28e013db?w=500&auto=format&fit=crop&q=60",
        readyDate: "2026-04-20T10:00:00Z"
      },
      inventory: {
        warehouseName: "Gudang Logistik Pusat",
        shelfLoc: "Sektor IT - Kabinet 1",
        stockCode: "STK-LEN-L14-I5",
        receivedDate: "2026-04-22T09:00:00Z",
        rackNumber: "CAB-IT-01"
      },
      shipping: {
        suratJalanNo: "SJ-IT-201",
        driverName: "Darno (Internal Go-Box)",
        vehiclePlate: "B 9044 SVX",
        vendorShipping: "Layanan Ekspedisi GoBox",
        departureTime: "2026-04-25T08:00:00Z"
      },
      transit: {
        currentLat: -6.2201,
        currentLng: 106.8228,
        eta: "2026-04-25T09:12:00Z",
        podTime: "2026-04-25T09:05:00Z",
        podRecipient: "Hendra Wijaya (Origin Staff)",
        signatureBase64: "Signed-HW",
        conditionOnArrival: "Sempurna"
      },
      deployment: {
        installTeam: "IT Support Team Origin",
        installationDate: "2026-04-26T10:00:00Z",
        planogramMatched: true,
        verifiedItems: ["Unit Laptop Lenovo", "Charger USB-C Type-C 65W", "Tas Laptop Ransel", "Lisensi Windows 11 Pro"],
        photoBefore: "https://images.unsplash.com/photo-1496181130204-7552cc14ac1a?w=500&auto=format&fit=crop&q=60",
        photoAfter: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=500&auto=format&fit=crop&q=60"
      },
      audit: {
        lastAuditDate: "2026-06-05T15:30:00Z",
        auditorName: "Rian Hidayat",
        findings: ["Kondisi body laptop mulus", "RAM dan SSD terbaca sesuai spesifikasi", "OS telah aktif dan terpasang antivirus korporat"],
        scoring: 98,
        recommendation: "Lakukan scan server malware rutin setiap awal bulan demi menjaga kerahasiaan data proyek b2b."
      },
      maintenance: {
        logHistory: []
      },
      retrieval: {},
      disposal: {}
    }
  },
  {
    id: "ASSET-ORIGIN-003",
    name: "CCTV Xiaomi Smart Camera Q2 HD",
    category: "Sistem Keamanan",
    client: "PT Origin Connect (Internal)",
    projectCode: "WO-ORG-003",
    quantity: 4,
    currentStage: AssetStage.MAINTENANCE,
    createdAt: "2026-04-01T09:00:00Z",
    updatedAt: "2026-06-07T14:00:00Z",
    currentLocation: "Ruang Logistik & Selasar Depan - Tahap Perbaikan",
    specs: {
      brand: "Xiaomi",
      sku: "XIA-Q2-IPCAM",
      dimensions: "11cm x 7.5cm x 7.5cm",
      powerWeight: "Baterai 5V Micro-USB / 0.3 Kg"
    },
    qrcode: "ASETIFY-ASSET-ORIGIN-003",
    financials: {
      purchaseCost: 3200000, // 800rb per unit
      maintenanceCost: 450000,
      disposalValue: 600000
    },
    auditScore: 78,
    maintenanceStatus: "REPAIRING",
    stageDetails: {
      request: {
        reqId: "REQ-ORG-492",
        timelineWeeks: 1,
        specsRequired: "IP Camera indoor, kualitas 1080p, koneksi Wifi 2.4Ghz, infrared mode malam, auto-track motion",
        vendorName: "PT Xiaomi Retail Indonesia",
        picName: "Dr. Gunawan",
        approvalDate: "2026-04-03T11:00:00Z"
      },
      production: {
        prodLead: "Xiaomi Distributor JKT",
        qcInspector: "Herman",
        qcScore: 92,
        productionReportCode: "LPROD-CAM-090",
        evidencePhoto: "https://images.unsplash.com/photo-1542060748-10c28b629f6f?w=500&auto=format&fit=crop&q=60",
        readyDate: "2026-04-10T15:00:00Z"
      },
      inventory: {
        warehouseName: "Gudang Utama Origin Jakarta",
        shelfLoc: "Kabinet Keamanan - A1",
        stockCode: "STK-XIA-Q2CAM",
        receivedDate: "2026-04-11T10:00:00Z",
        rackNumber: "CAB-SEC-01"
      },
      shipping: {
        suratJalanNo: "SJ-SEC-002",
        driverName: "Pak Lili (Kurir Lalamove)",
        vehiclePlate: "B 9382 PZX",
        vendorShipping: "Gojek/Lalamove Third-party",
        departureTime: "2026-04-14T08:00:00Z"
      },
      transit: {
        currentLat: -6.2201,
        currentLng: 106.8228,
        eta: "2026-04-14T09:30:00Z",
        podTime: "2026-04-14T09:12:00Z",
        podRecipient: "Siti Amelia",
        signatureBase64: "Signed-SA",
        conditionOnArrival: "Bagus"
      },
      deployment: {
        installTeam: "Origin Maintenance Team",
        installationDate: "2026-04-15T13:00:00Z",
        planogramMatched: true,
        verifiedItems: ["Unit Kamera", "Kabel adapter", "Bracket Dinding", "Micro SD Sandisk 64GB"],
        photoBefore: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=500&auto=format&fit=crop&q=60",
        photoAfter: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=500&auto=format&fit=crop&q=60"
      },
      audit: {
        lastAuditDate: "2026-06-06T10:00:00Z",
        auditorName: "Rian Hidayat",
        findings: ["1 unit CCTV di Area Selasar Depan sering kehilangan koneksi Wifi", "Gambar sempat terputus saat siang hari", "SD Card terdeteksi corrupt error write"],
        scoring: 78,
        recommendation: "Lakukan penggantian SD Card baru klas 10 dan tambahkan Wifi extender di area dekat selasar depan untuk stabilisasi jaringan."
      },
      maintenance: {
        activeTicketId: "TKT-CCTV-04",
        issueType: "Koneksi Wifi Putus & Write Error S-Card",
        reportedAt: "2026-06-07T08:30:00Z",
        technician: "Rian Saputra (Network Specialist)",
        repairCost: 150000,
        repairedParts: ["SD Card Sandisk 64GB Extreme", "Wifi Extender Broadlink"],
        logHistory: [
          { date: "2026-06-07", act: "Pemeriksaan sinyal wifi & penggantian memori", cost: 150000 }
        ]
      },
      retrieval: {},
      disposal: {}
    }
  },
  {
    id: "ASSET-ORIGIN-004",
    name: "Epson Printer Laserjet Mono L-Series",
    category: "Peralatan Kantor",
    client: "PT Origin Connect (Internal)",
    projectCode: "WO-ORG-004",
    quantity: 4,
    currentStage: AssetStage.INVENTORY,
    createdAt: "2026-05-15T09:00:00Z",
    updatedAt: "2026-06-04T11:00:00Z",
    currentLocation: "Gudang Utama Origin Jakarta - Shelf B1",
    specs: {
      brand: "Epson",
      sku: "EPS-LJT-MONO",
      dimensions: "37.5cm x 34.7cm x 17.9cm",
      powerWeight: "Listrik 45W / 4.4 Kg"
    },
    qrcode: "ASETIFY-ASSET-ORIGIN-004",
    financials: {
      purchaseCost: 11200000, // 2.8jt per unit
      maintenanceCost: 0,
      disposalValue: 1800000
    },
    auditScore: 100,
    maintenanceStatus: "NONE",
    stageDetails: {
      request: {
        reqId: "REQ-ORG-904",
        timelineWeeks: 1,
        specsRequired: "Printer Monochrome Laserjet, Cetak super cepat 20 ppm, koneksi wifi direct print USB",
        vendorName: "PT Prabu Epson Indonesia",
        picName: "Aris Munandar",
        approvalDate: "2026-05-18T10:00:00Z"
      },
      production: {
        prodLead: "Epson Partner Center JKT",
        qcInspector: "Dedi",
        qcScore: 98,
        productionReportCode: "LPROD-PRNT-12",
        evidencePhoto: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=500&auto=format&fit=crop&q=60",
        readyDate: "2026-05-25T13:00:00Z"
      },
      inventory: {
        warehouseName: "Gudang Utama Origin Jakarta",
        shelfLoc: "Blok ATK / Elektronik Lantai 1",
        stockCode: "STK-EPS-MONO-L",
        receivedDate: "2026-06-03T15:30:00Z",
        rackNumber: "BIN-A3-LIGHT"
      },
      shipping: {
        suratJalanNo: "",
        driverName: "",
        vehiclePlate: "",
        vendorShipping: "",
        departureTime: ""
      },
      transit: {
        currentLat: 0,
        currentLng: 0,
        eta: ""
      },
      deployment: {
        installTeam: "",
        installationDate: "",
        planogramMatched: false,
        verifiedItems: [],
        photoBefore: "",
        photoAfter: ""
      },
      audit: {
        lastAuditDate: "",
        auditorName: "",
        findings: [],
        scoring: 100,
        recommendation: ""
      },
      maintenance: {
        logHistory: []
      },
      retrieval: {},
      disposal: {}
    }
  },
  {
    id: "ASSET-ORIGIN-005",
    name: "LED TV 52\" LG Digital Display",
    category: "Display & Kiosk",
    client: "PT Origin Connect (Internal)",
    projectCode: "WO-ORG-005",
    quantity: 2,
    currentStage: AssetStage.DEPLOYED,
    createdAt: "2026-03-20T10:00:00Z",
    updatedAt: "2026-05-15T14:30:00Z",
    currentLocation: "Lobby Kantor Pusat & Ruang Pertemuan",
    specs: {
      brand: "LG",
      sku: "LG-52-LED-HD",
      dimensions: "115cm x 68cm x 8cm",
      powerWeight: "AC 220V 130W / 14 Kg"
    },
    qrcode: "ASETIFY-ASSET-ORIGIN-005",
    financials: {
      purchaseCost: 14500000, // 7.25jt per unit
      maintenanceCost: 350000,
      disposalValue: 3000000
    },
    auditScore: 96,
    maintenanceStatus: "NONE",
    stageDetails: {
      request: {
        reqId: "REQ-ORG-311",
        timelineWeeks: 2,
        specsRequired: "LED Display Smart TV 52 Inch, bracket dinding universal, resolusi Ultra HD 4K, colokan HDMI",
        vendorName: "PT Solusi Visualindo Pratama",
        picName: "Budi Santoso",
        approvalDate: "2026-03-24T09:30:00Z"
      },
      production: {
        prodLead: "LG Indowall Partner JKT",
        qcInspector: "Zulkifli",
        qcScore: 96,
        productionReportCode: "LPROD-LG52-89",
        evidencePhoto: "https://images.unsplash.com/photo-1542060748-10c28b629f6f?w=500&auto=format&fit=crop&q=60",
        readyDate: "2026-04-05T16:00:00Z"
      },
      inventory: {
        warehouseName: "Gudang Utama Origin Jakarta",
        shelfLoc: "Blok Monitor & Display B3",
        stockCode: "STK-LG52TV",
        receivedDate: "2026-04-08T11:00:00Z",
        rackNumber: "RACK-12-C"
      },
      shipping: {
        suratJalanNo: "SJ-LED-1092",
        driverName: "Dedi Santoso (Kurir Deliveree)",
        vehiclePlate: "B 9324 TNM",
        vendorShipping: "Deliveree Trans-Jakarta Logistics",
        departureTime: "2026-04-12T07:15:00Z"
      },
      transit: {
        currentLat: -6.2297,
        currentLng: 106.8166,
        eta: "2026-04-12T09:15:00Z",
        podTime: "2026-04-12T09:00:00Z",
        podRecipient: "Siti Amelia",
        signatureBase64: "Signed-SA-LG",
        conditionOnArrival: "Sempurna"
      },
      deployment: {
        installTeam: "Tech Support Squad JKT",
        installationDate: "2026-04-14T11:00:00Z",
        planogramMatched: true,
        verifiedItems: ["Unit LED TV 52\"", "Braket Dinding Besi", "Kabel HDMI 5m", "Modem Android TV Box"],
        photoBefore: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=500&auto=format&fit=crop&q=60",
        photoAfter: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=500&auto=format&fit=crop&q=60"
      },
      audit: {
        lastAuditDate: "2026-05-15T14:30:00Z",
        auditorName: "Rian Hidayat",
        findings: ["Kondisi visual 4K berjalan prima", "Bracket dinding terpasang sangat kokoh & stabil"],
        scoring: 96,
        recommendation: "Lakukan pembersihan layar dengan hand-wipe pembersih debu seminggu sekali demi menjaga durabilitas optical display."
      },
      maintenance: {
        logHistory: [
          { date: "2026-04-14", act: "Setup pemasangan & instalasi bracket", cost: 350000 }
        ]
      },
      retrieval: {},
      disposal: {}
    }
  },
  {
    id: "ASSET-RADU-001",
    name: "Saddle Bag Delivery Insulated Radu Food",
    category: "Tas Pengantaran",
    client: "Radu Food",
    projectCode: "WO-RDF-012",
    quantity: 145,
    currentStage: AssetStage.DEPLOYED,
    createdAt: "2026-04-10T09:00:00Z",
    updatedAt: "2026-06-04T15:00:00Z",
    currentLocation: "Didistribusikan ke Pengendara / Rider Radu Food JKT",
    specs: {
      brand: "Origin Custom Logistics",
      sku: "RDF-SAD-145",
      dimensions: "45cm x 45cm x 45cm",
      powerWeight: "Insothermal Foil / 2.5 Kg"
    },
    qrcode: "ASETIFY-ASSET-RADU-001",
    financials: {
      purchaseCost: 36250000, // 250rb per unit x 145
      maintenanceCost: 1500000,
      disposalValue: 4000000
    },
    auditScore: 94,
    maintenanceStatus: "NONE",
    stageDetails: {
      request: {
        reqId: "REQ-RDF-1122",
        timelineWeeks: 4,
        specsRequired: "Lebar 45cm persegi, lapisan aluminium foil penahan panas kualitas tinggi, tali motor ganda pasang kokoh",
        vendorName: "PT Tas Bagus Mandiri",
        picName: "Bayu Anggoro (VP Ops Radu Food)",
        approvalDate: "2026-04-12T13:00:00Z"
      },
      production: {
        prodLead: "Tas Custom Assembly Vendor",
        qcInspector: "Rudi Hartono",
        qcScore: 95,
        productionReportCode: "LPROD-BAG-023",
        evidencePhoto: "https://images.unsplash.com/photo-1542060748-10c28b629f6f?w=500&auto=format&fit=crop&q=60",
        readyDate: "2026-04-28T15:00:00Z"
      },
      inventory: {
        warehouseName: "Gudang Transit Hub Cakung",
        shelfLoc: "Blok Penampungan Kargo B1",
        stockCode: "STK-RDF-SAD-BAG",
        receivedDate: "2026-04-29T10:00:00Z",
        rackNumber: "ZONE-B1"
      },
      shipping: {
        suratJalanNo: "SJ-RDF-2012",
        driverName: "Bowo (Driver Sewaan Eksternal PT Logistik JKT)",
        vehiclePlate: "B 9381 TXX",
        vendorShipping: "PT Logistik Jaya Express Partner",
        departureTime: "2026-05-02T08:00:00Z"
      },
      transit: {
        currentLat: -6.1751,
        currentLng: 106.865,
        eta: "2026-05-02T11:00:00Z",
        podTime: "2026-05-02T10:45:00Z",
        podRecipient: "Pak Doni (Internal Logistic Radu)",
        signatureBase64: "Signed-Doni-RDF",
        conditionOnArrival: "Bagus"
      },
      deployment: {
        installTeam: "Radu Ops Delivery Unit",
        installationDate: "2026-05-04T13:00:00Z",
        planogramMatched: true,
        verifiedItems: ["145 unit saddle bag", "Tali pengait karet cadangan", "Skat pembagi internal box"],
        photoBefore: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=500&auto=format&fit=crop&q=60",
        photoAfter: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=500&auto=format&fit=crop&q=60"
      },
      audit: {
        lastAuditDate: "2026-06-04T15:00:00Z",
        auditorName: "Ahmad Rosihan",
        findings: ["140 unit terdistribusi dengan baik ke rider", "Kondisi lapisan isolator sangat prima menahan panas makanan", "5 unit cadangan disimpan di pusat administrasi"],
        scoring: 94,
        recommendation: "Lakukan pencucian berkala minimal 2 minggu sekali dengan disinfektan spray food-grade agar higienitas terjaga."
      },
      maintenance: {
        logHistory: []
      },
      retrieval: {},
      disposal: {}
    }
  },
  {
    id: "ASSET-AICE-001",
    name: "Tenda Sarnafil Event AICE & Kaluli 3x3",
    category: "Perlengkapan Event",
    client: "AICE & Kaluli (Event Sampling & Selling)",
    projectCode: "WO-ACE-101",
    quantity: 2,
    currentStage: AssetStage.TRANSIT,
    createdAt: "2026-05-20T07:30:00Z",
    updatedAt: "2026-06-08T01:00:00Z",
    currentLocation: "Dalam Perjalanan - Tol Jakarta-Cikampek Km 42 (Pihak Ke-3)",
    specs: {
      brand: "Custom Sarnafil",
      sku: "ACE-SML-3X3",
      dimensions: "300cm x 300cm x 280cm (3x3m)",
      powerWeight: "Besi Hollow Tahan Cuaca / 45 Kg"
    },
    qrcode: "ASETIFY-ASSET-AICE-001",
    financials: {
      purchaseCost: 9600000, // 4.8jt per unit x 2
      maintenanceCost: 0,
      disposalValue: 1500000
    },
    auditScore: 100,
    maintenanceStatus: "NONE",
    stageDetails: {
      request: {
        reqId: "REQ-ACE-982",
        timelineWeeks: 3,
        specsRequired: "Tenda Sarnafil Kerucut Ukuran 3x3 PVC tebal anti air luar ruangan, sablon logo AICE penuh di 4 Sisi",
        vendorName: "PT Tenda Kreatif Nusantara",
        picName: "Aris Munandar (Origin Event Manager)",
        approvalDate: "2025-05-22T09:00:00Z"
      },
      production: {
        prodLead: "Tenda Prod Div",
        qcInspector: "Fajar Wicaksono",
        qcScore: 97,
        productionReportCode: "LPROD-SNDG-11",
        evidencePhoto: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=500&auto=format&fit=crop&q=60",
        readyDate: "2026-06-01T14:00:00Z"
      },
      inventory: {
        warehouseName: "Gudang Transit Hub Cakung",
        shelfLoc: "Sektor Perlengkapan Berat Event",
        stockCode: "STK-ACE-SARNAFIL",
        receivedDate: "2026-06-02T11:00:00Z",
        rackNumber: "ZONE-A4-IT"
      },
      shipping: {
        suratJalanNo: "SJ-SAR-2041",
        driverName: "Kurniawan (Driver Expedisi Sewaan JKT)",
        vehiclePlate: "B 9942 UCF",
        vendorShipping: "PT Antar Kota Sentosa Express",
        departureTime: "2026-06-08T00:30:00Z"
      },
      transit: {
        currentLat: -6.3475,
        currentLng: 107.2882,
        eta: "2026-06-08T04:30:00Z",
        conditionOnArrival: "Bagus"
      },
      deployment: {
        installTeam: "Aice Activation Squad JKT",
        installationDate: "",
        planogramMatched: false,
        verifiedItems: ["Kerangka Tenda Sarnafil", "Penutup Terpal Atap Kerucut", "Dinding Samping Mika Parasut", "Pasak & Tali Angin"],
        photoBefore: "",
        photoAfter: ""
      },
      audit: {
        lastAuditDate: "",
        auditorName: "",
        findings: [],
        scoring: 100,
        recommendation: ""
      },
      maintenance: {
        logHistory: []
      },
      retrieval: {},
      disposal: {}
    }
  },
  {
    id: "ASSET-AICE-002",
    name: "Promotional Event Desk Portable AICE",
    category: "Perlengkapan Event",
    client: "AICE & Kaluli (Event Sampling & Selling)",
    projectCode: "WO-ACE-101",
    quantity: 2,
    currentStage: AssetStage.REQUEST,
    createdAt: "2026-06-05T10:00:00Z",
    updatedAt: "2026-06-08T02:00:00Z",
    currentLocation: "Tahap Pembelian / Persetujuan Finansial",
    specs: {
      brand: "Origin Custom Desk",
      sku: "ACE-EVD-002",
      dimensions: "80cm x 40cm x 195cm Desk Area",
      powerWeight: "Kerangka PVC Board Melamin / 8 Kg"
    },
    qrcode: "ASETIFY-ASSET-AICE-002",
    financials: {
      purchaseCost: 2600000, // 1.3jt per unit x 2
      maintenanceCost: 0,
      disposalValue: 400000
    },
    auditScore: 100,
    maintenanceStatus: "NONE",
    stageDetails: {
      request: {
        reqId: "REQ-ACE-1144",
        timelineWeeks: 1,
        specsRequired: "Event desk bongkar pasang, bahan kokoh, stiker decal vinyl laminasi logo visual AICE Event",
        vendorName: "PT Ritel Prima Visual",
        picName: "Sari Devi (VP Client Relation)",
        approvalDate: "2026-06-08T09:00:00Z"
      },
      production: {
        prodLead: "",
        qcInspector: "",
        qcScore: 0,
        productionReportCode: "",
        evidencePhoto: "",
        readyDate: ""
      },
      inventory: {
        warehouseName: "",
        shelfLoc: "",
        stockCode: "",
        receivedDate: "",
        rackNumber: ""
      },
      shipping: {
        suratJalanNo: "",
        driverName: "",
        vehiclePlate: "",
        vendorShipping: "",
        departureTime: ""
      },
      transit: {
        currentLat: 0,
        currentLng: 0,
        eta: ""
      },
      deployment: {
        installTeam: "",
        installationDate: "",
        planogramMatched: false,
        verifiedItems: [],
        photoBefore: "",
        photoAfter: ""
      },
      audit: {
        lastAuditDate: "",
        auditorName: "",
        findings: [],
        scoring: 100,
        recommendation: ""
      },
      maintenance: {
        logHistory: []
      },
      retrieval: {},
      disposal: {}
    }
  },
  {
    id: "ASSET-AICE-003",
    name: "Seragam Event SPG/SPB AICE & Kaluli",
    category: "Seragam & Atribut",
    client: "AICE & Kaluli (Event Sampling & Selling)",
    projectCode: "WO-ACE-101",
    quantity: 10,
    currentStage: AssetStage.PRODUCTION,
    createdAt: "2026-06-01T09:45:00Z",
    updatedAt: "2026-06-07T14:30:00Z",
    currentLocation: "Lini Penjahitan / Bordir Convection Vendor",
    specs: {
      brand: "Convection Custom",
      sku: "ACE-CWS-010",
      dimensions: "Ukuran S, M, L (Fit SPG Crew)",
      powerWeight: "Cotton Combed Kombinasi / 3 Kg"
    },
    qrcode: "ASETIFY-ASSET-AICE-003",
    financials: {
      purchaseCost: 1800050, // 180rb per unit x 10
      maintenanceCost: 0,
      disposalValue: 150000
    },
    auditScore: 100,
    maintenanceStatus: "NONE",
    stageDetails: {
      request: {
        reqId: "REQ-ACE-9011",
        timelineWeeks: 1,
        specsRequired: "T-shirt kerah perpaduan warna cyan biru putih, bordir logo sablon AICE Sampling dibagian punggung",
        vendorName: "PT Sandang Rekat Event",
        picName: "Aris Munandar",
        approvalDate: "2026-06-02T10:00:00Z"
      },
      production: {
        prodLead: "Anton Hermawan (UT Assembly)",
        qcInspector: "Danu Broto",
        qcScore: 94,
        productionReportCode: "LPROD-GEN-1020",
        evidencePhoto: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500&auto=format&fit=crop&q=60",
        readyDate: "2026-06-12T16:00:00Z"
      },
      inventory: {
        warehouseName: "",
        shelfLoc: "",
        stockCode: "",
        receivedDate: "",
        rackNumber: ""
      },
      shipping: {
        suratJalanNo: "",
        driverName: "",
        vehiclePlate: "",
        vendorShipping: "",
        departureTime: ""
      },
      transit: {
        currentLat: 0,
        currentLng: 0,
        eta: ""
      },
      deployment: {
        installTeam: "",
        installationDate: "",
        planogramMatched: false,
        verifiedItems: [],
        photoBefore: "",
        photoAfter: ""
      },
      audit: {
        lastAuditDate: "",
        auditorName: "",
        findings: [],
        scoring: 100,
        recommendation: ""
      },
      maintenance: {
        logHistory: []
      },
      retrieval: {},
      disposal: {}
    }
  },
  {
    id: "ASSET-AICE-004",
    name: "Rolling Banner Promotional Event AICE",
    category: "Perlengkapan Event",
    client: "AICE & Kaluli (Event Sampling & Selling)",
    projectCode: "WO-ACE-101",
    quantity: 2,
    currentStage: AssetStage.DEPLOYED,
    createdAt: "2026-05-10T10:00:00Z",
    updatedAt: "2026-06-03T14:30:00Z",
    currentLocation: "Lokasi Mall Kalibata City JKT",
    specs: {
      brand: "Origin Custom Banner",
      sku: "ACE-RLB-002",
      dimensions: "85cm x 200cm Pull-Up Display",
      powerWeight: "Baja Kaki Ringan Alumunium / 2.8 Kg"
    },
    qrcode: "ASETIFY-ASSET-AICE-004",
    financials: {
      purchaseCost: 1100000, // 550rb per unit x 2
      maintenanceCost: 50000,
      disposalValue: 200000
    },
    auditScore: 98,
    maintenanceStatus: "NONE",
    stageDetails: {
      request: {
        reqId: "REQ-ACE-1012",
        timelineWeeks: 1,
        specsRequired: "Bahan kertas Albatros khusus dengan laminating doff tahan gesek ringan, kelengkapan tas kawat",
        vendorName: "PT Prabu Epson Indonesia",
        picName: "Budi Santoso",
        approvalDate: "2026-05-12T10:00:00Z"
      },
      production: {
        prodLead: "Banner Print Hub",
        qcInspector: "Rina Malika",
        qcScore: 98,
        productionReportCode: "LPROD-BAN-011",
        evidencePhoto: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=500&auto=format&fit=crop&q=60",
        readyDate: "2026-05-18T13:00:00Z"
      },
      inventory: {
        warehouseName: "Gudang Utama Origin Jakarta",
        shelfLoc: "Sektor Event - Rack Stand 2",
        stockCode: "STK-ACE-BANNER",
        receivedDate: "2026-05-19T11:00:00Z",
        rackNumber: "ZONE-EVENT"
      },
      shipping: {
        suratJalanNo: "SJ-BANNER-02",
        driverName: "Andi (Ojek Grab Express)",
        vehiclePlate: "B 9382 PXX",
        vendorShipping: "Gojek/Grab Instant Courier",
        departureTime: "2026-05-20T08:00:00Z"
      },
      transit: {
        currentLat: -6.2201,
        currentLng: 106.8228,
        eta: "2026-05-20T09:30:00Z",
        podTime: "2026-05-20T09:12:00Z",
        podRecipient: "Barista Lead Kalibata",
        signatureBase64: "Signed-BL",
        conditionOnArrival: "Sempurna"
      },
      deployment: {
        installTeam: "Aice Activation Squad JKT",
        installationDate: "2026-05-21T10:00:00Z",
        planogramMatched: true,
        verifiedItems: ["2 unit rolling banner", "Tiang penyangga alumunium", "Tas kanvas pelindung"],
        photoBefore: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=500&auto=format&fit=crop&q=60",
        photoAfter: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500&auto=format&fit=crop&q=60"
      },
      audit: {
        lastAuditDate: "2026-06-03T14:30:00Z",
        auditorName: "Rian Hidayat",
        findings: ["Kondisi visual sangat memikat", "Struktur kaki alumunium tebal tegak lurus sempurna"],
        scoring: 98,
        recommendation: "Pastikan dibersihkan kain halus microfiber kering saat penutupan stand event setiap sore."
      },
      maintenance: {
        logHistory: []
      },
      retrieval: {},
      disposal: {}
    }
  },
  {
    id: "ASSET-GARUDA-001",
    name: "Promotional Event Desk Portable Garudafood",
    category: "Perlengkapan Event",
    client: "Garudafood (Event Campus Sampling)",
    projectCode: "WO-GFD-202",
    quantity: 2,
    currentStage: AssetStage.DEPLOYED,
    createdAt: "2026-05-01T08:00:00Z",
    updatedAt: "2026-06-05T14:30:00Z",
    currentLocation: "Universitas Indonesia - Area Aktivasi Food Court",
    specs: {
      brand: "Origin Custom Desk",
      sku: "GFD-EVD-002",
      dimensions: "80cm x 40cm x 195cm Display Desk",
      powerWeight: "Kerangka PVC Board Melamin / 8 Kg"
    },
    qrcode: "ASETIFY-ASSET-GARUDA-001",
    financials: {
      purchaseCost: 2600000, // 1.3jt per unit x 2
      maintenanceCost: 100000,
      disposalValue: 400000
    },
    auditScore: 98,
    maintenanceStatus: "NONE",
    stageDetails: {
      request: {
        reqId: "REQ-2026-0551",
        timelineWeeks: 4,
        specsRequired: "Event desk bongkar pasang, bahan kokoh, stiker decal vinyl laminasi logo visual Garudafood Event",
        vendorName: "PT Sentra Solusi Visual",
        picName: "Budi Santoso",
        approvalDate: "2026-05-03T10:00:00Z"
      },
      production: {
        prodLead: "PT Sentra Solusi Visual JKT",
        qcInspector: "Siti Rahma",
        qcScore: 97,
        productionReportCode: "LPROD-DISPLAY-0912",
        evidencePhoto: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=500&auto=format&fit=crop&q=60",
        readyDate: "2026-05-18T16:00:00Z"
      },
      inventory: {
        warehouseName: "Gudang Utama JKT Cikarang",
        shelfLoc: "Blok B-Rack 12",
        stockCode: "STK-55ISK-99",
        receivedDate: "2026-05-19T09:30:00Z",
        rackNumber: "RACK-12-C"
      },
      shipping: {
        suratJalanNo: "SJ-DISP-8910",
        driverName: "Dedi Sumantri (Sewa Deliveree JKT)",
        vehiclePlate: "B 9102 TXS",
        vendorShipping: "PT Logistik Jaya Express",
        departureTime: "2026-05-24T07:15:00Z"
      },
      transit: {
        currentLat: -6.2297,
        currentLng: 106.8166,
        eta: "2026-05-24T10:15:00Z",
        podTime: "2026-05-24T09:45:00Z",
        podRecipient: "Arwan (Staff UI)",
        signatureBase64: "Signed-M",
        conditionOnArrival: "Sempurna"
      },
      deployment: {
        installTeam: "Origin Event Squad JKT",
        installationDate: "2026-05-25T11:00:00Z",
        planogramMatched: true,
        verifiedItems: ["2 unit event desk portable", "Atap header board", "Tiang penyangga", "Tas hitam tenteng"],
        photoBefore: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=500&auto=format&fit=crop&q=60",
        photoAfter: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=500&auto=format&fit=crop&q=60"
      },
      audit: {
        lastAuditDate: "2026-06-05T14:30:00Z",
        auditorName: "Rian Hidayat",
        findings: ["Desk berfungsi normal", "Pemasangan vinyl decal sangat mulus tanpa bubble air"],
        scoring: 98,
        recommendation: "Lakukan pencatatan relokasi jika kampus mengizinkan stand dipindah area lobi luar."
      },
      maintenance: {
        logHistory: []
      },
      retrieval: {},
      disposal: {}
    }
  },
  {
    id: "ASSET-GARUDA-002",
    name: "Seragam Event Crew Garudafood",
    category: "Seragam & Atribut",
    client: "Garudafood (Event Campus Sampling)",
    projectCode: "WO-GFD-202",
    quantity: 10,
    currentStage: AssetStage.RETRIEVAL,
    createdAt: "2024-03-10T08:00:00Z",
    updatedAt: "2026-06-08T01:30:00Z",
    currentLocation: "Kantor Pusat / Gudang Retur Cikarang",
    specs: {
      brand: "Convection Custom",
      sku: "GFD-CWS-010",
      dimensions: "Ukuran Standar L dan XL",
      powerWeight: "Cotton Combed / 3 Kg"
    },
    qrcode: "ASETIFY-ASSET-GARUDA-002",
    financials: {
      purchaseCost: 1800000,
      maintenanceCost: 154000,
      disposalValue: 150000
    },
    auditScore: 82,
    maintenanceStatus: "NONE",
    stageDetails: {
      request: {
        reqId: "REQ-24-0331",
        timelineWeeks: 4,
        specsRequired: "Baju kaos oranye hitam lengan pendek dengan sablon Garudafood Go Campus di dada",
        vendorName: "PT Toffin Indonesia",
        picName: "Sari Devi (VP Ops Client Support)",
        approvalDate: "2024-03-12T10:00:00Z"
      },
      production: {
        prodLead: "Convection Partner",
        qcInspector: "Feri",
        qcScore: 96,
        productionReportCode: "LPROD-SNDG-04",
        evidencePhoto: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500&auto=format&fit=crop&q=60",
        readyDate: "2024-03-22T15:00:00Z"
      },
      inventory: {
        warehouseName: "Gudang Utama Cikarang Barat",
        shelfLoc: "Sektor Premium-2",
        stockCode: "STK-LM-LINEAPB",
        receivedDate: "2024-03-24T09:00:00Z",
        rackNumber: "PREM-02"
      },
      shipping: {
        suratJalanNo: "SJ-COF-1022",
        driverName: "Rohmat (Kurir Expedisi Sewa)",
        vehiclePlate: "B 1205 SYZ",
        vendorShipping: "PT Logistik Jaya Express",
        departureTime: "2024-03-26T07:30:00Z"
      },
      transit: {
        currentLat: -6.2201,
        currentLng: 106.8228,
        eta: "24-03-26T09:30:00Z",
        podTime: "2024-03-26T09:12:00Z",
        podRecipient: "Hassan (Crew Lead UI)",
        signatureBase64: "Signed-Bar",
        conditionOnArrival: "Sempurna"
      },
      deployment: {
        installTeam: "Aktivasi Crew Lapangan JKT",
        installationDate: "2024-03-27T10:00:00Z",
        planogramMatched: true,
        verifiedItems: ["10 unit baju kaos crew dlm kantong"],
        photoBefore: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=500&auto=format&fit=crop&q=60",
        photoAfter: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500&auto=format&fit=crop&q=60"
      },
      audit: {
        lastAuditDate: "2026-06-01T15:00:00Z",
        auditorName: "Siti Amelia",
        findings: ["Kondisi kaos beberapa ada jahitan longgar setelah event kampus usai", "Kaos ditarik kembali untuk dicuci ulang dan disimpan"],
        scoring: 82,
        recommendation: "Relokasi atau tarik unit ke warehouse pusat karena event kampus paruh awal tahun telah berakhir resmi."
      },
      maintenance: {
        logHistory: []
      },
      retrieval: {
        requestDate: "2026-06-08T01:30:00Z",
        reason: "Kampus UI Event usai, sisa seragam dicuci bersih dan ditarik kembali ke gudang pusat retur.",
        assessResult: "REDEPLOY",
        checkedBy: "Sandi (Toffin Tech Specialist)",
        conditionRating: 4
      },
      disposal: {}
    }
  },
  {
    id: "ASSET-GARUDA-003",
    name: "Rolling Banner Promotional Event Garudafood",
    category: "Perlengkapan Event",
    client: "Garudafood (Event Campus Sampling)",
    projectCode: "WO-GFD-202",
    quantity: 2,
    currentStage: AssetStage.INVENTORY,
    createdAt: "2026-05-20T10:00:00Z",
    updatedAt: "2026-06-04T16:00:00Z",
    currentLocation: "Gudang Utama JKT Cikarang - Bagian L",
    specs: {
      brand: "Origin Custom Banner",
      sku: "GFD-RLB-002",
      dimensions: "85cm x 200cm Pull-Up Display",
      powerWeight: "Baja Kaki Ringan Alumunium / 2.8 Kg"
    },
    qrcode: "ASETIFY-ASSET-GARUDA-003",
    financials: {
      purchaseCost: 1100000, // 550rb per unit x 2
      maintenanceCost: 0,
      disposalValue: 200000
    },
    auditScore: 100,
    maintenanceStatus: "NONE",
    stageDetails: {
      request: {
        reqId: "REQ-2026-0622",
        timelineWeeks: 3,
        specsRequired: "Bahan kertas Albatros khusus dengan laminating doff tahan gesek ringan, logo event Garudafood Go Campus",
        vendorName: "PT Ritel Pintar Kasir",
        picName: "Sari Devi (VP Ops)",
        approvalDate: "2026-05-22T11:00:00Z"
      },
      production: {
        prodLead: "Banner Print Hub",
        qcInspector: "Rina Malika",
        qcScore: 98,
        productionReportCode: "LPROD-POS-011",
        evidencePhoto: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=500&auto=format&fit=crop&q=60",
        readyDate: "2026-06-02T13:00:00Z"
      },
      inventory: {
        warehouseName: "Gudang Utama JKT Cikarang",
        shelfLoc: "Blok C-Shelf 04 (Bin K)",
        stockCode: "STK-POS-E9-KK",
        receivedDate: "2026-06-03T15:30:00Z",
        rackNumber: "BIN-A3-LIGHT"
      },
      shipping: {
        suratJalanNo: "",
        driverName: "",
        vehiclePlate: "",
        vendorShipping: "",
        departureTime: ""
      },
      transit: {
        currentLat: 0,
        currentLng: 0,
        eta: ""
      },
      deployment: {
        installTeam: "",
        installationDate: "",
        planogramMatched: false,
        verifiedItems: [],
        photoBefore: "",
        photoAfter: ""
      },
      audit: {
        lastAuditDate: "",
        auditorName: "",
        findings: [],
        scoring: 100,
        recommendation: ""
      },
      maintenance: {
        logHistory: []
      },
      retrieval: {},
      disposal: {}
    }
  },
  {
    id: "ASSET-SCARLETT-001",
    name: "Camera Pocket Recorder Xiaomi Yi Action Cam",
    category: "Kamera & IT",
    client: "Scarlett (Mystery Shopper)",
    projectCode: "WO-SCL-303",
    quantity: 50,
    currentStage: AssetStage.AUDITING,
    createdAt: "2026-02-15T09:00:00Z",
    updatedAt: "2026-06-01T10:00:00Z",
    currentLocation: "Didistribusikan ke Agen Penilai Scarlett Jabodetabek",
    specs: {
      brand: "Xiaomi",
      sku: "XIA-YI-ACT50",
      dimensions: "6cm x 4.2cm x 2.1cm Mini Action Cam",
      powerWeight: "Baterai Li-ion 5W / 0.15 Kg"
    },
    qrcode: "ASETIFY-ASSET-SCARLETT-001",
    financials: {
      purchaseCost: 62500000, // 1.25jt per unit x 50
      maintenanceCost: 3500000,
      disposalValue: 5000000
    },
    auditScore: 92,
    maintenanceStatus: "NONE",
    stageDetails: {
      request: {
        reqId: "REQ-2023-0091",
        timelineWeeks: 2,
        specsRequired: "Kamera pocket action mini Xiaomi Yi, resolusi Full HD, penyuplai baterai tambahan, micro SD 32GB",
        vendorName: "PT Scarlett Bintang Retail",
        picName: "Prof. Sudaryono (Operational Consultant)",
        approvalDate: "2023-02-18T10:30:00Z"
      },
      production: {
        prodLead: "Xiaomi Distributor Center",
        qcInspector: "Ferry",
        qcScore: 99,
        productionReportCode: "LPROD-CAM-0901",
        evidencePhoto: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=500&auto=format&fit=crop&q=60",
        readyDate: "2023-02-25T14:00:00Z"
      },
      inventory: {
        warehouseName: "Gudang Logistik Utama",
        shelfLoc: "Lemari IT / Optik Sektor 1",
        stockCode: "STK-CAM-SCL-01",
        receivedDate: "2023-02-28T09:00:00Z",
        rackNumber: "CAB-AV-01"
      },
      shipping: {
        suratJalanNo: "SJ-CAM-SCL",
        driverName: "Darno (Kurir Logistik Origin)",
        vehiclePlate: "B 1202 JXF",
        vendorShipping: "Kurir Sewaan Lalamove Car",
        departureTime: "2023-03-01T08:00:00Z"
      },
      transit: {
        currentLat: -7.7712,
        currentLng: 110.3776,
        eta: "2023-03-01T09:00:00Z",
        podTime: "2023-03-01T08:50:00Z",
        podRecipient: "Irwan (Coordinator Mystery Shopper Scarlett)",
        signatureBase64: "Signed-Sosio",
        conditionOnArrival: "Sempurna"
      },
      deployment: {
        installTeam: "Mystery Shopper Scarlett Ops",
        installationDate: "2023-03-02T10:00:00Z",
        planogramMatched: true,
        verifiedItems: ["50 unit kamera pocket", "50 unit silicon casing pelindung", "50 unit Micro SD 32GB"],
        photoBefore: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=500&auto=format&fit=crop&q=60",
        photoAfter: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=500&auto=format&fit=crop&q=60"
      },
      audit: {
        lastAuditDate: "2026-05-15T09:15:00Z",
        auditorName: "Rudi Hartoyo (Audit Aset)",
        findings: ["48 unit kamera dilaporkan berfungsi sangat baik untuk merekam secara tersembunyi", "2 unit mengalami penurunan daya tahan baterai drop"],
        scoring: 92,
        recommendation: "Ajukan pembelian 2 unit baterai kancing isi ulang cadangan untuk menggantikan performa unit yang mulai melemah."
      },
      maintenance: {
        logHistory: [
          { date: "2024-05-12", act: "Format berkala memori Micro SD", cost: 0 },
          { date: "2025-06-12", act: "Pengepakan silikon karet pelindung baru", cost: 1500000 }
        ]
      },
      retrieval: {},
      disposal: {}
    }
  },
  {
    id: "ASSET-SCARLETT-002",
    name: "ID Card Cardholder Mystery Shopper Scarlett",
    category: "Seragam & Atribut",
    client: "Scarlett (Mystery Shopper)",
    projectCode: "WO-SCL-303",
    quantity: 50,
    currentStage: AssetStage.DEPLOYED,
    createdAt: "2026-05-15T10:00:00Z",
    updatedAt: "2026-05-25T11:00:00Z",
    currentLocation: "Dibagikan ke Tim Mystery Shopper Scarlett JKT",
    specs: {
      brand: "Origin Custom Print",
      sku: "SCL-IDC-050",
      dimensions: "Ukuran Standar ID Card (8.5cm x 11cm)",
      powerWeight: "Bahan PVC Hard / 0.05 Kg"
    },
    qrcode: "ASETIFY-ASSET-SCARLETT-002",
    financials: {
      purchaseCost: 1250000, // 25rb per unit x 50
      maintenanceCost: 0,
      disposalValue: 0
    },
    auditScore: 100,
    maintenanceStatus: "NONE",
    stageDetails: {
      request: {
        reqId: "REQ-SCL-892",
        timelineWeeks: 1,
        specsRequired: "ID Card bahan PVC kokoh dengan cetak logo Scarlett Mystery Shopper eksklusif, dilengkapi tali lanyard oranye",
        vendorName: "PT Scarlett Bintang Retail",
        picName: "Aris Munandar",
        approvalDate: "2026-05-18T10:05:00Z"
      },
      production: {
        prodLead: "Digital Printing Hub",
        qcInspector: "Iwan Setiawan",
        qcScore: 100,
        productionReportCode: "LPROD-IDC-01",
        evidencePhoto: "https://images.unsplash.com/photo-1542060748-10c28b629f6f?w=500&auto=format&fit=crop&q=60",
        readyDate: "2026-05-20T14:30:00Z"
      },
      inventory: {
        warehouseName: "Gudang Utama Origin Jakarta",
        shelfLoc: "Kabinet Atribut Karyawan - C3",
        stockCode: "STK-SCL-IDC-Y1",
        receivedDate: "2026-05-22T09:00:00Z",
        rackNumber: "CAB-ATK-10"
      },
      shipping: {
        suratJalanNo: "SJ-IDC-2401",
        driverName: "Darno",
        vehiclePlate: "B 9382 PXX",
        vendorShipping: "Grab Instant Courier Sewaan",
        departureTime: "2026-05-24T08:00:00Z"
      },
      transit: {
        currentLat: -6.2201,
        currentLng: 106.8228,
        eta: "2026-05-24T09:00:00Z",
        podTime: "2026-05-24T08:50:00Z",
        podRecipient: "Irwan (Coordinator Mystery Shopper)",
        signatureBase64: "Signed-Irwan",
        conditionOnArrival: "Sempurna"
      },
      deployment: {
        installTeam: "Scarlett Audit Team",
        installationDate: "2026-05-25T11:00:00Z",
        planogramMatched: true,
        verifiedItems: ["50 unit ID card lanyard oranye"],
        photoBefore: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=500&auto=format&fit=crop&q=60",
        photoAfter: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=500&auto=format&fit=crop&q=60"
      },
      audit: {
        lastAuditDate: "2026-05-25T11:00:00Z",
        auditorName: "Rian Hidayat",
        findings: ["ID Card tercetak sangat rapi", "Tali lanyard tebal dan tahan lama"],
        scoring: 100,
        recommendation: "Bagikan kartu identitas sebelum dimulainya mystery shopping di outlet rekanan."
      },
      maintenance: {
        logHistory: []
      },
      retrieval: {},
      disposal: {}
    }
  }
];

export const INITIAL_ACTIVITY_LOGS: ActivityLog[] = [
  {
    id: "LOG-001",
    timestamp: "2026-06-08T01:30:00Z",
    assetId: "ASSET-GARUDA-002",
    assetName: "Seragam Event Crew Garudafood",
    stage: AssetStage.RETRIEVAL,
    action: "Memulai penarikan 10 unit baju event setelah program sampling Garudafood di UI rampung.",
    operator: "Sari Devi (VP Ops Client Support)",
    type: "info"
  },
  {
    id: "LOG-002",
    timestamp: "2026-06-08T00:30:00Z",
    assetId: "ASSET-AICE-001",
    assetName: "Tenda Sarnafil Event AICE & Kaluli 3x3",
    stage: AssetStage.TRANSIT,
    action: "Surat Jalan SJ-SAR-2041 terbit. Unit tenda dikirim menggunakan kargo sewaan plat B 9942 UCF.",
    operator: "Kurniawan (Driver Ekspedisi Sewaan)",
    type: "success"
  },
  {
    id: "LOG-003",
    timestamp: "2026-06-08T01:10:00Z",
    assetId: "ASSET-AICE-002",
    assetName: "Promotional Event Desk Portable AICE",
    stage: AssetStage.REQUEST,
    action: "Work Order WO-ACE-101 terbit. Mengajukan kelengkapan event desk untuk launching area Kalibata.",
    operator: "Sari Devi (VP Client Relation)",
    type: "success"
  },
  {
    id: "LOG-004",
    timestamp: "2026-06-07T08:30:00Z",
    assetId: "ASSET-ORIGIN-003",
    assetName: "CCTV Xiaomi Smart Camera Q2 HD",
    stage: AssetStage.MAINTENANCE,
    action: "Tiket Perawatan TKT-CCTV-04 dibuka setelah selasar depan mendapati putusnya koneksi transit IP.",
    operator: "Siti Amelia",
    type: "warning"
  },
  {
    id: "LOG-005",
    timestamp: "2026-06-05T15:30:00Z",
    assetId: "ASSET-ORIGIN-002",
    assetName: "Laptop Lenovo Thinkpad L14 Gen 4 Core i5",
    stage: AssetStage.DEPLOYED,
    action: "Audit kepatuhan hardware tahunan rampung di kantor pusat. Otoritas kelayakan: 98/100.",
    operator: "Rian Hidayat",
    type: "success"
  }
];

export const ALL_STEPS_FLOW = [
  {
    step: 1,
    id: "REQUEST",
    title: "1. REQUEST PROJECT",
    desc: "Client mengajukan kebutuhan aset untuk project",
    icon: "ClipboardList",
    bgColor: "bg-blue-50 border-blue-200 text-blue-700",
    colorHex: "#1d4ed8",
    outputs: ["Nomor Project", "Work Order (WO)", "Timeline Project", "QR Code Project"]
  },
  {
    step: 2,
    id: "PRODUCTION",
    title: "2. PRODUKSI ASET",
    desc: "Proses produksi aset sesuai spesifikasi & standar",
    icon: "Settings",
    bgColor: "bg-teal-50 border-teal-200 text-teal-700",
    colorHex: "#0d9488",
    outputs: ["Laporan Produksi", "QC Report", "Foto/Video Evidence", "Approval Digital"]
  },
  {
    step: 3,
    id: "INVENTORY",
    title: "3. INVENTORY & GUDANG",
    desc: "Aset jadi disimpan dan dikelola di gudang utama",
    icon: "Home",
    bgColor: "bg-green-50 border-green-200 text-green-700",
    colorHex: "#15803d",
    outputs: ["Stock Report", "Kartu Aset", "QR/Barcode Aset", "Inventory Report"]
  },
  {
    step: 4,
    id: "SHIPPING",
    title: "4. PENGIRIMAN",
    desc: "Pengiriman aset dari gudang ke lokasi project tujuan",
    icon: "Truck",
    bgColor: "bg-orange-50 border-orange-200 text-orange-700",
    colorHex: "#ea580c",
    outputs: ["Surat Jalan", "DO (Delivery Order)", "Kategori Rute", "Driver Contact"]
  },
  {
    step: 5,
    id: "TRANSIT",
    title: "5. TRACKING DELIVERY",
    desc: "Monitoring pengiriman hingga aset tiba di lokasi",
    icon: "MapPin",
    bgColor: "bg-amber-50 border-amber-200 text-amber-700",
    colorHex: "#d97706",
    outputs: ["POD (Foto + TTD)", "Timestamp Tiba", "Lokasi GPS", "Kondisi Aset Saat Tiba"]
  },
  {
    step: 6,
    id: "DEPLOYED",
    title: "6. PEMASANGAN / DEPLOYMENT",
    desc: "Pemasangan aset di lokasi sesuai planogram",
    icon: "Compass",
    bgColor: "bg-indigo-50 border-indigo-200 text-indigo-700",
    colorHex: "#4f46e5",
    outputs: ["Checklist Digital", "Foto Before-After", "Video Evidence", "Lokasi Presisi GPS"]
  },
  {
    step: 7,
    id: "AUDITING",
    title: "7. AUDIT & MONITORING",
    desc: "Audit berkala memastikan kondisi & kepatuhan",
    icon: "ShieldAlert",
    bgColor: "bg-pink-50 border-pink-200 text-pink-700",
    colorHex: "#be185d",
    outputs: ["Audit Report", "Skor & Temuan", "Rekomendasi Tindakan"]
  },
  {
    step: 8,
    id: "MAINTENANCE",
    title: "8. MAINTENANCE",
    desc: "Perbaikan / perawatan aset agar berfungsi optimal",
    icon: "Wrench",
    bgColor: "bg-rose-50 border-rose-200 text-rose-700",
    colorHex: "#e11d48",
    outputs: ["Ticket Maintenance", "Foto Perbaikan", "Laporan Perbaikan", "Biaya Perawatan"]
  },
  {
    step: 9,
    id: "RETRIEVAL",
    title: "9. PENARIKAN & REDEPLOY",
    desc: "Penarikan aset layak pindah atau lepas lokasi",
    icon: "CornerUpLeft",
    bgColor: "bg-cyan-50 border-cyan-200 text-cyan-700",
    colorHex: "#0891b2",
    outputs: ["Form Penarikan", "Checklist Kondisi", "WO Relokasi", "Lokasi Baru"]
  },
  {
    step: 10,
    id: "DISPOSED",
    title: "10. REPLACEMENT / DISPOSAL",
    desc: "Penggantian atau pemusnahan aset tidak layak",
    icon: "Trash2",
    bgColor: "bg-slate-100 border-slate-300 text-slate-700",
    colorHex: "#475569",
    outputs: ["Laporan Disposal", "Log Penggantian", "Sisa Scrap Value", "Database Updated"]
  }
];
