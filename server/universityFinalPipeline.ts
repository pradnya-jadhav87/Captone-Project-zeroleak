import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb, executeQuery, executeRun, saveDb } from './db.ts';
import {
  UniversityChromaVectorStore,
  performDeterministicExactCountSelection,
  validateBlueprintAndExactCounts,
  RagQuestionMetadata,
} from './universityRagPipeline.ts';
import { generateUniversityPaperPdf } from './universityPdfGenerator.ts';
import { protectAndSaveUniversityPdf } from './universityPdfProtection.ts';

export interface FinalValidationSummary {
  totalQuestions: number;
  mcqCount: number;
  shortAnswerCount: number;
  descriptiveCount: number;
  totalMarks: number;
  duplicateCount: number;
  sourcePaperDistribution: {
    paper1: number;
    paper2: number;
    paper3: number;
    paper4?: number;
    paper5?: number;
    [key: string]: number | undefined;
  };
  validationPassed: boolean;
  errors: string[];
}

/**
 * Log an audit trail entry for University Exam pipeline operations into SQLite database.
 */
export async function logUniversityPaperAudit(
  examId: string,
  paperId: string | null,
  actionType: 'UPLOAD' | 'EXTRACTION' | 'RAG_PROCESSING' | 'SELECTION' | 'VALIDATION' | 'GENERATION' | 'ENCRYPTION' | 'DOWNLOAD' | 'DOWNLOAD_BLOCKED',
  userId?: string,
  userRole?: string,
  details?: Record<string, any>,
  ipAddress?: string
) {
  try {
    const db = await getDb();
    executeRun(
      db,
      `INSERT INTO university_paper_audit_logs (id, exam_id, paper_id, action_type, user_id, user_role, details_json, ip_address, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        examId,
        paperId || null,
        actionType,
        userId || 'system',
        userRole || 'EXAM_MANAGER',
        details ? JSON.stringify(details) : null,
        ipAddress || '127.0.0.1',
        new Date().toISOString(),
      ]
    );
    saveDb();
  } catch (err) {
    console.error('[University Audit Log Error]:', err);
  }
}

/**
 * Express Route Handler: Final University Exam Paper Generation & Encryption Pipeline
 */
export async function handleGenerateFinalUniversityPaper(req: Request, res: Response) {
  try {
    const exam_id = (req.body.exam_id || 'EXAM-UNIV-MASTER-2026').trim();
    const set_letter = (req.body.set_letter || 'P').trim().toUpperCase();
    const user_id = (req as any).user?.id || 'usr-exam-mgr';
    const user_role = (req as any).user?.role || 'EXAM_MANAGER';
    const ip_address = req.ip || '127.0.0.1';

    const db = await getDb();

    // Fetch Examination record
    const examRows = executeQuery(db, 'SELECT * FROM examinations WHERE id = ?', [exam_id]);
    const exam = examRows[0] || {
      id: exam_id,
      name: 'State University Annual Board Examination 2026',
      university_name: 'State Board of Technical & Engineering Examinations',
      subject: 'Computer Science & Security Engineering',
      code: 'SLR-CS-502',
      duration_minutes: 180,
      total_marks: 70,
    };

    const config = req.body.config || {};
    const university_name = (req.body.university_name || config.universityName || config.university || exam.university_name || 'State Board of Technical Examinations').trim();
    const exam_name = (req.body.exam_name || config.examName || exam.name || 'Annual University Examination 2026').trim();
    const subject = (req.body.subject || config.subject || exam.subject || 'Core Engineering').trim();
    const paper_code = (req.body.paper_code || config.paperCode || exam.code || exam.paper_code || 'SLR-HL-475').trim();
    const duration_minutes = Number(req.body.duration_minutes || (config.durationHours ? config.durationHours * 60 : undefined) || exam.duration_minutes) || 180;
    const total_marks = Number(req.body.total_marks || config.totalMarks || exam.total_marks) || 70;

    // Step 1: Fetch extracted draft questions from SQLite
    const qRows = executeQuery(
      db,
      `SELECT id, draft_paper_id, exam_id, paper_index, source_paper, section, question_number, question_text, question_type, options_json, marks
       FROM draft_questions
       WHERE exam_id = ?
       ORDER BY paper_index ASC, id ASC`,
      [exam_id]
    );

    if (!qRows || qRows.length === 0) {
      await logUniversityPaperAudit(exam_id, null, 'VALIDATION', user_id, user_role, { error: 'NO_DRAFT_QUESTIONS' }, ip_address);
      return res.status(400).json({
        success: false,
        error: 'NO_DRAFT_QUESTIONS: Upload at least 3 source paper PDFs first.',
      });
    }

    const rawQuestions: RagQuestionMetadata[] = qRows.map((r: any) => ({
      questionId: r.id,
      sourcePaper: r.source_paper || `Paper ${r.paper_index}`,
      paperIndex: r.paper_index,
      section: r.section || 'Section I',
      questionType: r.question_type === 'MCQ' ? 'MCQ' : 'THEORY',
      marks: r.question_type === 'MCQ' ? 1 : (Number(r.marks) > 1 ? Number(r.marks) : ((r.question_text || '').length > 100 ? 6 : 4)),
      questionText: r.question_text || '',
      options: r.options_json ? JSON.parse(r.options_json) : undefined,
    }));

    // Audit RAG Processing
    await logUniversityPaperAudit(exam_id, null, 'RAG_PROCESSING', user_id, user_role, { questionCount: rawQuestions.length }, ip_address);

    // Step 2: Index in VectorStore & Detect Duplicates
    const vectorStore = new UniversityChromaVectorStore();
    await vectorStore.indexQuestions(rawQuestions);
    const { uniqueQuestions, duplicates } = vectorStore.detectSemanticDuplicates(0.85);

    // Step 3: Deterministic Exact-Count Selection (14 MCQs, 8 Sec1 Theory, 8 Sec2 Theory)
    const selection = performDeterministicExactCountSelection(uniqueQuestions, 14, 8, 8);
    await logUniversityPaperAudit(exam_id, null, 'SELECTION', user_id, user_role, { selectedMcqs: selection.mcqs.length, totalMarks: selection.totalMarks }, ip_address);

    // Step 4: Pre-PDF Final Validation Summary
    const mcqCount = selection.mcqs.length;
    const shortAnswerCount = selection.section1Theory.length;
    const descriptiveCount = selection.section2Theory.length;
    const totalQuestions = selection.totalQuestions;
    const totalMarks = selection.totalMarks;
    const duplicateCount = duplicates.length;
    const paperDistribution = selection.paperDistribution;

    const validationReport = validateBlueprintAndExactCounts(selection, 14, total_marks);

    const validationSummary: FinalValidationSummary = {
      totalQuestions,
      mcqCount,
      shortAnswerCount,
      descriptiveCount,
      totalMarks,
      duplicateCount,
      sourcePaperDistribution: paperDistribution,
      validationPassed: validationReport.isValid,
      errors: validationReport.errors,
    };

    await logUniversityPaperAudit(exam_id, null, 'VALIDATION', user_id, user_role, validationSummary, ip_address);

    // Requirement 13: Hard Stop Gate — If validation fails, DO NOT create the final PDF
    if (!validationReport.isValid) {
      return res.status(422).json({
        success: false,
        error: `VALIDATION_FAILED: ${validationReport.errors.join(' | ')}`,
        validationSummary,
        validationReport,
      });
    }

    // Step 5: PDFKit PDF Generation
    const rawPdfBuffer = await generateUniversityPaperPdf({
      universityName: university_name,
      examName: exam_name,
      subject,
      paperCode: paper_code,
      setLetter: set_letter,
      examDate: exam.exam_date || new Date().toLocaleDateString(),
      durationMinutes: duration_minutes,
      totalMarks,
      markingScheme: exam.marking_scheme,
      mcqs: selection.mcqs,
      section1Theory: selection.section1Theory,
      section2Theory: selection.section2Theory,
    });

    await logUniversityPaperAudit(exam_id, null, 'GENERATION', user_id, user_role, { pdfSizeBytes: rawPdfBuffer.length }, ip_address);

    const watermarkLocation = req.body.location || req.body.watermarkLocation;
    const user_name = (req as any).user?.full_name || (req as any).user?.name || (req as any).user?.email || 'Authorized Official';

    // Step 6: PDF Protection, Dynamic Watermark & Encryption via pdf-lib
    const protectionResult = await protectAndSaveUniversityPdf(rawPdfBuffer, paper_code, set_letter, {
      userId: user_id,
      userName: user_name,
      userRole: user_role,
      examId: exam_id,
      examName: exam_name,
      location: watermarkLocation,
      ipAddress: ip_address,
      deviceFingerprint: (req.headers['x-device-fingerprint'] as string) || 'secure-enclave-node',
      moduleType: 'UNIVERSITY',
    });

    await logUniversityPaperAudit(exam_id, null, 'ENCRYPTION', user_id, user_role, {
      pdfHash: protectionResult.pdfHash,
      trackingCode: protectionResult.trackingCode,
      algorithm: 'PDF-LIB-AES256-WATERMARKED',
    }, ip_address);

    // Step 7: Store Generated Paper Record in SQLite
    const generatedPaperId = uuidv4();
    const versionCode = `VER-${paper_code}-${set_letter}-${Date.now()}`;
    const pdfUrl = `/compiled_papers/${protectionResult.filename}`;
    const nowIso = new Date().toISOString();

    executeRun(
      db,
      `INSERT INTO university_generated_papers (id, exam_id, version_code, set_letter, total_questions, mcq_count, short_answer_count, descriptive_count, total_marks, duplicate_count, paper_distribution_json, pdf_filename, pdf_url, pdf_hash, encrypted_pdf_path, encryption_algorithm, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GENERATED_ENCRYPTED', ?, ?)`,
      [
        generatedPaperId,
        exam_id,
        versionCode,
        set_letter,
        totalQuestions,
        mcqCount,
        shortAnswerCount,
        descriptiveCount,
        70,
        duplicateCount,
        JSON.stringify(paperDistribution),
        protectionResult.filename,
        pdfUrl,
        protectionResult.pdfHash,
        protectionResult.savedPath,
        'PDF-LIB-AES256',
        user_id,
        nowIso,
      ]
    );

    saveDb();

    // Construct structured paper object for frontend UI presentation
    const structuredPaper = {
      universityName: university_name,
      examName: exam_name,
      subject,
      paperCode: paper_code,
      setLetter: set_letter,
      totalMarks: 70,
      duration: `${Math.round(duration_minutes / 60)} Hours`,
      instructions: [
        '1) Q. No. 1 is compulsory and shall be answered in the first 30 minutes. Each question carries one mark.',
        `2) Mention the question-paper set (${set_letter}) clearly on the answer book.`,
        '3) Figures to the right indicate full marks.',
        '4) Assume suitable data wherever necessary and state the assumptions clearly.',
      ],
      sections: [
        {
          title: 'SECTION I - Objective / MCQs',
          totalMarks: '14',
          instructions: 'Q.1 Choose the correct alternative.',
          questions: selection.mcqs.map((m, idx) => ({
            number: `Q.1(${idx + 1})`,
            text: m.questionText,
            options: m.options || [],
            marks: '1',
          })),
        },
        {
          title: 'SECTION I - Theory',
          totalMarks: '28',
          instructions: 'Q.2 Attempt any four (16 Marks). Q.3 Attempt any two (12 Marks).',
          questions: [
            ...selection.section1Theory.slice(0, 5).map((q, idx) => ({
              number: `Q.2(${String.fromCharCode(97 + idx)})`,
              text: q.questionText,
              options: [],
              marks: '4',
            })),
            ...selection.section1Theory.slice(5, 8).map((q, idx) => ({
              number: `Q.3(${String.fromCharCode(97 + idx)})`,
              text: q.questionText,
              options: [],
              marks: '6',
            })),
          ],
        },
        {
          title: 'SECTION II - Theory',
          totalMarks: '28',
          instructions: 'Q.4 Attempt any four (16 Marks). Q.5 Attempt any two (12 Marks).',
          questions: [
            ...selection.section2Theory.slice(0, 5).map((q, idx) => ({
              number: `Q.4(${String.fromCharCode(97 + idx)})`,
              text: q.questionText,
              options: [],
              marks: '4',
            })),
            ...selection.section2Theory.slice(5, 8).map((q, idx) => ({
              number: `Q.5(${String.fromCharCode(97 + idx)})`,
              text: q.questionText,
              options: [],
              marks: '6',
            })),
          ],
        },
      ],
    };

    return res.json({
      success: true,
      message: `Successfully generated and encrypted official PDFKit University Question Paper (Set ${set_letter}). SHA-256 Hash: ${protectionResult.pdfHash}`,
      generatedPaper: {
        id: generatedPaperId,
        exam_id,
        versionCode,
        set_letter,
        totalQuestions,
        mcqCount,
        shortAnswerCount,
        descriptiveCount,
        totalMarks: 70,
        duplicateCount,
        paperDistribution,
        pdfFilename: protectionResult.filename,
        pdfUrl,
        pdfHash: protectionResult.pdfHash,
        trackingCode: protectionResult.trackingCode,
        watermarkSummary: protectionResult.watermarkSummary,
        created_at: nowIso,
      },
      trackingCode: protectionResult.trackingCode,
      watermarkSummary: protectionResult.watermarkSummary,
      structuredPaper,
      validationSummary,
      validationReport,
    });
  } catch (err: any) {
    console.error('[Final University Paper Generation Error]:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to generate final University Question Paper PDF.',
    });
  }
}

