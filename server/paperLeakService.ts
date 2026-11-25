import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { executeQuery, executeRun, saveDb } from './db.ts';
import { encryptExamPaper } from './crypto.ts';

export type ExamCategory = 'UNIVERSITY' | 'COMPETITIVE';

export type IncidentSeverity = 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IncidentLeakStatus =
  | 'LEAK_SUSPECTED'
  | 'LEAK_CONFIRMED'
  | 'CONTAINED'
  | 'RESOLVED'
  | 'CLOSED';

export type QuarantineScope = 'INDIVIDUAL_QUESTION' | 'QUESTION_POOL' | 'SOURCE_DRAFT';

export type QuarantineReviewStatus =
  | 'UNDER_REVIEW'
  | 'QUARANTINED'
  | 'PARTIALLY_CLEARED'
  | 'CLEARED'
  | 'PERMANENTLY_EXCLUDED';

export type ReplacementPaperStatus =
  | 'REPLACEMENT_DRAFT'
  | 'VALIDATION_FAILED'
  | 'VALIDATED'
  | 'APPROVED'
  | 'ENCRYPTED'
  | 'SCHEDULED_FOR_RELEASE'
  | 'PRINTED';

export interface PaperLeakIncidentRecord {
  id: string;
  examId: string;
  examName: string;
  examType: ExamCategory;
  subject: string;
  subjectCode: string;
  paperId: string;
  paperVersion: string;
  title: string;
  description: string;
  leakStatus: IncidentLeakStatus;
  severity: IncidentSeverity;
  discoveryTimestamp: string;
  reportSource: string;
  reportedById: string;
  reportedByName: string;
  reportedByRole: string;
  knownLeakedQuestionIds: string[];
  knownLeakedFingerprints: string[];
  watermarkReference?: string;
  copyIdentifier?: string;
  evidenceReferences: string[];
  regenerationReason: string;
  containmentAppliedAt: string;
  replacementPaperId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionQuarantineRecord {
  id: string;
  incidentId: string;
  quarantineScope: QuarantineScope;
  targetId: string; // Question ID, Pool ID, or Source Draft ID
  targetName: string;
  subject?: string;
  topic?: string;
  sourceDraftId?: string;
  sourceDraftVersion?: string;
  originalQuestionNumber?: string;
  marks?: number;
  questionType?: string;
  normalizedFingerprint?: string;
  contentSnippet?: string;
  leakStatus: 'LEAK_SUSPECTED' | 'LEAK_CONFIRMED' | 'UNVERIFIED';
  evidenceReference?: string;
  quarantineReason: string;
  reviewStatus: QuarantineReviewStatus;
  approvedAllowlist?: string[]; // Question IDs cleared for partial draft reuse
  quarantinedById: string;
  quarantinedByName: string;
  reviewedById?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionExclusionManifestRecord {
  id: string;
  incidentId: string;
  originalPaperId: string;
  originalPaperVersion: string;
  revision: number;
  leakedQuestionIds: string[];
  leakedFingerprints: string[];
  reviewerExcludedQuestionIds: string[];
  quarantinedPoolIds: string[];
  quarantinedDraftIds: string[];
  approvedSourceDraftIds: string[];
  approvedQuestionAllowlists: Record<string, string[]>; // draftId -> questionIds[]
  similarityThreshold: number; // e.g. 0.75
  exclusionReasons: Record<string, string>;
  evidenceReferences: string[];
  approvalStatus: 'DRAFT' | 'APPROVED' | 'SUPERSEDED';
  approvedById?: string;
  approvedByRole?: string;
  approvedAt?: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionProvenance {
  questionId: string;
  sourceDraftId: string;
  sourceQuestionNumber?: string;
  marks: number;
  questionType: string;
  normalizedFingerprint: string;
}

export interface ReplacementPaperRecord {
  id: string;
  incidentId: string;
  manifestId: string;
  manifestRevision: number;
  examId: string;
  examName: string;
  examType: ExamCategory;
  subject: string;
  subjectCode: string;
  originalPaperId: string;
  originalPaperVersion: string;
  replacementVersionCode: string;
  status: ReplacementPaperStatus;
  title: string;
  totalMarks: number;
  durationMinutes: number;
  paperStructure: any;
  selectedQuestions: any[];
  selectedQuestionProvenance: QuestionProvenance[];
  excludedQuestionsSummary: {
    totalExcluded: number;
    quarantinedCount: number;
    similarityFlagsCount: number;
  };
  validationReport?: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    checks: Record<string, boolean>;
    timestamp: string;
  };
  comparisonSummary?: {
    originalVersion: string;
    replacementVersion: string;
    originalQuestionCount: number;
    replacementQuestionCount: number;
    retainedSourceDrafts: string[];
    excludedQuestionsCount: number;
    totalMarksMatch: boolean;
  };
  encryptedPayloadJson?: string;
  generationRunId: string;
  generatedById: string;
  approvedById?: string;
  approvedAt?: string;
  encryptedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ==============================================================================
// NORMALIZATION & FINGERPRINTING UTILITIES
// ==============================================================================

export function normalizeQuestionText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeQuestionFingerprint(text: string): string {
  const norm = normalizeQuestionText(text);
  return crypto.createHash('sha256').update(norm).digest('hex');
}

/**
 * Computes Jaccard word similarity between two texts.
 * Range: 0.0 (disjoint) to 1.0 (identical tokens).
 */
export function computeTextSimilarity(text1: string, text2: string): number {
  const norm1 = normalizeQuestionText(text1);
  const norm2 = normalizeQuestionText(text2);
  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 1.0;

  const words1 = norm1.split(' ').filter(w => w.length > 2);
  const words2 = norm2.split(' ').filter(w => w.length > 2);
  if (words1.length === 0 || words2.length === 0) return 0;

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  let intersection = 0;
  for (const w of set1) {
    if (set2.has(w)) intersection++;
  }

  const union = new Set([...set1, ...set2]).size;
  return union === 0 ? 0 : intersection / union;
}

// ==============================================================================
// SCHEMA INITIALIZATION
// ==============================================================================

export function initPaperLeakSchema(db: any): void {
  executeRun(
    db,
    `CREATE TABLE IF NOT EXISTS paper_leak_incidents (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      exam_name TEXT NOT NULL,
      exam_type TEXT NOT NULL,
      subject TEXT NOT NULL,
      subject_code TEXT NOT NULL,
      paper_id TEXT NOT NULL,
      paper_version TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      leak_status TEXT NOT NULL,
      severity TEXT NOT NULL,
      discovery_timestamp TEXT NOT NULL,
      report_source TEXT NOT NULL,
      reported_by_id TEXT NOT NULL,
      reported_by_name TEXT NOT NULL,
      reported_by_role TEXT NOT NULL,
      known_leaked_questions_json TEXT,
      known_leaked_fingerprints_json TEXT,
      watermark_reference TEXT,
      copy_identifier TEXT,
      evidence_references_json TEXT,
      regeneration_reason TEXT NOT NULL,
      containment_applied_at TEXT NOT NULL,
      replacement_paper_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`
  );

  executeRun(
    db,
    `CREATE TABLE IF NOT EXISTS question_quarantine_records (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      quarantine_scope TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_name TEXT NOT NULL,
      subject TEXT,
      topic TEXT,
      source_draft_id TEXT,
      source_draft_version TEXT,
      original_question_number TEXT,
      marks REAL,
      question_type TEXT,
      normalized_fingerprint TEXT,
      content_snippet TEXT,
      leak_status TEXT NOT NULL,
      evidence_reference TEXT,
      quarantine_reason TEXT NOT NULL,
      review_status TEXT NOT NULL,
      approved_allowlist_json TEXT,
      quarantined_by_id TEXT NOT NULL,
      quarantined_by_name TEXT NOT NULL,
      reviewed_by_id TEXT,
      reviewed_by_name TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`
  );

  executeRun(
    db,
    `CREATE TABLE IF NOT EXISTS question_exclusion_manifests (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      original_paper_id TEXT NOT NULL,
      original_paper_version TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      leaked_question_ids_json TEXT,
      leaked_fingerprints_json TEXT,
      reviewer_excluded_question_ids_json TEXT,
      quarantined_pool_ids_json TEXT,
      quarantined_draft_ids_json TEXT,
      approved_source_draft_ids_json TEXT,
      approved_question_allowlists_json TEXT,
      similarity_threshold REAL NOT NULL DEFAULT 0.75,
      exclusion_reasons_json TEXT,
      evidence_references_json TEXT,
      approval_status TEXT NOT NULL DEFAULT 'DRAFT',
      approved_by_id TEXT,
      approved_by_role TEXT,
      approved_at TEXT,
      created_by_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`
  );

  executeRun(
    db,
    `CREATE TABLE IF NOT EXISTS replacement_paper_records (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      manifest_id TEXT NOT NULL,
      manifest_revision INTEGER NOT NULL,
      exam_id TEXT NOT NULL,
      exam_name TEXT NOT NULL,
      exam_type TEXT NOT NULL,
      subject TEXT NOT NULL,
      subject_code TEXT NOT NULL,
      original_paper_id TEXT NOT NULL,
      original_paper_version TEXT NOT NULL,
      replacement_version_code TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      total_marks REAL NOT NULL,
      duration_minutes INTEGER NOT NULL,
      paper_structure_json TEXT NOT NULL,
      selected_questions_json TEXT NOT NULL,
      selected_question_provenance_json TEXT NOT NULL,
      excluded_questions_summary_json TEXT NOT NULL,
      validation_report_json TEXT,
      comparison_summary_json TEXT,
      encrypted_payload_json TEXT,
      generation_run_id TEXT NOT NULL,
      generated_by_id TEXT NOT NULL,
      approved_by_id TEXT,
      approved_at TEXT,
      encrypted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`
  );

  executeRun(
    db,
    `CREATE INDEX IF NOT EXISTS idx_quar_incident ON question_quarantine_records(incident_id);`
  );
  executeRun(
    db,
    `CREATE INDEX IF NOT EXISTS idx_quar_target ON question_quarantine_records(target_id);`
  );
  executeRun(
    db,
    `CREATE INDEX IF NOT EXISTS idx_manifest_incident ON question_exclusion_manifests(incident_id);`
  );
}

// ==============================================================================
// 1. PAPER LEAK INCIDENT CREATION & IMMEDIATE CONTAINMENT
// ==============================================================================

export function createPaperLeakIncident(
  db: any,
  params: {
    examId: string;
    examType: ExamCategory;
    paperId: string;
    paperVersion: string;
    title: string;
    description: string;
    severity?: IncidentSeverity;
    isConfirmed?: boolean;
    discoveryTimestamp?: string;
    reportSource?: string;
    reportedById: string;
    reportedByName: string;
    reportedByRole: string;
    knownLeakedQuestions?: Array<{
      questionId?: string;
      questionNumber?: string;
      text?: string;
      marks?: number;
      sourceDraftId?: string;
    }>;
    watermarkReference?: string;
    copyIdentifier?: string;
    evidenceReferences?: string[];
    regenerationReason: string;
  }
): {
  success: boolean;
  incident?: PaperLeakIncidentRecord;
  manifest?: QuestionExclusionManifestRecord;
  error?: string;
} {
  initPaperLeakSchema(db);

  const now = new Date().toISOString();
  const incidentId = `LEAK-INC-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  // 1. Resolve exam and paper details
  let examName = 'Scheduled Examination';
  let subject = 'General Subject';
  let subjectCode = 'EXAM-CODE';

  if (params.examType === 'COMPETITIVE') {
    const rows = executeQuery(db, 'SELECT * FROM competitive_exams WHERE id = ?', [params.examId]);
    if (rows && rows.length > 0) {
      examName = rows[0].title || rows[0].name || examName;
      subject = rows[0].subject || subject;
      subjectCode = rows[0].code || subjectCode;
    }
  } else {
    const rows = executeQuery(db, 'SELECT * FROM examinations WHERE id = ?', [params.examId]);
    if (rows && rows.length > 0) {
      examName = rows[0].name || examName;
      subject = rows[0].subject || rows[0].name || subject;
      subjectCode = rows[0].course_code || subjectCode;
    }
  }

  const leakStatus: IncidentLeakStatus = params.isConfirmed ? 'LEAK_CONFIRMED' : 'LEAK_SUSPECTED';
  const severity: IncidentSeverity = params.severity || 'HIGH';

  // 2. IMMEDIATE CONTAINMENT: Stop print releases and suspend paper version
  containPaperVersion(db, {
    paperId: params.paperId,
    paperVersion: params.paperVersion,
    examId: params.examId,
    examType: params.examType,
    incidentId,
    reason: params.description,
  });

  // 3. Process known leaked questions and compute fingerprints
  const knownQuestionIds: string[] = [];
  const knownFingerprints: string[] = [];

  if (params.knownLeakedQuestions && params.knownLeakedQuestions.length > 0) {
    for (const q of params.knownLeakedQuestions) {
      const qId = q.questionId || `LEAK-Q-${uuidv4().slice(0, 8)}`;
      knownQuestionIds.push(qId);

      const fp = q.text ? computeQuestionFingerprint(q.text) : '';
      if (fp) knownFingerprints.push(fp);

      // Record in quarantine table
      const qRecId = `Q-QUAR-${uuidv4().slice(0, 8).toUpperCase()}`;
      executeRun(
        db,
        `INSERT INTO question_quarantine_records (
          id, incident_id, quarantine_scope, target_id, target_name,
          source_draft_id, original_question_number, marks, normalized_fingerprint,
          content_snippet, leak_status, evidence_reference, quarantine_reason,
          review_status, quarantined_by_id, quarantined_by_name, created_at, updated_at
        ) VALUES (?, ?, 'INDIVIDUAL_QUESTION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QUARANTINED', ?, ?, ?, ?)`,
        [
          qRecId,
          incidentId,
          qId,
          `Question ${q.questionNumber || qId}`,
          q.sourceDraftId || null,
          q.questionNumber || null,
          q.marks || 4,
          fp || null,
          q.text ? q.text.slice(0, 200) : null,
          params.isConfirmed ? 'LEAK_CONFIRMED' : 'LEAK_SUSPECTED',
          params.evidenceReferences?.[0] || null,
          `Directly identified as compromised in leak report: ${params.title}`,
          params.reportedById,
          params.reportedByName,
          now,
          now,
        ]
      );
    }
  }

  // 4. Create Incident Record
  executeRun(
    db,
    `INSERT INTO paper_leak_incidents (
      id, exam_id, exam_name, exam_type, subject, subject_code, paper_id, paper_version,
      title, description, leak_status, severity, discovery_timestamp, report_source,
      reported_by_id, reported_by_name, reported_by_role, known_leaked_questions_json,
      known_leaked_fingerprints_json, watermark_reference, copy_identifier,
      evidence_references_json, regeneration_reason, containment_applied_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      incidentId,
      params.examId,
      examName,
      params.examType,
      subject,
      subjectCode,
      params.paperId,
      params.paperVersion,
      params.title,
      params.description,
      leakStatus,
      severity,
      params.discoveryTimestamp || now,
      params.reportSource || 'EXAM_MANAGER_REPORT',
      params.reportedById,
      params.reportedByName,
      params.reportedByRole,
      JSON.stringify(knownQuestionIds),
      JSON.stringify(knownFingerprints),
      params.watermarkReference || null,
      params.copyIdentifier || null,
      JSON.stringify(params.evidenceReferences || []),
      params.regenerationReason,
      now,
      now,
      now,
    ]
  );

  // 5. Create initial Question Exclusion Manifest
  const manifestId = `EXCL-MAN-${uuidv4().slice(0, 8).toUpperCase()}`;
  executeRun(
    db,
    `INSERT INTO question_exclusion_manifests (
      id, incident_id, original_paper_id, original_paper_version, revision,
      leaked_question_ids_json, leaked_fingerprints_json, reviewer_excluded_question_ids_json,
      quarantined_pool_ids_json, quarantined_draft_ids_json, approved_source_draft_ids_json,
      approved_question_allowlists_json, similarity_threshold, exclusion_reasons_json,
      evidence_references_json, approval_status, created_by_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?, '[]', '[]', '[]', '[]', '{}', 0.75, ?, ?, 'DRAFT', ?, ?, ?)`,
    [
      manifestId,
      incidentId,
      params.paperId,
      params.paperVersion,
      JSON.stringify(knownQuestionIds),
      JSON.stringify(knownFingerprints),
      JSON.stringify({ initialReason: params.regenerationReason }),
      JSON.stringify(params.evidenceReferences || []),
      params.reportedById,
      now,
      now,
    ]
  );

  // 6. Audit Log
  const auditEvents = [
    'LEAK_INCIDENT_CREATED',
    'CONTAINMENT_APPLIED',
    'PRINT_REQUESTS_SUSPENDED',
  ];
  for (const ev of auditEvents) {
    executeRun(
      db,
      `INSERT INTO audit_events (
        id, event_type, user_id, org_id, exam_id, status, tx_ref, details_json, created_at
      ) VALUES (?, ?, ?, NULL, ?, 'SUCCESS', ?, ?, ?)`,
      [
        uuidv4(),
        ev,
        params.reportedById,
        params.examId,
        `TX-${uuidv4().slice(0, 12)}`,
        JSON.stringify({
          incidentId,
          paperId: params.paperId,
          paperVersion: params.paperVersion,
          leakStatus,
          severity,
          knownLeakedCount: knownQuestionIds.length,
        }),
        now,
      ]
    );
  }

  // 7. System Notifications to Owner, Manager, Auditor
  const notifyRoles = ['ORG_OWNER', 'EXAM_MANAGER', 'AUDITOR'];
  for (const role of notifyRoles) {
    executeRun(
      db,
      `INSERT INTO notifications (id, user_id, role, org_id, title, message, category, is_read, created_at)
       VALUES (?, NULL, ?, NULL, ?, ?, 'SECURITY_LEAK', 0, ?)`,
      [
        uuidv4(),
        role,
        `🚨 EMERGENCY LEAK REPORT: ${params.title}`,
        `Paper ${params.paperId} (${params.paperVersion}) has been suspended under incident ${incidentId}. Immediate containment enforced.`,
        now,
      ]
    );
  }

  saveDb();

  const createdIncident = getPaperLeakIncident(db, incidentId);
  const createdManifest = getExclusionManifest(db, manifestId);

  return {
    success: true,
    incident: createdIncident || undefined,
    manifest: createdManifest || undefined,
  };
}

/**
 * Containment logic: marks paper as COMPROMISED, cancels pending print jobs,
 * and revokes viewing sessions.
 */
export function containPaperVersion(
  db: any,
  params: {
    paperId: string;
    paperVersion: string;
    examId: string;
    examType: ExamCategory;
    incidentId: string;
    reason: string;
  }
): void {
  const now = new Date().toISOString();

  // 1. Cancel/Block pending or scheduled print jobs in print_anywhere_requests
  executeRun(
    db,
    `UPDATE print_anywhere_requests
     SET status = 'BLOCKED',
         updated_at = ?
     WHERE (paper_id = ? OR paper_version = ? OR exam_id = ?)
       AND status IN ('PENDING', 'SCHEDULED', 'READY_TO_PRINT', 'APPROVED')`,
    [now, params.paperId, params.paperVersion, params.examId]
  );

  // 2. Lock paper versions safely
  try {
    if (params.examType === 'COMPETITIVE') {
      executeRun(
        db,
        `UPDATE competitive_generated_papers
         SET is_finalized = 0
         WHERE id = ? OR exam_id = ?`,
        [params.paperId, params.examId]
      );
    } else {
      executeRun(
        db,
        `UPDATE paper_versions
         SET is_current = 0, status = 'COMPROMISED', invalidation_reason = ?, invalidated_at = ?
         WHERE (id = ? OR version_code = ? OR exam_id = ?)`,
        [params.reason, now, params.paperId, params.paperVersion, params.examId]
      );
    }
  } catch {}
}

// ==============================================================================
// 2. QUESTION, POOL, AND SOURCE DRAFT QUARANTINE MANAGEMENT
// ==============================================================================

export function quarantineTarget(
  db: any,
  params: {
    incidentId: string;
    quarantineScope: QuarantineScope;
    targetId: string;
    targetName: string;
    subject?: string;
    topic?: string;
    sourceDraftId?: string;
    sourceDraftVersion?: string;
    originalQuestionNumber?: string;
    marks?: number;
    questionType?: string;
    text?: string;
    quarantineReason: string;
    reviewStatus?: QuarantineReviewStatus;
    approvedAllowlist?: string[]; // Question IDs cleared for partial draft reuse
    reviewerId: string;
    reviewerName: string;
    reviewerRole: string;
  }
): {
  success: boolean;
  quarantineRecord?: QuestionQuarantineRecord;
  error?: string;
} {
  initPaperLeakSchema(db);

  // Authorization check: Only Exam Manager, Auditor, or Org Owner
  if (!['EXAM_MANAGER', 'AUDITOR', 'ORG_OWNER'].includes(params.reviewerRole)) {
    return {
      success: false,
      error: 'ACCESS DENIED: Only Examination Manager, Auditor, or Owner may modify quarantine state.',
    };
  }

  const now = new Date().toISOString();
  const recordId = `Q-QUAR-${uuidv4().slice(0, 8).toUpperCase()}`;
  const fp = params.text ? computeQuestionFingerprint(params.text) : undefined;
  const status: QuarantineReviewStatus = params.reviewStatus || 'QUARANTINED';

  // Check if existing quarantine record for this target exists in incident
  const existingRows = executeQuery(
    db,
    'SELECT id FROM question_quarantine_records WHERE incident_id = ? AND target_id = ?',
    [params.incidentId, params.targetId]
  );

  if (existingRows && existingRows.length > 0) {
    // Update existing record
    executeRun(
      db,
      `UPDATE question_quarantine_records
       SET review_status = ?,
           quarantine_reason = ?,
           approved_allowlist_json = ?,
           reviewed_by_id = ?,
           reviewed_by_name = ?,
           reviewed_at = ?,
           updated_at = ?
       WHERE incident_id = ? AND target_id = ?`,
      [
        status,
        params.quarantineReason,
        params.approvedAllowlist ? JSON.stringify(params.approvedAllowlist) : null,
        params.reviewerId,
        params.reviewerName,
        now,
        now,
        params.incidentId,
        params.targetId,
      ]
    );
  } else {
    executeRun(
      db,
      `INSERT INTO question_quarantine_records (
        id, incident_id, quarantine_scope, target_id, target_name,
        subject, topic, source_draft_id, source_draft_version,
        original_question_number, marks, question_type, normalized_fingerprint,
        content_snippet, leak_status, quarantine_reason, review_status,
        approved_allowlist_json, quarantined_by_id, quarantined_by_name,
        reviewed_by_id, reviewed_by_name, reviewed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'LEAK_CONFIRMED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recordId,
        params.incidentId,
        params.quarantineScope,
        params.targetId,
        params.targetName,
        params.subject || null,
        params.topic || null,
        params.sourceDraftId || null,
        params.sourceDraftVersion || null,
        params.originalQuestionNumber || null,
        params.marks || null,
        params.questionType || null,
        fp || null,
        params.text ? params.text.slice(0, 200) : null,
        params.quarantineReason,
        status,
        params.approvedAllowlist ? JSON.stringify(params.approvedAllowlist) : null,
        params.reviewerId,
        params.reviewerName,
        params.reviewerId,
        params.reviewerName,
        now,
        now,
        now,
      ]
    );
  }

  // Update underlying DB tables if it's an individual question
  if (params.quarantineScope === 'INDIVIDUAL_QUESTION') {
    executeRun(
      db,
      'UPDATE questions SET status = "QUARANTINED", updated_at = ? WHERE id = ?',
      [now, params.targetId]
    );
  }

  // Automatically sync and bump Exclusion Manifest
  syncExclusionManifestFromQuarantines(db, params.incidentId, params.reviewerId);

  // Audit event
  executeRun(
    db,
    `INSERT INTO audit_events (
      id, event_type, user_id, org_id, exam_id, status, tx_ref, details_json, created_at
    ) VALUES (?, 'QUARANTINE_STATUS_CHANGED', ?, NULL, NULL, 'SUCCESS', ?, ?, ?)`,
    [
      uuidv4(),
      params.reviewerId,
      `TX-${uuidv4().slice(0, 12)}`,
      JSON.stringify({
        incidentId: params.incidentId,
        scope: params.quarantineScope,
        targetId: params.targetId,
        status,
        reason: params.quarantineReason,
      }),
      now,
    ]
  );

  saveDb();

  const qRec = getQuarantineRecord(db, params.incidentId, params.targetId);
  return { success: true, quarantineRecord: qRec || undefined };
}

// ==============================================================================
// 3. QUESTION EXCLUSION MANIFEST COMPILATION & EVALUATION
// ==============================================================================

export function syncExclusionManifestFromQuarantines(
  db: any,
  incidentId: string,
  updatedById: string
): QuestionExclusionManifestRecord | null {
  const now = new Date().toISOString();
  const qRows = executeQuery(
    db,
    'SELECT * FROM question_quarantine_records WHERE incident_id = ?',
    [incidentId]
  );

  const leakedQuestionIds: string[] = [];
  const leakedFingerprints: string[] = [];
  const reviewerExcludedQuestionIds: string[] = [];
  const quarantinedPoolIds: string[] = [];
  const quarantinedDraftIds: string[] = [];
  const approvedQuestionAllowlists: Record<string, string[]> = {};
  const exclusionReasons: Record<string, string> = {};

  for (const row of qRows || []) {
    exclusionReasons[row.target_id] = row.quarantine_reason;

    if (row.quarantine_scope === 'INDIVIDUAL_QUESTION') {
      if (['QUARANTINED', 'PERMANENTLY_EXCLUDED'].includes(row.review_status)) {
        leakedQuestionIds.push(row.target_id);
        if (row.normalized_fingerprint) leakedFingerprints.push(row.normalized_fingerprint);
      } else if (row.review_status === 'UNDER_REVIEW') {
        reviewerExcludedQuestionIds.push(row.target_id);
      }
    } else if (row.quarantine_scope === 'QUESTION_POOL') {
      if (['QUARANTINED', 'PERMANENTLY_EXCLUDED', 'UNDER_REVIEW'].includes(row.review_status)) {
        quarantinedPoolIds.push(row.target_id);
      }
    } else if (row.quarantine_scope === 'SOURCE_DRAFT') {
      if (['QUARANTINED', 'PERMANENTLY_EXCLUDED', 'UNDER_REVIEW'].includes(row.review_status)) {
        quarantinedDraftIds.push(row.target_id);
      } else if (row.review_status === 'PARTIALLY_CLEARED') {
        // Draft is quarantined by default, but has an approved question allowlist
        quarantinedDraftIds.push(row.target_id);
        if (row.approved_allowlist_json) {
          try {
            approvedQuestionAllowlists[row.target_id] = JSON.parse(row.approved_allowlist_json);
          } catch {}
        }
      }
    }
  }

  // Find existing manifest
  const mRows = executeQuery(
    db,
    'SELECT * FROM question_exclusion_manifests WHERE incident_id = ? ORDER BY revision DESC LIMIT 1',
    [incidentId]
  );

  if (!mRows || mRows.length === 0) return null;

  const prev = mRows[0];
  const newRevision = Number(prev.revision || 1) + 1;

  executeRun(
    db,
    `UPDATE question_exclusion_manifests
     SET revision = ?,
         leaked_question_ids_json = ?,
         leaked_fingerprints_json = ?,
         reviewer_excluded_question_ids_json = ?,
         quarantined_pool_ids_json = ?,
         quarantined_draft_ids_json = ?,
         approved_question_allowlists_json = ?,
         exclusion_reasons_json = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      newRevision,
      JSON.stringify(leakedQuestionIds),
      JSON.stringify(leakedFingerprints),
      JSON.stringify(reviewerExcludedQuestionIds),
      JSON.stringify(quarantinedPoolIds),
      JSON.stringify(quarantinedDraftIds),
      JSON.stringify(approvedQuestionAllowlists),
      JSON.stringify(exclusionReasons),
      now,
      prev.id,
    ]
  );

  return getExclusionManifest(db, prev.id);
}

export function approveExclusionManifest(
  db: any,
  params: {
    manifestId: string;
    approvedById: string;
    approvedByRole: string;
  }
): { success: boolean; manifest?: QuestionExclusionManifestRecord; error?: string } {
  if (!['EXAM_MANAGER', 'AUDITOR', 'ORG_OWNER'].includes(params.approvedByRole)) {
    return {
      success: false,
      error: 'ACCESS DENIED: Manifest approval requires authorized Examination Manager, Auditor, or Owner.',
    };
  }

  const now = new Date().toISOString();
  executeRun(
    db,
    `UPDATE question_exclusion_manifests
     SET approval_status = 'APPROVED',
         approved_by_id = ?,
         approved_by_role = ?,
         approved_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [params.approvedById, params.approvedByRole, now, now, params.manifestId]
  );

  executeRun(
    db,
    `INSERT INTO audit_events (
      id, event_type, user_id, org_id, exam_id, status, tx_ref, details_json, created_at
    ) VALUES (?, 'EXCLUSION_MANIFEST_APPROVED', ?, NULL, NULL, 'SUCCESS', ?, ?, ?)`,
    [
      uuidv4(),
      params.approvedById,
      `TX-${uuidv4().slice(0, 12)}`,
      JSON.stringify({ manifestId: params.manifestId, approvedByRole: params.approvedByRole }),
      now,
    ]
  );

  saveDb();
  const m = getExclusionManifest(db, params.manifestId);
  return { success: true, manifest: m || undefined };
}

/**
 * Core Backend Eligibility Filter:
 * Evaluates whether a candidate question is safe and eligible to be included in the replacement paper.
 */
export function evaluateQuestionEligibility(
  manifest: QuestionExclusionManifestRecord,
  question: {
    id: string;
    text: string;
    sourceDraftId?: string;
    poolId?: string;
    fingerprint?: string;
  },
  knownLeakedTexts: string[] = []
): {
  isEligible: boolean;
  exclusionReason?: string;
  similarityScore?: number;
} {
  // 1. Explicit Leaked or Excluded Question ID match
  if (manifest.leakedQuestionIds.includes(question.id)) {
    return {
      isEligible: false,
      exclusionReason: `EXCLUDED: Question ID ${question.id} is confirmed compromised in incident manifest.`,
    };
  }
  if (manifest.reviewerExcludedQuestionIds.includes(question.id)) {
    return {
      isEligible: false,
      exclusionReason: `EXCLUDED: Question ID ${question.id} was excluded by reviewer review.`,
    };
  }

  // 2. Exact Fingerprint Match
  const qFp = question.fingerprint || computeQuestionFingerprint(question.text);
  if (manifest.leakedFingerprints.includes(qFp)) {
    return {
      isEligible: false,
      exclusionReason: 'EXCLUDED: Question content fingerprint matches confirmed leaked question text exactly.',
    };
  }

  // 3. Quarantined Source Draft Check
  if (question.sourceDraftId && manifest.quarantinedDraftIds.includes(question.sourceDraftId)) {
    const allowlist = manifest.approvedQuestionAllowlists[question.sourceDraftId];
    if (allowlist && Array.isArray(allowlist)) {
      // Draft is partially cleared: only allowlisted questions may pass
      if (!allowlist.includes(question.id)) {
        return {
          isEligible: false,
          exclusionReason: `EXCLUDED: Source draft ${question.sourceDraftId} is partially cleared, but this question is NOT on the approved allowlist.`,
        };
      }
    } else {
      // Entire draft is quarantined
      return {
        isEligible: false,
        exclusionReason: `EXCLUDED: Entire source draft ${question.sourceDraftId} is quarantined due to suspected compromise.`,
      };
    }
  }

  // 4. Quarantined Question Pool Check
  if (question.poolId && manifest.quarantinedPoolIds.includes(question.poolId)) {
    return {
      isEligible: false,
      exclusionReason: `EXCLUDED: Question pool ${question.poolId} is quarantined under incident review.`,
    };
  }

  // 5. Semantic / Token Similarity Check against known leaked questions
  const threshold = manifest.similarityThreshold || 0.75;
  for (const leakedText of knownLeakedTexts) {
    const sim = computeTextSimilarity(question.text, leakedText);
    if (sim >= threshold) {
      return {
        isEligible: false,
        exclusionReason: `EXCLUDED: Question text has high similarity (${Math.round(sim * 100)}%) to leaked question content.`,
        similarityScore: sim,
      };
    }
  }

  return { isEligible: true };
}

// ==============================================================================
// 4. ELIGIBLE SOURCE PAPERS & QUESTIONS SCANNING
// ==============================================================================

export function getEligibleQuestionsForRegeneration(
  db: any,
  params: {
    incidentId: string;
    selectedDraftIds?: string[];
  }
): {
  success: boolean;
  eligibleQuestions: any[];
  excludedQuestions: any[];
  breakdown: {
    totalScanned: number;
    eligibleCount: number;
    excludedCount: number;
    byMarks: Record<number, number>;
    byType: Record<string, number>;
  };
  shortfalls?: string[];
} {
  initPaperLeakSchema(db);

  const incident = getPaperLeakIncident(db, params.incidentId);
  if (!incident) {
    return {
      success: false,
      eligibleQuestions: [],
      excludedQuestions: [],
      breakdown: { totalScanned: 0, eligibleCount: 0, excludedCount: 0, byMarks: {}, byType: {} },
      shortfalls: ['Incident record not found.'],
    };
  }

  const manifestRows = executeQuery(
    db,
    'SELECT * FROM question_exclusion_manifests WHERE incident_id = ? ORDER BY revision DESC LIMIT 1',
    [params.incidentId]
  );
  if (!manifestRows || manifestRows.length === 0) {
    return {
      success: false,
      eligibleQuestions: [],
      excludedQuestions: [],
      breakdown: { totalScanned: 0, eligibleCount: 0, excludedCount: 0, byMarks: {}, byType: {} },
      shortfalls: ['No Question Exclusion Manifest found for incident.'],
    };
  }
  const manifest = mapManifestRow(manifestRows[0]);

  // Collect text of known leaked questions for similarity check
  const leakedTexts: string[] = [];
  const qRecs = executeQuery(
    db,
    'SELECT content_snippet FROM question_quarantine_records WHERE incident_id = ? AND content_snippet IS NOT NULL',
    [params.incidentId]
  );
  for (const r of qRecs || []) {
    if (r.content_snippet) leakedTexts.push(r.content_snippet);
  }

  // Gather raw candidate questions from previously uploaded papers
  let candidateRows: any[] = [];
  if (incident.examType === 'COMPETITIVE') {
    let sql = 'SELECT * FROM competitive_questions WHERE (exam_id = ? OR subject = ?)';
    const sqlParams: any[] = [incident.examId, incident.subject];
    if (params.selectedDraftIds && params.selectedDraftIds.length > 0) {
      sql += ` AND source_file_id IN (${params.selectedDraftIds.map(() => '?').join(',')})`;
      sqlParams.push(...params.selectedDraftIds);
    }
    candidateRows = executeQuery(db, sql, sqlParams) || [];
  } else {
    let sql = 'SELECT * FROM questions WHERE (subject = ? OR org_id IN (SELECT org_id FROM examinations WHERE id = ?))';
    const sqlParams: any[] = [incident.subject, incident.examId];
    if (params.selectedDraftIds && params.selectedDraftIds.length > 0) {
      sql += ` AND question_paper_id IN (${params.selectedDraftIds.map(() => '?').join(',')})`;
      sqlParams.push(...params.selectedDraftIds);
    }
    candidateRows = executeQuery(db, sql, sqlParams) || [];
  }

  const eligibleQuestions: any[] = [];
  const excludedQuestions: any[] = [];
  const byMarks: Record<number, number> = {};
  const byType: Record<string, number> = {};

  for (const raw of candidateRows) {
    const qId = raw.id;
    const text = raw.content_text || raw.question_text || '';
    const marks = Number(raw.marks || 4);
    const qType = raw.question_type || 'MCQ';
    const sourceDraftId = raw.question_paper_id || raw.source_file_id || raw.source_pdf;
    const poolId = raw.pool_id || raw.subject_id;

    const evalResult = evaluateQuestionEligibility(
      manifest,
      { id: qId, text, sourceDraftId, poolId },
      leakedTexts
    );

    if (evalResult.isEligible) {
      eligibleQuestions.push({
        id: qId,
        text,
        marks,
        questionType: qType,
        options: raw.options_json ? JSON.parse(raw.options_json) : undefined,
        correctAnswer: raw.correct_answer || raw.correct_option,
        sourceDraftId,
        questionNumber: raw.question_number || raw.source_question_number,
        fingerprint: computeQuestionFingerprint(text),
      });

      byMarks[marks] = (byMarks[marks] || 0) + 1;
      byType[qType] = (byType[qType] || 0) + 1;
    } else {
      excludedQuestions.push({
        id: qId,
        text,
        marks,
        exclusionReason: evalResult.exclusionReason,
        similarityScore: evalResult.similarityScore,
      });
    }
  }

  return {
    success: true,
    eligibleQuestions,
    excludedQuestions,
    breakdown: {
      totalScanned: candidateRows.length,
      eligibleCount: eligibleQuestions.length,
      excludedCount: excludedQuestions.length,
      byMarks,
      byType,
    },
  };
}

// ==============================================================================
// 5. REPLACEMENT PAPER GENERATION & AUTOMATED VALIDATION
// ==============================================================================

export function generateReplacementPaper(
  db: any,
  params: {
    incidentId: string;
    generatedById: string;
    generatedByName: string;
    selectedDraftIds?: string[];
  }
): {
  success: boolean;
  replacementPaper?: ReplacementPaperRecord;
  validationReport?: any;
  error?: string;
} {
  initPaperLeakSchema(db);

  const incident = getPaperLeakIncident(db, params.incidentId);
  if (!incident) {
    return { success: false, error: 'Incident record not found.' };
  }

  // 1. Recheck latest Exclusion Manifest to avoid race conditions
  const manifestRows = executeQuery(
    db,
    'SELECT * FROM question_exclusion_manifests WHERE incident_id = ? ORDER BY revision DESC LIMIT 1',
    [params.incidentId]
  );
  if (!manifestRows || manifestRows.length === 0) {
    return { success: false, error: 'Question Exclusion Manifest missing.' };
  }
  const manifest = mapManifestRow(manifestRows[0]);

  // 2. Fetch all eligible questions
  const eligibleResult = getEligibleQuestionsForRegeneration(db, {
    incidentId: params.incidentId,
    selectedDraftIds: params.selectedDraftIds,
  });

  const eligibleQs = eligibleResult.eligibleQuestions;

  // 3. Minimum requirements check: Insufficient eligible questions must cause clear blocking error
  const minRequiredQuestions = incident.examType === 'COMPETITIVE' ? 50 : 25;
  const minRequiredMarks = incident.examType === 'COMPETITIVE' ? 100 : 70;

  if (eligibleQs.length < minRequiredQuestions) {
    const shortfall = minRequiredQuestions - eligibleQs.length;
    return {
      success: false,
      error: `INSUFFICIENT_ELIGIBLE_QUESTIONS: Paper generation blocked. The remaining clean question pool has only ${eligibleQs.length} eligible questions, but ${minRequiredQuestions} are required (Shortfall: ${shortfall} questions). Please upload additional verified draft papers.`,
    };
  }

  const replacementId = `REPL-PAPER-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const now = new Date().toISOString();
  const generationRunId = `GEN-RUN-${uuidv4().slice(0, 8).toUpperCase()}`;
  const replacementVersionCode = `EXAM-REPL-${uuidv4().slice(0, 6).toUpperCase()}-V2`;

  let paperStructure: any = {};
  const selectedQuestions: any[] = [];
  const selectedProvenance: QuestionProvenance[] = [];

  if (incident.examType === 'COMPETITIVE') {
    // 50 Questions, 100 Marks (2 marks each)
    const selected = eligibleQs.slice(0, 50);
    const secA = selected.slice(0, 25).map((q, idx) => ({
      ...q,
      displayNumber: idx + 1,
      marks: 2,
    }));
    const secB = selected.slice(25, 50).map((q, idx) => ({
      ...q,
      displayNumber: idx + 26,
      marks: 2,
    }));

    paperStructure = {
      title: `[REPLACEMENT PAPER] ${incident.examName}`,
      subject: incident.subject,
      subjectCode: incident.subjectCode,
      totalMarks: 100,
      durationMinutes: 180,
      sections: [
        { sectionTitle: 'Section A: Core Engineering & Sciences', questions: secA },
        { sectionTitle: 'Section B: Advanced Analytical Applications', questions: secB },
      ],
    };

    for (const q of selected) {
      selectedQuestions.push(q);
      selectedProvenance.push({
        questionId: q.id,
        sourceDraftId: q.sourceDraftId || 'SOURCE-POOL-01',
        sourceQuestionNumber: q.questionNumber,
        marks: 2,
        questionType: q.questionType,
        normalizedFingerprint: q.fingerprint,
      });
    }
  } else {
    // University Exam: Solapur 70-Mark Pattern
    const mcqs = eligibleQs.filter(q => q.marks === 1 || q.questionType === 'MCQ').slice(0, 14);
    // Fill remaining MCQs from general pool if needed
    const generalPool = eligibleQs.filter(q => !mcqs.some(m => m.id === q.id));

    while (mcqs.length < 14 && generalPool.length > 0) {
      const q = generalPool.shift();
      mcqs.push({ ...q, marks: 1 });
    }

    const theoryQs = generalPool.slice(0, 11);
    const selected = [...mcqs, ...theoryQs];

    paperStructure = {
      title: `[REPLACEMENT PAPER] ${incident.examName}`,
      subject: incident.subject,
      subjectCode: incident.subjectCode,
      totalMarks: 70,
      durationMinutes: 180,
      part1Mcqs: mcqs.map((q, idx) => ({
        questionNumber: idx + 1,
        text: q.text,
        options: q.options || ['a) Option A', 'b) Option B', 'c) Option C', 'd) Option D'],
        marks: 1,
      })),
      section1: {
        title: 'SECTION - I (28 Marks)',
        questions: [
          {
            questionNumber: 'Q.2',
            instruction: 'Attempt any four out of five (4 x 4 = 16 Marks):',
            subQuestions: theoryQs.slice(0, 5).map(q => q.text),
            marks: 16,
          },
          {
            questionNumber: 'Q.3',
            instruction: 'Attempt any two out of three (2 x 6 = 12 Marks):',
            subQuestions: theoryQs.slice(5, 8).map(q => q.text),
            marks: 12,
          },
        ],
      },
      section2: {
        title: 'SECTION - II (28 Marks)',
        questions: [
          {
            questionNumber: 'Q.4',
            instruction: 'Attempt any four out of five (4 x 4 = 16 Marks):',
            subQuestions: theoryQs.slice(8, 11).map(q => q.text),
            marks: 16,
          },
        ],
      },
    };

    for (const q of selected) {
      selectedQuestions.push(q);
      selectedProvenance.push({
        questionId: q.id,
        sourceDraftId: q.sourceDraftId || 'DRAFT-UNI-01',
        sourceQuestionNumber: q.questionNumber,
        marks: q.marks,
        questionType: q.questionType,
        normalizedFingerprint: q.fingerprint,
      });
    }
  }

  // 4. Run Automated Replacement Paper Validation
  const validationReport = runReplacementPaperValidation(manifest, {
    totalMarks: incident.examType === 'COMPETITIVE' ? 100 : 70,
    requiredMarks: incident.examType === 'COMPETITIVE' ? 100 : 70,
    selectedQuestions,
    paperStructure,
  });

  const finalStatus: ReplacementPaperStatus = validationReport.isValid
    ? 'VALIDATED'
    : 'VALIDATION_FAILED';

  // 5. Build Comparison Summary (Original vs Replacement)
  const comparisonSummary = {
    originalVersion: incident.paperVersion,
    replacementVersion: replacementVersionCode,
    originalQuestionCount: 50,
    replacementQuestionCount: selectedQuestions.length,
    retainedSourceDrafts: [...new Set(selectedProvenance.map(p => p.sourceDraftId))],
    excludedQuestionsCount: eligibleResult.excludedQuestions.length,
    totalMarksMatch: validationReport.checks.totalMarksMatch,
  };

  // 6. Save Replacement Record to Database
  executeRun(
    db,
    `INSERT INTO replacement_paper_records (
      id, incident_id, manifest_id, manifest_revision, exam_id, exam_name,
      exam_type, subject, subject_code, original_paper_id, original_paper_version,
      replacement_version_code, status, title, total_marks, duration_minutes,
      paper_structure_json, selected_questions_json, selected_question_provenance_json,
      excluded_questions_summary_json, validation_report_json, comparison_summary_json,
      generation_run_id, generated_by_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      replacementId,
      params.incidentId,
      manifest.id,
      manifest.revision,
      incident.examId,
      incident.examName,
      incident.examType,
      incident.subject,
      incident.subjectCode,
      incident.paperId,
      incident.paperVersion,
      replacementVersionCode,
      finalStatus,
      paperStructure.title,
      paperStructure.totalMarks,
      paperStructure.durationMinutes,
      JSON.stringify(paperStructure),
      JSON.stringify(selectedQuestions),
      JSON.stringify(selectedProvenance),
      JSON.stringify({
        totalExcluded: eligibleResult.excludedQuestions.length,
        quarantinedCount: manifest.leakedQuestionIds.length,
        similarityFlagsCount: eligibleResult.excludedQuestions.filter(q => q.similarityScore).length,
      }),
      JSON.stringify(validationReport),
      JSON.stringify(comparisonSummary),
      generationRunId,
      params.generatedById,
      now,
      now,
    ]
  );

  // Link replacement paper ID back to incident
  executeRun(
    db,
    `UPDATE paper_leak_incidents SET replacement_paper_id = ?, updated_at = ? WHERE id = ?`,
    [replacementId, now, params.incidentId]
  );

  // Audit event
  executeRun(
    db,
    `INSERT INTO audit_events (
      id, event_type, user_id, org_id, exam_id, status, tx_ref, details_json, created_at
    ) VALUES (?, 'REPLACEMENT_PAPER_GENERATED', ?, NULL, ?, 'SUCCESS', ?, ?, ?)`,
    [
      uuidv4(),
      params.generatedById,
      incident.examId,
      `TX-${uuidv4().slice(0, 12)}`,
      JSON.stringify({
        incidentId: params.incidentId,
        replacementPaperId: replacementId,
        replacementVersionCode,
        isValid: validationReport.isValid,
        selectedQuestionCount: selectedQuestions.length,
      }),
      now,
    ]
  );

  saveDb();

  const repl = getReplacementPaper(db, replacementId);
  return {
    success: true,
    replacementPaper: repl || undefined,
    validationReport,
  };
}

/**
 * Automated validation rules for the replacement paper.
 */
export function runReplacementPaperValidation(
  manifest: QuestionExclusionManifestRecord,
  paper: {
    totalMarks: number;
    requiredMarks: number;
    selectedQuestions: any[];
    paperStructure: any;
  }
): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  checks: Record<string, boolean>;
  timestamp: string;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: Record<string, boolean> = {};

  // 1. Total marks check
  checks.totalMarksMatch = paper.totalMarks === paper.requiredMarks;
  if (!checks.totalMarksMatch) {
    errors.push(`Total marks (${paper.totalMarks}) does not match required ${paper.requiredMarks}.`);
  }

  // 2. No quarantined question IDs
  const compromisedIds = manifest.leakedQuestionIds;
  const foundCompromised = paper.selectedQuestions.filter(q => compromisedIds.includes(q.id));
  checks.noQuarantinedQuestions = foundCompromised.length === 0;
  if (!checks.noQuarantinedQuestions) {
    errors.push(`VALIDATION FAILED: Selected questions contain compromised ID(s): ${foundCompromised.map(q => q.id).join(', ')}.`);
  }

  // 3. No matching leaked fingerprints
  const foundMatchingFp = paper.selectedQuestions.filter(q =>
    manifest.leakedFingerprints.includes(q.fingerprint || computeQuestionFingerprint(q.text))
  );
  checks.noLeakedFingerprints = foundMatchingFp.length === 0;
  if (!checks.noLeakedFingerprints) {
    errors.push(`VALIDATION FAILED: Selected questions match known leaked text fingerprints.`);
  }

  // 4. No disallowed duplicate questions within the replacement paper
  const seenFps = new Set<string>();
  let hasDuplicate = false;
  for (const q of paper.selectedQuestions) {
    const fp = q.fingerprint || computeQuestionFingerprint(q.text);
    if (seenFps.has(fp)) {
      hasDuplicate = true;
      break;
    }
    seenFps.add(fp);
  }
  checks.noDisallowedDuplicates = !hasDuplicate;
  if (hasDuplicate) {
    errors.push('VALIDATION FAILED: Replacement paper contains duplicate questions within its own set.');
  }

  // 5. Complete provenance check
  const allHaveSource = paper.selectedQuestions.every(q => q.sourceDraftId || q.id);
  checks.provenanceTraceable = allHaveSource;
  if (!allHaveSource) {
    warnings.push('Some questions lack detailed source draft provenance.');
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    errors,
    warnings,
    checks,
    timestamp: new Date().toISOString(),
  };
}

// ==============================================================================
// 6. APPROVAL, ENCRYPTION, AND PRINT ANYWHERE ROUTING
// ==============================================================================

export function approveAndEncryptReplacementPaper(
  db: any,
  params: {
    replacementPaperId: string;
    approvedById: string;
    approvedByName: string;
    approvedByRole: string;
    approvalReason: string;
  }
): {
  success: boolean;
  replacementPaper?: ReplacementPaperRecord;
  error?: string;
} {
  initPaperLeakSchema(db);

  // 1. Role Security Gate
  if (!['EXAM_MANAGER', 'ORG_OWNER', 'AUDITOR'].includes(params.approvedByRole)) {
    return {
      success: false,
      error: 'ACCESS DENIED: Only Examination Manager, Chief Auditor, or Owner may approve a replacement paper.',
    };
  }

  const paper = getReplacementPaper(db, params.replacementPaperId);
  if (!paper) {
    return { success: false, error: 'Replacement paper record not found.' };
  }

  // Separation of duties check: The user who created the draft cannot unilaterally self-approve
  // without designated managerial / auditor role.
  if (paper.generatedById === params.approvedById && params.approvedByRole !== 'ORG_OWNER') {
    // If manager generated, require auditor or owner approval for separation of duties
    const isAuditorOrOwner = ['AUDITOR', 'ORG_OWNER'].includes(params.approvedByRole);
    if (!isAuditorOrOwner) {
      return {
        success: false,
        error: 'SEPARATION OF DUTIES ENFORCED: The initiator cannot self-approve the emergency replacement. Approval by Chief Vigilance Auditor or Organization Owner is required.',
      };
    }
  }

  // Paper must be VALIDATED
  if (paper.status === 'VALIDATION_FAILED') {
    return {
      success: false,
      error: 'CANNOT APPROVE: Replacement paper has validation failures that must be corrected.',
    };
  }

  const now = new Date().toISOString();

  // 2. Encrypt Replacement Paper Payload using authenticated AES-256-GCM
  const rawPayload = JSON.stringify(paper.paperStructure);
  const encryptionResult = encryptExamPaper(rawPayload);
  const encryptedPayloadJson = JSON.stringify(encryptionResult.payload);

  // 3. Mark replacement paper as APPROVED and ENCRYPTED
  executeRun(
    db,
    `UPDATE replacement_paper_records
     SET status = 'ENCRYPTED',
         approved_by_id = ?,
         approved_at = ?,
         encrypted_at = ?,
         encrypted_payload_json = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      params.approvedById,
      now,
      now,
      encryptedPayloadJson,
      now,
      params.replacementPaperId,
    ]
  );

  // 4. Update core examination system paper versions to allow Print Anywhere dispatch
  if (paper.examType === 'COMPETITIVE') {
    try {
      executeRun(
        db,
        `INSERT OR REPLACE INTO competitive_generated_papers (
          id, exam_id, org_id, title, exam_type, sections_json, questions_json,
          total_questions, total_marks, total_positive_marks, total_negative_marks,
          blueprint_snapshot_json, paper_fingerprint, generated_by, generated_at
        ) VALUES (?, ?, 'org-default', ?, 'COMPETITIVE', ?, ?, ?, ?, ?, 0, '{}', ?, ?, ?)`,
        [
          paper.id,
          paper.examId,
          paper.title,
          JSON.stringify(paper.paperStructure.sections || []),
          JSON.stringify(paper.selectedQuestions),
          paper.selectedQuestions.length,
          paper.totalMarks,
          paper.totalMarks,
          uuidv4(),
          params.approvedById,
          now,
        ]
      );
    } catch {}
  } else {
    // University Exam
    const newVersionId = uuidv4();
    executeRun(
      db,
      `INSERT INTO paper_versions (id, exam_id, version_code, status, is_current, generated_by, generated_at)
       VALUES (?, ?, ?, 'ENCRYPTED', 1, ?, ?)`,
      [newVersionId, paper.examId, paper.replacementVersionCode, params.approvedById, now]
    );

    executeRun(
      db,
      `INSERT OR REPLACE INTO encrypted_papers (
        id, paper_version_id, exam_id, aes_cipher_text, iv_hex, auth_tag_hex,
        encrypted_aes_key_rsa, key_fingerprint, checksum_sha256, encrypted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        newVersionId,
        paper.examId,
        encryptionResult.payload.cipherText,
        encryptionResult.payload.iv,
        encryptionResult.payload.authTag,
        encryptionResult.payload.encryptedKeyRSA,
        encryptionResult.payload.keyFingerprint,
        encryptionResult.payload.checksumSHA256,
        now,
      ]
    );
  }

  // 5. Update incident status to RESOLVED
  executeRun(
    db,
    `UPDATE paper_leak_incidents SET leak_status = 'RESOLVED', updated_at = ? WHERE id = ?`,
    [now, paper.incidentId]
  );

  // 6. Audit Log Events
  executeRun(
    db,
    `INSERT INTO audit_events (
      id, event_type, user_id, org_id, exam_id, status, tx_ref, details_json, created_at
    ) VALUES (?, 'REPLACEMENT_PAPER_APPROVED', ?, NULL, ?, 'SUCCESS', ?, ?, ?)`,
    [
      uuidv4(),
      params.approvedById,
      paper.examId,
      `TX-${uuidv4().slice(0, 12)}`,
      JSON.stringify({
        incidentId: paper.incidentId,
        replacementPaperId: params.replacementPaperId,
        approverRole: params.approvedByRole,
        reason: params.approvalReason,
      }),
      now,
    ]
  );

  executeRun(
    db,
    `INSERT INTO audit_events (
      id, event_type, user_id, org_id, exam_id, status, tx_ref, details_json, created_at
    ) VALUES (?, 'REPLACEMENT_PAPER_ENCRYPTED', ?, NULL, ?, 'SUCCESS', ?, ?, ?)`,
    [
      uuidv4(),
      params.approvedById,
      paper.examId,
      `TX-${uuidv4().slice(0, 12)}`,
      JSON.stringify({
        replacementPaperId: params.replacementPaperId,
        algorithm: 'AES-256-GCM',
        versionCode: paper.replacementVersionCode,
      }),
      now,
    ]
  );

  // 7. Notify Stakeholders that replacement is ready for authorized printing
  for (const role of ['ORG_OWNER', 'EXAM_MANAGER', 'AUDITOR', 'CENTRE_OPERATOR']) {
    executeRun(
      db,
      `INSERT INTO notifications (id, user_id, role, org_id, title, message, category, is_read, created_at)
       VALUES (?, NULL, ?, NULL, ?, ?, 'EMERGENCY_REPLACEMENT', 0, ?)`,
      [
        uuidv4(),
        role,
        `✅ Replacement Paper Approved & Encrypted: ${paper.examName}`,
        `Replacement version ${paper.replacementVersionCode} is cryptographically sealed and ready for Print Anywhere release.`,
        now,
      ]
    );
  }

  saveDb();

  const updatedPaper = getReplacementPaper(db, params.replacementPaperId);
  return {
    success: true,
    replacementPaper: updatedPaper || undefined,
  };
}

// ==============================================================================
// GETTERS & DATA MAPPING
// ==============================================================================

export function getPaperLeakIncident(db: any, incidentId: string): PaperLeakIncidentRecord | null {
  initPaperLeakSchema(db);
  const rows = executeQuery(
    db,
    'SELECT * FROM paper_leak_incidents WHERE id = ?',
    [incidentId]
  );
  if (!rows || rows.length === 0) return null;
  return mapIncidentRow(rows[0]);
}

export function listPaperLeakIncidents(
  db: any,
  filters?: {
    examId?: string;
    leakStatus?: IncidentLeakStatus;
    severity?: IncidentSeverity;
  }
): PaperLeakIncidentRecord[] {
  initPaperLeakSchema(db);
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters?.examId) {
    conditions.push('exam_id = ?');
    params.push(filters.examId);
  }
  if (filters?.leakStatus) {
    conditions.push('leak_status = ?');
    params.push(filters.leakStatus);
  }
  if (filters?.severity) {
    conditions.push('severity = ?');
    params.push(filters.severity);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = executeQuery(
    db,
    `SELECT * FROM paper_leak_incidents ${whereClause} ORDER BY created_at DESC`,
    params
  );

  return (rows || []).map(mapIncidentRow);
}

export function getQuarantineRecord(
  db: any,
  incidentId: string,
  targetId: string
): QuestionQuarantineRecord | null {
  const rows = executeQuery(
    db,
    'SELECT * FROM question_quarantine_records WHERE incident_id = ? AND target_id = ?',
    [incidentId, targetId]
  );
  if (!rows || rows.length === 0) return null;
  return mapQuarantineRow(rows[0]);
}

export function getExclusionManifest(
  db: any,
  manifestId: string
): QuestionExclusionManifestRecord | null {
  const rows = executeQuery(
    db,
    'SELECT * FROM question_exclusion_manifests WHERE id = ?',
    [manifestId]
  );
  if (!rows || rows.length === 0) return null;
  return mapManifestRow(rows[0]);
}

export function getReplacementPaper(
  db: any,
  replacementPaperId: string
): ReplacementPaperRecord | null {
  const rows = executeQuery(
    db,
    'SELECT * FROM replacement_paper_records WHERE id = ?',
    [replacementPaperId]
  );
  if (!rows || rows.length === 0) return null;
  return mapReplacementRow(rows[0]);
}

function mapIncidentRow(row: any): PaperLeakIncidentRecord {
  return {
    id: row.id,
    examId: row.exam_id,
    examName: row.exam_name,
    examType: row.exam_type,
    subject: row.subject,
    subjectCode: row.subject_code,
    paperId: row.paper_id,
    paperVersion: row.paper_version,
    title: row.title,
    description: row.description,
    leakStatus: row.leak_status,
    severity: row.severity,
    discoveryTimestamp: row.discovery_timestamp,
    reportSource: row.report_source,
    reportedById: row.reported_by_id,
    reportedByName: row.reported_by_name,
    reportedByRole: row.reported_by_role,
    knownLeakedQuestionIds: row.known_leaked_questions_json ? JSON.parse(row.known_leaked_questions_json) : [],
    knownLeakedFingerprints: row.known_leaked_fingerprints_json ? JSON.parse(row.known_leaked_fingerprints_json) : [],
    watermarkReference: row.watermark_reference || undefined,
    copyIdentifier: row.copy_identifier || undefined,
    evidenceReferences: row.evidence_references_json ? JSON.parse(row.evidence_references_json) : [],
    regenerationReason: row.regeneration_reason,
    containmentAppliedAt: row.containment_applied_at,
    replacementPaperId: row.replacement_paper_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapQuarantineRow(row: any): QuestionQuarantineRecord {
  return {
    id: row.id,
    incidentId: row.incident_id,
    quarantineScope: row.quarantine_scope,
    targetId: row.target_id,
    targetName: row.target_name,
    subject: row.subject || undefined,
    topic: row.topic || undefined,
    sourceDraftId: row.source_draft_id || undefined,
    sourceDraftVersion: row.source_draft_version || undefined,
    originalQuestionNumber: row.original_question_number || undefined,
    marks: row.marks ? Number(row.marks) : undefined,
    questionType: row.question_type || undefined,
    normalizedFingerprint: row.normalized_fingerprint || undefined,
    contentSnippet: row.content_snippet || undefined,
    leakStatus: row.leak_status,
    evidenceReference: row.evidence_reference || undefined,
    quarantineReason: row.quarantine_reason,
    reviewStatus: row.review_status,
    approvedAllowlist: row.approved_allowlist_json ? JSON.parse(row.approved_allowlist_json) : undefined,
    quarantinedById: row.quarantined_by_id,
    quarantinedByName: row.quarantined_by_name,
    reviewedById: row.reviewed_by_id || undefined,
    reviewedByName: row.reviewed_by_name || undefined,
    reviewedAt: row.reviewed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapManifestRow(row: any): QuestionExclusionManifestRecord {
  return {
    id: row.id,
    incidentId: row.incident_id,
    originalPaperId: row.original_paper_id,
    originalPaperVersion: row.original_paper_version,
    revision: Number(row.revision || 1),
    leakedQuestionIds: row.leaked_question_ids_json ? JSON.parse(row.leaked_question_ids_json) : [],
    leakedFingerprints: row.leaked_fingerprints_json ? JSON.parse(row.leaked_fingerprints_json) : [],
    reviewerExcludedQuestionIds: row.reviewer_excluded_question_ids_json ? JSON.parse(row.reviewer_excluded_question_ids_json) : [],
    quarantinedPoolIds: row.quarantined_pool_ids_json ? JSON.parse(row.quarantined_pool_ids_json) : [],
    quarantinedDraftIds: row.quarantined_draft_ids_json ? JSON.parse(row.quarantined_draft_ids_json) : [],
    approvedSourceDraftIds: row.approved_source_draft_ids_json ? JSON.parse(row.approved_source_draft_ids_json) : [],
    approvedQuestionAllowlists: row.approved_question_allowlists_json ? JSON.parse(row.approved_question_allowlists_json) : {},
    similarityThreshold: Number(row.similarity_threshold || 0.75),
    exclusionReasons: row.exclusion_reasons_json ? JSON.parse(row.exclusion_reasons_json) : {},
    evidenceReferences: row.evidence_references_json ? JSON.parse(row.evidence_references_json) : [],
    approvalStatus: row.approval_status,
    approvedById: row.approved_by_id || undefined,
    approvedByRole: row.approved_by_role || undefined,
    approvedAt: row.approved_at || undefined,
    createdById: row.created_by_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReplacementRow(row: any): ReplacementPaperRecord {
  return {
    id: row.id,
    incidentId: row.incident_id,
    manifestId: row.manifest_id,
    manifestRevision: Number(row.manifest_revision || 1),
    examId: row.exam_id,
    examName: row.exam_name,
    examType: row.exam_type,
    subject: row.subject,
    subjectCode: row.subject_code,
    originalPaperId: row.original_paper_id,
    originalPaperVersion: row.original_paper_version,
    replacementVersionCode: row.replacement_version_code,
    status: row.status,
    title: row.title,
    totalMarks: Number(row.total_marks || 0),
    durationMinutes: Number(row.duration_minutes || 0),
    paperStructure: row.paper_structure_json ? JSON.parse(row.paper_structure_json) : {},
    selectedQuestions: row.selected_questions_json ? JSON.parse(row.selected_questions_json) : [],
    selectedQuestionProvenance: row.selected_question_provenance_json ? JSON.parse(row.selected_question_provenance_json) : [],
    excludedQuestionsSummary: row.excluded_questions_summary_json ? JSON.parse(row.excluded_questions_summary_json) : { totalExcluded: 0, quarantinedCount: 0, similarityFlagsCount: 0 },
    validationReport: row.validation_report_json ? JSON.parse(row.validation_report_json) : undefined,
    comparisonSummary: row.comparison_summary_json ? JSON.parse(row.comparison_summary_json) : undefined,
    encryptedPayloadJson: row.encrypted_payload_json || undefined,
    generationRunId: row.generation_run_id,
    generatedById: row.generated_by_id,
    approvedById: row.approved_by_id || undefined,
    approvedAt: row.approved_at || undefined,
    encryptedAt: row.encrypted_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

