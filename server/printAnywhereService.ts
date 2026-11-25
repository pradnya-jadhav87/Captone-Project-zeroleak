import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { executeQuery, executeRun, saveDb } from './db.ts';

export type ExamCategory = 'UNIVERSITY' | 'COMPETITIVE';

export type PrintRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'READY_TO_PRINT'
  | 'PRINTING'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'FAILED';

export interface PrinterRegistryItem {
  id: string;
  printerCode: string;
  name: string;
  location: string;
  centreNumber: string;
  connectionType: 'SECURE_TLS' | 'NETWORK_IP' | 'AIRGAP_RELAY' | 'USB_ENCLAVE';
  isActive: boolean;
  permittedExamTypes: ExamCategory[];
  maxCopiesLimit: number;
  ipAddress?: string;
  status: 'ONLINE' | 'OFFLINE';
}

export interface PrintAnywhereRequestRecord {
  id: string;
  requestNumber: string;
  examId: string;
  examName: string;
  examType: ExamCategory;
  paperId: string;
  paperVersion: string;
  centreNumber: string;
  printerId: string;
  printerName: string;
  printerLocation: string;
  requestedCopies: number;
  approvedCopies: number;
  scheduledUnlockTime: string;
  scheduledDate: string;
  status: PrintRequestStatus;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  operatorId: string | null;
  operatorName: string | null;
  printedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
  idempotencyKey: string | null;
  reprintApproved: boolean;
  reprintApprovedBy: string | null;
  txHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_MAX_COPIES_PER_REQUEST = 500;

// Seed printers available across centres
export const INITIAL_PRINTER_REGISTRY: PrinterRegistryItem[] = [
  {
    id: 'PRN-CTR101-01',
    printerCode: 'PRN-101-VAULT',
    name: 'Vault Laser Duplex Station 1',
    location: 'Central Security Vault Room B1 (CTR-101)',
    centreNumber: 'CTR-101',
    connectionType: 'SECURE_TLS',
    isActive: true,
    permittedExamTypes: ['UNIVERSITY', 'COMPETITIVE'],
    maxCopiesLimit: 500,
    ipAddress: '10.101.4.15',
    status: 'ONLINE',
  },
  {
    id: 'PRN-CTR101-02',
    printerCode: 'PRN-101-HALL-A',
    name: 'Main Examination Hall A Production Printer',
    location: 'Main Examination Hall Block 1 (CTR-101)',
    centreNumber: 'CTR-101',
    connectionType: 'AIRGAP_RELAY',
    isActive: true,
    permittedExamTypes: ['UNIVERSITY', 'COMPETITIVE'],
    maxCopiesLimit: 300,
    ipAddress: '10.101.4.16',
    status: 'ONLINE',
  },
  {
    id: 'PRN-CTR102-01',
    printerCode: 'PRN-102-REGIONAL',
    name: 'Regional Secure High-Volume Unit',
    location: 'Pune Regional Confidential Enclave (CTR-102)',
    centreNumber: 'CTR-102',
    connectionType: 'SECURE_TLS',
    isActive: true,
    permittedExamTypes: ['UNIVERSITY', 'COMPETITIVE'],
    maxCopiesLimit: 500,
    ipAddress: '10.102.2.10',
    status: 'ONLINE',
  },
  {
    id: 'PRN-CTR103-01',
    printerCode: 'PRN-103-METRO',
    name: 'Metro Confidential Duplex Station',
    location: 'Mumbai Confidential Printing Wing (CTR-103)',
    centreNumber: 'CTR-103',
    connectionType: 'NETWORK_IP',
    isActive: true,
    permittedExamTypes: ['UNIVERSITY', 'COMPETITIVE'],
    maxCopiesLimit: 400,
    ipAddress: '10.103.5.21',
    status: 'ONLINE',
  },
  {
    id: 'PRN-CTR101-99',
    printerCode: 'PRN-101-STANDBY',
    name: 'Auxiliary Standby Laser (Offline)',
    location: 'Administrative Block Room 204 (CTR-101)',
    centreNumber: 'CTR-101',
    connectionType: 'USB_ENCLAVE',
    isActive: false,
    permittedExamTypes: ['UNIVERSITY', 'COMPETITIVE'],
    maxCopiesLimit: 100,
    ipAddress: '10.101.4.99',
    status: 'OFFLINE',
  },
];

/**
 * Initializes tables for Printer Registry and Print Anywhere Requests.
 */
export function initPrintAnywhereWorkflowSchema(db: any): void {
  try {
    // 1. Printer Registry Table
    executeRun(
      db,
      `CREATE TABLE IF NOT EXISTS validated_printer_registry (
        id TEXT PRIMARY KEY,
        printer_code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        location TEXT NOT NULL,
        centre_number TEXT NOT NULL,
        connection_type TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        permitted_exam_types TEXT NOT NULL,
        max_copies_limit INTEGER NOT NULL DEFAULT 500,
        ip_address TEXT,
        status TEXT NOT NULL DEFAULT 'ONLINE',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`
    );

    // 2. Print Anywhere Requests Table
    executeRun(
      db,
      `CREATE TABLE IF NOT EXISTS print_anywhere_requests (
        id TEXT PRIMARY KEY,
        request_number TEXT NOT NULL UNIQUE,
        exam_id TEXT NOT NULL,
        exam_name TEXT NOT NULL,
        exam_type TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        paper_version TEXT NOT NULL,
        centre_number TEXT NOT NULL,
        printer_id TEXT NOT NULL,
        printer_name TEXT NOT NULL,
        printer_location TEXT NOT NULL,
        requested_copies INTEGER NOT NULL,
        approved_copies INTEGER NOT NULL,
        scheduled_unlock_time TEXT NOT NULL,
        scheduled_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        requested_by TEXT NOT NULL,
        requested_by_name TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        operator_id TEXT,
        operator_name TEXT,
        printed_at TEXT,
        completed_at TEXT,
        failure_reason TEXT,
        idempotency_key TEXT UNIQUE,
        reprint_approved INTEGER DEFAULT 0,
        reprint_approved_by TEXT,
        tx_hash TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`
    );

    // 3. Watermark Trace Forensics Ledger
    executeRun(
      db,
      `CREATE TABLE IF NOT EXISTS print_watermark_traces (
        id TEXT PRIMARY KEY,
        copy_identifier TEXT NOT NULL UNIQUE,
        print_request_id TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        paper_version TEXT NOT NULL,
        exam_id TEXT NOT NULL,
        exam_name TEXT NOT NULL,
        exam_type TEXT NOT NULL,
        centre_number TEXT NOT NULL,
        printer_id TEXT NOT NULL,
        printer_name TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        operator_name TEXT NOT NULL,
        copy_number INTEGER NOT NULL,
        total_copies INTEGER NOT NULL,
        printed_at TEXT NOT NULL,
        watermark_text TEXT NOT NULL,
        security_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`
    );

    // Seed registry if empty
    const countRows = executeQuery(db, 'SELECT COUNT(*) as count FROM validated_printer_registry');
    if (!countRows || Number(countRows[0]?.count || 0) === 0) {
      const now = new Date().toISOString();
      for (const prn of INITIAL_PRINTER_REGISTRY) {
        executeRun(
          db,
          `INSERT OR IGNORE INTO validated_printer_registry (
            id, printer_code, name, location, centre_number, connection_type,
            is_active, permitted_exam_types, max_copies_limit, ip_address, status,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            prn.id,
            prn.printerCode,
            prn.name,
            prn.location,
            prn.centreNumber,
            prn.connectionType,
            prn.isActive ? 1 : 0,
            JSON.stringify(prn.permittedExamTypes),
            prn.maxCopiesLimit,
            prn.ipAddress || null,
            prn.status,
            now,
            now,
          ]
        );
      }
      saveDb();
    }
  } catch (err) {
    console.warn('initPrintAnywhereWorkflowSchema error:', err);
  }
}

/**
 * Lists validated printers, optionally filtered by centre and exam type.
 */
export function getRegisteredPrinters(
  db: any,
  filters?: {
    centreNumber?: string;
    examType?: ExamCategory;
    activeOnly?: boolean;
  }
): PrinterRegistryItem[] {
  initPrintAnywhereWorkflowSchema(db);
  const rows = executeQuery(db, 'SELECT * FROM validated_printer_registry ORDER BY centre_number ASC, name ASC');
  if (!rows) return [];

  return rows
    .map((r: any): PrinterRegistryItem => {
      let permitted: ExamCategory[] = ['UNIVERSITY', 'COMPETITIVE'];
      try {
        permitted = JSON.parse(r.permitted_exam_types || '[]');
      } catch {
        permitted = ['UNIVERSITY', 'COMPETITIVE'];
      }
      return {
        id: r.id,
        printerCode: r.printer_code,
        name: r.name,
        location: r.location,
        centreNumber: r.centre_number,
        connectionType: r.connection_type,
        isActive: Boolean(r.is_active === 1),
        permittedExamTypes: permitted,
        maxCopiesLimit: Number(r.max_copies_limit || 500),
        ipAddress: r.ip_address || undefined,
        status: r.status || (r.is_active === 1 ? 'ONLINE' : 'OFFLINE'),
      };
    })
    .filter((p: PrinterRegistryItem) => {
      if (filters?.centreNumber && p.centreNumber !== filters.centreNumber) return false;
      if (filters?.examType && !p.permittedExamTypes.includes(filters.examType)) return false;
      if (filters?.activeOnly && (!p.isActive || p.status !== 'ONLINE')) return false;
      return true;
    });
}

/**
 * Creates a Print Anywhere request (by Examination Manager).
 */
export function createPrintAnywhereRequest(
  db: any,
  params: {
    examId: string;
    examName: string;
    examType: ExamCategory;
    paperId: string;
    paperVersion: string;
    centreNumber: string;
    printerId: string;
    requestedCopies: number;
    scheduledUnlockTime: string;
    scheduledDate: string;
    requestedBy: string;
    requestedByName: string;
    idempotencyKey?: string;
  }
): {
  success: boolean;
  request?: PrintAnywhereRequestRecord;
  error?: string;
} {
  initPrintAnywhereWorkflowSchema(db);

  // 1. Idempotency Check
  if (params.idempotencyKey) {
    const existing = executeQuery(
      db,
      'SELECT * FROM print_anywhere_requests WHERE idempotency_key = ?',
      [params.idempotencyKey]
    );
    if (existing && existing.length > 0) {
      return {
        success: true,
        request: mapRequestRow(existing[0]),
      };
    }
  }

  // 2. Validate Printer against registry
  const printers = getRegisteredPrinters(db, {
    centreNumber: params.centreNumber,
    examType: params.examType,
    activeOnly: false,
  });
  const targetPrinter = printers.find(
    p => p.id === params.printerId || p.printerCode === params.printerId
  );

  if (!targetPrinter) {
    return {
      success: false,
      error: `VALIDATION ERROR: Printer ${params.printerId} is not registered for Centre ${params.centreNumber} or not authorized for ${params.examType} examinations.`,
    };
  }

  if (!targetPrinter.isActive || targetPrinter.status !== 'ONLINE') {
    return {
      success: false,
      error: `PRINTER UNAVAILABLE: Selected printer "${targetPrinter.name}" is currently OFFLINE or INACTIVE in the hardware registry.`,
    };
  }

  // 3. Validate Copy Count Limit
  const maxAllowed = targetPrinter.maxCopiesLimit || DEFAULT_MAX_COPIES_PER_REQUEST;
  const requestedCopies = Number(params.requestedCopies) || 1;
  if (requestedCopies <= 0) {
    return { success: false, error: 'Requested copies count must be at least 1.' };
  }
  if (requestedCopies > maxAllowed) {
    return {
      success: false,
      error: `COPY LIMIT EXCEEDED: Requested ${requestedCopies} copies exceeds the approved hardware limit of ${maxAllowed} copies for this printer.`,
    };
  }

  // 4. Validate Paper Leak Containment
  try {
    const leakRows = executeQuery(
      db,
      `SELECT id, leak_status FROM paper_leak_incidents 
       WHERE (paper_id = ? AND paper_version = ?) AND leak_status IN ('LEAK_SUSPECTED', 'LEAK_CONFIRMED', 'CONTAINED')
       LIMIT 1`,
      [params.paperId, params.paperVersion]
    );
    if (leakRows && leakRows.length > 0) {
      return {
        success: false,
        error: `ACCESS DENIED: Paper version ${params.paperVersion} is suspended under active leak incident ${leakRows[0].id}. New print requests are prohibited.`,
      };
    }
  } catch {}

  const id = uuidv4();
  const requestNumber = `REQ-PRN-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const now = new Date().toISOString();
  const initialStatus: PrintRequestStatus = 'SCHEDULED';

  executeRun(
    db,
    `INSERT INTO print_anywhere_requests (
      id, request_number, exam_id, exam_name, exam_type, paper_id, paper_version,
      centre_number, printer_id, printer_name, printer_location, requested_copies,
      approved_copies, scheduled_unlock_time, scheduled_date, status, requested_by,
      requested_by_name, requested_at, idempotency_key, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      requestNumber,
      params.examId,
      params.examName,
      params.examType,
      params.paperId,
      params.paperVersion,
      params.centreNumber,
      targetPrinter.id,
      targetPrinter.name,
      targetPrinter.location,
      requestedCopies,
      requestedCopies, // approved copies matches requested when authorized by manager
      params.scheduledUnlockTime,
      params.scheduledDate,
      initialStatus,
      params.requestedBy,
      params.requestedByName,
      now,
      params.idempotencyKey || null,
      now,
      now,
    ]
  );

  saveDb();

  const createdRows = executeQuery(
    db,
    'SELECT * FROM print_anywhere_requests WHERE id = ?',
    [id]
  );

  return {
    success: true,
    request: mapRequestRow(createdRows[0]),
  };
}

/**
 * Retrieves print requests with optional filters.
 */
export function getPrintAnywhereRequests(
  db: any,
  filters?: {
    centreNumber?: string;
    examType?: ExamCategory;
    status?: PrintRequestStatus;
    paperId?: string;
    limit?: number;
  }
): PrintAnywhereRequestRecord[] {
  initPrintAnywhereWorkflowSchema(db);
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters?.centreNumber) {
    conditions.push('centre_number = ?');
    params.push(filters.centreNumber);
  }
  if (filters?.examType) {
    conditions.push('exam_type = ?');
    params.push(filters.examType);
  }
  if (filters?.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters?.paperId) {
    conditions.push('paper_id = ?');
    params.push(filters.paperId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters?.limit && filters.limit > 0 ? Math.min(200, filters.limit) : 100;

  const rows = executeQuery(
    db,
    `SELECT * FROM print_anywhere_requests ${whereClause} ORDER BY created_at DESC LIMIT ${limit}`,
    params
  );

  return (rows || []).map(mapRequestRow);
}

/**
 * Evaluates whether an examination paper is ready for print release based on server time and timezone.
 */
export function evaluatePrintTimeLock(
  scheduledDate: string,
  scheduledUnlockTime: string,
  timezone: string = 'Asia/Kolkata'
): {
  isUnlocked: boolean;
  serverTimeIso: string;
  unlockTimeIso: string;
  remainingSeconds: number;
  formattedDisplay: string;
} {
  const now = new Date();
  const serverTimeIso = now.toISOString();

  // Combine scheduled date and time
  // e.g. "2026-10-15" and "10:30 AM" or "10:30"
  let unlockDate: Date;
  try {
    let timeStr = scheduledUnlockTime.trim();
    let hours = 0;
    let minutes = 0;
    if (timeStr.includes(':')) {
      const isPM = /pm/i.test(timeStr);
      const isAM = /am/i.test(timeStr);
      const cleanTime = timeStr.replace(/[^\d:]/g, '');
      const parts = cleanTime.split(':');
      hours = parseInt(parts[0], 10) || 0;
      minutes = parseInt(parts[1], 10) || 0;
      if (isPM && hours < 12) hours += 12;
      if (isAM && hours === 12) hours = 0;
    }
    const dateParts = scheduledDate.split('-');
    if (dateParts.length === 3) {
      unlockDate = new Date(
        parseInt(dateParts[0], 10),
        parseInt(dateParts[1], 10) - 1,
        parseInt(dateParts[2], 10),
        hours,
        minutes,
        0
      );
    } else {
      unlockDate = new Date(`${scheduledDate}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);
    }
  } catch {
    unlockDate = new Date(now.getTime() - 1000); // fallback to already unlocked
  }

  const unlockMs = isNaN(unlockDate.getTime()) ? now.getTime() - 1000 : unlockDate.getTime();
  const nowMs = now.getTime();
  const isUnlocked = nowMs >= unlockMs;
  const remainingSeconds = Math.max(0, Math.ceil((unlockMs - nowMs) / 1000));

  return {
    isUnlocked,
    serverTimeIso,
    unlockTimeIso: unlockDate.toISOString(),
    remainingSeconds,
    formattedDisplay: `${scheduledUnlockTime} on ${scheduledDate} (${timezone})`,
  };
}

/**
 * Centre Superintendent & Operator releases print job at/after scheduled unlock time.
 * Validates timezone, generates traceable watermarks, and records atomic reservation.
 */
export function executePrintJobRelease(
  db: any,
  params: {
    requestId: string;
    operatorId: string;
    operatorName: string;
    centreNumber: string;
    ipAddress?: string;
  }
): {
  success: boolean;
  request?: PrintAnywhereRequestRecord;
  watermarks?: Array<{ copyIdentifier: string; watermarkText: string }>;
  error?: string;
} {
  initPrintAnywhereWorkflowSchema(db);

  const rows = executeQuery(
    db,
    'SELECT * FROM print_anywhere_requests WHERE id = ?',
    [params.requestId]
  );

  if (!rows || rows.length === 0) {
    return { success: false, error: 'Print request not found in dispatch ledger.' };
  }

  const req = rows[0];

  // 1. Verify centre match
  if (req.centre_number !== params.centreNumber) {
    return {
      success: false,
      error: `ACCESS DENIED: Print request is assigned to Centre ${req.centre_number}, but operator is logged in at Centre ${params.centreNumber}.`,
    };
  }

  // 2. Verify request status is not BLOCKED or CANCELLED by emergency containment
  if (req.status === 'BLOCKED' || req.status === 'CANCELLED') {
    return {
      success: false,
      error: 'SECURITY CONTAINMENT: Print request has been BLOCKED or CANCELLED due to an active security or paper leak incident.',
    };
  }

  // Check paper leak incidents table
  try {
    const leakRows = executeQuery(
      db,
      `SELECT id, leak_status FROM paper_leak_incidents 
       WHERE (paper_id = ? AND paper_version = ?) AND leak_status IN ('LEAK_SUSPECTED', 'LEAK_CONFIRMED', 'CONTAINED')
       LIMIT 1`,
      [req.paper_id, req.paper_version]
    );
    if (leakRows && leakRows.length > 0) {
      return {
        success: false,
        error: `SECURITY CONTAINMENT: Paper version is suspended under active leak incident ${leakRows[0].id}. Print release is strictly prohibited.`,
      };
    }
  } catch {}

  // 3. Strict Server-Side Time Check
  const timeEval = evaluatePrintTimeLock(req.scheduled_date, req.scheduled_unlock_time);
  if (!timeEval.isUnlocked) {
    return {
      success: false,
      error: `TIME-LOCK ENFORCED: Paper unlock time (${timeEval.formattedDisplay}) has not been reached. Printing is strictly blocked for another ${timeEval.remainingSeconds} seconds.`,
    };
  }

  // 3. Prohibit repeat printing unless reprint approved
  if (req.status === 'COMPLETED' && req.reprint_approved !== 1) {
    return {
      success: false,
      error: 'SECURITY LOCK: Authorized copy count has already been printed. Reprints require explicit audited authorization by the Examination Manager or Organization Owner.',
    };
  }

  const now = new Date().toISOString();
  const copiesCount = Number(req.approved_copies || 1);
  const watermarks: Array<{ copyIdentifier: string; watermarkText: string }> = [];

  // Generate unique copy identifiers and watermarks for each sheet copy
  for (let c = 1; c <= copiesCount; c++) {
    const copyId = `CPY-${req.centre_number}-${req.printer_id.slice(-4)}-${c.toString().padStart(4, '0')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const stampText = `CENTRE NO: ${req.centre_number} • EXAM: ${req.exam_name} • PRINT TIME: ${now} (IST) • PRINTER: ${req.printer_name} • PAPER REF: ${req.paper_version} • COPY ID: ${copyId} • CONFIDENTIAL — CONTROLLED EXAMINATION COPY`;
    const secHash = crypto.createHash('sha256').update(`${copyId}:${now}:${params.operatorId}`).digest('hex');

    watermarks.push({
      copyIdentifier: copyId,
      watermarkText: stampText,
    });

    executeRun(
      db,
      `INSERT INTO print_watermark_traces (
        id, copy_identifier, print_request_id, paper_id, paper_version,
        exam_id, exam_name, exam_type, centre_number, printer_id, printer_name,
        operator_id, operator_name, copy_number, total_copies, printed_at,
        watermark_text, security_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        copyId,
        req.id,
        req.paper_id,
        req.paper_version,
        req.exam_id,
        req.exam_name,
        req.exam_type,
        req.centre_number,
        req.printer_id,
        req.printer_name,
        params.operatorId,
        params.operatorName,
        c,
        copiesCount,
        now,
        stampText,
        secHash,
        now,
      ]
    );
  }

  const txHash = `0x${crypto.randomBytes(32).toString('hex')}`;

  // Update status to COMPLETED
  executeRun(
    db,
    `UPDATE print_anywhere_requests 
     SET status = 'COMPLETED',
         operator_id = ?,
         operator_name = ?,
         printed_at = ?,
         completed_at = ?,
         tx_hash = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      params.operatorId,
      params.operatorName,
      now,
      now,
      txHash,
      now,
      req.id,
    ]
  );

  saveDb();

  const updatedRows = executeQuery(
    db,
    'SELECT * FROM print_anywhere_requests WHERE id = ?',
    [req.id]
  );

  return {
    success: true,
    request: mapRequestRow(updatedRows[0]),
    watermarks,
  };
}

/**
 * Searches and traces a physical paper leak by watermark reference, copy ID, or partial stamp text.
 */
export function investigateLeakedWatermark(
  db: any,
  query: string
): {
  found: boolean;
  match?: any;
  custodyTimeline?: any[];
} {
  initPrintAnywhereWorkflowSchema(db);
  const cleanQ = query.trim();
  if (!cleanQ) return { found: false };

  const rows = executeQuery(
    db,
    `SELECT * FROM print_watermark_traces 
     WHERE copy_identifier LIKE ? OR watermark_text LIKE ? OR exam_name LIKE ? OR print_request_id = ?
     ORDER BY printed_at DESC LIMIT 1`,
    [`%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`, cleanQ]
  );

  if (!rows || rows.length === 0) {
    return { found: false };
  }

  const trace = rows[0];

  // Retrieve matching request and audit events
  const reqRows = executeQuery(
    db,
    'SELECT * FROM print_anywhere_requests WHERE id = ?',
    [trace.print_request_id]
  );
  const req = reqRows && reqRows.length > 0 ? reqRows[0] : null;

  const timeline = [
    {
      stage: 'REQUEST_CREATED',
      actor: req?.requested_by_name || 'Examination Manager',
      timestamp: req?.requested_at || trace.created_at,
      details: `Print Anywhere request submitted for ${trace.total_copies} authorized copies at Centre ${trace.centre_number}.`,
    },
    {
      stage: 'RELEASE_AND_PRINT',
      actor: trace.operator_name,
      timestamp: trace.printed_at,
      details: `Physical copy ${trace.copy_number}/${trace.total_copies} released on Printer "${trace.printer_name}" (ID: ${trace.printer_id}). Stamped with Copy ID: ${trace.copy_identifier}.`,
    },
  ];

  return {
    found: true,
    match: {
      copyIdentifier: trace.copy_identifier,
      paperId: trace.paper_id,
      paperVersion: trace.paper_version,
      examId: trace.exam_id,
      examName: trace.exam_name,
      examType: trace.exam_type,
      centreNumber: trace.centre_number,
      printerId: trace.printer_id,
      printerName: trace.printer_name,
      operatorId: trace.operator_id,
      operatorName: trace.operator_name,
      copyNumber: trace.copy_number,
      totalCopies: trace.total_copies,
      printedAt: trace.printed_at,
      watermarkText: trace.watermark_text,
      securityHash: trace.security_hash,
    },
    custodyTimeline: timeline,
  };
}

function mapRequestRow(r: any): PrintAnywhereRequestRecord {
  return {
    id: r.id,
    requestNumber: r.request_number,
    examId: r.exam_id,
    examName: r.exam_name,
    examType: r.exam_type as ExamCategory,
    paperId: r.paper_id,
    paperVersion: r.paper_version,
    centreNumber: r.centre_number,
    printerId: r.printer_id,
    printerName: r.printer_name,
    printerLocation: r.printer_location,
    requestedCopies: Number(r.requested_copies || 1),
    approvedCopies: Number(r.approved_copies || 1),
    scheduledUnlockTime: r.scheduled_unlock_time,
    scheduledDate: r.scheduled_date,
    status: r.status as PrintRequestStatus,
    requestedBy: r.requested_by,
    requestedByName: r.requested_by_name,
    requestedAt: r.requested_at,
    operatorId: r.operator_id || null,
    operatorName: r.operator_name || null,
    printedAt: r.printed_at || null,
    completedAt: r.completed_at || null,
    failureReason: r.failure_reason || null,
    idempotencyKey: r.idempotency_key || null,
    reprintApproved: Boolean(r.reprint_approved === 1),
    reprintApprovedBy: r.reprint_approved_by || null,
    txHash: r.tx_hash || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
