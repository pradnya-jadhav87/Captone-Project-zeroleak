import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { executeQuery, executeRun, saveDb } from './db.ts';

export type ExamCategory = 'UNIVERSITY' | 'COMPETITIVE';

export interface DecryptionAttemptRecord {
  id: string;
  paperId: string;
  paperVersion: string;
  examType: ExamCategory;
  userId: string;
  sessionId: string;
  failedAttempts: number;
  maxAttempts: number;
  isLocked: boolean;
  lockReason: string | null;
  lockedAt: string | null;
  unlockedAt: string | null;
  unlockedBy: string | null;
  lastAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const MAX_DECRYPTION_ATTEMPTS = 3;

/**
 * Initializes the decryption attempts ledger schema.
 */
export function initDecryptionAttemptSchema(db: any): void {
  try {
    executeRun(
      db,
      `CREATE TABLE IF NOT EXISTS paper_decryption_attempts (
        id TEXT PRIMARY KEY,
        paper_id TEXT NOT NULL,
        paper_version TEXT NOT NULL,
        exam_type TEXT NOT NULL,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        is_locked INTEGER NOT NULL DEFAULT 0,
        lock_reason TEXT,
        locked_at TEXT,
        unlocked_at TEXT,
        unlocked_by TEXT,
        last_attempt_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`
    );

    executeRun(
      db,
      `CREATE INDEX IF NOT EXISTS idx_decrypt_attempts_paper_session 
       ON paper_decryption_attempts(paper_id, paper_version, session_id);`
    );

    executeRun(
      db,
      `CREATE INDEX IF NOT EXISTS idx_decrypt_attempts_paper_user 
       ON paper_decryption_attempts(paper_id, paper_version, user_id);`
    );
  } catch (err) {
    console.warn('initDecryptionAttemptSchema warning:', err);
  }
}

/**
 * Retrieves the persistent decryption attempt state for a paper version and session/user.
 */
export function getDecryptionAttemptState(
  db: any,
  params: {
    paperId: string;
    paperVersion?: string;
    examType: ExamCategory;
    userId: string;
    sessionId?: string;
  }
): {
  id: string;
  failedAttempts: number;
  remainingAttempts: number;
  isLocked: boolean;
  lockedAt: string | null;
  lockReason: string | null;
} {
  initDecryptionAttemptSchema(db);
  const version = params.paperVersion || 'v1';
  const sessId = params.sessionId || `sess-${params.userId}-${params.paperId}`;

  // Check by session_id OR by (paper_id + paper_version + user_id)
  const rows = executeQuery(
    db,
    `SELECT * FROM paper_decryption_attempts 
     WHERE paper_id = ? AND paper_version = ? AND (session_id = ? OR user_id = ?)
     ORDER BY updated_at DESC LIMIT 1`,
    [params.paperId, version, sessId, params.userId]
  );

  if (!rows || rows.length === 0) {
    return {
      id: '',
      failedAttempts: 0,
      remainingAttempts: MAX_DECRYPTION_ATTEMPTS,
      isLocked: false,
      lockedAt: null,
      lockReason: null,
    };
  }

  const rec = rows[0];
  const failed = Number(rec.failed_attempts || 0);
  const isLocked = Boolean(rec.is_locked === 1 || failed >= MAX_DECRYPTION_ATTEMPTS);
  const remaining = Math.max(0, MAX_DECRYPTION_ATTEMPTS - failed);

  return {
    id: rec.id,
    failedAttempts: failed,
    remainingAttempts: remaining,
    isLocked,
    lockedAt: rec.locked_at || null,
    lockReason: rec.lock_reason || null,
  };
}

/**
 * Records a failed key attempt atomically. Increments counter.
 * If failed attempts reach 3, permanently locks the decryption session.
 */
export function recordFailedDecryptionAttempt(
  db: any,
  params: {
    paperId: string;
    paperVersion?: string;
    examType: ExamCategory;
    userId: string;
    userRole?: string;
    sessionId?: string;
    ipAddress?: string;
    reason?: string;
  }
): {
  success: boolean;
  failedAttempts: number;
  remainingAttempts: number;
  isLocked: boolean;
  lockedAt: string | null;
  message: string;
} {
  initDecryptionAttemptSchema(db);
  const version = params.paperVersion || 'v1';
  const sessId = params.sessionId || `sess-${params.userId}-${params.paperId}`;
  const now = new Date().toISOString();

  const existing = executeQuery(
    db,
    `SELECT * FROM paper_decryption_attempts 
     WHERE paper_id = ? AND paper_version = ? AND (session_id = ? OR user_id = ?)
     ORDER BY updated_at DESC LIMIT 1`,
    [params.paperId, version, sessId, params.userId]
  );

  let currentRecord: any = null;
  if (existing && existing.length > 0) {
    currentRecord = existing[0];
  }

  const currentFailed = currentRecord ? Number(currentRecord.failed_attempts || 0) : 0;
  const newFailed = currentFailed + 1;
  const willLock = newFailed >= MAX_DECRYPTION_ATTEMPTS;
  const remainingAttempts = Math.max(0, MAX_DECRYPTION_ATTEMPTS - newFailed);
  const lockReason = willLock
    ? `SESSION_LOCKED: Maximum 3 incorrect decryption key attempts reached on ${now}.`
    : null;

  if (currentRecord) {
    executeRun(
      db,
      `UPDATE paper_decryption_attempts 
       SET failed_attempts = ?,
           is_locked = ?,
           lock_reason = COALESCE(?, lock_reason),
           locked_at = CASE WHEN ? = 1 AND locked_at IS NULL THEN ? ELSE locked_at END,
           last_attempt_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        newFailed,
        willLock ? 1 : (currentRecord.is_locked || 0),
        lockReason,
        willLock ? 1 : 0,
        now,
        now,
        now,
        currentRecord.id,
      ]
    );
  } else {
    const id = uuidv4();
    executeRun(
      db,
      `INSERT INTO paper_decryption_attempts (
        id, paper_id, paper_version, exam_type, user_id, session_id,
        failed_attempts, max_attempts, is_locked, lock_reason, locked_at,
        last_attempt_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 3, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.paperId,
        version,
        params.examType,
        params.userId,
        sessId,
        newFailed,
        willLock ? 1 : 0,
        lockReason,
        willLock ? now : null,
        now,
        now,
        now,
      ]
    );
  }

  // Also log security threat event in audit ledger
  try {
    const auditId = uuidv4();
    executeRun(
      db,
      `INSERT INTO security_events (
        id, event_type, severity, risk_score, user_id, ip_address, details_json, resolved, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        auditId,
        willLock ? 'DECRYPTION_LOCKOUT_TRIGGERED' : 'INVALID_DECRYPTION_KEY_ATTEMPT',
        willLock ? 'CRITICAL' : 'HIGH',
        willLock ? 85.0 : 45.0,
        params.userId,
        params.ipAddress || '127.0.0.1',
        JSON.stringify({
          paperId: params.paperId,
          paperVersion: version,
          examType: params.examType,
          failedAttempts: newFailed,
          remainingAttempts,
          isLocked: willLock,
          reason: params.reason || 'Cryptographic authentication key mismatch',
          sessionId: sessId,
          timestamp: now,
        }),
        now,
      ]
    );
  } catch (err) {
    console.warn('Could not record security event for failed decryption attempt:', err);
  }

  saveDb();

  let message = '';
  if (willLock) {
    message = 'Access permanently locked: 3 consecutive incorrect key attempts. An authorized administrator must reset this lock.';
  } else {
    message = `Incorrect decryption key. Remaining attempts: ${remainingAttempts} of ${MAX_DECRYPTION_ATTEMPTS}.`;
  }

  return {
    success: false,
    failedAttempts: newFailed,
    remainingAttempts,
    isLocked: willLock,
    lockedAt: willLock ? now : null,
    message,
  };
}

/**
 * Records a successful check without clearing the persistent failure history.
 */
export function recordSuccessfulDecryption(
  db: any,
  params: {
    paperId: string;
    paperVersion?: string;
    examType: ExamCategory;
    userId: string;
    sessionId?: string;
  }
): void {
  initDecryptionAttemptSchema(db);
  const version = params.paperVersion || 'v1';
  const sessId = params.sessionId || `sess-${params.userId}-${params.paperId}`;
  const now = new Date().toISOString();

  executeRun(
    db,
    `UPDATE paper_decryption_attempts 
     SET last_attempt_at = ?,
         updated_at = ?
     WHERE paper_id = ? AND paper_version = ? AND is_locked = 0 AND (session_id = ? OR user_id = ?)`,
    [now, now, params.paperId, version, sessId, params.userId]
  );

  saveDb();
}

/**
 * Authenticated administrative recovery process to reset attempts and clear lock.
 * Can only be performed by an Organization Owner or Auditor with justification.
 */
export function adminResetDecryptionLock(
  db: any,
  params: {
    paperId: string;
    paperVersion?: string;
    examType: ExamCategory;
    adminUserId: string;
    adminUserName?: string;
    adminRole: string;
    reason: string;
    ipAddress?: string;
  }
): {
  success: boolean;
  error?: string;
  message?: string;
  unlockedAt?: string;
} {
  initDecryptionAttemptSchema(db);

  if (!['ORG_OWNER', 'AUDITOR'].includes(params.adminRole)) {
    return {
      success: false,
      error: 'ACCESS DENIED: Administrative reset of decryption lockout requires Organization Owner or Auditor authorization.',
    };
  }

  if (!params.reason || params.reason.trim().length < 10) {
    return {
      success: false,
      error: 'A detailed operational justification (at least 10 characters) is required to reset a locked decryption session.',
    };
  }

  const version = params.paperVersion || 'v1';
  const now = new Date().toISOString();

  executeRun(
    db,
    `UPDATE paper_decryption_attempts 
     SET failed_attempts = 0,
         is_locked = 0,
         lock_reason = NULL,
         unlocked_at = ?,
         unlocked_by = ?,
         updated_at = ?
     WHERE paper_id = ? AND paper_version = ?`,
    [now, params.adminUserId, now, params.paperId, version]
  );

  // Record audited recovery event
  try {
    const auditId = uuidv4();
    executeRun(
      db,
      `INSERT INTO audit_events (
        id, event_type, user_id, user_email, role, exam_id, ip_address, status, tx_ref, details_json, created_at
      ) VALUES (?, 'ADMIN_DECRYPTION_LOCK_RESET', ?, ?, ?, ?, ?, 'SUCCESS', ?, ?, ?)`,
      [
        auditId,
        params.adminUserId,
        params.adminUserName || params.adminUserId,
        params.adminRole,
        params.paperId,
        params.ipAddress || '127.0.0.1',
        `0x${crypto.randomBytes(16).toString('hex')}`,
        JSON.stringify({
          paperId: params.paperId,
          paperVersion: version,
          examType: params.examType,
          reason: params.reason,
          unlockedByRole: params.adminRole,
          unlockedAt: now,
        }),
        now,
      ]
    );
  } catch (err) {
    console.warn('Could not record administrative unlock audit event:', err);
  }

  saveDb();

  return {
    success: true,
    message: `Decryption lockout successfully cleared for paper version ${version} by authorized administrator (${params.adminRole}).`,
    unlockedAt: now,
  };
}
