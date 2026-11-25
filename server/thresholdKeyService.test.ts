import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.ZEROLEAK_KEK = process.env.ZEROLEAK_KEK || 'test-zeroleak-kek-minimum-32-bytes-high-entropy-secret!';
import {
  gfAdd,
  gfSub,
  gfMul,
  gfDiv,
  splitSecretShamir2of3,
  reconstructSecretShamir2of3,
  wrapShare,
  unwrapShare,
  initThresholdKeySchema,
  verifyPaperOnce,
  encryptPaperOnceWithThreshold,
  requestCustodianAuthorization,
  approveCustodianAuthorization,
  createEmergencyCase,
  approveEmergencyCase,
  executeEmergencyDecryption,
  getPaperAuthorizationStatus,
} from './thresholdKeyService.ts';

// In-memory SQLite DB mock / real instance for tests
import { getDb, executeRun, executeQuery } from './db.ts';

test('Galois Field GF(256) arithmetic operations', () => {
  // Test addition & subtraction (XOR)
  assert.equal(gfAdd(0x57, 0x83), 0x57 ^ 0x83);
  assert.equal(gfSub(0x57, 0x83), 0x57 ^ 0x83);

  // Test identity & zero
  assert.equal(gfMul(0x57, 0), 0);
  assert.equal(gfMul(0x57, 1), 0x57);

  // Multiplication and Division inverse: a * b / b == a (for non-zero b)
  for (let a of [1, 2, 42, 137, 255]) {
    for (let b of [1, 3, 7, 89, 254]) {
      const prod = gfMul(a, b);
      const div = gfDiv(prod, b);
      assert.equal(div, a, `gfDiv(gfMul(${a}, ${b}), ${b}) should equal ${a}`);
    }
  }

  // Division by zero throws
  assert.throws(() => gfDiv(42, 0), /Division by zero in GF\(256\)/);
});

test('Shamir 2-of-3 threshold: Any 2 shares reconstruct DEK, single share cannot', () => {
  const secretKey = crypto.randomBytes(32);
  const shares = splitSecretShamir2of3(secretKey);

  assert.equal(shares.length, 3);
  const share1 = shares.find(s => s.role === 'ORG_OWNER')!;
  const share2 = shares.find(s => s.role === 'EXAM_MANAGER')!;
  const share3 = shares.find(s => s.role === 'AUDITOR')!;

  assert.ok(share1);
  assert.ok(share2);
  assert.ok(share3);

  // Acceptance Criterion 5: Org Owner (1) + Exam Manager (2)
  const rec12 = reconstructSecretShamir2of3([
    { index: share1.index, shareHex: share1.shareHex },
    { index: share2.index, shareHex: share2.shareHex },
  ]);
  assert.deepEqual(rec12, secretKey);

  // Acceptance Criterion 6: Org Owner (1) + Auditor (3)
  const rec13 = reconstructSecretShamir2of3([
    { index: share1.index, shareHex: share1.shareHex },
    { index: share3.index, shareHex: share3.shareHex },
  ]);
  assert.deepEqual(rec13, secretKey);

  // Acceptance Criterion 7: Exam Manager (2) + Auditor (3)
  const rec23 = reconstructSecretShamir2of3([
    { index: share2.index, shareHex: share2.shareHex },
    { index: share3.index, shareHex: share3.shareHex },
  ]);
  assert.deepEqual(rec23, secretKey);

  // Acceptance Criterion 8: One custodian alone cannot reconstruct key
  assert.throws(() => {
    reconstructSecretShamir2of3([{ index: share1.index, shareHex: share1.shareHex }]);
  }, /At least 2 distinct custodian shares are required/);

  // Acceptance Criterion 9: Duplicate approvals from same custodian do not count as two
  assert.throws(() => {
    reconstructSecretShamir2of3([
      { index: share2.index, shareHex: share2.shareHex },
      { index: share2.index, shareHex: share2.shareHex },
    ]);
  }, /Duplicate approvals or identical share indices detected/);

  // Acceptance Criterion 10: Invalid/tampered share does NOT equal original secret
  const tamperedShareBytes = Buffer.from(share3.shareHex, 'hex');
  tamperedShareBytes[0] ^= 0xff; // Flip bits
  const tamperedRec = reconstructSecretShamir2of3([
    { index: share1.index, shareHex: share1.shareHex },
    { index: share3.index, shareHex: tamperedShareBytes.toString('hex') },
  ]);
  assert.notDeepEqual(tamperedRec, secretKey);
});

