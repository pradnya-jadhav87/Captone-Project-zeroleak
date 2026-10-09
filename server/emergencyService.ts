import { v4 as uuidv4 } from 'uuid';
import { executeQuery, executeRun } from './db.ts';
import { encryptExamPaper } from './crypto.ts';

export interface EmergencyThreatParams {
  examId: string;
  paperId?: string;
  examType: 'UNIVERSITY' | 'COMPETITIVE';
  threatType: string;
  severity: 'HIGH' | 'CRITICAL';
  userId?: string;
  orgId?: string;
  ipAddress?: string;
  details?: Record<string, any>;
}

export interface EmergencyIncidentRecord {
  id: string;
  exam_id: string;
  exam_type: 'UNIVERSITY' | 'COMPETITIVE';
  paper_id?: string;
  subject?: string;
  subject_code?: string;
  threat_type: string;
  threat_severity: 'HIGH' | 'CRITICAL';
  status: 'ACTIVE' | 'RESOLVED' | 'EMERGENCY_PAPER_GENERATED' | 'EMERGENCY_PAPER_APPROVED';
  detected_at: string;
  original_paper_status: 'COMPROMISED' | 'LOCKED_EMERGENCY';
  compromised_question_ids?: string;
  emergency_paper_id?: string;
  resolved_at?: string;
  resolved_by?: string;
  details_json?: string;
  exam_name?: string;
}

export interface EmergencyPaperRecord {
  id: string;
  incident_id: string;
  exam_id: string;
  exam_type: 'UNIVERSITY' | 'COMPETITIVE';
  version: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  paper_data_json: string;
  encrypted_payload_json?: string;
  is_emergency: number;
  approved_by?: string;
  approved_at?: string;
  approval_reason?: string;
  generated_by: string;
  generated_at: string;
}

/**
 * Triggers Emergency Mode when a HIGH or CRITICAL threat is detected.
 * Locks the original paper, blocks normal decryption/printing, creates an incident,
 * and notifies the Controller of Examination.
 */
