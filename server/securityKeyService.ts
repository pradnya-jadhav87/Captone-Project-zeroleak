import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { executeQuery, executeRun } from './db.ts';

export type SecurityOperation = 'PRINT' | 'TRANSLATE';

/**
 * Fallback server-side secrets if not explicitly defined in process.env.
 * These are generated securely per process lifetime if not configured in .env.
 */
let cachedPrintKey: string = process.env.PAPER_PRINT_KEY || '';
let cachedTranslationKey: string = process.env.PAPER_TRANSLATION_KEY || '';

if (!cachedPrintKey) {
  cachedPrintKey = process.env.NODE_ENV === 'test' ? 'TEST-PRINT-KEY-2026' : `ZL-PRN-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

if (!cachedTranslationKey) {
  cachedTranslationKey = process.env.NODE_ENV === 'test' ? 'TEST-TRANSLATE-KEY-2026' : `ZL-TRN-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

/**
 * Returns the server-side expected authorization key for an operation.
 * NEVER returns this to the client or logs it.
 */
export function getServerSecretKey(operation: SecurityOperation): string {
  if (operation === 'PRINT') {
    return process.env.PAPER_PRINT_KEY || cachedPrintKey;
  }
  if (operation === 'TRANSLATE') {
    return process.env.PAPER_TRANSLATION_KEY || cachedTranslationKey;
  }
  throw new Error(`Unsupported security operation: ${operation}`);
}

/**
 * Constant-time string equality check to avoid timing attacks.
 */
export function secureKeyCompare(submitted: string, expected: string): boolean {
  if (!submitted || !expected) return false;
  const submittedBuffer = Buffer.from(submitted.trim());
  const expectedBuffer = Buffer.from(expected.trim());
  if (submittedBuffer.length !== expectedBuffer.length) {
    // Prevent short-circuit timing differences on length
    crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return crypto.timingSafeEqual(submittedBuffer, expectedBuffer);
}

/**
 * Checks current server-side attempt status for a user, exam, and operation.
 */
export function getSecurityAttemptRecord(
  db: any,
  params: { userId: string; examId: string; operation: SecurityOperation; paperId?: string }
): { attemptCount: number; isLocked: boolean; attemptsRemaining: number } {
  const { userId, examId, operation } = params;
  const rows = executeQuery(
    db,
    'SELECT * FROM security_key_attempts WHERE user_id = ? AND exam_id = ? AND operation = ?',
    [userId, examId, operation]
  );

  if (!rows || rows.length === 0) {
    return { attemptCount: 0, isLocked: false, attemptsRemaining: 2 };
  }

  const record = rows[0];
  const count = Number(record.attempt_count) || 0;
  const locked = Number(record.is_locked) === 1 || count >= 2;
  const remaining = Math.max(0, 2 - count);

  return { attemptCount: count, isLocked: locked, attemptsRemaining: remaining };
}

export interface VerifyKeyResult {
  ok: boolean;
  isLocked: boolean;
  attemptsRemaining: number;
  authorizationToken?: string;
  expiresAt?: string;
  error?: string;
  securityEventTriggered?: boolean;
}

/**
 * Verifies a submitted security key with strict 2-attempt server enforcement.
 */
export function processSecurityKeyVerification(
  db: any,
  params: {
    user: { id: string; role: string; org_id: string; email?: string };
    examId: string;
    paperId?: string;
    operation: SecurityOperation;
    submittedKey: string;
    ipAddress?: string;
  }
): VerifyKeyResult {
  const { user, examId, paperId, operation, submittedKey } = params;
  const now = new Date().toISOString();

  // 1. Check existing attempt status
  const existingRows = executeQuery(
    db,
    'SELECT * FROM security_key_attempts WHERE user_id = ? AND exam_id = ? AND operation = ?',
    [user.id, examId, operation]
  );

  let currentCount = 0;
  let attemptId = uuidv4();

  if (existingRows && existingRows.length > 0) {
    const existing = existingRows[0];
    attemptId = existing.id;
    currentCount = Number(existing.attempt_count) || 0;
    const isAlreadyLocked = Number(existing.is_locked) === 1 || currentCount >= 2;

    if (isAlreadyLocked) {
      return {
        ok: false,
        isLocked: true,
        attemptsRemaining: 0,
        error: 'Security verification failed. Maximum attempts reached. This operation has been locked.',
      };
    }
  }

  // 2. Compare key with constant-time equality
  const expectedKey = getServerSecretKey(operation);
  const isMatch = secureKeyCompare(submittedKey, expectedKey);

  if (isMatch) {
    // Successful Verification:
    // Reset attempt counter or clear lock state
    executeRun(
      db,
      `INSERT OR REPLACE INTO security_key_attempts (id, user_id, exam_id, paper_id, operation, attempt_count, is_locked, locked_at, last_attempt_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, NULL, ?)`,
      [attemptId, user.id, examId, paperId || null, operation, now]
    );

    // Generate short-lived authorization token (valid for 15 minutes)
    const token = `SEC-AUTH-${uuidv4()}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    executeRun(
      db,
      `INSERT INTO security_authorizations (id, token, user_id, role, exam_id, paper_id, operation, created_at, expires_at, consumed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [uuidv4(), token, user.id, user.role, examId, paperId || null, operation, now, expiresAt]
    );

    return {
      ok: true,
      isLocked: false,
      attemptsRemaining: 2,
      authorizationToken: token,
      expiresAt,
    };
  }

  // Failed Verification:
  const newCount = currentCount + 1;
  const isNowLocked = newCount >= 2;
  const attemptsRemaining = Math.max(0, 2 - newCount);

  executeRun(
    db,
    `INSERT OR REPLACE INTO security_key_attempts (id, user_id, exam_id, paper_id, operation, attempt_count, is_locked, locked_at, last_attempt_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      attemptId,
      user.id,
      examId,
      paperId || null,
      operation,
      newCount,
      isNowLocked ? 1 : 0,
      isNowLocked ? now : null,
      now,
    ]
  );

  if (isNowLocked) {
    return {
      ok: false,
      isLocked: true,
      attemptsRemaining: 0,
      securityEventTriggered: true,
      error: 'Security verification failed. Maximum attempts reached. This operation has been locked.',
    };
  }

  return {
    ok: false,
    isLocked: false,
    attemptsRemaining,
    error: `Invalid security key. Attempts remaining: ${attemptsRemaining}`,
  };
}

/**
 * Validates an issued authorization token for an operation.
 */
export function validateSecurityAuthorizationToken(
  db: any,
  params: {
    token: string;
    userId: string;
    operation: SecurityOperation;
    examId: string;
    paperId?: string;
  }
): { valid: boolean; reason?: string } {
  const { token, userId, operation, examId } = params;
  if (!token) {
    return { valid: false, reason: 'Security authorization key required for this operation.' };
  }

  const rows = executeQuery(
    db,
    'SELECT * FROM security_authorizations WHERE token = ? AND user_id = ? AND operation = ? AND exam_id = ?',
    [token, userId, operation, examId]
  );

  if (!rows || rows.length === 0) {
    return { valid: false, reason: 'Invalid or unauthorized security verification session.' };
  }

  const auth = rows[0];
  const now = new Date().toISOString();

  if (auth.expires_at < now) {
    return { valid: false, reason: 'Security authorization session expired. Re-verification required.' };
  }

  // Check if the user is currently locked for this operation
  const attemptStatus = getSecurityAttemptRecord(db, { userId, examId, operation });
  if (attemptStatus.isLocked) {
    return { valid: false, reason: 'Operation is locked due to security policy violations.' };
  }

  return { valid: true };
}
