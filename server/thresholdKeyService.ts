import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { executeQuery, executeRun, executeTransactionWithResult, saveDb } from './db.ts';
import { consumeViewOnceSession, initViewOnceSchema } from './viewOnceService.ts';

export type Database = any;
export type CustodianRole = 'ORG_OWNER' | 'EXAM_MANAGER' | 'AUDITOR';
export type ExamCategory = 'COMPETITIVE' | 'UNIVERSITY';

// ============================================================================
// 1. GALOIS FIELD GF(256) ARITHMETIC (Rijndael Polynomial 0x11b, generator 3)
// ============================================================================

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = val;
    GF_EXP[i + 255] = val;
    GF_LOG[val] = i;
    // Multiply by generator 3 in GF(2^8)
    const val2 = (val << 1) ^ (val & 0x80 ? 0x11b : 0);
    val = (val2 ^ val) & 0xff;
  }
  GF_LOG[0] = 0; // Undefined mathematically, safe sentinel
})();

export function gfAdd(a: number, b: number): number {
  return (a ^ b) & 0xff;
}

export function gfSub(a: number, b: number): number {
  return (a ^ b) & 0xff; // In GF(2^n), addition and subtraction are identical (XOR)
}

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

export function gfDiv(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Cryptographic error: Division by zero in GF(256). Duplicate or invalid shares supplied.');
  }
  if (a === 0) return 0;
  return GF_EXP[(GF_LOG[a] + 255 - GF_LOG[b]) % 255];
}

// ============================================================================
// 2. SHAMIR'S SECRET SHARING (2-of-3 THRESHOLD SCHEME OVER GF(256))
// ============================================================================

export interface ShamirShare {
  index: number; // 1 = ORG_OWNER, 2 = EXAM_MANAGER, 3 = AUDITOR
  role: CustodianRole;
  shareHex: string;
}

const CUSTODIAN_ROLES_BY_INDEX: Record<number, CustodianRole> = {
  1: 'ORG_OWNER',
  2: 'EXAM_MANAGER',
  3: 'AUDITOR',
};

const CUSTODIAN_INDICES_BY_ROLE: Record<CustodianRole, number> = {
  ORG_OWNER: 1,
  EXAM_MANAGER: 2,
  AUDITOR: 3,
};

/**
 * Splits a 32-byte secret (e.g. Data-Encryption Key) into 3 shares with threshold 2.
 * Any 2 shares can reconstruct the secret. A single share reveals zero information.
 */
export function splitSecretShamir2of3(secret: Buffer): ShamirShare[] {
  if (!Buffer.isBuffer(secret) || secret.length !== 32) {
    throw new Error('Shamir split requires exactly a 32-byte Buffer.');
  }

  // Linear polynomial per byte: P_i(x) = secret[i] ^ (slope[i] * x)
  const slopes = crypto.randomBytes(32);
  // Ensure non-zero slopes for information-theoretic security
  for (let i = 0; i < 32; i++) {
    if (slopes[i] === 0) {
      slopes[i] = crypto.randomInt(1, 256);
    }
  }

  const shares: ShamirShare[] = [];
  const indices = [1, 2, 3];

  for (const x of indices) {
    const shareBytes = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
      const s = secret[i];
      const a = slopes[i];
      const term = gfMul(a, x);
      shareBytes[i] = gfAdd(s, term);
    }
    shares.push({
      index: x,
      role: CUSTODIAN_ROLES_BY_INDEX[x],
      shareHex: shareBytes.toString('hex'),
    });
  }

  return shares;
}

/**
 * Reconstructs the 32-byte secret from any 2 distinct Shamir shares using Lagrange interpolation at x = 0.
 * Rejects single shares, duplicate shares, and malformed inputs.
 */
export function reconstructSecretShamir2of3(
  shares: Array<{ index: number; shareHex: string }>
): Buffer {
  if (!Array.isArray(shares) || shares.length < 2) {
    throw new Error('Threshold policy failure: At least 2 distinct custodian shares are required to reconstruct key.');
  }

  const share1 = shares[0];
  const share2 = shares[1];

  if (!share1 || !share2) {
    throw new Error('Invalid share objects provided.');
  }

  const x1 = share1.index;
  const x2 = share2.index;

  if (x1 === x2) {
    throw new Error('Threshold policy failure: Duplicate approvals or identical share indices detected. Distinct custodians required.');
  }

  if (![1, 2, 3].includes(x1) || ![1, 2, 3].includes(x2)) {
    throw new Error(`Unauthorized share index: indices must be 1, 2, or 3. Got ${x1} and ${x2}.`);
  }

  const y1 = Buffer.from(share1.shareHex, 'hex');
  const y2 = Buffer.from(share2.shareHex, 'hex');

  if (y1.length !== 32 || y2.length !== 32) {
    throw new Error('Malformed share length: each share must be exactly 32 bytes.');
  }

  // Lagrange basis polynomials evaluated at x = 0:
  // L1(0) = (0 - x2) / (x1 - x2) = x2 / (x1 ^ x2)
  // L2(0) = (0 - x1) / (x2 - x1) = x1 / (x1 ^ x2)
  const denom = gfSub(x1, x2); // In GF(256), x1 ^ x2
  const l1_0 = gfDiv(x2, denom);
  const l2_0 = gfDiv(x1, denom);

  const secret = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    const term1 = gfMul(y1[i], l1_0);
    const term2 = gfMul(y2[i], l2_0);
    secret[i] = gfAdd(term1, term2);
  }

  return secret;
}

// ============================================================================
// 3. KEY WRAPPING & SECURE STORAGE AT REST
// ============================================================================

function getServerKek(): Buffer {
  const configuredKek = process.env.ZEROLEAK_KEK?.trim();
  if (!configuredKek) {
    throw new Error('ZEROLEAK_KEK is required to wrap threshold shares. Configure a unique secret before using paper encryption.');
  }
  if (Buffer.byteLength(configuredKek, 'utf8') < 32) {
    throw new Error('ZEROLEAK_KEK must contain at least 32 bytes. Configure a unique high-entropy secret before using paper encryption.');
  }
  return crypto.createHash('sha256').update(configuredKek, 'utf8').digest();
}