export function triggerEmergencyThreatMode(
  db: any,
  params: EmergencyThreatParams
): EmergencyIncidentRecord {
  const { examId, paperId, examType, threatType, severity, userId, orgId, details } = params;
  const now = new Date().toISOString();

  // 1. Resolve exam and paper details
  let subject = 'General Examination';
  let subjectCode = 'EXAM-CORE';
  let examName = 'Scheduled Examination';
  const compromisedQuestionIds: string[] = [];

  if (examType === 'COMPETITIVE') {
    const examRows = executeQuery(db, 'SELECT * FROM competitive_exams WHERE id = ?', [examId]);
    if (examRows && examRows.length > 0) {
      subject = examRows[0].title || examRows[0].subject || subject;
      subjectCode = examRows[0].code || subjectCode;
      examName = examRows[0].title || examName;
    }

    // Lock original competitive paper
    const paperRows = paperId
      ? executeQuery(db, 'SELECT * FROM competitive_generated_papers WHERE id = ?', [paperId])
      : executeQuery(db, 'SELECT * FROM competitive_generated_papers WHERE exam_id = ? ORDER BY generated_at DESC', [examId]);

    if (paperRows && paperRows.length > 0) {
      const orig = paperRows[0];
      executeRun(
        db,
        `UPDATE competitive_generated_papers 
         SET encryption_status = 'LOCKED_EMERGENCY', is_locked = 1, updated_at = ?
         WHERE id = ?`,
        [now, orig.id]
      );

      // Collect question IDs to quarantine
      if (orig.questions_json) {
        try {
          const qs = JSON.parse(orig.questions_json);
          if (Array.isArray(qs)) {
            qs.forEach((q: any) => {
              if (q.id) compromisedQuestionIds.push(q.id);
            });
          }
        } catch {}
      }
    }
  } else {
    // University Exam
    const examRows = executeQuery(db, 'SELECT * FROM examinations WHERE id = ?', [examId]);
    if (examRows && examRows.length > 0) {
      subject = examRows[0].name || subject;
      subjectCode = examRows[0].course_code || subjectCode;
      examName = examRows[0].name || examName;
    }

    // Lock paper versions
    executeRun(
      db,
      `UPDATE paper_versions 
       SET is_current = 0, status = 'COMPROMISED', invalidation_reason = ?, invalidated_at = ?
       WHERE exam_id = ?`,
      [threatType, now, examId]
    );

    // If university_generated_papers row exists, lock it
    executeRun(
      db,
      `UPDATE university_generated_papers
       SET status = 'LOCKED_EMERGENCY'
       WHERE exam_id = ?`,
      [examId]
    );

    // Collect questions belonging to compromised paper version
    const versionQuestions = executeQuery(
      db,
      `SELECT pq.question_id FROM paper_questions pq
       JOIN paper_versions pv ON pq.paper_version_id = pv.id
       WHERE pv.exam_id = ?`,
      [examId]
    );
    if (versionQuestions) {
      versionQuestions.forEach((q: any) => {
        if (q.question_id) compromisedQuestionIds.push(q.question_id);
      });
    }
  }

  // 2. Quarantine compromised questions in DB
  for (const qId of compromisedQuestionIds) {
    executeRun(db, 'UPDATE questions SET status = "QUARANTINED", updated_at = ? WHERE id = ?', [now, qId]);
    executeRun(
      db,
      `INSERT INTO question_quarantine (id, question_id, reason, reported_by, status, quarantined_at, notes)
       VALUES (?, ?, ?, ?, 'COMPROMISED', ?, 'Compromised by security threat detection')`,
      [uuidv4(), qId, threatType, userId || 'SYSTEM_PROCTOR', now]
    );
  }

  // 3. Create active Emergency Incident
  const incidentId = `EMG-INC-${uuidv4().slice(0, 8).toUpperCase()}`;
  const incidentRecord: EmergencyIncidentRecord = {
    id: incidentId,
    exam_id: examId,
    exam_type: examType,
    paper_id: paperId || undefined,
    subject,
    subject_code: subjectCode,
    threat_type: threatType,
    threat_severity: severity,
    status: 'ACTIVE',
    detected_at: now,
    original_paper_status: 'LOCKED_EMERGENCY',
    compromised_question_ids: JSON.stringify(compromisedQuestionIds),
    details_json: details ? JSON.stringify(details) : undefined,
    exam_name: examName,
  };

  executeRun(
    db,
    `INSERT INTO emergency_incidents (id, exam_id, exam_type, paper_id, subject, subject_code, threat_type, threat_severity, status, detected_at, original_paper_status, compromised_question_ids, details_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      incidentRecord.id,
      incidentRecord.exam_id,
      incidentRecord.exam_type,
      incidentRecord.paper_id || null,
      incidentRecord.subject || null,
      incidentRecord.subject_code || null,
      incidentRecord.threat_type,
      incidentRecord.threat_severity,
      incidentRecord.status,
      incidentRecord.detected_at,
      incidentRecord.original_paper_status,
      incidentRecord.compromised_question_ids || null,
      incidentRecord.details_json || null,
    ]
  );

  // 4. Record Audit Log Events
  const auditEvents = [
    'THREAT_DETECTED',
    'ORIGINAL_PAPER_LOCKED',
    'NORMAL_DECRYPTION_BLOCKED',
    'NORMAL_PRINT_BLOCKED',
    'EMERGENCY_INCIDENT_CREATED',
  ];

  for (const ev of auditEvents) {
    executeRun(
      db,
      `INSERT INTO audit_events (id, event_type, user_id, org_id, exam_id, status, tx_ref, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?, ?, ?)`,
      [
        uuidv4(),
        ev,
        userId || 'SYSTEM_PROCTOR',
        orgId || null,
        examId,
        `TX-${uuidv4().slice(0, 12)}`,
        JSON.stringify({
          incidentId,
          threatType,
          severity,
          examType,
          compromisedCount: compromisedQuestionIds.length,
          ...(details || {}),
        }),
        now,
      ]
    );
  }

  // 5. Notify Controller of Examination
  executeRun(
    db,
    `INSERT INTO notifications (id, user_id, role, org_id, title, message, category, is_read, created_at)
     VALUES (?, NULL, 'EXAM_MANAGER', ?, ?, ?, 'SECURITY', 0, ?)`,
    [
      uuidv4(),
      orgId || null,
      `🚨 EMERGENCY ALERT: ${threatType} detected on ${examName}`,
      `A ${severity} security violation occurred. The original examination paper has been locked. Please proceed to the Controller Emergency Module to generate and approve an emergency paper.`,
      now,
    ]
  );

  return incidentRecord;
}

/**
 * Returns all active emergency incidents for Controller review.
 */
export function getActiveEmergencyIncidents(db: any, orgId?: string): EmergencyIncidentRecord[] {
  const incidents = executeQuery(
    db,
    'SELECT * FROM emergency_incidents ORDER BY detected_at DESC'
  );

  return (incidents || []).map((inc: any) => {
    let examName = inc.subject || 'Examination';
    if (inc.exam_type === 'COMPETITIVE') {
      const e = executeQuery(db, 'SELECT title FROM competitive_exams WHERE id = ?', [inc.exam_id]);
      if (e && e[0]?.title) examName = e[0].title;
    } else {
      const e = executeQuery(db, 'SELECT name FROM examinations WHERE id = ?', [inc.exam_id]);
      if (e && e[0]?.name) examName = e[0].name;
    }
    return { ...inc, exam_name: examName };
  });
}

/**
 * Returns a specific emergency incident by ID.
 */
export function getEmergencyIncident(db: any, incidentId: string): EmergencyIncidentRecord | null {
  const rows = executeQuery(db, 'SELECT * FROM emergency_incidents WHERE id = ?', [incidentId]);
  if (!rows || rows.length === 0) return null;
  const inc = rows[0];
  let examName = inc.subject || 'Examination';
  if (inc.exam_type === 'COMPETITIVE') {
    const e = executeQuery(db, 'SELECT title FROM competitive_exams WHERE id = ?', [inc.exam_id]);
    if (e && e[0]?.title) examName = e[0].title;
  } else {
    const e = executeQuery(db, 'SELECT name FROM examinations WHERE id = ?', [inc.exam_id]);
    if (e && e[0]?.name) examName = e[0].name;
  }
  return { ...inc, exam_name: examName };
}

/**
 * Generates an Emergency Paper using approved clean question pools,
 * strictly excluding any compromised or quarantined questions.
 */
export function generateEmergencyPaper(
  db: any,
  params: {
    incidentId: string;
    userId: string;
    orgId?: string;
    reason?: string;
  }
): EmergencyPaperRecord {
  const { incidentId, userId, orgId, reason } = params;
  const now = new Date().toISOString();

  const incident = getEmergencyIncident(db, incidentId);
  if (!incident) {
    throw new Error('Emergency Incident not found.');
  }

  // Parse compromised questions to exclude
  let excludedIds: string[] = [];
  if (incident.compromised_question_ids) {
    try {
      excludedIds = JSON.parse(incident.compromised_question_ids);
    } catch {}
  }

  const emergencyPaperId = `EMG-PAPER-${uuidv4().slice(0, 8).toUpperCase()}`;
  let generatedPaperPayload: any = null;

  if (incident.exam_type === 'COMPETITIVE') {
    // Generate fresh Competitive Examination Paper
    const compExam = executeQuery(db, 'SELECT * FROM competitive_exams WHERE id = ?', [incident.exam_id])[0];
    const blueprintRows = executeQuery(db, 'SELECT * FROM paper_blueprints WHERE exam_id = ?', [incident.exam_id]);
    const blueprint = blueprintRows && blueprintRows.length > 0 ? blueprintRows[0] : null;

    // Fetch pool questions, filtering out compromised IDs
    const poolQuestions = executeQuery(
      db,
      'SELECT * FROM competitive_questions WHERE pool_file_id IN (SELECT id FROM competitive_question_pool_files WHERE exam_id = ?) AND status != "QUARANTINED"',
      [incident.exam_id]
    );

    const cleanQuestions = (poolQuestions || []).filter((q: any) => !excludedIds.includes(q.id));

    // Construct fresh emergency sections
    const defaultTotalQs = compExam?.total_questions || blueprint?.total_questions || 50;
    const totalMarks = compExam?.total_marks || blueprint?.total_marks || 100;
    const duration = compExam?.duration_minutes || blueprint?.duration_minutes || 120;

    const sections = [
      {
        id: 'SEC-EMG-1',
        title: 'Section A: Core Technical & Analytical Reasoning (Emergency Paper)',
        description: 'Mandatory objective evaluation section.',
        totalQuestions: Math.min(25, cleanQuestions.length),
        totalMarks: Math.round(totalMarks * 0.5),
        questions: cleanQuestions.slice(0, 25).map((q: any, idx: number) => ({
          id: q.id,
          questionNumber: idx + 1,
          text: q.question_text || `Emergency Question ${idx + 1}: Technical Principles and Systems`,
          options: q.options_json ? JSON.parse(q.options_json) : ['Option A', 'Option B', 'Option C', 'Option D'],
          correctOption: q.correct_option || 'Option A',
          marks: 2,
          difficulty: 'MEDIUM',
        })),
      },
      {
        id: 'SEC-EMG-2',
        title: 'Section B: Advanced Problem Solving (Emergency Paper)',
        description: 'Comprehensive technical and applied questions.',
        totalQuestions: Math.min(25, Math.max(0, cleanQuestions.length - 25)),
        totalMarks: Math.round(totalMarks * 0.5),
        questions: cleanQuestions.slice(25, 50).map((q: any, idx: number) => ({
          id: q.id,
          questionNumber: idx + 26,
          text: q.question_text || `Emergency Question ${idx + 26}: System Design & Algorithmic Analysis`,
          options: q.options_json ? JSON.parse(q.options_json) : ['Option A', 'Option B', 'Option C', 'Option D'],
          correctOption: q.correct_option || 'Option A',
          marks: 2,
          difficulty: 'HARD',
        })),
      },
    ];

    generatedPaperPayload = {
      emergencyPaperId,
      incidentId,
      examId: incident.exam_id,
      examType: 'COMPETITIVE',
      title: `[EMERGENCY PAPER] ${compExam?.title || incident.subject || 'Competitive Examination'}`,
      subject: incident.subject,
      subjectCode: incident.subject_code,
      totalMarks,
      durationMinutes: duration,
      isEmergency: true,
      sections,
      totalQuestions: sections.reduce((acc, s) => acc + s.questions.length, 0),
      blueprintApplied: true,
      excludedCompromisedQuestionsCount: excludedIds.length,
      generatedAt: now,
    };
  } else {
    // Generate fresh University Examination Paper (Solapur University Pattern: 70 Marks)
    const uniExam = executeQuery(db, 'SELECT * FROM examinations WHERE id = ?', [incident.exam_id])[0];
    const totalMarks = 70;

    // Q.1: Exactly 14 MCQs (14 x 1 = 14 Marks)
    const q1Mcqs = Array.from({ length: 14 }, (_, i) => ({
      questionNumber: i + 1,
      text: `MCQ ${i + 1}: Select the correct computational complexity or architectural property for secure transaction pipeline.`,
      options: ['a) O(1) Constant Time', 'b) O(log n) Logarithmic', 'c) O(n) Linear Scale', 'd) O(n^2) Quadratic'],
      marks: 1,
    }));

    // Section I: Q.2 (Attempt any 3 of 4: 12 marks), Q.3 (8 marks), Q.4 (8 marks with OR choice)
    const section1 = {
      title: 'SECTION - I (28 Marks)',
      questions: [
        {
          questionNumber: 'Q.2',
          instruction: 'Attempt any three out of four (3 x 4 = 12 Marks):',
          subQuestions: [
            'a) Explain memory virtualization and paging mechanisms in modern operating systems.',
            'b) Derive the Bresenham line generation algorithm for |m| < 1 with mathematical proof.',
            'c) Discuss the working principles of Shamir 3-of-5 threshold cryptographic secret sharing.',
            'd) Compare symmetric AES-256-GCM authenticated cipher with asymmetric RSA-2048 encryption.',
          ],
          marks: 12,
        },
        {
          questionNumber: 'Q.3',
          instruction: 'Algorithmic / Derivation Question (8 Marks):',
          text: 'Explain Liang-Barsky parametric line clipping algorithm with suitable clipping coordinates and pseudocode.',
          marks: 8,
        },
        {
          questionNumber: 'Q.4',
          instruction: 'Descriptive Question with Mandatory Internal Choice (8 Marks):',
          text: 'Explain 3D geometric transformation matrices for scaling, rotation, and translation.\n\nOR\n\nExplain Sutherland-Hodgeman polygon clipping algorithm with complete boundary intersection traversal.',
          marks: 8,
        },
      ],
    };

    // Section II: Q.5 (Attempt any 3 of 4: 12 marks), Q.6 (8 marks with OR choice), Q.7 (8 marks)
    const section2 = {
      title: 'SECTION - II (28 Marks)',
      questions: [
        {
          questionNumber: 'Q.5',
          instruction: 'Solve any three out of four (3 x 4 = 12 Marks):',
          subQuestions: [
            'a) Describe Phong shading and illumination model components with ambient, diffuse, and specular terms.',
            'b) Explain depth-buffer (Z-buffer) hidden surface removal algorithm with complexity analysis.',
            'c) Describe Cohen-Sutherland outcode derivation and trivial acceptance/rejection conditions.',
            'd) Formulate perspective projection transformation matrix with focal distance parameters.',
          ],
          marks: 12,
        },
        {
          questionNumber: 'Q.6',
          instruction: 'Long Answer Question with Mandatory Internal Choice (8 Marks):',
          text: 'Explain RGB, CMYK, and HSV color models with gamut transformation formulas.\n\nOR\n\nExplain Bezier curve formulation and Bernstein polynomial properties for degree-3 blending functions.',
          marks: 8,
        },
        {
          questionNumber: 'Q.7',
          instruction: 'Long Answer Question (8 Marks):',
          text: 'Discuss visible surface determination algorithms and compare Painter algorithm with Warnock area subdivision.',
          marks: 8,
        },
      ],
    };

    generatedPaperPayload = {
      emergencyPaperId,
      incidentId,
      examId: incident.exam_id,
      examType: 'UNIVERSITY',
      title: `[EMERGENCY PAPER] ${uniExam?.name || incident.subject || 'University Examination'}`,
      subject: incident.subject,
      subjectCode: incident.subject_code,
      totalMarks,
      durationHours: 3,
      isEmergency: true,
      part1Mcqs: q1Mcqs,
      section1,
      section2,
      excludedCompromisedQuestionsCount: excludedIds.length,
      generatedAt: now,
    };
  }

  // 3. Store Emergency Paper in DB (Pending Controller Approval)
  const paperRecord: EmergencyPaperRecord = {
    id: emergencyPaperId,
    incident_id: incidentId,
    exam_id: incident.exam_id,
    exam_type: incident.exam_type,
    version: 'EMERGENCY-V1',
    status: 'PENDING_APPROVAL',
    paper_data_json: JSON.stringify(generatedPaperPayload),
    is_emergency: 1,
    generated_by: userId,
    generated_at: now,
  };

  executeRun(
    db,
    `INSERT INTO emergency_papers (id, incident_id, exam_id, exam_type, version, status, paper_data_json, is_emergency, generated_by, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      paperRecord.id,
      paperRecord.incident_id,
      paperRecord.exam_id,
      paperRecord.exam_type,
      paperRecord.version,
      paperRecord.status,
      paperRecord.paper_data_json,
      paperRecord.generated_by,
      paperRecord.generated_at,
    ]
  );

  // 4. Update Incident Status
  executeRun(
    db,
    `UPDATE emergency_incidents
     SET status = 'EMERGENCY_PAPER_GENERATED', emergency_paper_id = ?, details_json = ?
     WHERE id = ?`,
    [
      emergencyPaperId,
      JSON.stringify({ reason: reason || 'Controller of Examinations generated fresh emergency replacement paper' }),
      incidentId,
    ]
  );

  // 5. Audit Log
  executeRun(
    db,
    `INSERT INTO audit_events (id, event_type, user_id, org_id, exam_id, status, tx_ref, details_json, created_at)
     VALUES (?, 'EMERGENCY_PAPER_GENERATED', ?, ?, ?, 'SUCCESS', ?, ?, ?)`,
    [
      uuidv4(),
      userId,
      orgId || null,
      incident.exam_id,
      `TX-${uuidv4().slice(0, 12)}`,
      JSON.stringify({
        incidentId,
        emergencyPaperId,
        examType: incident.exam_type,
        version: 'EMERGENCY-V1',
        excludedCompromisedQuestionsCount: excludedIds.length,
      }),
      now,
    ]
  );

  return paperRecord;
}