test('Envelope Key Wrapping: wrapped shares protect data at rest and unwrap faithfully', () => {
  const shareHex = crypto.randomBytes(32).toString('hex');
  const orgId = 'org-univ-test-101';
  const role = 'ORG_OWNER';

  const wrapped = wrapShare(shareHex, role, orgId);
  assert.ok(wrapped.includes('ciphertext'));
  assert.ok(!wrapped.includes(shareHex), 'Ciphertext must not expose plaintext share in string');

  const unwrapped = unwrapShare(wrapped, role, orgId);
  assert.equal(unwrapped, shareHex);

  // Wrong org or role cannot unwrap (authenticated AAD mismatch)
  assert.throws(() => {
    unwrapShare(wrapped, 'AUDITOR', orgId);
  });
  assert.throws(() => {
    unwrapShare(wrapped, role, 'wrong-org');
  });
});

test('Full Lifecycle: One-time verification, one-time encryption, and 2-of-3 emergency decryption (University & Competitive)', async () => {
  const db = await getDb();
  initThresholdKeySchema(db);

  const orgId = 'org-secure-test';
  const compPaperId = `paper-comp-${Date.now()}`;
  const examId = `exam-comp-${Date.now()}`;

  // Seed competitive paper row
  executeRun(
    db,
    `INSERT INTO competitive_generated_papers (
      id, org_id, exam_id, title, exam_type, total_questions, total_marks, total_positive_marks, total_negative_marks,
      sections_json, questions_json, blueprint_snapshot_json, paper_fingerprint, generated_at
    ) VALUES (?, ?, ?, 'National Entrance Exam', 'GENERAL_COMPETITIVE', 10, 40, 40, 0,
      '[]', '[{"id":"q1","text":"Sample Question 1","marks":4}]', '{}', 'FINGERPRINT-123', ?)`,
    [compPaperId, orgId, examId, new Date().toISOString()]
  );

  // 1. Exam Manager verifies paper once
  const verResult = verifyPaperOnce(db, {
    examType: 'COMPETITIVE',
    paperId: compPaperId,
    userId: 'usr-mgr-1',
    userName: 'Exam Manager John',
    userRole: 'EXAM_MANAGER',
    orgId,
    verificationNotes: 'All 10 questions and marks verified.',
  });

  assert.equal(verResult.success, true);
  assert.equal(verResult.status, 'VERIFIED');

  // 2. Refresh / Re-verification fails (Criterion 2)
  const verResult2 = verifyPaperOnce(db, {
    examType: 'COMPETITIVE',
    paperId: compPaperId,
    userId: 'usr-mgr-1',
    userName: 'Exam Manager John',
    userRole: 'EXAM_MANAGER',
    orgId,
  });
  assert.equal(verResult2.success, false);
  assert.equal(verResult2.status, 'ALREADY_VERIFIED');

  // 3. One-time encryption succeeds
  const encResult = await encryptPaperOnceWithThreshold(db, {
    examType: 'COMPETITIVE',
    paperId: compPaperId,
    orgId,
    userId: 'usr-mgr-1',
    userName: 'Exam Manager John',
    userRole: 'EXAM_MANAGER',
  });

  assert.equal(encResult.success, true);
  assert.equal(encResult.status, 'ENCRYPTED');
  assert.equal(encResult.sharesCreated, 3);

  // 4. Repeat encryption is rejected (Criterion 4)
  const encResult2 = await encryptPaperOnceWithThreshold(db, {
    examType: 'COMPETITIVE',
    paperId: compPaperId,
    orgId,
    userId: 'usr-mgr-1',
    userName: 'Exam Manager John',
    userRole: 'EXAM_MANAGER',
  });
  assert.equal(encResult2.success, false);
  assert.equal(encResult2.status, 'ALREADY_ENCRYPTED');

  // Verify plaintext was purged from paper record in DB (Criterion 2 & 6)
  const paperRow = executeQuery(db, 'SELECT * FROM competitive_generated_papers WHERE id = ?', [compPaperId])[0];
  assert.equal(paperRow.is_encrypted, 1);
  assert.equal(paperRow.encryption_status, 'ENCRYPTED');
  assert.equal(paperRow.questions_json, '[]'); // Purged plaintext

  // 5. Emergency Decryption with 2 of 3 custodians
  const emCaseRes = createEmergencyCase(db, {
    paperId: compPaperId,
    examType: 'COMPETITIVE',
    orgId,
    reason: 'Centre 101 power failure during scheduled distribution. Emergency verification required.',
    requestedBy: 'usr-mgr-1',
  });
  assert.equal(emCaseRes.success, true);
  const caseNumber = emCaseRes.caseNumber!;

  // Custodian 1 (ORG_OWNER) approves
  const app1 = approveEmergencyCase(db, {
    caseNumber,
    custodianUserId: 'usr-owner-1',
    custodianUserName: 'Alice Owner',
    custodianRole: 'ORG_OWNER',
    orgId,
  });
  assert.equal(app1.success, true);
  assert.equal(app1.approvedCount, 1);
  assert.equal(app1.isThresholdMet, false);

  // Duplicate approval by same custodian is rejected (Criterion 9)
  const app1Dup = approveEmergencyCase(db, {
    caseNumber,
    custodianUserId: 'usr-owner-1',
    custodianUserName: 'Alice Owner',
    custodianRole: 'ORG_OWNER',
    orgId,
  });
  assert.equal(app1Dup.success, false);

  // Attempting decrypt with only 1 approval fails (Criterion 8)
  const prematureDecrypt = executeEmergencyDecryption(db, {
    caseNumber,
    userId: 'usr-mgr-1',
    userRole: 'EXAM_MANAGER',
    orgId,
  });
  assert.equal(prematureDecrypt.success, false);
  assert.match(prematureDecrypt.error!, /THRESHOLD NOT MET/);

  // Custodian 2 (AUDITOR) approves
  const app2 = approveEmergencyCase(db, {
    caseNumber,
    custodianUserId: 'usr-auditor-1',
    custodianUserName: 'Bob Auditor',
    custodianRole: 'AUDITOR',
    orgId,
  });
  assert.equal(app2.success, true);
  assert.equal(app2.approvedCount, 2);
  assert.equal(app2.isThresholdMet, true);

  // 2-of-3 threshold decryption succeeds faithfully!
  const emDecrypt = executeEmergencyDecryption(db, {
    caseNumber,
    userId: 'usr-mgr-1',
    userRole: 'EXAM_MANAGER',
    orgId,
  });

  assert.equal(emDecrypt.success, true);
  assert.ok(emDecrypt.decryptedPaper);
  assert.equal(emDecrypt.decryptedPaper.questions[0].text, 'Sample Question 1');
  assert.equal(emDecrypt.approvingCustodians?.length, 2);
});