/**
 * Wraps a custodian share using authenticated AES-256-GCM bound to org and role.
 */
export function wrapShare(shareHex: string, custodianRole: string, orgId: string): string {
  const aad = Buffer.from(`${custodianRole}:${orgId}`);
  const iv = crypto.randomBytes(12);
  const derivedKey = crypto.createHmac('sha256', getServerKek()).update(aad).digest();

  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  cipher.setAAD(aad);
  let ciphertext = cipher.update(shareHex, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return JSON.stringify({
    ciphertext,
    iv: iv.toString('hex'),
    tag,
  });
}

/**
 * Unwraps a custodian share using authenticated AES-256-GCM.
 */
export function unwrapShare(wrappedPayloadJson: string, custodianRole: string, orgId: string): string {
  const parsed = JSON.parse(wrappedPayloadJson);
  const aad = Buffer.from(`${custodianRole}:${orgId}`);
  const derivedKey = crypto.createHmac('sha256', getServerKek()).update(aad).digest();
  const iv = Buffer.from(parsed.iv, 'hex');
  const tag = Buffer.from(parsed.tag, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  let shareHex = decipher.update(parsed.ciphertext, 'hex', 'utf8');
  shareHex += decipher.final('utf8');
  return shareHex;
}

// ============================================================================
// 4. DATABASE INITIALIZATION & SCHEMA SETUP
// ============================================================================

export function initThresholdKeySchema(db: Database) {
  executeRun(
    db,
    `CREATE TABLE IF NOT EXISTS paper_threshold_key_shares (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL,
      paper_version TEXT NOT NULL,
      exam_type TEXT NOT NULL,
      org_id TEXT NOT NULL,
      custodian_role TEXT NOT NULL,
      share_index INTEGER NOT NULL,
      wrapped_share_payload TEXT NOT NULL,
      share_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );`
  );

  executeRun(
    db,
    `CREATE TABLE IF NOT EXISTS paper_authorization_requests (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL,
      paper_version TEXT NOT NULL,
      exam_type TEXT NOT NULL,
      org_id TEXT NOT NULL,
      custodian_role TEXT NOT NULL,
      request_type TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      approved_by TEXT,
      approved_at TEXT,
      rejection_reason TEXT,
      expires_at TEXT NOT NULL,
      nonce TEXT NOT NULL
    );`
  );

  executeRun(
    db,
    `CREATE TABLE IF NOT EXISTS paper_emergency_cases (
      id TEXT PRIMARY KEY,
      case_number TEXT UNIQUE NOT NULL,
      paper_id TEXT NOT NULL,
      paper_version TEXT NOT NULL,
      exam_type TEXT NOT NULL,
      org_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      approvals_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      decrypted_at TEXT,
      decrypted_by TEXT,
      outcome TEXT
    );`
  );

  executeRun(
    db,
    `CREATE TABLE IF NOT EXISTS paper_verification_records (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL,
      paper_version TEXT NOT NULL,
      exam_type TEXT NOT NULL,
      org_id TEXT NOT NULL,
      verified_by TEXT NOT NULL,
      verified_by_name TEXT,
      verified_at TEXT NOT NULL,
      verification_result TEXT NOT NULL,
      verification_notes TEXT,
      ip_address TEXT
    );`
  );

  // Alter competitive_generated_papers with columns if missing
  const compColumns = [
    "verification_status TEXT DEFAULT 'UNVERIFIED'",
    'verification_completed INTEGER DEFAULT 0',
    'verified_by TEXT',
    'verified_at TEXT',
    "paper_version TEXT DEFAULT 'v1'",
    'is_encrypted INTEGER DEFAULT 0',
    'encryption_algorithm TEXT',
    'encryption_dek_id TEXT',
  ];
  for (const col of compColumns) {
    try {
      executeRun(db, `ALTER TABLE competitive_generated_papers ADD COLUMN ${col};`);
    } catch {}
  }

  // Alter university_generated_papers with columns if missing
  const uniColumns = [
    "verification_status TEXT DEFAULT 'UNVERIFIED'",
    'verification_completed INTEGER DEFAULT 0',
    'verified_by TEXT',
    'verified_at TEXT',
    "paper_version TEXT DEFAULT 'v1'",
    'is_encrypted INTEGER DEFAULT 0',
    'encryption_dek_id TEXT',
  ];
  for (const col of uniColumns) {
    try {
      executeRun(db, `ALTER TABLE university_generated_papers ADD COLUMN ${col};`);
    } catch {}
  }
}

// ============================================================================
// 5. ONE-TIME PAPER VERIFICATION BY EXAM MANAGER
// ============================================================================

export function verifyPaperOnce(
  db: Database,
  params: {
    examType: ExamCategory;
    paperId: string;
    paperVersion?: string;
    userId: string;
    userName: string;
    userRole: string;
    orgId: string;
    sessionToken?: string;
    verificationNotes?: string;
    ipAddress?: string;
  }
): {
  success: boolean;
  status: 'VERIFIED' | 'ALREADY_VERIFIED' | 'ALREADY_ENCRYPTED' | 'UNAUTHORIZED';
  verifiedAt?: string;
  paperVersion?: string;
  error?: string;
} {
  initThresholdKeySchema(db);

  if (!['EXAM_MANAGER', 'ORG_OWNER'].includes(params.userRole)) {
    return {
      success: false,
      status: 'UNAUTHORIZED',
      error: 'ACCESS DENIED: Only an authorized Exam Manager or Organization Owner can verify generated question papers.',
    };
  }

  const paperTable = params.examType === 'COMPETITIVE' ? 'competitive_generated_papers' : 'university_generated_papers';
  const cleanPaperId = params.paperId.startsWith('paper-') ? params.paperId.replace(/^paper-/, '') : params.paperId;
  const rows = executeQuery(
    db,
    `SELECT * FROM ${paperTable} 
     WHERE id = ? OR id = ? OR exam_id = ? OR exam_id = ? 
     ORDER BY rowid DESC LIMIT 1`,
    [params.paperId, cleanPaperId, params.paperId, cleanPaperId]
  );
  if (!rows || rows.length === 0) {
    return {
      success: false,
      status: 'UNAUTHORIZED',
      error: `Question paper not found: ${params.paperId}`,
    };
  }

  const paper = rows[0];
  const actualPaperId = paper.id;
  const version = params.paperVersion || paper.paper_version || paper.version_code || 'v1';
  let sessionPaperId = actualPaperId;

  if (params.sessionToken) {
    initViewOnceSchema(db);
    const sessions = executeQuery(
      db,
      `SELECT * FROM view_once_preview_sessions
       WHERE session_token = ? AND (paper_id = ? OR paper_id = ?)
         AND user_id = ? AND user_role = ? AND exam_type = ?`,
      [params.sessionToken, actualPaperId, params.paperId, params.userId, params.userRole, params.examType]
    );
    if (!sessions.length || sessions[0].status !== 'VIEWING') {
      return {
        success: false,
        status: 'UNAUTHORIZED',
        error: 'An active one-time preview session for this paper and signed-in user is required to complete verification.',
      };
    }
    sessionPaperId = sessions[0].paper_id;
  }

  // Check if already encrypted
  if (paper.is_encrypted === 1 || paper.encryption_status === 'ENCRYPTED') {
    return {
      success: false,
      status: 'ALREADY_ENCRYPTED',
      error: 'Paper has already been encrypted. Viewing and verification actions are permanently sealed.',
    };
  }

  // Check if already verified
  if (paper.verification_completed === 1 || paper.verification_status === 'VERIFIED') {
    return {
      success: false,
      status: 'ALREADY_VERIFIED',
      error: 'Paper verification has already been permanently completed for this paper version. Previews are locked.',
    };
  }

  const nowIso = new Date().toISOString();
  const recordId = uuidv4();

  // Record immutable verification log
  executeRun(
    db,
    `INSERT INTO paper_verification_records (
      id, paper_id, paper_version, exam_type, org_id, verified_by, verified_by_name,
      verified_at, verification_result, verification_notes, ip_address
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED', ?, ?)`,
    [
      recordId,
      actualPaperId,
      version,
      params.examType,
      params.orgId,
      params.userId,
      params.userName,
      nowIso,
      params.verificationNotes || 'Questions, marks, sections, formatting, and total marks verified by Exam Manager.',
      params.ipAddress || '127.0.0.1',
    ]
  );

  // Permanently mark paper as verified
  executeRun(
    db,
    `UPDATE ${paperTable}
     SET verification_status = 'VERIFIED',
         verification_completed = 1,
         verified_by = ?,
         verified_at = ?,
         preview_status = 'CONSUMED',
         preview_consumed_at = ?,
         preview_consumed_by = ?
     WHERE id = ?`,
    [params.userId, nowIso, nowIso, params.userId, actualPaperId]
  );

  // Permanently consume view-once preview session ledger
  const consumeResult = consumeViewOnceSession(db, {
    examType: params.examType,
    paperId: sessionPaperId,
    sessionToken: params.sessionToken,
    userId: params.userId,
    userRole: params.userRole,
    reason: 'CONFIRMED_FINALIZE',
    ipAddress: params.ipAddress,
  });
  if (!consumeResult.success) {
    return {
      success: false,
      status: 'UNAUTHORIZED',
      error: 'The one-time preview session could not be finalized. Refresh status and contact an administrator if the preview is already consumed.',
    };
  }
  saveDb();

  return {
    success: true,
    status: 'VERIFIED',
    verifiedAt: nowIso,
    paperVersion: version,
  };
}

// ============================================================================
// 6. ONE-TIME PAPER ENCRYPTION WITH 2-OF-3 THRESHOLD DEK
// ============================================================================

export async function encryptPaperOnceWithThreshold(
  db: Database,
  params: {
    examType: ExamCategory;
    paperId: string;
    paperVersion?: string;
    orgId: string;
    userId: string;
    userName: string;
    userRole: string;
    ipAddress?: string;
    requireThresholdAuth?: boolean;
  }
): Promise<{
  success: boolean;
  status: 'ENCRYPTED' | 'ALREADY_ENCRYPTED' | 'NOT_VERIFIED' | 'UNAUTHORIZED' | 'FAILED';
  paperId: string;
  paperVersion: string;
  encryptedAt?: string;
  keyFingerprint?: string;
  checksumSHA256?: string;
  sharesCreated?: number;
  algorithm?: string;
  error?: string;
}> {
  initThresholdKeySchema(db);

  if (!['EXAM_MANAGER', 'ORG_OWNER'].includes(params.userRole)) {
    return {
      success: false,
      status: 'UNAUTHORIZED',
      paperId: params.paperId,
      paperVersion: params.paperVersion || 'v1',
      error: 'ACCESS DENIED: Only an authorized Exam Manager or Organization Owner can trigger paper encryption.',
    };
  }

  const paperTable = params.examType === 'COMPETITIVE' ? 'competitive_generated_papers' : 'university_generated_papers';
  const cleanPaperId = params.paperId.startsWith('paper-') ? params.paperId.replace(/^paper-/, '') : params.paperId;
  const rows = executeQuery(
    db,
    `SELECT * FROM ${paperTable} 
     WHERE id = ? OR id = ? OR exam_id = ? OR exam_id = ? 
     ORDER BY rowid DESC LIMIT 1`,
    [params.paperId, cleanPaperId, params.paperId, cleanPaperId]
  );
  if (!rows || rows.length === 0) {
    return {
      success: false,
      status: 'FAILED',
      paperId: params.paperId,
      paperVersion: params.paperVersion || 'v1',
      error: `Question paper not found: ${params.paperId}`,
    };
  }

  const paper = rows[0];
  const actualPaperId = paper.id;
  const version = params.paperVersion || paper.paper_version || paper.version_code || 'v1';

  // 1. Check if already encrypted (One-time encryption enforcement)
  if (paper.is_encrypted === 1 || paper.encryption_status === 'ENCRYPTED') {
    return {
      success: false,
      status: 'ALREADY_ENCRYPTED',
      paperId: actualPaperId,
      paperVersion: version,
      error: 'ACCESS DENIED: Paper version is already encrypted. Repeat encryption requests are strictly prohibited.',
    };
  }

  // 2. Check if verified
  if (paper.verification_completed !== 1 && paper.verification_status !== 'VERIFIED') {
    return {
      success: false,
      status: 'NOT_VERIFIED',
      paperId: actualPaperId,
      paperVersion: version,
      error: 'PRE-CONDITION NOT MET: Paper must be verified once by the Exam Manager before encryption can occur.',
    };
  }

  // 2B. Check 2-of-3 Custodian Authorization when required
  if (params.requireThresholdAuth) {
    const authStatus = getPaperAuthorizationStatus(db, actualPaperId, version, params.orgId);
    const fallbackAuth = getPaperAuthorizationStatus(db, params.paperId, version, params.orgId);
    const isMet = authStatus.isThresholdMet || fallbackAuth.isThresholdMet;
    const count = Math.max(authStatus.approvedCount, fallbackAuth.approvedCount);
    if (!isMet) {
      const pending = authStatus.pendingRoles.join(', ');
      return {
        success: false,
        status: 'UNAUTHORIZED',
        paperId: actualPaperId,
        paperVersion: version,
        error: `PRE-CONDITION NOT MET: At least 2-of-3 Custodian Authorization required before encryption (Current approvals: ${count}/2). Pending custodians: ${pending}.`,
      };
    }
  }

  let dek: Buffer | null = null;
  try {
    // 3. Assemble complete paper payload to encrypt
    let paperPayloadObj: any = null;
    if (params.examType === 'COMPETITIVE') {
      let sections: any[] = [];
      let questions: any[] = [];
      try {
        sections = paper.sections_json ? JSON.parse(paper.sections_json) : [];
      } catch {}
      try {
        questions = paper.questions_json ? JSON.parse(paper.questions_json) : [];
      } catch {}

      paperPayloadObj = {
        id: paper.id,
        examId: paper.exam_id,
        orgId: paper.org_id,
        title: paper.title,
        examType: paper.exam_type,
        totalQuestions: paper.total_questions,
        totalMarks: paper.total_marks,
        sections,
        questions,
        blueprintSnapshot: paper.blueprint_snapshot_json ? JSON.parse(paper.blueprint_snapshot_json) : null,
        paperFingerprint: paper.paper_fingerprint,
        generatedAt: paper.generated_at,
        version,
      };
    } else {
      paperPayloadObj = {
        id: paper.id,
        examId: paper.exam_id,
        versionCode: paper.version_code,
        setLetter: paper.set_letter,
        totalQuestions: paper.total_questions,
        mcqCount: paper.mcq_count,
        shortAnswerCount: paper.short_answer_count,
        descriptiveCount: paper.descriptive_count,
        totalMarks: paper.total_marks,
        paperDistribution: paper.paper_distribution_json ? JSON.parse(paper.paper_distribution_json) : null,
        pdfFilename: paper.pdf_filename,
        pdfHash: paper.pdf_hash,
        createdAt: paper.created_at,
        version,
      };
    }

    const plaintext = JSON.stringify(paperPayloadObj);
    const checksumSHA256 = crypto.createHash('sha256').update(plaintext).digest('hex');

    // 4. Generate random Data-Encryption Key (DEK) (32 bytes AES-256)
    dek = crypto.randomBytes(32);
    const keyFingerprint = crypto.createHash('sha256').update(dek).digest('hex');
    const dekId = `DEK-${uuidv4()}`;

    // 5. Encrypt payload with AES-256-GCM using DEK
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    let cipherText = cipher.update(plaintext, 'utf8', 'base64');
    cipherText += cipher.final('base64');
    const authTag = cipher.getAuthTag().toString('hex');
    const ivHex = iv.toString('hex');
    const nowIso = new Date().toISOString();

    const encryptedPayloadRecord = {
      cipherText,
      iv: ivHex,
      authTag,
      keyFingerprint,
      checksumSHA256,
      algorithm: 'AES-256-GCM-2of3-THRESHOLD',
      encryptedAt: nowIso,
      dekId,
    };

    // 6. Generate 2-of-3 Shamir Secret Shares
    const shares = splitSecretShamir2of3(dek);

    const paperTable = params.examType === 'COMPETITIVE'
      ? 'competitive_generated_papers'
      : 'university_generated_papers';
    const encryptedPayloadJson = JSON.stringify(encryptedPayloadRecord);

    // Seal the paper and create all three wrapped shares atomically, so retries cannot leave partial keys.
    executeTransactionWithResult(db, (run, query) => {
      const currentRows = query(`SELECT * FROM ${paperTable} WHERE id = ?`, [actualPaperId]);
      const currentPaper = currentRows[0];
      if (!currentPaper) {
        throw new Error('Paper record disappeared before encryption could be committed.');
      }
      if (currentPaper.is_encrypted === 1 || currentPaper.encryption_status === 'ENCRYPTED') {
        throw new Error('Paper version was encrypted by another request. Duplicate encryption is blocked.');
      }
      if (currentPaper.verification_completed !== 1 && currentPaper.verification_status !== 'VERIFIED') {
        throw new Error('Paper verification is required before encryption can be committed.');
      }

      if (params.examType === 'COMPETITIVE') {
        run(
          `UPDATE competitive_generated_papers
           SET is_encrypted = 1,
               encryption_status = 'ENCRYPTED',
               encrypted_payload_json = ?,
               encryption_time_iso = ?,
               encryption_algorithm = 'AES-256-GCM-2of3-THRESHOLD',
               encryption_dek_id = ?,
               questions_json = '[]',
               sections_json = '[]',
               preview_status = 'CONSUMED'
           WHERE id = ? AND COALESCE(is_encrypted, 0) = 0
             AND (COALESCE(verification_completed, 0) = 1 OR verification_status = 'VERIFIED')`,
          [encryptedPayloadJson, nowIso, dekId, actualPaperId]
        );
      } else {
        run(
          `UPDATE university_generated_papers
           SET is_encrypted = 1,
               status = 'ENCRYPTED',
               encryption_algorithm = 'AES-256-GCM-2of3-THRESHOLD',
               encryption_dek_id = ?,
               paper_distribution_json = ?,
               preview_status = 'CONSUMED'
           WHERE id = ? AND COALESCE(is_encrypted, 0) = 0
             AND (COALESCE(verification_completed, 0) = 1 OR verification_status = 'VERIFIED')`,
          [dekId, encryptedPayloadJson, actualPaperId]
        );
      }
      const changedRows = query('SELECT changes() AS changed');
      if (Number(changedRows[0]?.changed) !== 1) {
        throw new Error('Paper changed during encryption; verify the paper state and retry.');
      }

      for (const share of shares) {
        const wrapped = wrapShare(share.shareHex, share.role, params.orgId);
        const shareHash = crypto.createHash('sha256').update(share.shareHex).digest('hex');
        run(
          `INSERT INTO paper_threshold_key_shares (
            id, paper_id, paper_version, exam_type, org_id, custodian_role,
            share_index, wrapped_share_payload, share_hash, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            actualPaperId,
            version,
            params.examType,
            params.orgId,
            share.role,
            share.index,
            wrapped,
            shareHash,
            nowIso,
          ]
        );
      }
    });

    dek.fill(0);
    dek = null;

    return {
      success: true,
      status: 'ENCRYPTED',
      paperId: actualPaperId,
      paperVersion: version,
      encryptedAt: nowIso,
      keyFingerprint,
      checksumSHA256,
      sharesCreated: 3,
      algorithm: 'AES-256-GCM-2of3-THRESHOLD',
    };
  } catch (err: any) {
    dek?.fill(0);
    console.error('Encryption failed:', err);
    return {
      success: false,
      status: 'FAILED',
      paperId: params.paperId,
      paperVersion: version,
      error: `Encryption transaction failed: ${err.message || 'Internal error'}. Paper remains in verified uncorrupted state.`,
    };
  }
}

// ============================================================================
// 7. CUSTODIAN KEY-REQUEST & AUTHORIZATION LEDGER
// ============================================================================

export function requestCustodianAuthorization(
  db: Database,
  params: {
    paperId: string;
    paperVersion: string;
    examType: ExamCategory;
    orgId: string;
    custodianRole: CustodianRole;
    requestType: 'ENCRYPTION' | 'EMERGENCY_DECRYPTION';
    requestedBy: string;
    expiresInHours?: number;
  }
): { success: boolean; requestId?: string; nonce?: string; expiresAt?: string; error?: string } {
  initThresholdKeySchema(db);

  if (!['ENCRYPTION', 'EMERGENCY_DECRYPTION'].includes(params.requestType)) {
    return { success: false, error: 'Invalid authorization request type.' };
  }
  if (!['ORG_OWNER', 'AUDITOR', 'EXAM_MANAGER'].includes(params.custodianRole)) {
    return { success: false, error: 'Invalid custodian role specified.' };
  }

  const paperTable = params.examType === 'COMPETITIVE' ? 'competitive_generated_papers' : 'university_generated_papers';
  const cleanPaperId = params.paperId.startsWith('paper-') ? params.paperId.replace(/^paper-/, '') : params.paperId;
  const paperRows = executeQuery(
    db,
    `SELECT * FROM ${paperTable} 
     WHERE id = ? OR id = ? OR exam_id = ? OR exam_id = ? 
     ORDER BY rowid DESC LIMIT 1`,
    [params.paperId, cleanPaperId, params.paperId, cleanPaperId]
  );
  const actualPaperId = paperRows && paperRows.length > 0 ? paperRows[0].id : params.paperId;

  // Check if an active PENDING request exists
  const existing = executeQuery(
    db,
    `SELECT * FROM paper_authorization_requests
     WHERE (paper_id = ? OR paper_id = ?) AND paper_version = ? AND org_id = ?
       AND custodian_role = ? AND request_type = ? AND status = 'PENDING'
     ORDER BY requested_at DESC`,
    [params.paperId, actualPaperId, params.paperVersion, params.orgId, params.custodianRole, params.requestType]
  );

  const now = new Date();
  if (existing && existing.length > 0) {
    const active = existing[0];
    if (new Date(active.expires_at).getTime() > now.getTime()) {
      return {
        success: true,
        requestId: active.id,
        nonce: active.nonce,
        expiresAt: active.expires_at,
      };
    }
    executeRun(db, "UPDATE paper_authorization_requests SET status = 'EXPIRED' WHERE id = ? AND status = 'PENDING'", [active.id]);
  }

  const requestedHours = Number(params.expiresInHours);
  const hours = Number.isFinite(requestedHours) && requestedHours > 0
    ? Math.min(requestedHours, 168)
    : 24;
  const expiresAt = new Date(now.getTime() + hours * 3600 * 1000).toISOString();
  const requestId = uuidv4();
  const nonce = crypto.randomBytes(16).toString('hex');
  const nowIso = now.toISOString();

  executeRun(
    db,
    `INSERT INTO paper_authorization_requests (
      id, paper_id, paper_version, exam_type, org_id, custodian_role,
      request_type, requested_by, requested_at, status, expires_at, nonce
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    [
      requestId,
      actualPaperId,
      params.paperVersion,
      params.examType,
      params.orgId,
      params.custodianRole,
      params.requestType,
      params.requestedBy,
      nowIso,
      expiresAt,
      nonce,
    ]
  );

  saveDb();

  return {
    success: true,
    requestId,
    nonce,
    expiresAt,
  };
}

export function approveCustodianAuthorization(
  db: Database,
  params: {
    requestId: string;
    custodianUserId: string;
    custodianRole: CustodianRole;
    orgId: string;
    decision: 'APPROVED' | 'REJECTED';
    rejectionReason?: string;
  }
): { success: boolean; status?: string; error?: string } {
  initThresholdKeySchema(db);

  const rows = executeQuery(db, 'SELECT * FROM paper_authorization_requests WHERE id = ?', [params.requestId]);
  if (!rows || rows.length === 0) {
    return { success: false, error: 'Authorization request not found.' };
  }

  const req = rows[0];

  if (req.org_id !== params.orgId) {
    return { success: false, error: 'ACCESS DENIED: Organization mismatch.' };
  }

  if (req.custodian_role !== params.custodianRole) {
    return {
      success: false,
      error: `ACCESS DENIED: Request is designated for ${req.custodian_role}, but signer is ${params.custodianRole}.`,
    };
  }

  if (req.requested_by === params.custodianUserId) {
    return {
      success: false,
      error: 'ACCESS DENIED: The person who requested authorization cannot approve or reject their own request. A different authorized custodian must act.',
    };
  }

  const now = new Date();
  if (new Date(req.expires_at).getTime() <= now.getTime()) {
    executeRun(db, "UPDATE paper_authorization_requests SET status = 'EXPIRED' WHERE id = ?", [params.requestId]);
    saveDb();
    return { success: false, error: 'Authorization request has expired.' };
  }

  if (req.status !== 'PENDING') {
    return { success: false, error: `Request has already been processed: current status is ${req.status}.` };
  }

  if (params.decision === 'REJECTED' && (!params.rejectionReason || params.rejectionReason.trim().length < 10)) {
    return { success: false, error: 'A rejection reason of at least 10 characters is required.' };
  }

  const nowIso = now.toISOString();
  executeRun(
    db,
    `UPDATE paper_authorization_requests
     SET status = ?, approved_by = ?, approved_at = ?, rejection_reason = ?
     WHERE id = ?`,
    [params.decision, params.custodianUserId, nowIso, params.rejectionReason || null, params.requestId]
  );

  saveDb();

  return { success: true, status: params.decision };
}

export function getPaperAuthorizationStatus(
  db: Database,
  paperId: string,
  paperVersion: string = 'v1',
  orgId?: string
): {
  paperId: string;
  paperVersion: string;
  orgOwnerRequest: any | null;
  auditorRequest: any | null;
  examManagerRequest: any | null;
  allApproved: boolean;
  approvedCount: number;
  isThresholdMet: boolean;
  pendingRoles: CustodianRole[];
} {
  initThresholdKeySchema(db);

  const cleanPaperId = paperId.startsWith('paper-') ? paperId.replace(/^paper-/, '') : paperId;
  const nowIso = new Date().toISOString();
  executeRun(
    db,
    `UPDATE paper_authorization_requests
     SET status = 'EXPIRED'
     WHERE (paper_id = ? OR paper_id = ?) AND paper_version = ?
       AND request_type = 'ENCRYPTION' AND status IN ('PENDING', 'APPROVED')
       AND expires_at <= ? AND (? IS NULL OR org_id = ?)`,
    [paperId, cleanPaperId, paperVersion, nowIso, orgId ?? null, orgId ?? null]
  );
  const requests = executeQuery(
    db,
    `SELECT * FROM paper_authorization_requests
     WHERE (paper_id = ? OR paper_id = ?) AND paper_version = ?
       AND request_type = 'ENCRYPTION' AND (? IS NULL OR org_id = ?)
     ORDER BY requested_at DESC`,
    [paperId, cleanPaperId, paperVersion, orgId ?? null, orgId ?? null]
  );

  const orgOwner = requests.find((r: any) => r.custodian_role === 'ORG_OWNER');
  const auditor = requests.find((r: any) => r.custodian_role === 'AUDITOR');
  const examManager = requests.find((r: any) => r.custodian_role === 'EXAM_MANAGER');

  const approvedRoles: CustodianRole[] = [];
  const approvingUsers = new Set<string>();
  const addApprovedRole = (request: any, role: CustodianRole) => {
    if (request?.status !== 'APPROVED' || !request.approved_by || approvingUsers.has(request.approved_by)) return;
    approvingUsers.add(request.approved_by);
    approvedRoles.push(role);
  };
  addApprovedRole(orgOwner, 'ORG_OWNER');
  addApprovedRole(examManager, 'EXAM_MANAGER');
  addApprovedRole(auditor, 'AUDITOR');

  const approvedCount = approvedRoles.length;
  const isThresholdMet = approvedCount >= 2;

  const pendingRoles: CustodianRole[] = [];
  if (orgOwner?.status !== 'APPROVED') pendingRoles.push('ORG_OWNER');
  if (examManager?.status !== 'APPROVED') pendingRoles.push('EXAM_MANAGER');
  if (auditor?.status !== 'APPROVED') pendingRoles.push('AUDITOR');

  return {
    paperId,
    paperVersion,
    orgOwnerRequest: orgOwner || null,
    auditorRequest: auditor || null,
    examManagerRequest: examManager || null,
    allApproved: isThresholdMet,
    approvedCount,
    isThresholdMet,
    pendingRoles,
  };
}

// ============================================================================
// 8. 2-OF-3 EMERGENCY DECRYPTION WORKFLOW
// ============================================================================

export function createEmergencyCase(
  db: Database,
  params: {
    paperId: string;
    paperVersion?: string;
    examType: ExamCategory;
    orgId: string;
    reason: string;
    requestedBy: string;
    validityMinutes?: number;
  }
): { success: boolean; caseNumber?: string; expiresAt?: string; error?: string } {
  initThresholdKeySchema(db);

  if (!params.reason || params.reason.trim().length < 10) {
    return { success: false, error: 'A detailed operational justification (at least 10 chars) is required for emergency cases.' };
  }

  const paperTable = params.examType === 'COMPETITIVE' ? 'competitive_generated_papers' : 'university_generated_papers';
  const cleanPaperId = params.paperId.startsWith('paper-') ? params.paperId.replace(/^paper-/, '') : params.paperId;
  const paperRows = executeQuery(
    db,
    `SELECT * FROM ${paperTable} 
     WHERE id = ? OR id = ? OR exam_id = ? OR exam_id = ? 
     ORDER BY rowid DESC LIMIT 1`,
    [params.paperId, cleanPaperId, params.paperId, cleanPaperId]
  );
  if (!paperRows || paperRows.length === 0) {
    return { success: false, error: 'Target question paper not found.' };
  }

  const paper = paperRows[0];
  const actualPaperId = paper.id;
  const version = params.paperVersion || paper.paper_version || paper.version_code || 'v1';

  const caseId = uuidv4();
  const caseNumber = `EMG-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const now = new Date();
  const minutes = params.validityMinutes || 120; // 2 hours default
  const expiresAt = new Date(now.getTime() + minutes * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  executeRun(
    db,
    `INSERT INTO paper_emergency_cases (
      id, case_number, paper_id, paper_version, exam_type, org_id,
      reason, requested_by, status, approvals_json, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', '[]', ?, ?)`,
    [
      caseId,
      caseNumber,
      actualPaperId,
      version,
      params.examType,
      params.orgId,
      params.reason,
      params.requestedBy,
      nowIso,
      expiresAt,
    ]
  );

  saveDb();

  return {
    success: true,
    caseNumber,
    expiresAt,
  };
}

export function approveEmergencyCase(
  db: Database,
  params: {
    caseNumber: string;
    custodianUserId: string;
    custodianUserName: string;
    custodianRole: CustodianRole;
    orgId: string;
    notes?: string;
  }
): {
  success: boolean;
  caseNumber: string;
  approvedCount: number;
  isThresholdMet: boolean;
  status: string;
  error?: string;
} {
  initThresholdKeySchema(db);

  if (!['ORG_OWNER', 'EXAM_MANAGER', 'AUDITOR'].includes(params.custodianRole)) {
    return {
      success: false,
      caseNumber: params.caseNumber,
      approvedCount: 0,
      isThresholdMet: false,
      status: 'REJECTED',
      error: 'ACCESS DENIED: Only authorized custodians (ORG_OWNER, EXAM_MANAGER, AUDITOR) may approve emergency cases.',
    };
  }

  const rows = executeQuery(db, 'SELECT * FROM paper_emergency_cases WHERE case_number = ?', [params.caseNumber]);
  if (!rows || rows.length === 0) {
    return {
      success: false,
      caseNumber: params.caseNumber,
      approvedCount: 0,
      isThresholdMet: false,
      status: 'NOT_FOUND',
      error: `Emergency case not found: ${params.caseNumber}`,
    };
  }

  const emCase = rows[0];

  if (emCase.org_id !== params.orgId) {
    return {
      success: false,
      caseNumber: params.caseNumber,
      approvedCount: 0,
      isThresholdMet: false,
      status: 'UNAUTHORIZED_ORG',
      error: 'ACCESS DENIED: Organization mismatch.',
    };
  }

  if (emCase.status !== 'OPEN') {
    return {
      success: false,
      caseNumber: params.caseNumber,
      approvedCount: 0,
      isThresholdMet: false,
      status: emCase.status,
      error: `Emergency case is no longer open for approvals (status: ${emCase.status}).`,
    };
  }

  const now = new Date();
  if (new Date(emCase.expires_at).getTime() < now.getTime()) {
    executeRun(db, "UPDATE paper_emergency_cases SET status = 'EXPIRED' WHERE id = ?", [emCase.id]);
    saveDb();
    return {
      success: false,
      caseNumber: params.caseNumber,
      approvedCount: 0,
      isThresholdMet: false,
      status: 'EXPIRED',
      error: 'Emergency case has expired.',
    };
  }

  let approvals: any[] = [];
  try {
    approvals = emCase.approvals_json ? JSON.parse(emCase.approvals_json) : [];
  } catch {
    approvals = [];
  }

  // 1. Prevent duplicate approvals by same custodian user ID
  if (approvals.some((a: any) => a.custodianUserId === params.custodianUserId)) {
    return {
      success: false,
      caseNumber: params.caseNumber,
      approvedCount: approvals.length,
      isThresholdMet: approvals.length >= 2,
      status: 'DUPLICATE_APPROVAL',
      error: 'POLICY VIOLATION: Custodian has already recorded an approval for this emergency case.',
    };
  }

  // 2. Prevent duplicate approvals by same custodian role
  if (approvals.some((a: any) => a.custodianRole === params.custodianRole)) {
    return {
      success: false,
      caseNumber: params.caseNumber,
      approvedCount: approvals.length,
      isThresholdMet: approvals.length >= 2,
      status: 'DUPLICATE_ROLE',
      error: `POLICY VIOLATION: An approval for custodian role ${params.custodianRole} is already registered. Distinct roles required.`,
    };
  }

  const newApproval = {
    custodianUserId: params.custodianUserId,
    custodianUserName: params.custodianUserName,
    custodianRole: params.custodianRole,
    approvedAt: now.toISOString(),
    notes: params.notes || 'Emergency 2-of-3 key authorization granted.',
  };

  approvals.push(newApproval);

  executeRun(
    db,
    'UPDATE paper_emergency_cases SET approvals_json = ? WHERE id = ?',
    [JSON.stringify(approvals), emCase.id]
  );

  saveDb();

  return {
    success: true,
    caseNumber: params.caseNumber,
    approvedCount: approvals.length,
    isThresholdMet: approvals.length >= 2,
    status: approvals.length >= 2 ? 'THRESHOLD_MET' : 'PENDING_SECOND_APPROVAL',
  };
}

export function executeEmergencyDecryption(
  db: Database,
  params: {
    caseNumber: string;
    userId: string;
    userRole: string;
    orgId: string;
    ipAddress?: string;
  }
): {
  success: boolean;
  caseNumber: string;
  paperId: string;
  paperVersion: string;
  decryptedPaper?: any;
  approvingCustodians?: Array<{ role: string; userId: string; approvedAt: string }>;
  error?: string;
} {
  initThresholdKeySchema(db);

  const rows = executeQuery(db, 'SELECT * FROM paper_emergency_cases WHERE case_number = ?', [params.caseNumber]);
  if (!rows || rows.length === 0) {
    return { success: false, caseNumber: params.caseNumber, paperId: '', paperVersion: '', error: 'Emergency case not found.' };
  }

  const emCase = rows[0];

  if (emCase.org_id !== params.orgId) {
    return { success: false, caseNumber: params.caseNumber, paperId: emCase.paper_id, paperVersion: emCase.paper_version, error: 'ACCESS DENIED: Organization mismatch.' };
  }

  const now = new Date();
  if (new Date(emCase.expires_at).getTime() < now.getTime()) {
    executeRun(db, "UPDATE paper_emergency_cases SET status = 'EXPIRED' WHERE id = ?", [emCase.id]);
    saveDb();
    return { success: false, caseNumber: params.caseNumber, paperId: emCase.paper_id, paperVersion: emCase.paper_version, error: 'Emergency authorization window has expired.' };
  }

  let approvals: any[] = [];
  try {
    approvals = emCase.approvals_json ? JSON.parse(emCase.approvals_json) : [];
  } catch {
    approvals = [];
  }

  if (approvals.length < 2) {
    return {
      success: false,
      caseNumber: params.caseNumber,
      paperId: emCase.paper_id,
      paperVersion: emCase.paper_version,
      error: `THRESHOLD NOT MET: 2 distinct custodian authorizations required. Currently have ${approvals.length} approval(s).`,
    };
  }

  // Ensure two distinct roles from ORG_OWNER, EXAM_MANAGER, AUDITOR
  const role1 = approvals[0].custodianRole as CustodianRole;
  const role2 = approvals[1].custodianRole as CustodianRole;

  if (role1 === role2) {
    return {
      success: false,
      caseNumber: params.caseNumber,
      paperId: emCase.paper_id,
      paperVersion: emCase.paper_version,
      error: 'CRITICAL SECURITY ERROR: Approvals must originate from two different custodian roles.',
    };
  }

  // Fetch wrapped shares for role1 and role2
  const shareRows = executeQuery(
    db,
    `SELECT * FROM paper_threshold_key_shares
     WHERE paper_id = ? AND paper_version = ?`,
    [emCase.paper_id, emCase.paper_version]
  );

  const shareRow1 = shareRows.find((s: any) => s.custodian_role === role1);
  const shareRow2 = shareRows.find((s: any) => s.custodian_role === role2);

  if (!shareRow1 || !shareRow2) {
    return {
      success: false,
      caseNumber: params.caseNumber,
      paperId: emCase.paper_id,
      paperVersion: emCase.paper_version,
      error: 'Stored threshold shares not found for the approving custodians.',
    };
  }

  try {
    // Unwrap both shares
    const shareHex1 = unwrapShare(shareRow1.wrapped_share_payload, role1, emCase.org_id);
    const shareHex2 = unwrapShare(shareRow2.wrapped_share_payload, role2, emCase.org_id);

    // Reconstruct DEK in backend memory using Shamir's 2-of-3 reconstruction
    const reconstructedDek = reconstructSecretShamir2of3([
      { index: shareRow1.share_index, shareHex: shareHex1 },
      { index: shareRow2.share_index, shareHex: shareHex2 },
    ]);

    // Fetch encrypted paper
    const paperTable = emCase.exam_type === 'COMPETITIVE' ? 'competitive_generated_papers' : 'university_generated_papers';
    const paperRecordRows = executeQuery(db, `SELECT * FROM ${paperTable} WHERE id = ?`, [emCase.paper_id]);
    if (!paperRecordRows || paperRecordRows.length === 0) {
      throw new Error('Encrypted paper record not found in ledger.');
    }
    const paperRec = paperRecordRows[0];

    const encPayloadJson = emCase.exam_type === 'COMPETITIVE'
      ? paperRec.encrypted_payload_json
      : paperRec.paper_distribution_json;

    if (!encPayloadJson) {
      throw new Error('No encrypted payload found on paper record.');
    }

    const encRecord = JSON.parse(encPayloadJson);
    const iv = Buffer.from(encRecord.iv, 'hex');
    const authTag = Buffer.from(encRecord.authTag, 'hex');

    // Decrypt AES-256-GCM ciphertext in backend
    const decipher = crypto.createDecipheriv('aes-256-gcm', reconstructedDek, iv);
    decipher.setAuthTag(authTag);
    let decryptedText = decipher.update(encRecord.cipherText, 'base64', 'utf8');
    decryptedText += decipher.final('utf8');

    // Check integrity checksum
    const calcChecksum = crypto.createHash('sha256').update(decryptedText).digest('hex');
    if (calcChecksum !== encRecord.checksumSHA256) {
      throw new Error('Integrity check failed: Reconstructed DEK failed SHA-256 checksum verification.');
    }

    const decryptedPaper = JSON.parse(decryptedText);

    // Wipe reconstructed DEK from memory immediately
    reconstructedDek.fill(0);

    // Update emergency case status
    const nowIso = new Date().toISOString();
    executeRun(
      db,
      `UPDATE paper_emergency_cases
       SET status = 'DECRYPTED', decrypted_at = ?, decrypted_by = ?, outcome = 'SUCCESS'
       WHERE id = ?`,
      [nowIso, params.userId, emCase.id]
    );

    saveDb();

    return {
      success: true,
      caseNumber: params.caseNumber,
      paperId: emCase.paper_id,
      paperVersion: emCase.paper_version,
      decryptedPaper,
      approvingCustodians: approvals.map((a: any) => ({
        role: a.custodianRole,
        userId: a.custodianUserId,
        approvedAt: a.approvedAt,
      })),
    };
  } catch (err: any) {
    console.error('Emergency decryption failed:', err);
    return {
      success: false,
      caseNumber: params.caseNumber,
      paperId: emCase.paper_id,
      paperVersion: emCase.paper_version,
      error: `Emergency decryption failed: ${err.message || 'Cryptographic authentication error'}`,
    };
  }
}
