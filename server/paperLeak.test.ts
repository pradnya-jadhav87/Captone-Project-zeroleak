import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getDb, executeRun, executeQuery } from './db.ts';
import {
  initPaperLeakSchema,
  createPaperLeakIncident,
  containPaperVersion,
  quarantineTarget,
  approveExclusionManifest,
  evaluateQuestionEligibility,
  getEligibleQuestionsForRegeneration,
  generateReplacementPaper,
  runReplacementPaperValidation,
  approveAndEncryptReplacementPaper,
  getPaperLeakIncident,
  getReplacementPaper,
  computeQuestionFingerprint,
  computeTextSimilarity,
} from './paperLeakService.ts';
import {
  initPrintAnywhereWorkflowSchema,
  createPrintAnywhereRequest,
  executePrintJobRelease,
} from './printAnywhereService.ts';

describe('ZeroLeak Paper Leak Response, Containment & Emergency Regeneration Tests', () => {
  // =========================================================================
  // 1. INCIDENT CREATION, IMMEDIATE CONTAINMENT & EVIDENCE PRESERVATION
  // =========================================================================
  describe('1. Incident Creation, Containment & Preservation (Criteria 1, 2, 17)', () => {
    it('1.1. Leak incident immediately suspends paper version and blocks pending print releases', async () => {
      const db = await getDb();
      initPaperLeakSchema(db);
      initPrintAnywhereWorkflowSchema(db);

      const paperId = `paper-comp-${Date.now()}`;
      const examId = `exam-comp-${Date.now()}`;

      // Insert dummy examination matching schema
      executeRun(
        db,
        `INSERT OR REPLACE INTO examinations (
          id, org_id, name, subject, category, exam_type, exam_date, exam_time, unlock_time,
          total_marks, total_questions, duration_minutes, status, created_by, created_at, updated_at
        ) VALUES (?, 'org-test', 'Computer Networks & Security', 'Computer Networks', 'UNIVERSITY', 'THEORY', '2026-10-15', '10:00 AM', '09:30 AM', 70, 25, 180, 'READY_FOR_PRINT', 'usr-test', ?, ?)`,
        [examId, new Date().toISOString(), new Date().toISOString()]
      );

      // Create a pending print request for this paper version
      const printReq = createPrintAnywhereRequest(db, {
        examId,
        examName: 'Computer Networks & Security',
        examType: 'UNIVERSITY',
        paperId,
        paperVersion: 'v1',
        centreNumber: 'CTR-101',
        printerId: 'PRN-CTR101-01',
        requestedCopies: 5,
        scheduledUnlockTime: '10:00 AM',
        scheduledDate: '2026-10-15',
        requestedBy: 'usr-mgr',
        requestedByName: 'Exam Manager',
      });
      assert.strictEqual(printReq.success, true);
      assert.strictEqual(printReq.request?.status, 'SCHEDULED');

      // Now, report paper leak incident
      const leakReport = createPaperLeakIncident(db, {
        examId,
        examType: 'UNIVERSITY',
        paperId,
        paperVersion: 'v1',
        title: 'Suspected Paper Leak in Transmission Channel',
        description: 'Physical copies photographed outside examination vault.',
        severity: 'CRITICAL',
        isConfirmed: true,
        reportedById: 'usr-mgr',
        reportedByName: 'Dr. Ramesh Patil',
        reportedByRole: 'EXAM_MANAGER',
        knownLeakedQuestions: [
          { questionId: 'Q-LEAK-01', questionNumber: 'Q.2', text: 'Explain RSA-2048 public key encryption algorithm.' },
          { questionId: 'Q-LEAK-02', questionNumber: 'Q.3', text: 'Derive Diffie-Hellman cryptographic key exchange protocol.' },
        ],
        regenerationReason: 'Emergency paper containment and clean replacement required.',
      });

      assert.strictEqual(leakReport.success, true);
      assert.ok(leakReport.incident?.id.startsWith('LEAK-INC-'));
      assert.strictEqual(leakReport.incident?.leakStatus, 'LEAK_CONFIRMED');

      // Verify that pending print job was immediately BLOCKED
      const releaseAttempt = executePrintJobRelease(db, {
        requestId: printReq.request!.id,
        operatorId: 'usr-op-01',
        operatorName: 'Centre Operator',
        centreNumber: 'CTR-101',
      });
      assert.strictEqual(releaseAttempt.success, false);
      assert.ok(
        releaseAttempt.error?.includes('SECURITY CONTAINMENT') ||
        releaseAttempt.error?.includes('BLOCKED')
      );
    });

    it('1.2. Preserves compromised paper and incident evidence in restricted storage without deleting', async () => {
      const db = await getDb();
      initPaperLeakSchema(db);

      const incident = getPaperLeakIncident(db, 'LEAK-INC-NONEXISTENT');
      assert.strictEqual(incident, null);

      // Verify existing incident is queryable and not deleted
      const allIncidents = createPaperLeakIncident(db, {
        examId: 'exam-evidence-01',
        examType: 'COMPETITIVE',
        paperId: 'paper-evidence-01',
        paperVersion: 'v1',
        title: 'Forensic Audit Evidence Retention Test',
        description: 'Paper photographed and disseminated on social network.',
        reportedById: 'usr-auditor-01',
        reportedByName: 'Chief Auditor',
        reportedByRole: 'AUDITOR',
        evidenceReferences: ['EVID-IMG-001.JPG', 'FORENSIC-HASH-A1B2C3'],
        regenerationReason: 'Compromised by social leak.',
      });

      assert.strictEqual(allIncidents.success, true);
      const retrieved = getPaperLeakIncident(db, allIncidents.incident!.id);
      assert.ok(retrieved);
      assert.strictEqual(retrieved?.evidenceReferences[0], 'EVID-IMG-001.JPG');
      assert.strictEqual(retrieved?.paperId, 'paper-evidence-01');
    });
  });

  // =========================================================================
  // 2. QUESTION, POOL, AND SOURCE DRAFT QUARANTINE (Criteria 3, 4, 9, 14)
  // =========================================================================
  describe('2. Quarantine Containment Scopes (Criteria 3, 4, 9, 14)', () => {
    it('2.1. Quarantines specific questions and blocks them from replacement candidate pool', async () => {
      const db = await getDb();
      initPaperLeakSchema(db);

      const incidentId = `INC-QUAR-${Date.now()}`;
      const qRes = quarantineTarget(db, {
        incidentId,
        quarantineScope: 'INDIVIDUAL_QUESTION',
        targetId: 'Q-COMPROMISED-101',
        targetName: 'Question 101: Distributed Consensus',
        text: 'Explain Raft distributed consensus protocol under network partitions.',
        quarantineReason: 'Questions leaked on messaging channel.',
        reviewStatus: 'QUARANTINED',
        reviewerId: 'usr-auditor-01',
        reviewerName: 'Chief Auditor',
        reviewerRole: 'AUDITOR',
      });

      assert.strictEqual(qRes.success, true);
      assert.strictEqual(qRes.quarantineRecord?.reviewStatus, 'QUARANTINED');

      // Test eligibility filter: must reject this question
      const manifestMock: any = {
        leakedQuestionIds: ['Q-COMPROMISED-101'],
        reviewerExcludedQuestionIds: [],
        leakedFingerprints: [],
        quarantinedDraftIds: [],
        quarantinedPoolIds: [],
        approvedQuestionAllowlists: {},
        similarityThreshold: 0.75,
      };

      const evalResult = evaluateQuestionEligibility(manifestMock, {
        id: 'Q-COMPROMISED-101',
        text: 'Explain Raft distributed consensus protocol under network partitions.',
      });
      assert.strictEqual(evalResult.isEligible, false);
      assert.ok(evalResult.exclusionReason?.includes('compromised'));
    });

    it('2.2. Quarantining an entire source draft excludes all questions unless explicitly allowlisted', async () => {
      const db = await getDb();
      initPaperLeakSchema(db);

      const incidentId = `INC-DRAFT-${Date.now()}`;

      // Case A: Draft is fully quarantined
      quarantineTarget(db, {
        incidentId,
        quarantineScope: 'SOURCE_DRAFT',
        targetId: 'DRAFT-DISTR-01',
        targetName: 'Draft Examination Paper 1 - Distributed Systems',
        quarantineReason: 'Draft PDF file was exposed in shared directory.',
        reviewStatus: 'QUARANTINED',
        reviewerId: 'usr-mgr-01',
        reviewerName: 'Exam Manager',
        reviewerRole: 'EXAM_MANAGER',
      });

      const manifestFullQuarantine: any = {
        leakedQuestionIds: [],
        reviewerExcludedQuestionIds: [],
        leakedFingerprints: [],
        quarantinedDraftIds: ['DRAFT-DISTR-01'],
        quarantinedPoolIds: [],
        approvedQuestionAllowlists: {},
        similarityThreshold: 0.75,
      };

      const evalFull = evaluateQuestionEligibility(manifestFullQuarantine, {
        id: 'Q-DISTR-99',
        text: 'Explain Paxos algorithmic round phases.',
        sourceDraftId: 'DRAFT-DISTR-01',
      });
      assert.strictEqual(evalFull.isEligible, false);
      assert.ok(evalFull.exclusionReason?.includes('quarantined'));

      // Case B: Partial clearance with documented allowlist
      const manifestPartial: any = {
        leakedQuestionIds: ['Q-DISTR-LEAKED'],
        reviewerExcludedQuestionIds: [],
        leakedFingerprints: [],
        quarantinedDraftIds: ['DRAFT-DISTR-01'],
        quarantinedPoolIds: [],
        approvedQuestionAllowlists: {
          'DRAFT-DISTR-01': ['Q-DISTR-VERIFIED-A', 'Q-DISTR-VERIFIED-B'],
        },
        similarityThreshold: 0.75,
      };

      // Non-allowlisted question -> EXCLUDED
      const evalNonAllowlisted = evaluateQuestionEligibility(manifestPartial, {
        id: 'Q-DISTR-OTHER',
        text: 'Explain Byzantine Fault Tolerance.',
        sourceDraftId: 'DRAFT-DISTR-01',
      });
      assert.strictEqual(evalNonAllowlisted.isEligible, false);
      assert.ok(evalNonAllowlisted.exclusionReason?.includes('approved allowlist'));

      // Allowlisted question -> ELIGIBLE
      const evalAllowlisted = evaluateQuestionEligibility(manifestPartial, {
        id: 'Q-DISTR-VERIFIED-A',
        text: 'Explain vector clocks in distributed ordering.',
        sourceDraftId: 'DRAFT-DISTR-01',
      });
      assert.strictEqual(evalAllowlisted.isEligible, true);
    });

    it('2.3. Unauthorized roles cannot alter quarantine state', async () => {
      const db = await getDb();
      initPaperLeakSchema(db);

      const unauthorizedRes = quarantineTarget(db, {
        incidentId: 'INC-UNAUTH-01',
        quarantineScope: 'INDIVIDUAL_QUESTION',
        targetId: 'Q-123',
        targetName: 'Q-123',
        quarantineReason: 'Hacker attempt',
        reviewerId: 'usr-student',
        reviewerName: 'Student Candidate',
        reviewerRole: 'CANDIDATE' as any,
      });

      assert.strictEqual(unauthorizedRes.success, false);
      assert.ok(unauthorizedRes.error?.includes('ACCESS DENIED'));
    });
  });

  // =========================================================================
  // 3. EXCLUSION MANIFEST, FINGERPRINTS & SIMILARITY CHECKS (Criteria 5, 6, 9)
  // =========================================================================
  describe('3. Exclusion Manifest, Fingerprints & Semantic Similarity (Criteria 5, 6, 9)', () => {
    it('3.1. Excludes duplicate occurrences across different drafts using normalized SHA-256 fingerprints', () => {
      const leakedText = 'Explain 3D geometric transformation matrices for scaling, rotation, and translation.';
      const leakedFingerprint = computeQuestionFingerprint(leakedText);

      // Question from Draft B with slightly different punctuation/whitespace
      const draftBText = 'Explain 3D Geometric Transformation Matrices for Scaling, Rotation, and Translation!';
      const draftBFingerprint = computeQuestionFingerprint(draftBText);

      assert.strictEqual(leakedFingerprint, draftBFingerprint);

      const manifest: any = {
        leakedQuestionIds: [],
        reviewerExcludedQuestionIds: [],
        leakedFingerprints: [leakedFingerprint],
        quarantinedDraftIds: [],
        quarantinedPoolIds: [],
        approvedQuestionAllowlists: {},
        similarityThreshold: 0.75,
      };

      const evalDup = evaluateQuestionEligibility(manifest, {
        id: 'Q-DRAFT-B-99', // New ID, but duplicate content
        text: draftBText,
      });
      assert.strictEqual(evalDup.isEligible, false);
      assert.ok(evalDup.exclusionReason?.includes('fingerprint matches'));
    });

    it('3.2. Semantic-similarity check flags likely paraphrases or near-duplicates (>= 75% similarity)', () => {
      const leakedOriginal = 'Explain Liang-Barsky parametric line clipping algorithm with suitable clipping coordinates and pseudocode.';
      const paraphrase = 'Describe Liang-Barsky parametric line clipping algorithm with suitable coordinates and pseudocode explanation.';

      const sim = computeTextSimilarity(leakedOriginal, paraphrase);
      assert.ok(sim >= 0.75, `Expected similarity >= 0.75, got ${sim}`);

      const manifest: any = {
        leakedQuestionIds: [],
        reviewerExcludedQuestionIds: [],
        leakedFingerprints: [],
        quarantinedDraftIds: [],
        quarantinedPoolIds: [],
        approvedQuestionAllowlists: {},
        similarityThreshold: 0.75,
      };

      const evalParaphrase = evaluateQuestionEligibility(
        manifest,
        { id: 'Q-CANDIDATE-PARAPHRASE', text: paraphrase },
        [leakedOriginal]
      );

      assert.strictEqual(evalParaphrase.isEligible, false);
      assert.ok(evalParaphrase.exclusionReason?.includes('high similarity'));
    });
  });

  // =========================================================================
  // 4. REPLACEMENT PAPER REGENERATION & SHORTFALL ERROR (Criteria 7, 8, 10, 15)
  // =========================================================================
  describe('4. Replacement Paper Regeneration & Shortfall Handling (Criteria 7, 8, 10, 15)', () => {
    it('4.1. Generates genuine new question combination with version V2 from previously uploaded eligible drafts', async () => {
      const db = await getDb();
      initPaperLeakSchema(db);

      const examId = `exam-regen-${Date.now()}`;

      // Insert university examination
      executeRun(
        db,
        `INSERT OR REPLACE INTO examinations (
          id, org_id, name, subject, category, exam_type, exam_date, exam_time, unlock_time,
          total_marks, total_questions, duration_minutes, status, created_by, created_at, updated_at
        ) VALUES (?, 'org-test', 'Operating Systems & Security', 'Operating Systems', 'UNIVERSITY', 'THEORY', '2026-10-15', '10:00 AM', '09:30 AM', 70, 25, 180, 'READY_FOR_PRINT', 'usr-test', ?, ?)`,
        [examId, new Date().toISOString(), new Date().toISOString()]
      );

      // Seed 30 clean questions into DB for this subject
      for (let i = 1; i <= 30; i++) {
        executeRun(
          db,
          `INSERT OR REPLACE INTO questions (
            id, org_id, question_paper_id, question_number, subject, topic, difficulty,
            marks, correct_answer, syllabus, question_type, content_text, created_by, created_at, updated_at
          ) VALUES (?, 'org-test', 'DRAFT-CLEAN-01', ?, 'Operating Systems & Security', 'Core', 'MEDIUM', ?, 'A', 'Syllabus', ?, ?, 'usr-mgr', ?, ?)`,
          [
            `Q-CLEAN-OS-${i}`,
            `Q.${i}`,
            i <= 14 ? 1 : 4,
            i <= 14 ? 'MCQ' : 'THEORY',
            `Clean Question ${i}: Explain kernel architecture and memory virtualization concept ${i}.`,
            new Date().toISOString(),
            new Date().toISOString(),
          ]
        );
      }

      // Create paper leak incident for original version
      const inc = createPaperLeakIncident(db, {
        examId,
        examType: 'UNIVERSITY',
        paperId: `paper-orig-${Date.now()}`,
        paperVersion: 'v1',
        title: 'Midterm Leak Reported',
        description: 'Compromised questions Q.1 and Q.2',
        reportedById: 'usr-mgr',
        reportedByName: 'Exam Manager',
        reportedByRole: 'EXAM_MANAGER',
        knownLeakedQuestions: [
          { questionId: 'Q-LEAK-OLD-01', text: 'Old Leaked Question 1' },
        ],
        regenerationReason: 'Regenerate clean replacement paper version.',
      });
      assert.strictEqual(inc.success, true);

      // Approve manifest
      const manifestRows = executeQuery(
        db,
        'SELECT id FROM question_exclusion_manifests WHERE incident_id = ? ORDER BY revision DESC LIMIT 1',
        [inc.incident!.id]
      );
      const manifestId = manifestRows[0]?.id;
      approveExclusionManifest(db, {
        manifestId,
        approvedById: 'usr-auditor-01',
        approvedByRole: 'AUDITOR',
      });

      // Generate replacement paper
      const regenRes = generateReplacementPaper(db, {
        incidentId: inc.incident!.id,
        generatedById: 'usr-mgr-01',
        generatedByName: 'Dr. Exam Manager',
      });

      assert.strictEqual(regenRes.success, true);
      assert.ok(regenRes.replacementPaper);
      assert.strictEqual(regenRes.replacementPaper?.totalMarks, 70);
      assert.strictEqual(regenRes.replacementPaper?.status, 'VALIDATED');
      assert.ok(regenRes.replacementPaper?.replacementVersionCode.includes('-V2'));
      assert.strictEqual(regenRes.validationReport?.isValid, true);
    });

    it('4.2. Insufficient eligible questions cause a clear blocking error rather than unsafe reuse', async () => {
      const db = await getDb();
      initPaperLeakSchema(db);

      const examId = `exam-shortfall-${Date.now()}`;

      // Insert competitive exam
      executeRun(
        db,
        `INSERT OR REPLACE INTO competitive_exams (id, org_id, name, exam_type, duration_minutes, created_at, updated_at)
         VALUES (?, 'org-test', 'Physics National Olympiad', 'COMPETITIVE', 180, ?, ?)`,
        [examId, new Date().toISOString(), new Date().toISOString()]
      );

      // Seed only 5 questions (50 required for competitive paper)
      for (let i = 1; i <= 5; i++) {
        executeRun(
          db,
          `INSERT OR REPLACE INTO competitive_questions (
            id, org_id, exam_id, subject, question_text, marks, verification_status, created_at, updated_at
          ) VALUES (?, 'org-test', ?, 'Physics', ?, 2, 'VERIFIED', ?, ?)`,
          [
            `Q-PHY-SCANT-${i}`,
            examId,
            `Scant Question ${i}: Calculate relativistic momentum of particle ${i}.`,
            new Date().toISOString(),
            new Date().toISOString(),
          ]
        );
      }

      // Create leak incident
      const inc = createPaperLeakIncident(db, {
        examId,
        examType: 'COMPETITIVE',
        paperId: `paper-comp-${Date.now()}`,
        paperVersion: 'v1',
        title: 'Physics Leak Incident',
        description: 'Physical booklet leaked',
        reportedById: 'usr-mgr',
        reportedByName: 'Exam Manager',
        reportedByRole: 'EXAM_MANAGER',
        regenerationReason: 'Compile replacement',
      });

      // Attempt generation with insufficient questions
      const failRegen = generateReplacementPaper(db, {
        incidentId: inc.incident!.id,
        generatedById: 'usr-mgr',
        generatedByName: 'Exam Manager',
      });

      assert.strictEqual(failRegen.success, false);
      assert.ok(failRegen.error?.includes('INSUFFICIENT_ELIGIBLE_QUESTIONS'));
      assert.ok(failRegen.error?.includes('Shortfall'));
    });
  });

  // =========================================================================
  // 5. VALIDATION, APPROVAL, ENCRYPTION & PRINT ANYWHERE RELEASE (Criteria 11-13, 16, 18)
  // =========================================================================
  describe('5. Validation, Approval, Encryption & Print Anywhere (Criteria 11-13, 16, 18)', () => {
    it('5.1. Validation failure blocks encryption and release', () => {
      const manifestMock: any = {
        leakedQuestionIds: ['Q-COMPROMISED-BAD'],
        leakedFingerprints: [],
        similarityThreshold: 0.75,
      };

      // Paper with corrupted total marks (60 instead of 70) and containing a compromised question
      const badPaper = {
        totalMarks: 60,
        requiredMarks: 70,
        selectedQuestions: [
          { id: 'Q-COMPROMISED-BAD', text: 'Bad question', marks: 10 },
          { id: 'Q-CLEAN-01', text: 'Clean question', marks: 50 },
        ],
        paperStructure: {},
      };

      const val = runReplacementPaperValidation(manifestMock, badPaper);
      assert.strictEqual(val.isValid, false);
      assert.ok(val.errors.some(e => e.includes('Total marks')));
      assert.ok(val.errors.some(e => e.includes('compromised ID')));
    });

    it('5.2. Approved replacement is encrypted with AES-256-GCM and released through Print Anywhere with traceable watermarks', async () => {
      const db = await getDb();
      initPaperLeakSchema(db);
      initPrintAnywhereWorkflowSchema(db);

      const examId = `exam-full-cycle-${Date.now()}`;
      executeRun(
        db,
        `INSERT OR REPLACE INTO examinations (
          id, org_id, name, subject, category, exam_type, exam_date, exam_time, unlock_time,
          total_marks, total_questions, duration_minutes, status, created_by, created_at, updated_at
        ) VALUES (?, 'org-test', 'Advanced Algorithms', 'Advanced Algorithms', 'UNIVERSITY', 'THEORY', '2026-10-15', '10:00 AM', '09:30 AM', 70, 25, 180, 'READY_FOR_PRINT', 'usr-mgr', ?, ?)`,
        [examId, new Date().toISOString(), new Date().toISOString()]
      );

      // Seed 25 clean questions
      for (let i = 1; i <= 25; i++) {
        executeRun(
          db,
          `INSERT OR REPLACE INTO questions (
            id, org_id, question_paper_id, question_number, subject, topic, difficulty,
            marks, correct_answer, syllabus, question_type, content_text, created_by, created_at, updated_at
          ) VALUES (?, 'org-test', 'DRAFT-ALGO-01', ?, 'Advanced Algorithms', 'Core', 'MEDIUM', ?, 'A', 'Syllabus', ?, ?, 'usr-mgr', ?, ?)`,
          [
            `Q-ALGO-${i}`,
            `Q.${i}`,
            i <= 14 ? 1 : 4,
            i <= 14 ? 'MCQ' : 'THEORY',
            `Algorithm Problem ${i}: Analyze asymptotically optimal spanning trees and min-cut flow network ${i}.`,
            new Date().toISOString(),
            new Date().toISOString(),
          ]
        );
      }

      // 1. Report leak incident
      const inc = createPaperLeakIncident(db, {
        examId,
        examType: 'UNIVERSITY',
        paperId: `paper-algo-${Date.now()}`,
        paperVersion: 'v1',
        title: 'Algorithms Midterm Leak',
        description: 'Telegram leak verified by vigilance committee.',
        reportedById: 'usr-mgr-01',
        reportedByName: 'Dr. Ramesh Patil',
        reportedByRole: 'EXAM_MANAGER',
        regenerationReason: 'Emergency replacement compile.',
      });

      // 2. Generate replacement paper
      const regen = generateReplacementPaper(db, {
        incidentId: inc.incident!.id,
        generatedById: 'usr-mgr-01',
        generatedByName: 'Dr. Ramesh Patil',
      });
      assert.strictEqual(regen.success, true);
      const replId = regen.replacementPaper!.id;

      // 3. Separation of duties: Approve and Encrypt by Chief Auditor or Owner
      const approveRes = approveAndEncryptReplacementPaper(db, {
        replacementPaperId: replId,
        approvedById: 'usr-auditor-patel',
        approvedByName: 'Vigilance Auditor Patel',
        approvedByRole: 'AUDITOR',
        approvalReason: 'Approved clean emergency replacement after verifying exclusion manifest.',
      });

      assert.strictEqual(approveRes.success, true);
      assert.strictEqual(approveRes.replacementPaper?.status, 'ENCRYPTED');
      assert.ok(approveRes.replacementPaper?.encryptedPayloadJson);

      // 4. Send replacement version through Print Anywhere workflow
      const newVersionCode = approveRes.replacementPaper!.replacementVersionCode;
      const pastDate = new Date(Date.now() - 3600 * 1000).toISOString().split('T')[0];

      const printReq = createPrintAnywhereRequest(db, {
        examId,
        examName: 'Advanced Algorithms',
        examType: 'UNIVERSITY',
        paperId: replId,
        paperVersion: newVersionCode,
        centreNumber: 'CTR-101',
        printerId: 'PRN-CTR101-01',
        requestedCopies: 3,
        scheduledUnlockTime: '08:00 AM',
        scheduledDate: pastDate,
        requestedBy: 'usr-mgr-01',
        requestedByName: 'Dr. Ramesh Patil',
      });

      assert.strictEqual(printReq.success, true);

      // 5. Operator releases print job for replacement version -> SUCCESS with traceable watermarks
      const releaseRes = executePrintJobRelease(db, {
        requestId: printReq.request!.id,
        operatorId: 'usr-op-01',
        operatorName: 'Centre Operator',
        centreNumber: 'CTR-101',
      });

      assert.strictEqual(releaseRes.success, true);
      assert.strictEqual(releaseRes.watermarks?.length, 3);
      const copy1 = releaseRes.watermarks![0];
      assert.ok(copy1.copyIdentifier.startsWith('CPY-CTR-101-'));
      assert.ok(copy1.watermarkText.includes('CONFIDENTIAL — CONTROLLED EXAMINATION COPY'));
    });
  });
});