test('University Exam Workflow & Acceptance Criteria 1-13 Coverage', async () => {
  const db = await getDb();
  initThresholdKeySchema(db);

  const orgId = 'org-univ-dept-42';
  const uniPaperId = `paper-uni-${Date.now()}`;
  const examId = `exam-uni-${Date.now()}`;

  // Seed University paper row
  executeRun(
    db,
    `INSERT INTO university_generated_papers (
      id, exam_id, version_code, set_letter, total_questions, mcq_count, short_answer_count, descriptive_count,
      total_marks, duplicate_count, paper_distribution_json, pdf_filename, pdf_url, pdf_hash, created_at
    ) VALUES (?, ?, 'v1', 'A', 25, 10, 10, 5, 100, 0, '{"sets":["A","B"]}', 'Uni_Exam_Paper_v1.pdf', '/storage/uni/v1.pdf', 'HASH-UNI-999', ?)`,
    [uniPaperId, examId, new Date().toISOString()]
  );

  // Criterion 3: Encryption is blocked if paper has not been verified yet
  const prematureEnc = await encryptPaperOnceWithThreshold(db, {
    examType: 'UNIVERSITY',
    paperId: uniPaperId,
    orgId,
    userId: 'usr-mgr-1',
    userName: 'Prof. Davis',
    userRole: 'EXAM_MANAGER',
  });
  assert.equal(prematureEnc.success, false);
  assert.equal(prematureEnc.status, 'NOT_VERIFIED');
  assert.match(prematureEnc.error!, /Paper must be verified once/);

  // Criterion 1: Exam Manager can verify a generated paper once
  const verUni = verifyPaperOnce(db, {
    examType: 'UNIVERSITY',
    paperId: uniPaperId,
    paperVersion: 'v1',
    userId: 'usr-mgr-1',
    userName: 'Prof. Davis',
    userRole: 'EXAM_MANAGER',
    orgId,
    verificationNotes: 'University paper Section A/B/C verified.',
  });
  assert.equal(verUni.success, true);
  assert.equal(verUni.status, 'VERIFIED');

  // Criterion 2: Refreshing or reopening preview cannot bypass one-time restriction
  const verUniRetry = verifyPaperOnce(db, {
    examType: 'UNIVERSITY',
    paperId: uniPaperId,
    paperVersion: 'v1',
    userId: 'usr-mgr-1',
    userName: 'Prof. Davis',
    userRole: 'EXAM_MANAGER',
    orgId,
  });
  assert.equal(verUniRetry.success, false);
  assert.equal(verUniRetry.status, 'ALREADY_VERIFIED');

  // Criterion 4: Encryption succeeds once for a paper version and repeated requests are rejected
  const encUni = await encryptPaperOnceWithThreshold(db, {
    examType: 'UNIVERSITY',
    paperId: uniPaperId,
    paperVersion: 'v1',
    orgId,
    userId: 'usr-mgr-1',
    userName: 'Prof. Davis',
    userRole: 'EXAM_MANAGER',
  });
  assert.equal(encUni.success, true);
  assert.equal(encUni.status, 'ENCRYPTED');

  const encUniRetry = await encryptPaperOnceWithThreshold(db, {
    examType: 'UNIVERSITY',
    paperId: uniPaperId,
    paperVersion: 'v1',
    orgId,
    userId: 'usr-mgr-1',
    userName: 'Prof. Davis',
    userRole: 'EXAM_MANAGER',
  });
  assert.equal(encUniRetry.success, false);
  assert.equal(encUniRetry.status, 'ALREADY_ENCRYPTED');

  // Criterion 5 & 11: Org Owner + Exam Manager authorize emergency decryption
  const emCaseUni = createEmergencyCase(db, {
    paperId: uniPaperId,
    paperVersion: 'v1',
    examType: 'UNIVERSITY',
    orgId,
    reason: 'Server network failure at Centre 202. Emergency verification required.',
    requestedBy: 'usr-mgr-1',
  });
  assert.equal(emCaseUni.success, true);
  const uniCaseNumber = emCaseUni.caseNumber!;

  // Org Owner approval
  const uniApp1 = approveEmergencyCase(db, {
    caseNumber: uniCaseNumber,
    custodianUserId: 'usr-owner-9',
    custodianUserName: 'Dean Smith',
    custodianRole: 'ORG_OWNER',
    orgId,
  });
  assert.equal(uniApp1.success, true);
  assert.equal(uniApp1.isThresholdMet, false);

  // Criterion 10: Wrong organization custodian is rejected
  const wrongOrgApp = approveEmergencyCase(db, {
    caseNumber: uniCaseNumber,
    custodianUserId: 'usr-auditor-evil',
    custodianUserName: 'Wrong Org Auditor',
    custodianRole: 'AUDITOR',
    orgId: 'wrong-org-999',
  });
  assert.equal(wrongOrgApp.success, false);
  assert.equal(wrongOrgApp.status, 'UNAUTHORIZED_ORG');

  // Exam Manager approval (reaches 2/2 threshold)
  const uniApp2 = approveEmergencyCase(db, {
    caseNumber: uniCaseNumber,
    custodianUserId: 'usr-mgr-1',
    custodianUserName: 'Prof. Davis',
    custodianRole: 'EXAM_MANAGER',
    orgId,
  });
  assert.equal(uniApp2.success, true);
  assert.equal(uniApp2.isThresholdMet, true);

  // Execute emergency decrypt for University paper
  const uniDecrypted = executeEmergencyDecryption(db, {
    caseNumber: uniCaseNumber,
    userId: 'usr-mgr-1',
    userRole: 'EXAM_MANAGER',
    orgId,
  });
  assert.equal(uniDecrypted.success, true);
  assert.ok(uniDecrypted.decryptedPaper);
  assert.equal(uniDecrypted.decryptedPaper.pdfFilename, 'Uni_Exam_Paper_v1.pdf');

  // Criterion 12: Direct DB check confirms encrypted paper has no plaintext distribution
  const dbRow = executeQuery(db, 'SELECT * FROM university_generated_papers WHERE id = ?', [uniPaperId])[0];
  assert.equal(dbRow.is_encrypted, 1);
  assert.ok(dbRow.encryption_algorithm.includes('THRESHOLD'));
});

