import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getDb } from './db.ts';
import {
  initDecryptionAttemptSchema,
  getDecryptionAttemptState,
  recordFailedDecryptionAttempt,
  recordSuccessfulDecryption,
  adminResetDecryptionLock,
  MAX_DECRYPTION_ATTEMPTS,
} from './decryptionAttemptService.ts';
import {
  initPrintAnywhereWorkflowSchema,
  getRegisteredPrinters,
  createPrintAnywhereRequest,
  getPrintAnywhereRequests,
  evaluatePrintTimeLock,
  executePrintJobRelease,
  investigateLeakedWatermark,
} from './printAnywhereService.ts';
import {
  initProctoredPrintSchema,
  getOrCreateProctoredSession,
  recordProctorIncident,
  acknowledgeWarning,
  adminResetProctorLock,
  MAX_PROCTOR_WARNINGS,
} from './proctoredPrintService.ts';

describe('ZeroLeak Secure Decryption, Print Anywhere & Proctored Printing Tests', () => {
  // =========================================================================
  // 1. MAXIMUM 3 DECRYPTION-KEY ATTEMPTS & ADMINISTRATIVE RECOVERY
  // =========================================================================
  describe('1. Decryption Key Attempts & Strict 3-Attempt Lockout', () => {
    it('1.1. Tracks remaining attempts: 2, 1, then 0 on consecutive failed key attempts', async () => {
      const db = await getDb();
      initDecryptionAttemptSchema(db);

      const paperId = `test-paper-${Date.now()}`;
      const userId = 'usr-operator-test';
      const sessionId = `sess-${Date.now()}`;

      // Initial state: 3 attempts remaining
      const initial = getDecryptionAttemptState(db, {
        paperId,
        paperVersion: 'v1',
        examType: 'UNIVERSITY',
        userId,
        sessionId,
      });
      assert.strictEqual(initial.failedAttempts, 0);
      assert.strictEqual(initial.remainingAttempts, 3);
      assert.strictEqual(initial.isLocked, false);

      // Attempt 1: 1 failed, 2 remaining
      const att1 = recordFailedDecryptionAttempt(db, {
        paperId,
        paperVersion: 'v1',
        examType: 'UNIVERSITY',
        userId,
        sessionId,
        reason: 'Bad key guess 1',
      });
      assert.strictEqual(att1.failedAttempts, 1);
      assert.strictEqual(att1.remainingAttempts, 2);
      assert.strictEqual(att1.isLocked, false);

      // Attempt 2: 2 failed, 1 remaining
      const att2 = recordFailedDecryptionAttempt(db, {
        paperId,
        paperVersion: 'v1',
        examType: 'UNIVERSITY',
        userId,
        sessionId,
        reason: 'Bad key guess 2',
      });
      assert.strictEqual(att2.failedAttempts, 2);
      assert.strictEqual(att2.remainingAttempts, 1);
      assert.strictEqual(att2.isLocked, false);

      // Attempt 3: 3 failed, 0 remaining -> IMMEDIATE LOCKOUT
      const att3 = recordFailedDecryptionAttempt(db, {
        paperId,
        paperVersion: 'v1',
        examType: 'UNIVERSITY',
        userId,
        sessionId,
        reason: 'Bad key guess 3',
      });
      assert.strictEqual(att3.failedAttempts, 3);
      assert.strictEqual(att3.remainingAttempts, 0);
      assert.strictEqual(att3.isLocked, true);
      assert.ok(att3.lockedAt);

      // Subsequent query confirms persistent locked state across reloads
      const reloaded = getDecryptionAttemptState(db, {
        paperId,
        paperVersion: 'v1',
        examType: 'UNIVERSITY',
        userId,
        sessionId,
      });
      assert.strictEqual(reloaded.isLocked, true);
      assert.strictEqual(reloaded.remainingAttempts, 0);
    });

    it('1.2. Rejects unauthorized reset and succeeds only with authorized administrator role & justification', async () => {
      const db = await getDb();
      const paperId = `test-paper-lock-${Date.now()}`;
      const userId = 'usr-operator-locked';
      const sessionId = `sess-lock-${Date.now()}`;

      // Force 3 failed attempts
      for (let i = 0; i < 3; i++) {
        recordFailedDecryptionAttempt(db, {
          paperId,
          paperVersion: 'v1',
          examType: 'COMPETITIVE',
          userId,
          sessionId,
        });
      }

      // Unauthorized user tries to reset -> REJECTED
      const unauthReset = adminResetDecryptionLock(db, {
        paperId,
        paperVersion: 'v1',
        examType: 'COMPETITIVE',
        adminUserId: 'usr-student',
        adminRole: 'STUDENT',
        reason: 'Reset my lock please',
      });
      assert.strictEqual(unauthReset.success, false);
      assert.ok(unauthReset.error?.includes('ACCESS DENIED'));

      // Missing reason -> REJECTED
      const emptyReasonReset = adminResetDecryptionLock(db, {
        paperId,
        paperVersion: 'v1',
        examType: 'COMPETITIVE',
        adminUserId: 'usr-owner',
        adminRole: 'ORG_OWNER',
        reason: 'short',
      });
      assert.strictEqual(emptyReasonReset.success, false);
      assert.ok(emptyReasonReset.error?.includes('justification'));

      // Authorized Organization Owner with valid reason -> SUCCESS
      const validReset = adminResetDecryptionLock(db, {
        paperId,
        paperVersion: 'v1',
        examType: 'COMPETITIVE',
        adminUserId: 'usr-owner-01',
        adminRole: 'ORG_OWNER',
        reason: 'Official security review completed and verified authorized superintendent presence.',
      });
      assert.strictEqual(validReset.success, true);
      assert.ok(validReset.unlockedAt);

      // Verifying state is now reset and unlocked
      const stateAfterReset = getDecryptionAttemptState(db, {
        paperId,
        paperVersion: 'v1',
        examType: 'COMPETITIVE',
        userId,
        sessionId,
      });
      assert.strictEqual(stateAfterReset.isLocked, false);
      assert.strictEqual(stateAfterReset.remainingAttempts, 3);
    });

    it('1.3. Successful authenticated decryption clears failed attempts counter', async () => {
      const db = await getDb();
      const paperId = `test-paper-success-${Date.now()}`;
      const userId = 'usr-operator-ok';
      const sessionId = `sess-ok-${Date.now()}`;

      // 1 failed attempt
      recordFailedDecryptionAttempt(db, {
        paperId,
        paperVersion: 'v1',
        examType: 'UNIVERSITY',
        userId,
        sessionId,
      });

      // Valid decryption occurs
      recordSuccessfulDecryption(db, {
        paperId,
        paperVersion: 'v1',
        examType: 'UNIVERSITY',
        userId,
        sessionId,
      });

      const finalState = getDecryptionAttemptState(db, {
        paperId,
        paperVersion: 'v1',
        examType: 'UNIVERSITY',
        userId,
        sessionId,
      });
      assert.strictEqual(finalState.failedAttempts, 0);
      assert.strictEqual(finalState.remainingAttempts, 3);
      assert.strictEqual(finalState.isLocked, false);
    });
  });

  // =========================================================================
  // 2. PRINT ANYWHERE WORKFLOW & PRINTER REGISTRY
  // =========================================================================
  describe('2. Print Anywhere: Examination Manager -> Centre Operator & Registry', () => {
    it('2.1. Validates printer registry and rejects non-existent or offline printers', async () => {
      const db = await getDb();
      initPrintAnywhereWorkflowSchema(db);

      const registeredPrinters = getRegisteredPrinters(db, { centreNumber: 'CTR-101' });
      assert.ok(registeredPrinters.length >= 2);

      // Attempt request with offline printer PRN-CTR101-99 -> REJECTED
      const offlineReq = createPrintAnywhereRequest(db, {
        examId: 'exam-test-1',
        examName: 'Advanced Algorithms',
        examType: 'UNIVERSITY',
        paperId: 'paper-algo-01',
        paperVersion: 'v1',
        centreNumber: 'CTR-101',
        printerId: 'PRN-CTR101-99',
        requestedCopies: 30,
        scheduledUnlockTime: '10:00 AM',
        scheduledDate: '2026-10-15',
        requestedBy: 'mgr-01',
        requestedByName: 'Exam Manager',
      });
      assert.strictEqual(offlineReq.success, false);
      assert.ok(offlineReq.error?.includes('OFFLINE') || offlineReq.error?.includes('UNAVAILABLE'));

      // Attempt request exceeding hardware copy limit -> REJECTED
      const overflowReq = createPrintAnywhereRequest(db, {
        examId: 'exam-test-1',
        examName: 'Advanced Algorithms',
        examType: 'UNIVERSITY',
        paperId: 'paper-algo-01',
        paperVersion: 'v1',
        centreNumber: 'CTR-101',
        printerId: 'PRN-CTR101-01',
        requestedCopies: 9999, // Exceeds 500 limit
        scheduledUnlockTime: '10:00 AM',
        scheduledDate: '2026-10-15',
        requestedBy: 'mgr-01',
        requestedByName: 'Exam Manager',
      });
      assert.strictEqual(overflowReq.success, false);
      assert.ok(overflowReq.error?.includes('COPY LIMIT EXCEEDED'));
    });

    it('2.2. Creates Print Anywhere request and enforces idempotency key', async () => {
      const db = await getDb();
      const idempotencyKey = `idemp-${Date.now()}`;

      const req1 = createPrintAnywhereRequest(db, {
        examId: 'exam-os-401',
        examName: 'Operating Systems End-Sem',
        examType: 'UNIVERSITY',
        paperId: 'paper-os-v1',
        paperVersion: 'v1',
        centreNumber: 'CTR-101',
        printerId: 'PRN-CTR101-01',
        requestedCopies: 40,
        scheduledUnlockTime: '09:30 AM',
        scheduledDate: '2026-10-15',
        requestedBy: 'mgr-01',
        requestedByName: 'Exam Manager',
        idempotencyKey,
      });

      assert.strictEqual(req1.success, true);
      assert.ok(req1.request?.requestNumber.startsWith('REQ-PRN-'));
      assert.strictEqual(req1.request?.status, 'SCHEDULED');
      assert.strictEqual(req1.request?.approvedCopies, 40);

      // Repeat identical request with same idempotency key -> Returns original record without duplicates
      const req2 = createPrintAnywhereRequest(db, {
        examId: 'exam-os-401',
        examName: 'Operating Systems End-Sem',
        examType: 'UNIVERSITY',
        paperId: 'paper-os-v1',
        paperVersion: 'v1',
        centreNumber: 'CTR-101',
        printerId: 'PRN-CTR101-01',
        requestedCopies: 40,
        scheduledUnlockTime: '09:30 AM',
        scheduledDate: '2026-10-15',
        requestedBy: 'mgr-01',
        requestedByName: 'Exam Manager',
        idempotencyKey,
      });

      assert.strictEqual(req2.success, true);
      assert.strictEqual(req2.request?.id, req1.request?.id);
      assert.strictEqual(req2.request?.requestNumber, req1.request?.requestNumber);
    });

    it('2.3. Strictly enforces server-side time-lock before releasing print job', async () => {
      const db = await getDb();

      // Create request scheduled 2 hours into future
      const futureDate = new Date(Date.now() + 2 * 3600 * 1000).toISOString().split('T')[0];
      const futureReq = createPrintAnywhereRequest(db, {
        examId: 'exam-future',
        examName: 'Future Timed Exam',
        examType: 'COMPETITIVE',
        paperId: 'paper-future-v1',
        paperVersion: 'v1',
        centreNumber: 'CTR-101',
        printerId: 'PRN-CTR101-01',
        requestedCopies: 10,
        scheduledUnlockTime: '11:59 PM',
        scheduledDate: futureDate,
        requestedBy: 'mgr-01',
        requestedByName: 'Exam Manager',
      });

      assert.strictEqual(futureReq.success, true);

      // Operator triggers print before unlock time -> BLOCKED
      const earlyRelease = executePrintJobRelease(db, {
        requestId: futureReq.request!.id,
        operatorId: 'usr-op-01',
        operatorName: 'Centre Superintendent',
        centreNumber: 'CTR-101',
      });

      assert.strictEqual(earlyRelease.success, false);
      assert.ok(earlyRelease.error?.includes('TIME-LOCK ENFORCED'));

      // Create request with past unlock time
      const pastDate = new Date(Date.now() - 3600 * 1000).toISOString().split('T')[0];
      const pastReq = createPrintAnywhereRequest(db, {
        examId: 'exam-past',
        examName: 'Ready Timed Exam',
        examType: 'COMPETITIVE',
        paperId: 'paper-past-v1',
        paperVersion: 'v1',
        centreNumber: 'CTR-101',
        printerId: 'PRN-CTR101-01',
        requestedCopies: 5,
        scheduledUnlockTime: '06:00 AM',
        scheduledDate: pastDate,
        requestedBy: 'mgr-01',
        requestedByName: 'Exam Manager',
      });

      assert.strictEqual(pastReq.success, true);

      // Operator triggers print at/after unlock time -> SUCCESS with traceable watermarks
      const authorizedRelease = executePrintJobRelease(db, {
        requestId: pastReq.request!.id,
        operatorId: 'usr-op-01',
        operatorName: 'Manoj Kumar (Centre Superintendent)',
        centreNumber: 'CTR-101',
      });

      assert.strictEqual(authorizedRelease.success, true);
      assert.strictEqual(authorizedRelease.request?.status, 'COMPLETED');
      assert.strictEqual(authorizedRelease.watermarks?.length, 5);

      // Each sheet copy has a unique traceable identifier
      const copy1 = authorizedRelease.watermarks![0];
      assert.ok(copy1.copyIdentifier.startsWith('CPY-CTR-101-'));
      assert.ok(copy1.watermarkText.includes('CONFIDENTIAL — CONTROLLED EXAMINATION COPY'));

      // Attempt repeat printing without reprint authorization -> BLOCKED
      const repeatRelease = executePrintJobRelease(db, {
        requestId: pastReq.request!.id,
        operatorId: 'usr-op-01',
        operatorName: 'Manoj Kumar',
        centreNumber: 'CTR-101',
      });
      assert.strictEqual(repeatRelease.success, false);
      assert.ok(repeatRelease.error?.includes('SECURITY LOCK') || repeatRelease.error?.includes('already been printed'));
    });
  });

  // =========================================================================
  // 3. PROCTORED PRINTING LIVE MONITORING & 3-WARNING LOCKOUT
  // =========================================================================
  describe('3. Proctored Printing Live Surveillance & 3-Warning Workstation Lockout', () => {
    it('3.1. Deduplicates video frame incidents within temporal window', async () => {
      const db = await getDb();
      initProctoredPrintSchema(db);

      const sessionId = `ws-proctor-${Date.now()}`;
      const operatorId = 'usr-op-surv';

      // First incident: Mobile phone detected -> Warning 1 logged
      const inc1 = recordProctorIncident(db, {
        sessionId,
        operatorId,
        operatorName: 'Operator Desk 1',
        centreNumber: 'CTR-101',
        incidentType: 'MOBILE_PHONE_DETECTED',
      });

      assert.strictEqual(inc1.incidentLogged, true);
      assert.strictEqual(inc1.isDuplicate, false);
      assert.strictEqual(inc1.warningCount, 1);
      assert.strictEqual(inc1.remainingWarnings, 2);

      // Immediate subsequent frame with same incident type -> Deduplicated / Ignored
      const incDedup = recordProctorIncident(db, {
        sessionId,
        operatorId,
        operatorName: 'Operator Desk 1',
        centreNumber: 'CTR-101',
        incidentType: 'MOBILE_PHONE_DETECTED',
      });

      assert.strictEqual(incDedup.incidentLogged, false);
      assert.strictEqual(incDedup.isDuplicate, true);
      assert.strictEqual(incDedup.warningCount, 1); // Not incremented
    });

    it('3.2. Enforces Warning 2 acknowledgement and 3-Warning permanent lockout', async () => {
      const db = await getDb();
      const sessionId = `ws-lockout-${Date.now()}`;
      const operatorId = 'usr-op-lockout';

      // Warning 1
      const w1 = recordProctorIncident(db, {
        sessionId,
        operatorId,
        operatorName: 'Operator Desk 2',
        centreNumber: 'CTR-101',
        incidentType: 'MOBILE_PHONE_DETECTED',
      });
      assert.strictEqual(w1.warningCount, 1);
      assert.strictEqual(w1.actionRequired, 'WARNING');

      // Warning 2: Different incident type (Multiple persons) -> Strong Warning with Ack Required
      const w2 = recordProctorIncident(db, {
        sessionId,
        operatorId,
        operatorName: 'Operator Desk 2',
        centreNumber: 'CTR-101',
        incidentType: 'MULTIPLE_PERSONS_DETECTED',
      });
      assert.strictEqual(w2.warningCount, 2);
      assert.strictEqual(w2.actionRequired, 'STRONG_WARNING_ACK_REQUIRED');

      // Operator acknowledges warning 2
      const ackRes = acknowledgeWarning(db, { sessionId, operatorId });
      assert.strictEqual(ackRes.success, true);

      // Warning 3: Third incident (Capture Risk) -> IMMEDIATE WORKSTATION LOCKOUT
      const w3 = recordProctorIncident(db, {
        sessionId,
        operatorId,
        operatorName: 'Operator Desk 2',
        centreNumber: 'CTR-101',
        incidentType: 'CAPTURE_RISK_DETECTED',
      });
      assert.strictEqual(w3.warningCount, 3);
      assert.strictEqual(w3.isLocked, true);
      assert.strictEqual(w3.actionRequired, 'IMMEDIATE_LOCKOUT');
      assert.ok(w3.lockedAt);

      // Subsequent check confirms session is persistently locked
      const sess = getOrCreateProctoredSession(db, {
        sessionId,
        operatorId,
        operatorName: 'Operator Desk 2',
        centreNumber: 'CTR-101',
      });
      assert.strictEqual(sess.isLocked, true);
      assert.strictEqual(sess.warningCount, 3);

      // Administrator resets proctored lock -> Unlocked
      const adminReset = adminResetProctorLock(db, {
        sessionId,
        adminUserId: 'usr-auditor-01',
        adminRole: 'AUDITOR',
        reason: 'Physical inspection completed by Vigilance Auditor. Area sanitized.',
      });
      assert.strictEqual(adminReset.success, true);

      const sessAfterReset = getOrCreateProctoredSession(db, {
        sessionId,
        operatorId,
        operatorName: 'Operator Desk 2',
        centreNumber: 'CTR-101',
      });
      assert.strictEqual(sessAfterReset.isLocked, false);
      assert.strictEqual(sessAfterReset.warningCount, 0);
    });
  });

  // =========================================================================
  // 4. TRACEABLE ANTI-LEAK WATERMARK & AUDITOR INVESTIGATION
  // =========================================================================
  describe('4. Traceable Anti-Leak Watermark & Forensic Investigation', () => {
    it('4.1. Chief Vigilance Auditor traces physical leaked copy to originating centre, printer, and operator', async () => {
      const db = await getDb();
      initPrintAnywhereWorkflowSchema(db);

      // Create and release a past job with 3 copies
      const pastDate = new Date(Date.now() - 3600 * 1000).toISOString().split('T')[0];
      const req = createPrintAnywhereRequest(db, {
        examId: 'exam-forensic-101',
        examName: 'Medical Genetics Paper II',
        examType: 'COMPETITIVE',
        paperId: 'paper-med-02',
        paperVersion: 'v2',
        centreNumber: 'CTR-102',
        printerId: 'PRN-CTR102-01',
        requestedCopies: 3,
        scheduledUnlockTime: '08:00 AM',
        scheduledDate: pastDate,
        requestedBy: 'mgr-02',
        requestedByName: 'Dr. Sharma (Exam Manager)',
      });

      const release = executePrintJobRelease(db, {
        requestId: req.request!.id,
        operatorId: 'usr-op-pune',
        operatorName: 'Sanjay Deshmukh (Centre Superintendent)',
        centreNumber: 'CTR-102',
      });

      assert.strictEqual(release.success, true);
      const targetWatermark = release.watermarks![1]; // Copy #2
      assert.ok(targetWatermark.copyIdentifier);

      // Auditor searches by exact Copy Identifier
      const searchExact = investigateLeakedWatermark(db, targetWatermark.copyIdentifier);
      assert.strictEqual(searchExact.found, true);
      assert.strictEqual(searchExact.match?.copyIdentifier, targetWatermark.copyIdentifier);
      assert.strictEqual(searchExact.match?.centreNumber, 'CTR-102');
      assert.strictEqual(searchExact.match?.printerId, 'PRN-CTR102-01');
      assert.strictEqual(searchExact.match?.operatorName, 'Sanjay Deshmukh (Centre Superintendent)');
      assert.strictEqual(searchExact.match?.copyNumber, 2);
      assert.strictEqual(searchExact.match?.totalCopies, 3);
      assert.ok(searchExact.custodyTimeline?.length! >= 2);

      // Auditor searches by partial watermark text snippet
      const searchPartial = investigateLeakedWatermark(db, 'Medical Genetics');
      assert.strictEqual(searchPartial.found, true);
      assert.strictEqual(searchPartial.match?.examName, 'Medical Genetics Paper II');

      // Auditor searches non-existent reference
      const searchFake = investigateLeakedWatermark(db, 'CPY-FAKE-99999');
      assert.strictEqual(searchFake.found, false);
    });
  });
});