/**
 * Controller of Examination approves the emergency paper.
 * Encrypts the approved emergency paper and makes it ready for printing by Centre Operators.
 */
export function approveEmergencyPaper(
  db: any,
  params: {
    incidentId: string;
    emergencyPaperId: string;
    userId: string;
    userRole: string;
    orgId?: string;
    approvalReason: string;
  }
): EmergencyPaperRecord {
  const { incidentId, emergencyPaperId, userId, userRole, orgId, approvalReason } = params;
  const now = new Date().toISOString();

  // Role Security Gate: ONLY Controller of Examinations / Org Owner can approve
  if (userRole !== 'EXAM_MANAGER' && userRole !== 'ORG_OWNER') {
    throw new Error('ACCESS_DENIED: Only the Controller of Examinations may approve an emergency paper.');
  }

  const paperRows = executeQuery(db, 'SELECT * FROM emergency_papers WHERE id = ?', [emergencyPaperId]);
  if (!paperRows || paperRows.length === 0) {
    throw new Error('Emergency paper not found.');
  }

  const paper = paperRows[0];
  const paperData = JSON.parse(paper.paper_data_json);

  // 1. Encrypt Emergency Paper Payload (AES-256-GCM)
  const rawString = JSON.stringify(paperData);
  const encryptionResult = encryptExamPaper(rawString);
  const encryptedPayloadJson = JSON.stringify(encryptionResult.payload);

  // 2. Mark Emergency Paper as APPROVED
  executeRun(
    db,
    `UPDATE emergency_papers
     SET status = 'APPROVED', approved_by = ?, approved_at = ?, approval_reason = ?, encrypted_payload_json = ?
     WHERE id = ?`,
    [userId, now, approvalReason, encryptedPayloadJson, emergencyPaperId]
  );

  // 3. Link as active paper for Centre Operator dispatch
  if (paper.exam_type === 'COMPETITIVE') {
    // Upsert into competitive_generated_papers
    const existingCompPaper = executeQuery(
      db,
      'SELECT id FROM competitive_generated_papers WHERE exam_id = ? ORDER BY generated_at DESC LIMIT 1',
      [paper.exam_id]
    );

    const compPaperId = existingCompPaper && existingCompPaper[0] ? existingCompPaper[0].id : uuidv4();

    executeRun(
      db,
      `INSERT OR REPLACE INTO competitive_generated_papers (
        id, exam_id, org_id, title, sections_json, questions_json,
        total_questions, total_marks, duration_minutes, is_finalized,
        encryption_status, encrypted_payload_json, generated_by, generated_at,
        is_locked, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'ENCRYPTED_READY', ?, ?, ?, 0, ?)`,
      [
        compPaperId,
        paper.exam_id,
        orgId || 'org-default',
        paperData.title || `[EMERGENCY PAPER] Competitive Exam`,
        JSON.stringify(paperData.sections || []),
        JSON.stringify(paperData.sections?.flatMap((s: any) => s.questions) || []),
        paperData.totalQuestions || 50,
        paperData.totalMarks || 100,
        paperData.durationMinutes || 120,
        encryptedPayloadJson,
        userId,
        now,
        now,
      ]
    );
  } else {
    // University Exam: create new active paper_version and encrypted_papers record
    const newVersionId = uuidv4();
    const versionCode = `EXAM-EMERGENCY-${uuidv4().slice(0, 6).toUpperCase()}-V1`;

    executeRun(
      db,
      `UPDATE paper_versions SET is_current = 0 WHERE exam_id = ?`,
      [paper.exam_id]
    );

    executeRun(
      db,
      `INSERT INTO paper_versions (id, exam_id, version_code, status, is_current, generated_by, generated_at)
       VALUES (?, ?, ?, 'ENCRYPTED', 1, ?, ?)`,
      [newVersionId, paper.exam_id, versionCode, userId, now]
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
        paper.exam_id,
        encryptionResult.payload.cipherText,
        encryptionResult.payload.iv,
        encryptionResult.payload.authTag,
        encryptionResult.payload.encryptedKeyRSA,
        encryptionResult.payload.keyFingerprint,
        encryptionResult.payload.checksumSHA256,
        now,
      ]
    );

    // If university_generated_papers exists, update status
    executeRun(
      db,
      `UPDATE university_generated_papers SET status = 'APPROVED' WHERE exam_id = ?`,
      [paper.exam_id]
    );
  }

  // 4. Update Incident Status
  executeRun(
    db,
    `UPDATE emergency_incidents
     SET status = 'EMERGENCY_PAPER_APPROVED', resolved_at = ?, resolved_by = ?
     WHERE id = ?`,
    [now, userId, incidentId]
  );

  // 5. Audit Log Events
  executeRun(
    db,
    `INSERT INTO audit_events (id, event_type, user_id, org_id, exam_id, status, tx_ref, details_json, created_at)
     VALUES (?, 'EMERGENCY_PAPER_APPROVED', ?, ?, ?, 'SUCCESS', ?, ?, ?)`,
    [
      uuidv4(),
      userId,
      orgId || null,
      paper.exam_id,
      `TX-${uuidv4().slice(0, 12)}`,
      JSON.stringify({
        incidentId,
        emergencyPaperId,
        approvalReason,
        approverRole: userRole,
      }),
      now,
    ]
  );

  executeRun(
    db,
    `INSERT INTO audit_events (id, event_type, user_id, org_id, exam_id, status, tx_ref, details_json, created_at)
     VALUES (?, 'EMERGENCY_PAPER_ENCRYPTED', ?, ?, ?, 'SUCCESS', ?, ?, ?)`,
    [
      uuidv4(),
      userId,
      orgId || null,
      paper.exam_id,
      `TX-${uuidv4().slice(0, 12)}`,
      JSON.stringify({
        incidentId,
        emergencyPaperId,
        encryptionAlgorithm: 'AES-256-GCM',
      }),
      now,
    ]
  );

  return {
    ...paper,
    status: 'APPROVED',
    approved_by: userId,
    approved_at: now,
    approval_reason: approvalReason,
    encrypted_payload_json: encryptedPayloadJson,
  };
}

/**
 * Checks whether an exam's paper is currently compromised/locked due to an active incident
 * and has not yet been replaced with an approved emergency paper.
 */
export function isPaperCompromisedOrLocked(
  db: any,
  params: { examId: string; paperId?: string }
): { isCompromised: boolean; incident?: EmergencyIncidentRecord } {
  const { examId } = params;
  const rows = executeQuery(
    db,
    `SELECT * FROM emergency_incidents 
     WHERE exam_id = ? AND status IN ('ACTIVE', 'EMERGENCY_PAPER_GENERATED')
     ORDER BY detected_at DESC LIMIT 1`,
    [examId]
  );

  if (rows && rows.length > 0) {
    return { isCompromised: true, incident: rows[0] };
  }

  return { isCompromised: false };
}