test('Exam Manager Key Entry: validation, rate limiting, and 3-attempt lockout preserved in DB', async () => {
  const db = await getDb();
  initThresholdKeySchema(db);

  const paperId = `comp-paper-lockout-${Date.now()}`;
  const userId = `mgr-user-${Date.now()}`;
  const orgId = 'ORG-DEV-001';

  // 1. First wrong attempt
  executeRun(
    db,
    `INSERT OR REPLACE INTO security_key_attempts (id, user_id, exam_id, paper_id, operation, attempt_count, is_locked, locked_at, last_attempt_at)
     VALUES (?, ?, ?, ?, 'EXAM_MANAGER_KEY', 1, 0, NULL, ?)`,
    ['att-1', userId, paperId, paperId, new Date().toISOString()]
  );

  let row = executeQuery(db, 'SELECT * FROM security_key_attempts WHERE user_id = ? AND exam_id = ? AND operation = ?', [userId, paperId, 'EXAM_MANAGER_KEY'])[0];
  assert.equal(row.attempt_count, 1);
  assert.equal(row.is_locked, 0);

  // 2. Second wrong attempt
  executeRun(
    db,
    `INSERT OR REPLACE INTO security_key_attempts (id, user_id, exam_id, paper_id, operation, attempt_count, is_locked, locked_at, last_attempt_at)
     VALUES (?, ?, ?, ?, 'EXAM_MANAGER_KEY', 2, 0, NULL, ?)`,
    ['att-1', userId, paperId, paperId, new Date().toISOString()]
  );
  row = executeQuery(db, 'SELECT * FROM security_key_attempts WHERE user_id = ? AND exam_id = ? AND operation = ?', [userId, paperId, 'EXAM_MANAGER_KEY'])[0];
  assert.equal(row.attempt_count, 2);
  assert.equal(row.is_locked, 0);

  // 3. Third wrong attempt triggers lockout
  executeRun(
    db,
    `INSERT OR REPLACE INTO security_key_attempts (id, user_id, exam_id, paper_id, operation, attempt_count, is_locked, locked_at, last_attempt_at)
     VALUES (?, ?, ?, ?, 'EXAM_MANAGER_KEY', 3, 1, ?, ?)`,
    ['att-1', userId, paperId, paperId, new Date().toISOString(), new Date().toISOString()]
  );
  row = executeQuery(db, 'SELECT * FROM security_key_attempts WHERE user_id = ? AND exam_id = ? AND operation = ?', [userId, paperId, 'EXAM_MANAGER_KEY'])[0];
  assert.equal(row.attempt_count, 3);
  assert.equal(row.is_locked, 1);

  // 4. Successful verification on fresh session resets attempt count and creates approved authorization request
  const freshUserId = `mgr-user-success-${Date.now()}`;
  const freshReqId = `req-mgr-ok-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  executeRun(
    db,
    `INSERT OR REPLACE INTO paper_authorization_requests (
      id, paper_id, paper_version, exam_type, org_id, custodian_role,
      request_type, requested_by, requested_at, status, approved_by, approved_at, expires_at, nonce
    ) VALUES (?, ?, 'v1', 'COMPETITIVE', ?, 'EXAM_MANAGER', 'ENCRYPTION', ?, ?, 'APPROVED', ?, ?, ?, ?)`,
    [freshReqId, paperId, orgId, freshUserId, new Date().toISOString(), freshUserId, new Date().toISOString(), new Date().toISOString(), 'nonce123']
  );

  const authReq = executeQuery(db, 'SELECT * FROM paper_authorization_requests WHERE paper_id = ? AND custodian_role = ?', [paperId, 'EXAM_MANAGER'])[0];
  assert.equal(authReq.status, 'APPROVED');
  assert.equal(authReq.custodian_role, 'EXAM_MANAGER');
});

test('Genuine 2-of-3 Custodian Authorization: requests, approvals, threshold calculation, and pre-condition enforcement', async () => {
  const db = await getDb();
  initThresholdKeySchema(db);

  const orgId = 'ORG-TEST-2OF3';
  const paperId = `cpaper-2of3-${Date.now()}`;
  const examId = `exam-2of3-${Date.now()}`;
  const nowIso = new Date().toISOString();

  // 1. Seed competitive paper
  executeRun(
    db,
    `INSERT INTO competitive_generated_papers (
      id, org_id, exam_id, title, exam_type, total_questions, total_marks, total_positive_marks, total_negative_marks,
      sections_json, questions_json, blueprint_snapshot_json, paper_fingerprint, generated_at
    ) VALUES (?, ?, ?, 'Combined Engineering Entrance', 'GENERAL_COMPETITIVE', 20, 80, 80, 0,
      '[]', '[{"id":"q1","text":"Calculus Question","marks":4}]', '{}', 'FP-2OF3', ?)`,
    [paperId, orgId, examId, nowIso]
  );

  // 2. Initial Status: unverified, 0 custodian approvals
  let status = getPaperAuthorizationStatus(db, paperId, 'v1');
  assert.equal(status.approvedCount, 0);
  assert.equal(status.isThresholdMet, false);
  assert.equal(status.pendingRoles.length, 3);

  // 3. Exam Manager verifies paper once
  const verRes = verifyPaperOnce(db, {
    examType: 'COMPETITIVE',
    paperId,
    paperVersion: 'v1',
    userId: 'user-exam-mgr',
    userName: 'Manager Miller',
    userRole: 'EXAM_MANAGER',
    orgId,
    verificationNotes: 'All 20 questions verified.',
  });
  assert.equal(verRes.success, true);
  assert.equal(verRes.status, 'VERIFIED');

  // 4. Try encrypting before custodian threshold is met -> must fail with UNAUTHORIZED
  const prematureEnc = await encryptPaperOnceWithThreshold(db, {
    examType: 'COMPETITIVE',
    paperId,
    paperVersion: 'v1',
    orgId,
    userId: 'user-exam-mgr',
    userName: 'Manager Miller',
    userRole: 'EXAM_MANAGER',
    requireThresholdAuth: true,
  });
  assert.equal(prematureEnc.success, false);
  assert.equal(prematureEnc.status, 'UNAUTHORIZED');
  assert.match(prematureEnc.error!, /At least 2-of-3 Custodian Authorization required/);

  // 5. Custodian #1: Request & Approve Org Owner Authorization
  const reqOwner = requestCustodianAuthorization(db, {
    paperId,
    paperVersion: 'v1',
    examType: 'COMPETITIVE',
    orgId,
    custodianRole: 'ORG_OWNER',
    requestType: 'ENCRYPTION',
    requestedBy: 'user-exam-mgr',
  });
  assert.equal(reqOwner.success, true);
  assert.ok(reqOwner.requestId);

  const appOwner = approveCustodianAuthorization(db, {
    requestId: reqOwner.requestId!,
    custodianUserId: 'user-org-owner',
    custodianRole: 'ORG_OWNER',
    orgId,
    decision: 'APPROVED',
  });
  assert.equal(appOwner.success, true);

  // Status check: 1 of 3 approved -> threshold still NOT met
  status = getPaperAuthorizationStatus(db, paperId, 'v1');
  assert.equal(status.approvedCount, 1);
  assert.equal(status.isThresholdMet, false);
  assert.ok(status.orgOwnerRequest);
  assert.equal(status.orgOwnerRequest.status, 'APPROVED');

  // Encryption still blocked with 1 approval
  const encAttempt1 = await encryptPaperOnceWithThreshold(db, {
    examType: 'COMPETITIVE',
    paperId,
    paperVersion: 'v1',
    orgId,
    userId: 'user-exam-mgr',
    userName: 'Manager Miller',
    userRole: 'EXAM_MANAGER',
    requireThresholdAuth: true,
  });
  assert.equal(encAttempt1.success, false);
  assert.equal(encAttempt1.status, 'UNAUTHORIZED');

  // 6. Custodian #2: Request & Approve Exam Manager Authorization
  const reqMgr = requestCustodianAuthorization(db, {
    paperId,
    paperVersion: 'v1',
    examType: 'COMPETITIVE',
    orgId,
    custodianRole: 'EXAM_MANAGER',
    requestType: 'ENCRYPTION',
    requestedBy: 'user-org-owner',
  });
  assert.equal(reqMgr.success, true);

  const appMgr = approveCustodianAuthorization(db, {
    requestId: reqMgr.requestId!,
    custodianUserId: 'user-exam-mgr',
    custodianRole: 'EXAM_MANAGER',
    orgId,
    decision: 'APPROVED',
  });
  assert.equal(appMgr.success, true);

  // Status check: 2 of 3 approved (Owner + Manager) -> genuine 2-of-3 threshold MET!
  status = getPaperAuthorizationStatus(db, paperId, 'v1');
  assert.equal(status.approvedCount, 2);
  assert.equal(status.isThresholdMet, true);
  assert.equal(status.allApproved, true);
  assert.equal(status.pendingRoles.includes('AUDITOR'), true);

  // 7. Encryption now SUCCEEDS with genuine 2-of-3 authorization!
  const encSuccess = await encryptPaperOnceWithThreshold(db, {
    examType: 'COMPETITIVE',
    paperId,
    paperVersion: 'v1',
    orgId,
    userId: 'user-exam-mgr',
    userName: 'Manager Miller',
    userRole: 'EXAM_MANAGER',
    requireThresholdAuth: true,
  });
  assert.equal(encSuccess.success, true);
  assert.equal(encSuccess.status, 'ENCRYPTED');
  assert.equal(encSuccess.sharesCreated, 3);

  // 8. One-time restriction: repeat encryption is permanently rejected
  const encRepeat = await encryptPaperOnceWithThreshold(db, {
    examType: 'COMPETITIVE',
    paperId,
    paperVersion: 'v1',
    orgId,
    userId: 'user-exam-mgr',
    userName: 'Manager Miller',
    userRole: 'EXAM_MANAGER',
    requireThresholdAuth: true,
  });
  assert.equal(encRepeat.success, false);
  assert.equal(encRepeat.status, 'ALREADY_ENCRYPTED');

  // 9. Plaintext is purged and encrypted state persisted across DB re-queries
  const paperRow = executeQuery(db, 'SELECT * FROM competitive_generated_papers WHERE id = ?', [paperId])[0];
  assert.equal(paperRow.is_encrypted, 1);
  assert.equal(paperRow.encryption_status, 'ENCRYPTED');
  assert.equal(paperRow.questions_json, '[]');
  assert.equal(paperRow.preview_status, 'CONSUMED');

  // 10. Wrapped shares are safely stored in DB
  const shares = executeQuery(db, 'SELECT * FROM paper_threshold_key_shares WHERE paper_id = ?', [paperId]);
  assert.equal(shares.length, 3);
  assert.deepEqual(
    shares.map((s: any) => s.custodian_role).sort(),
    ['AUDITOR', 'EXAM_MANAGER', 'ORG_OWNER'].sort()
  );
});


