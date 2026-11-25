import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { executeQuery, executeRun, saveDb } from './db.ts';

export type ProctorIncidentType =
  | 'MOBILE_PHONE_DETECTED'
  | 'MULTIPLE_PERSONS_DETECTED'
  | 'CAPTURE_RISK_DETECTED'
  | 'CAMERA_COVERED_OR_OFF';

export interface ProctoredPrintSessionRecord {
  id: string;
  sessionId: string;
  operatorId: string;
  operatorName: string;
  centreNumber: string;
  printRequestId: string | null;
  warningCount: number;
  maxWarnings: number;
  isLocked: boolean;
  lockReason: string | null;
  lockedAt: string | null;
  lastIncidentAt: string | null;
  lastIncidentType: ProctorIncidentType | null;
  ackRequired: boolean;
  ackCompletedAt: string | null;
  unlockedAt: string | null;
  unlockedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export const MAX_PROCTOR_WARNINGS = 3;
export const INCIDENT_DEDUPLICATION_WINDOW_MS = 6000; // 6 seconds

/**
 * Initializes proctored print session and incident tables.
 */
export function initProctoredPrintSchema(db: any): void {
  try {
    executeRun(
      db,
      `CREATE TABLE IF NOT EXISTS proctored_print_sessions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL UNIQUE,
        operator_id TEXT NOT NULL,
        operator_name TEXT NOT NULL,
        centre_number TEXT NOT NULL,
        print_request_id TEXT,
        warning_count INTEGER NOT NULL DEFAULT 0,
        max_warnings INTEGER NOT NULL DEFAULT 3,
        is_locked INTEGER NOT NULL DEFAULT 0,
        lock_reason TEXT,
        locked_at TEXT,
        last_incident_at TEXT,
        last_incident_type TEXT,
        ack_required INTEGER NOT NULL DEFAULT 0,
        ack_completed_at TEXT,
        unlocked_at TEXT,
        unlocked_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`
    );

    executeRun(
      db,
      `CREATE TABLE IF NOT EXISTS proctored_print_incidents (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        incident_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        warning_number INTEGER NOT NULL,
        dedup_hash TEXT NOT NULL,
        metadata_json TEXT,
        snapshot_url TEXT,
        detected_at TEXT NOT NULL
      );`
    );
  } catch (err) {
    console.warn('initProctoredPrintSchema error:', err);
  }
}

/**
 * Gets or creates the proctored printing session for an operator workstation.
 */
export function getOrCreateProctoredSession(
  db: any,
  params: {
    sessionId: string;
    operatorId: string;
    operatorName: string;
    centreNumber: string;
    printRequestId?: string;
  }
): ProctoredPrintSessionRecord {
  initProctoredPrintSchema(db);

  const rows = executeQuery(
    db,
    'SELECT * FROM proctored_print_sessions WHERE session_id = ?',
    [params.sessionId]
  );

  if (rows && rows.length > 0) {
    return mapSessionRow(rows[0]);
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  executeRun(
    db,
    `INSERT INTO proctored_print_sessions (
      id, session_id, operator_id, operator_name, centre_number,
      print_request_id, warning_count, max_warnings, is_locked,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 3, 0, ?, ?)`,
    [
      id,
      params.sessionId,
      params.operatorId,
      params.operatorName,
      params.centreNumber,
      params.printRequestId || null,
      now,
      now,
    ]
  );

  saveDb();

  const createdRows = executeQuery(
    db,
    'SELECT * FROM proctored_print_sessions WHERE id = ?',
    [id]
  );

  return mapSessionRow(createdRows[0]);
}

/**
 * Records a proctoring incident (mobile phone, multiple persons, capture risk).
 * Deduplicates rapid video frames.
 * Enforces 3-warning lockout.
 */
export function recordProctorIncident(
  db: any,
  params: {
    sessionId: string;
    operatorId: string;
    operatorName: string;
    centreNumber: string;
    incidentType: ProctorIncidentType;
    confidence?: number;
    snapshotUrl?: string;
    printRequestId?: string;
  }
): {
  incidentLogged: boolean;
  isDuplicate: boolean;
  warningCount: number;
  remainingWarnings: number;
  actionRequired: 'NONE' | 'WARNING' | 'STRONG_WARNING_ACK_REQUIRED' | 'IMMEDIATE_LOCKOUT';
  isLocked: boolean;
  lockedAt: string | null;
  message: string;
} {
  initProctoredPrintSchema(db);

  const session = getOrCreateProctoredSession(db, params);
  if (session.isLocked) {
    return {
      incidentLogged: false,
      isDuplicate: false,
      warningCount: session.warningCount,
      remainingWarnings: 0,
      actionRequired: 'IMMEDIATE_LOCKOUT',
      isLocked: true,
      lockedAt: session.lockedAt,
      message: 'Workstation printing session is permanently locked due to security policy violations.',
    };
  }

  const now = new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  // 1. Frame Deduplication: Check if an identical incident was logged within the deduplication window
  if (session.lastIncidentAt && session.lastIncidentType === params.incidentType) {
    const lastIncidentMs = new Date(session.lastIncidentAt).getTime();
    if (nowMs - lastIncidentMs < INCIDENT_DEDUPLICATION_WINDOW_MS) {
      return {
        incidentLogged: false,
        isDuplicate: true,
        warningCount: session.warningCount,
        remainingWarnings: Math.max(0, MAX_PROCTOR_WARNINGS - session.warningCount),
        actionRequired: session.ackRequired ? 'STRONG_WARNING_ACK_REQUIRED' : 'WARNING',
        isLocked: false,
        lockedAt: null,
        message: 'Duplicate frame incident ignored within temporal deduplication window.',
      };
    }
  }

  // 2. Increment warning count
  const newWarningCount = session.warningCount + 1;
  const isLocked = newWarningCount >= MAX_PROCTOR_WARNINGS;
  const ackRequired = newWarningCount === 2; // Warning 2 requires explicit operator acknowledgment
  const remainingWarnings = Math.max(0, MAX_PROCTOR_WARNINGS - newWarningCount);

  let lockReason: string | null = null;
  let actionRequired: 'NONE' | 'WARNING' | 'STRONG_WARNING_ACK_REQUIRED' | 'IMMEDIATE_LOCKOUT' = 'WARNING';

  if (isLocked) {
    lockReason = `SECURITY_LOCKOUT: 3 confirmed proctoring violations detected (${params.incidentType}). Workstation locked, print queue cancelled.`;
    actionRequired = 'IMMEDIATE_LOCKOUT';

    // If an active print request was linked, cancel/block it immediately
    if (params.printRequestId) {
      executeRun(
        db,
        `UPDATE print_anywhere_requests 
         SET status = 'BLOCKED', failure_reason = ?, updated_at = ?
         WHERE id = ? AND status != 'COMPLETED'`,
        [lockReason, nowIso, params.printRequestId]
      );
    }
  } else if (newWarningCount === 2) {
    actionRequired = 'STRONG_WARNING_ACK_REQUIRED';
  }

  // Log incident record
  const dedupHash = crypto.createHash('md5').update(`${params.sessionId}:${params.incidentType}:${Math.floor(nowMs / 5000)}`).digest('hex');
  executeRun(
    db,
    `INSERT INTO proctored_print_incidents (
      id, session_id, operator_id, incident_type, severity, warning_number,
      dedup_hash, metadata_json, snapshot_url, detected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      params.sessionId,
      params.operatorId,
      params.incidentType,
      isLocked ? 'CRITICAL' : (newWarningCount === 2 ? 'HIGH' : 'MEDIUM'),
      newWarningCount,
      dedupHash,
      JSON.stringify({
        confidence: params.confidence || 0.95,
        operatorName: params.operatorName,
        centreNumber: params.centreNumber,
        printRequestId: params.printRequestId,
      }),
      params.snapshotUrl || null,
      nowIso,
    ]
  );

  // Update session record
  executeRun(
    db,
    `UPDATE proctored_print_sessions 
     SET warning_count = ?,
         is_locked = ?,
         lock_reason = COALESCE(?, lock_reason),
         locked_at = CASE WHEN ? = 1 THEN ? ELSE locked_at END,
         last_incident_at = ?,
         last_incident_type = ?,
         ack_required = ?,
         updated_at = ?
     WHERE session_id = ?`,
    [
      newWarningCount,
      isLocked ? 1 : 0,
      lockReason,
      isLocked ? 1 : 0,
      nowIso,
      nowIso,
      params.incidentType,
      ackRequired ? 1 : 0,
      nowIso,
      params.sessionId,
    ]
  );

  // If locked, create high-priority notification for Exam Manager & Organization Owner
  if (isLocked) {
    try {
      executeRun(
        db,
        `INSERT INTO notifications (
          id, role, title, message, category, is_read, created_at
        ) VALUES (?, 'EXAM_MANAGER', 'CRITICAL SECURITY LOCKOUT: Printing Cancelled at Centre ' || ?, ?, 'SECURITY_ALERT', 0, ?)`,
        [
          uuidv4(),
          params.centreNumber,
          `Operator ${params.operatorName} (Centre ${params.centreNumber}) reached 3 proctoring warnings (${params.incidentType}). Session locked and print queue aborted.`,
          nowIso,
        ]
      );
    } catch (notifErr) {
      console.warn('Could not record notification:', notifErr);
    }
  }

  saveDb();

  let message = '';
  if (isLocked) {
    message = 'LOCKOUT ACTIVATED: 3 security violations detected. Workstation is locked and printing is aborted.';
  } else if (newWarningCount === 2) {
    message = `STRONG WARNING (2/3): ${formatIncidentName(params.incidentType)} detected. Please acknowledge this alert immediately to continue.`;
  } else {
    message = `SECURITY WARNING (1/3): ${formatIncidentName(params.incidentType)} detected. Ensure the print station remains strictly secure.`;
  }

  return {
    incidentLogged: true,
    isDuplicate: false,
    warningCount: newWarningCount,
    remainingWarnings,
    actionRequired,
    isLocked,
    lockedAt: isLocked ? nowIso : null,
    message,
  };
}

/**
 * Operator acknowledges Warning #2 to continue monitoring.
 */
export function acknowledgeWarning(
  db: any,
  params: {
    sessionId: string;
    operatorId: string;
  }
): { success: boolean; message: string } {
  initProctoredPrintSchema(db);
  const now = new Date().toISOString();

  executeRun(
    db,
    `UPDATE proctored_print_sessions 
     SET ack_required = 0, ack_completed_at = ?, updated_at = ?
     WHERE session_id = ? AND operator_id = ? AND is_locked = 0`,
    [now, now, params.sessionId, params.operatorId]
  );

  saveDb();
  return { success: true, message: 'Warning acknowledgement recorded.' };
}

/**
 * Authorized administrator (ORG_OWNER, AUDITOR, EXAM_MANAGER) resets proctored print lockout.
 */
export function adminResetProctorLock(
  db: any,
  params: {
    sessionId: string;
    adminUserId: string;
    adminRole: string;
    reason: string;
  }
): { success: boolean; error?: string; message?: string } {
  initProctoredPrintSchema(db);

  if (!['ORG_OWNER', 'AUDITOR', 'EXAM_MANAGER'].includes(params.adminRole)) {
    return {
      success: false,
      error: 'ACCESS DENIED: Unlocking a proctored print station requires ORG_OWNER, AUDITOR, or EXAM_MANAGER authorization.',
    };
  }

  if (!params.reason || params.reason.trim().length < 10) {
    return {
      success: false,
      error: 'A detailed operational justification (at least 10 characters) is required to clear a proctoring lockout.',
    };
  }

  const now = new Date().toISOString();

  executeRun(
    db,
    `UPDATE proctored_print_sessions 
     SET warning_count = 0,
         is_locked = 0,
         lock_reason = NULL,
         ack_required = 0,
         unlocked_at = ?,
         unlocked_by = ?,
         updated_at = ?
     WHERE session_id = ?`,
    [now, params.adminUserId, now, params.sessionId]
  );

  saveDb();
  return { success: true, message: 'Proctored workstation lock successfully cleared by administrator.' };
}

function formatIncidentName(type: ProctorIncidentType): string {
  switch (type) {
    case 'MOBILE_PHONE_DETECTED': return 'Mobile phone / recording device';
    case 'MULTIPLE_PERSONS_DETECTED': return 'Multiple persons / unauthorized bystander';
    case 'CAPTURE_RISK_DETECTED': return 'Screen capture / unauthorized window switch';
    case 'CAMERA_COVERED_OR_OFF': return 'Camera covered / disabled';
    default: return 'Security policy violation';
  }
}

function mapSessionRow(r: any): ProctoredPrintSessionRecord {
  return {
    id: r.id,
    sessionId: r.session_id,
    operatorId: r.operator_id,
    operatorName: r.operator_name,
    centreNumber: r.centre_number,
    printRequestId: r.print_request_id || null,
    warningCount: Number(r.warning_count || 0),
    maxWarnings: Number(r.max_warnings || 3),
    isLocked: Boolean(r.is_locked === 1),
    lockReason: r.lock_reason || null,
    lockedAt: r.locked_at || null,
    lastIncidentAt: r.last_incident_at || null,
    lastIncidentType: (r.last_incident_type as ProctorIncidentType) || null,
    ackRequired: Boolean(r.ack_required === 1),
    ackCompletedAt: r.ack_completed_at || null,
    unlockedAt: r.unlocked_at || null,
    unlockedBy: r.unlocked_by || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