/**
 * Express Route Handler: Fetch Audit Logs for University Exam Pipeline
 */
export async function handleGetUniversityAuditLogs(req: Request, res: Response) {
  try {
    const exam_id = ((req.query.exam_id as string) || 'EXAM-UNIV-MASTER-2026').trim();
    const db = await getDb();
    const logs = executeQuery(
      db,
      `SELECT * FROM university_paper_audit_logs
       WHERE exam_id = ?
       ORDER BY timestamp DESC LIMIT 50`,
      [exam_id]
    );
    return res.json({ success: true, logs });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Express Route Handler: Download Encrypted PDF (Hardened: Paper download permanently blocked)
 */
export async function handleDownloadUniversityPaper(req: Request, res: Response) {
  try {
    const paperId = req.params.id;
    const user_id = (req as any).user?.id || 'usr-exam-mgr';
    const user_role = (req as any).user?.role || 'EXAM_MANAGER';
    const ip_address = req.ip || '127.0.0.1';
    const device_id = (req as any).user?.device_id || (req as any).clientDeviceFingerprint || (req.headers['x-device-fingerprint'] as string) || 'unknown-device';

    const db = await getDb();
    const rows = executeQuery(db, 'SELECT * FROM university_generated_papers WHERE id = ? OR pdf_filename LIKE ?', [paperId, `%${paperId}%`]);
    const paper = rows[0];

    // Log Download Blocked Audit Event
    await logUniversityPaperAudit(
      paper?.exam_id || 'unknown',
      paper?.id || paperId,
      'DOWNLOAD_BLOCKED',
      user_id,
      user_role,
      {
        message: 'University exam paper download blocked for security hardening.',
        pdfFilename: paper?.pdf_filename,
        deviceId: device_id,
        route: req.originalUrl,
      },
      ip_address
    );

    return res.status(403).json({
      success: false,
      error: 'DOWNLOAD_BLOCKED: University examination paper downloads are permanently prohibited for security hardening.',
      code: 'DOWNLOAD_BLOCKED',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to process download request.' });
  }
}

