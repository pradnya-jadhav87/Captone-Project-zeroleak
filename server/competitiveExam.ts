import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { getDb, executeQuery, executeRun, getPostgresPool } from './db.ts';
import { translateQuestionWithAI, extractQuestionsFromPaperWithAI } from './ai.ts';

export interface CompetitiveSubjectRule {
  id: string;
  subjectName: string;
  numberOfQuestions: number;
  questionType: 'MCQ' | 'Descriptive' | 'Mixed';
  marksPerQuestion: number;
  negativeMarks: number;
  translationRequired: boolean;
  translationLanguage?: string;
  subjectOrder: number;
  pdfs?: any[];
}

export interface CompetitiveExamBlueprint {
  subjects: CompetitiveSubjectRule[];
  totalQuestions: number;
  totalMarks: number;
  totalPositiveMarks: number;
  totalNegativeMarks: number;
}

export interface ExtractedCompetitiveQuestion {
  id: string;
  questionNumber: string;
  subject: string;
  subjectId?: string;
  type: 'MCQ' | 'Descriptive' | 'Mixed';
  questionText: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  options: Array<{ label: string; text: string }>;
  correctOption?: string;
  subQuestions?: string[];
  marks: number;
  negativeMarks: number;
  sourcePdf: string;
  sourcePage: number;
  sourceQuestionNumber: string;
  hasDiagram?: boolean;
  verificationStatus: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';
  translationStatus?: string;
  translatedText?: string;
  translatedOptions?: Array<{ label: string; text: string }>;
}

/**
 * Initialize PostgreSQL and SQLite tables for Competitive Examination
 */
export async function initializeCompetitiveSchema(db: any): Promise<void> {
  try {
    // 1. Direct PostgreSQL schema with BYTEA binary storage and full columns
    const pg = getPostgresPool();
    if (pg) {
      try {
        await pg.query(`
          CREATE TABLE IF NOT EXISTS competitive_exams (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            name TEXT NOT NULL,
            exam_type TEXT NOT NULL,
            duration_minutes INTEGER NOT NULL DEFAULT 180,
            exam_date TEXT,
            exam_time TEXT,
            instructions TEXT,
            blueprint_json TEXT,
            status TEXT NOT NULL DEFAULT 'DRAFT',
            created_by TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS competitive_question_pool_files (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            exam_id TEXT NOT NULL,
            subject_id TEXT NOT NULL,
            subject_name TEXT NOT NULL,
            file_name TEXT NOT NULL,
            mime_type TEXT DEFAULT 'application/pdf',
            file_size INTEGER DEFAULT 0,
            file_data BYTEA,
            file_hash TEXT,
            status TEXT NOT NULL DEFAULT 'PENDING',
            question_count INTEGER DEFAULT 0,
            error_message TEXT,
            uploaded_at TEXT NOT NULL,
            processed_at TEXT
          );

          CREATE TABLE IF NOT EXISTS competitive_question_pools (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            exam_id TEXT NOT NULL,
            subject TEXT NOT NULL,
            source_pdf_name TEXT NOT NULL,
            page_count INTEGER DEFAULT 1,
            question_count INTEGER DEFAULT 0,
            file_size INTEGER DEFAULT 0,
            uploaded_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS competitive_questions (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            exam_id TEXT NOT NULL,
            subject_id TEXT,
            source_file_id TEXT,
            pool_id TEXT,
            subject TEXT NOT NULL,
            question_number TEXT,
            question_type TEXT NOT NULL DEFAULT 'MCQ',
            question_text TEXT NOT NULL,
            option_a TEXT,
            option_b TEXT,
            option_c TEXT,
            option_d TEXT,
            options_json TEXT,
            correct_option TEXT,
            sub_questions_json TEXT,
            marks REAL NOT NULL DEFAULT 4.0,
            negative_marks REAL NOT NULL DEFAULT 1.0,
            source_pdf TEXT,
            source_page INTEGER,
            source_question_number TEXT,
            has_diagram BOOLEAN DEFAULT FALSE,
            verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
            translation_status TEXT DEFAULT 'PENDING',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS competitive_generated_papers (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            exam_id TEXT NOT NULL,
            title TEXT NOT NULL,
            exam_type TEXT NOT NULL,
            total_questions INTEGER NOT NULL,
            total_marks REAL NOT NULL,
            total_positive_marks REAL NOT NULL,
            total_negative_marks REAL NOT NULL,
            sections_json TEXT NOT NULL,
            questions_json TEXT NOT NULL,
            blueprint_snapshot_json TEXT NOT NULL,
            source_provenance_json TEXT,
            paper_fingerprint TEXT NOT NULL,
            generated_by TEXT,
            generated_at TEXT NOT NULL
          );

          ALTER TABLE competitive_questions ADD COLUMN IF NOT EXISTS subject_id TEXT;
          ALTER TABLE competitive_questions ADD COLUMN IF NOT EXISTS source_file_id TEXT;
          ALTER TABLE competitive_questions ADD COLUMN IF NOT EXISTS option_a TEXT;
          ALTER TABLE competitive_questions ADD COLUMN IF NOT EXISTS option_b TEXT;
          ALTER TABLE competitive_questions ADD COLUMN IF NOT EXISTS option_c TEXT;
          ALTER TABLE competitive_questions ADD COLUMN IF NOT EXISTS option_d TEXT;
          ALTER TABLE competitive_questions ADD COLUMN IF NOT EXISTS correct_option TEXT;
          ALTER TABLE competitive_questions ADD COLUMN IF NOT EXISTS has_diagram BOOLEAN DEFAULT FALSE;

          ALTER TABLE competitive_generated_papers ADD COLUMN IF NOT EXISTS paper_number INTEGER DEFAULT 1;
          ALTER TABLE competitive_generated_papers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'AVAILABLE';
          ALTER TABLE competitive_generated_papers ADD COLUMN IF NOT EXISTS started_at TEXT;
          ALTER TABLE competitive_generated_papers ADD COLUMN IF NOT EXISTS completed_at TEXT;

          CREATE TABLE IF NOT EXISTS competitive_translation_assignments (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            exam_id TEXT NOT NULL,
            subject_id TEXT NOT NULL,
            subject_name TEXT NOT NULL,
            language TEXT NOT NULL,
            translator_id TEXT NOT NULL,
            translator_name TEXT NOT NULL,
            source_file_ids_json TEXT,
            question_ids_json TEXT,
            status TEXT NOT NULL DEFAULT 'ASSIGNED',
            total_questions INTEGER DEFAULT 0,
            translated_count INTEGER DEFAULT 0,
            verified_count INTEGER DEFAULT 0,
            created_by TEXT,
            assigned_at TEXT NOT NULL,
            completed_at TEXT,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS competitive_question_translations (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            exam_id TEXT NOT NULL,
            subject_id TEXT NOT NULL,
            source_file_id TEXT,
            source_question_id TEXT NOT NULL,
            translation_pool_id TEXT,
            translator_id TEXT NOT NULL,
            language TEXT NOT NULL,
            translated_text TEXT,
            translated_question_text TEXT,
            translated_option_a TEXT,
            translated_option_b TEXT,
            translated_option_c TEXT,
            translated_option_d TEXT,
            translated_options_json TEXT,
            status TEXT NOT NULL DEFAULT 'DRAFT',
            verification_status TEXT NOT NULL DEFAULT 'PENDING',
            version INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            verified_at TEXT
          );

          CREATE TABLE IF NOT EXISTS competitive_generated_paper_questions (
            id TEXT PRIMARY KEY,
            paper_id TEXT NOT NULL,
            question_id TEXT NOT NULL,
            sequence_number INTEGER NOT NULL,
            subject TEXT NOT NULL,
            marks REAL NOT NULL DEFAULT 4.0,
            negative_marks REAL NOT NULL DEFAULT 1.0,
            original_question_id TEXT NOT NULL,
            question_text TEXT NOT NULL,
            options_json TEXT,
            translated_text TEXT,
            translated_options_json TEXT,
            source_pdf TEXT,
            source_page INTEGER,
            source_question_number TEXT,
            created_at TEXT NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_comp_exams_org ON competitive_exams(org_id);
          CREATE INDEX IF NOT EXISTS idx_comp_pool_files_exam_sub ON competitive_question_pool_files(exam_id, subject_id);
          CREATE INDEX IF NOT EXISTS idx_comp_pool_files_status ON competitive_question_pool_files(status);
          CREATE INDEX IF NOT EXISTS idx_comp_questions_source_file ON competitive_questions(source_file_id);
          CREATE INDEX IF NOT EXISTS idx_comp_questions_exam_subject_id ON competitive_questions(exam_id, subject_id);
          CREATE INDEX IF NOT EXISTS idx_comp_questions_exam_status ON competitive_questions(exam_id, verification_status);
          CREATE INDEX IF NOT EXISTS idx_comp_trans_assign_org ON competitive_translation_assignments(org_id, exam_id);
          CREATE INDEX IF NOT EXISTS idx_comp_qtrans_match ON competitive_question_translations(org_id, exam_id, source_question_id, language);
          CREATE INDEX IF NOT EXISTS idx_comp_gen_papers_exam ON competitive_generated_papers(exam_id, paper_number);
        `);
      } catch (pgErr) {
        console.warn('[ZeroLeak Competitive Schema] PostgreSQL schema init notice:', pgErr);
      }
    }

    // 2. Local fallback schema
    if (db) {
      try {
        executeRun(
          db,
          `CREATE TABLE IF NOT EXISTS competitive_exams (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            name TEXT NOT NULL,
            exam_type TEXT NOT NULL,
            duration_minutes INTEGER NOT NULL DEFAULT 180,
            exam_date TEXT,
            exam_time TEXT,
            instructions TEXT,
            blueprint_json TEXT,
            status TEXT NOT NULL DEFAULT 'DRAFT',
            created_by TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );`
        );

        executeRun(
          db,
          `CREATE TABLE IF NOT EXISTS competitive_question_pool_files (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            exam_id TEXT NOT NULL,
            subject_id TEXT NOT NULL,
            subject_name TEXT NOT NULL,
            file_name TEXT NOT NULL,
            mime_type TEXT DEFAULT 'application/pdf',
            file_size INTEGER DEFAULT 0,
            file_hash TEXT,
            status TEXT NOT NULL DEFAULT 'PENDING',
            question_count INTEGER DEFAULT 0,
            error_message TEXT,
            uploaded_at TEXT NOT NULL,
            processed_at TEXT
          );`
        );

        executeRun(
          db,
          `CREATE TABLE IF NOT EXISTS competitive_questions (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            exam_id TEXT NOT NULL,
            subject_id TEXT,
            source_file_id TEXT,
            pool_id TEXT,
            subject TEXT NOT NULL,
            question_number TEXT,
            question_type TEXT NOT NULL DEFAULT 'MCQ',
            question_text TEXT NOT NULL,
            option_a TEXT,
            option_b TEXT,
            option_c TEXT,
            option_d TEXT,
            options_json TEXT,
            correct_option TEXT,
            sub_questions_json TEXT,
            marks REAL NOT NULL DEFAULT 4.0,
            negative_marks REAL NOT NULL DEFAULT 1.0,
            source_pdf TEXT,
            source_page INTEGER,
            source_question_number TEXT,
            has_diagram INTEGER DEFAULT 0,
            verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
            translation_status TEXT DEFAULT 'PENDING',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );`
        );

          executeRun(
          db,
          `CREATE TABLE IF NOT EXISTS competitive_generated_papers (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            exam_id TEXT NOT NULL,
            title TEXT NOT NULL,
            exam_type TEXT NOT NULL,
            total_questions INTEGER NOT NULL,
            total_marks REAL NOT NULL,
            total_positive_marks REAL NOT NULL,
            total_negative_marks REAL NOT NULL,
            sections_json TEXT NOT NULL,
            questions_json TEXT NOT NULL,
            blueprint_snapshot_json TEXT NOT NULL,
            source_provenance_json TEXT,
            paper_fingerprint TEXT NOT NULL,
            paper_number INTEGER DEFAULT 1,
            status TEXT DEFAULT 'AVAILABLE',
            started_at TEXT,
            completed_at TEXT,
            generated_by TEXT,
            generated_at TEXT NOT NULL
          );`
        );

        executeRun(
          db,
          `CREATE TABLE IF NOT EXISTS competitive_translation_assignments (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            exam_id TEXT NOT NULL,
            subject_id TEXT NOT NULL,
            subject_name TEXT NOT NULL,
            language TEXT NOT NULL,
            translator_id TEXT NOT NULL,
            translator_name TEXT NOT NULL,
            source_file_ids_json TEXT,
            question_ids_json TEXT,
            status TEXT NOT NULL DEFAULT 'ASSIGNED',
            total_questions INTEGER DEFAULT 0,
            translated_count INTEGER DEFAULT 0,
            verified_count INTEGER DEFAULT 0,
            created_by TEXT,
            assigned_at TEXT NOT NULL,
            completed_at TEXT,
            updated_at TEXT NOT NULL
          );`
        );

        executeRun(
          db,
          `CREATE TABLE IF NOT EXISTS competitive_question_translations (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            exam_id TEXT NOT NULL,
            subject_id TEXT NOT NULL,
            source_file_id TEXT,
            source_question_id TEXT NOT NULL,
            translation_pool_id TEXT,
            translator_id TEXT NOT NULL,
            language TEXT NOT NULL,
            translated_text TEXT,
            translated_question_text TEXT,
            translated_option_a TEXT,
            translated_option_b TEXT,
            translated_option_c TEXT,
            translated_option_d TEXT,
            translated_options_json TEXT,
            status TEXT NOT NULL DEFAULT 'DRAFT',
            verification_status TEXT NOT NULL DEFAULT 'PENDING',
            version INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            verified_at TEXT
          );`
        );

        executeRun(
          db,
          `CREATE TABLE IF NOT EXISTS competitive_generated_paper_questions (
            id TEXT PRIMARY KEY,
            paper_id TEXT NOT NULL,
            question_id TEXT NOT NULL,
            sequence_number INTEGER NOT NULL,
            subject TEXT NOT NULL,
            marks REAL NOT NULL DEFAULT 4.0,
            negative_marks REAL NOT NULL DEFAULT 1.0,
            original_question_id TEXT NOT NULL,
            question_text TEXT NOT NULL,
            options_json TEXT,
            translated_text TEXT,
            translated_options_json TEXT,
            source_pdf TEXT,
            source_page INTEGER,
            source_question_number TEXT,
            created_at TEXT NOT NULL
          );`
        );
      } catch (dbErr) {
        console.warn('[ZeroLeak Competitive Schema] Local DB schema init notice:', dbErr);
      }
    }
  } catch (err) {
    console.error('[ZeroLeak Competitive Schema] Init error:', err);
  }
}

/**
 * Clean header/footer noise from raw text lines
 */
function cleanExtractedLines(rawText: string): string[] {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const cleaned: string[] = [];

  const noiseRegexes = [
    /^page\s+\d+(\s+of\s+\d+)?$/i,
    /^-+\s*\d+\s*-+$/,
    /^confidential(\s+exam)?$/i,
    /^end\s+of\s+(question\s+)?paper$/i,
    /^please\s+turn\s+over(\s*\(pto\))?$/i,
    /^rough\s+work(\s+only)?$/i,
    /^space\s+for\s+rough\s+work$/i,
    /^copyright\s+.*reserved/i,
  ];

  for (const line of lines) {
    const isNoise = noiseRegexes.some(rx => rx.test(line));
    if (!isNoise) {
      cleaned.push(line);
    }
  }

  return cleaned;
}

/**
 * Real Parser: extracts individual questions, options, LaTeX math, diagrams, marks, and question numbers
 */
export function parseQuestionsFromRawText(
  rawText: string,
  subject: string,
  sourcePdfName: string,
  defaultMarks: number = 4,
  defaultNegativeMarks: number = 1
): ExtractedCompetitiveQuestion[] {
  const lines = cleanExtractedLines(rawText);
  if (lines.length === 0) return [];

  const questions: ExtractedCompetitiveQuestion[] = [];
  const qNumRegex = /^(?:Q(?:uestion)?\.?\s*(\d+[a-z]?)|(\d+[a-z]?)[\.\)\-]|\[(\d+[a-z]?)\])\s*(.*)/i;
  const optionRegex = /^(\(?([A-Da-d1-4])[\)\.]|\[([A-Da-d1-4])\])\s*(.*)/;
  const marksRegex = /\[(\d+(?:\.\d+)?)\s*(?:Marks?|M)\]|\((\d+(?:\.\d+)?)\s*(?:Marks?|M)\)/i;
  const diagramRegex = /\b(fig(?:ure)?\.?|diagram|circuit|graph|plot|chart|illustration|shown below|refer to the (?:image|diagram|figure)|table below|given below)\b/i;
  const answerRegex = /\b(?:ans(?:wer)?|key|correct(?:\s+option)?)\s*[:=\-]?\s*\(?([A-Da-d1-4])\)?\b/i;

  let currentQ: {
    number: string;
    textLines: string[];
    options: Array<{ label: string; text: string }>;
    subQuestions: string[];
    marks: number;
    negativeMarks: number;
    page: number;
    hasDiagram: boolean;
    detectedAnswer?: string;
  } | null = null;

  let estimatedPage = 1;
  let linesSincePageBreak = 0;

  const pushCurrentQuestion = () => {
    if (currentQ && currentQ.textLines.length > 0) {
      const fullText = currentQ.textLines.join(' ').trim();
      if (fullText.length >= 8) {
        let optA = '';
        let optB = '';
        let optC = '';
        let optD = '';

        for (const opt of currentQ.options) {
          const l = opt.label.toUpperCase();
          if (l === 'A' || l === '1') optA = opt.text;
          else if (l === 'B' || l === '2') optB = opt.text;
          else if (l === 'C' || l === '3') optC = opt.text;
          else if (l === 'D' || l === '4') optD = opt.text;
        }

        const referencesDiagram = currentQ.hasDiagram || diagramRegex.test(fullText);

        questions.push({
          id: `cq-${uuidv4()}`,
          questionNumber: currentQ.number,
          subject,
          type: currentQ.options.length >= 2 ? 'MCQ' : 'Descriptive',
          questionText: fullText,
          optionA: optA,
          optionB: optB,
          optionC: optC,
          optionD: optD,
          options: currentQ.options,
          correctOption: currentQ.detectedAnswer,
          subQuestions: currentQ.subQuestions,
          marks: currentQ.marks,
          negativeMarks: currentQ.negativeMarks,
          sourcePdf: sourcePdfName,
          sourcePage: currentQ.page,
          sourceQuestionNumber: currentQ.number,
          hasDiagram: referencesDiagram,
          verificationStatus: 'UNVERIFIED',
          translationStatus: 'ORIGINAL',
        });
      }
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    linesSincePageBreak++;
    if (linesSincePageBreak > 45) {
      estimatedPage++;
      linesSincePageBreak = 0;
    }

    const qMatch = line.match(qNumRegex);
    if (qMatch) {
      pushCurrentQuestion();

      const qNum = qMatch[1] || qMatch[2] || qMatch[3] || `${questions.length + 1}`;
      const restText = (qMatch[4] || '').trim();

      let detectedMarks = defaultMarks;
      const mMatch = (line + ' ' + restText).match(marksRegex);
      if (mMatch) {
        detectedMarks = parseFloat(mMatch[1] || mMatch[2]) || defaultMarks;
      }

      currentQ = {
        number: qNum,
        textLines: restText ? [restText] : [],
        options: [],
        subQuestions: [],
        marks: detectedMarks,
        negativeMarks: defaultNegativeMarks,
        page: estimatedPage,
        hasDiagram: diagramRegex.test(line),
      };
      continue;
    }

    if (!currentQ) continue;

    // Check if line contains answer key
    const ansMatch = line.match(answerRegex);
    if (ansMatch) {
      const ansLabel = ansMatch[1].toUpperCase();
      const normAns = ansLabel === '1' ? 'A' : ansLabel === '2' ? 'B' : ansLabel === '3' ? 'C' : ansLabel === '4' ? 'D' : ansLabel;
      currentQ.detectedAnswer = normAns;
    }

    // Check if line contains horizontal 4-option row e.g. (A) text (B) text (C) text (D) text
    const horizMatch = line.match(/\(?A[\)\.]\s*(.*?)\s*\(?B[\)\.]\s*(.*?)\s*\(?C[\)\.]\s*(.*?)\s*\(?D[\)\.]\s*(.*)/i);
    if (horizMatch) {
      currentQ.options.push({ label: 'A', text: horizMatch[1].trim() });
      currentQ.options.push({ label: 'B', text: horizMatch[2].trim() });
      currentQ.options.push({ label: 'C', text: horizMatch[3].trim() });
      currentQ.options.push({ label: 'D', text: horizMatch[4].trim() });
      continue;
    }

    // Check if line is a single MCQ Option
    const optMatch = line.match(optionRegex);
    if (optMatch) {
      let rawLabel = (optMatch[2] || optMatch[3] || '').toUpperCase();
      if (rawLabel === '1') rawLabel = 'A';
      else if (rawLabel === '2') rawLabel = 'B';
      else if (rawLabel === '3') rawLabel = 'C';
      else if (rawLabel === '4') rawLabel = 'D';

      const text = (optMatch[4] || '').trim();
      currentQ.options.push({ label: rawLabel, text });
      continue;
    }

    // Check if line continues previous option
    if (currentQ.options.length > 0) {
      const lastOpt = currentQ.options[currentQ.options.length - 1];
      lastOpt.text = (lastOpt.text + ' ' + line).trim();
      continue;
    }

    // Check for subquestion numbering e.g. a) or (i)
    if (/^(\([a-z0-9]+\)|[a-z]\))\s+/i.test(line)) {
      currentQ.subQuestions.push(line);
      continue;
    }

    if (diagramRegex.test(line)) {
      currentQ.hasDiagram = true;
    }

    // Regular question text line (preserves LaTeX formulas, exponents, etc.)
    currentQ.textLines.push(line);
  }

  // Push final question
  pushCurrentQuestion();

  return questions;
}

/**
 * Express Route Handlers (Backed by PostgreSQL with strict organization isolation)
 */

// 1. GET /api/competitive/exams
export async function handleGetCompetitiveExams(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const pg = getPostgresPool();
    const db = await getDb();

    let rows: any[] = [];
    if (pg) {
      try {
        const result = await pg.query(
          'SELECT * FROM competitive_exams WHERE org_id = $1 ORDER BY created_at DESC',
          [orgId]
        );
        rows = result.rows;
      } catch (pgErr) {
        console.warn('[Competitive] PG query notice in getExams, falling back to local DB:', pgErr);
        rows = executeQuery(db, 'SELECT * FROM competitive_exams WHERE org_id = ? ORDER BY created_at DESC', [orgId]);
      }
    } else {
      rows = executeQuery(db, 'SELECT * FROM competitive_exams WHERE org_id = ? ORDER BY created_at DESC', [orgId]);
    }

    const exams = await Promise.all(
      rows.map(async r => {
        const blueprint = r.blueprint_json ? JSON.parse(r.blueprint_json) : null;
        if (blueprint && Array.isArray(blueprint.subjects)) {
          // Fetch files for this exam from PostgreSQL
          let files: any[] = [];
          if (pg) {
            try {
              const fRes = await pg.query(
                "SELECT id, exam_id, subject_id, subject_name, file_name, mime_type, file_size, file_hash, status, question_count, error_message, uploaded_at, processed_at FROM competitive_question_pool_files WHERE exam_id = $1 AND org_id = $2 AND status <> 'DELETED' ORDER BY uploaded_at ASC",
                [r.id, orgId]
              );
              files = fRes.rows;
            } catch {
              files = executeQuery(
                db,
                "SELECT id, exam_id, subject_id, subject_name, file_name, mime_type, file_size, file_hash, status, question_count, error_message, uploaded_at, processed_at FROM competitive_question_pool_files WHERE exam_id = ? AND org_id = ? AND status <> 'DELETED' ORDER BY uploaded_at ASC",
                [r.id, orgId]
              );
            }
          } else {
            files = executeQuery(
              db,
              "SELECT id, exam_id, subject_id, subject_name, file_name, mime_type, file_size, file_hash, status, question_count, error_message, uploaded_at, processed_at FROM competitive_question_pool_files WHERE exam_id = ? AND org_id = ? AND status <> 'DELETED' ORDER BY uploaded_at ASC",
              [r.id, orgId]
            );
          }

          // Fetch verified questions count per subject
          let countsBySubject: Record<string, { total: number; verified: number }> = {};
          if (pg) {
            try {
              const cRes = await pg.query(
                'SELECT subject_id, subject, verification_status, COUNT(*) as count FROM competitive_questions WHERE exam_id = $1 AND org_id = $2 GROUP BY subject_id, subject, verification_status',
                [r.id, orgId]
              );
              for (const row of cRes.rows) {
                const subKey = (row.subject_id || row.subject || '').trim().toLowerCase();
                if (!countsBySubject[subKey]) countsBySubject[subKey] = { total: 0, verified: 0 };
                const c = parseInt(row.count, 10) || 0;
                countsBySubject[subKey].total += c;
                if (row.verification_status === 'VERIFIED') countsBySubject[subKey].verified += c;
              }
            } catch {}
          }

          blueprint.subjects = blueprint.subjects.map((sub: any) => {
            const matchingFiles = files.filter((f: any) => {
              if (f.subject_id && sub.id) return f.subject_id === sub.id;
              if (sub.subjectName && sub.subjectName.trim()) {
                return (f.subject_name || '').trim().toLowerCase() === sub.subjectName.trim().toLowerCase();
              }
              return false;
            });

            const activePdfs = matchingFiles.map((f: any) => ({
              id: f.id,
              fileId: f.id,
              name: f.file_name,
              size: f.file_size || 0,
              status: f.status || 'COMPLETED',
              extractedCount: f.question_count || 0,
              subjectId: f.subject_id,
              uploadedAt: f.uploaded_at,
            }));

            const subKey = (sub.id || sub.subjectName || '').trim().toLowerCase();
            const counts = countsBySubject[subKey] || { total: 0, verified: 0 };

            return {
              ...sub,
              pdfs: activePdfs,
              totalExtracted: counts.total,
              totalVerified: counts.verified,
            };
          });
        }

        return {
          ...r,
          blueprint,
        };
      })
    );

    return res.json({ success: true, exams });
  } catch (err: any) {
    console.error('handleGetCompetitiveExams error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch competitive exams.' });
  }
}

// 2. POST /api/competitive/exams (Create / Update Exam & Blueprint)
export async function handleSaveCompetitiveExam(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const { id, name, exam_type, duration_minutes, exam_date, exam_time, instructions, blueprint } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Exam Name is required.' });
    }

    const examId = id || `comp-${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();
    const blueprintJson = blueprint ? JSON.stringify(blueprint) : null;
    const duration = duration_minutes !== undefined && duration_minutes !== '' ? Number(duration_minutes) : 180;
    const pg = getPostgresPool();
    const db = await getDb();

    if (pg) {
      try {
        const check = await pg.query('SELECT id FROM competitive_exams WHERE id = $1 AND org_id = $2', [examId, orgId]);
        if (check.rows.length > 0) {
          await pg.query(
            `UPDATE competitive_exams
             SET name = $1, exam_type = $2, duration_minutes = $3, exam_date = $4, exam_time = $5, instructions = $6, blueprint_json = $7, updated_at = $8
             WHERE id = $9 AND org_id = $10`,
            [name, exam_type || 'Competitive Examination', duration, exam_date || '', exam_time || '', instructions || '', blueprintJson, now, examId, orgId]
          );
        } else {
          await pg.query(
            `INSERT INTO competitive_exams (id, org_id, name, exam_type, duration_minutes, exam_date, exam_time, instructions, blueprint_json, status, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'DRAFT', $10, $11, $12)`,
            [examId, orgId, name, exam_type || 'Competitive Examination', duration, exam_date || '', exam_time || '', instructions || '', blueprintJson, req.user?.id || 'admin', now, now]
          );
        }
      } catch (pgErr) {
        console.warn('[Competitive] PG save error notice:', pgErr);
      }
    }

    // Local DB mirror
    if (db) {
      const existing = executeQuery(db, 'SELECT id FROM competitive_exams WHERE id = ? AND org_id = ?', [examId, orgId]);
      if (existing && existing.length > 0) {
        executeRun(
          db,
          `UPDATE competitive_exams
           SET name = ?, exam_type = ?, duration_minutes = ?, exam_date = ?, exam_time = ?, instructions = ?, blueprint_json = ?, updated_at = ?
           WHERE id = ? AND org_id = ?`,
          [name, exam_type || 'Competitive Examination', duration, exam_date || '', exam_time || '', instructions || '', blueprintJson, now, examId, orgId]
        );
      } else {
        executeRun(
          db,
          `INSERT INTO competitive_exams (id, org_id, name, exam_type, duration_minutes, exam_date, exam_time, instructions, blueprint_json, status, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
          [examId, orgId, name, exam_type || 'Competitive Examination', duration, exam_date || '', exam_time || '', instructions || '', blueprintJson, req.user?.id || 'admin', now, now]
        );
      }
    }

    return res.json({
      success: true,
      message: 'Competitive examination configuration saved.',
      exam: {
        id: examId,
        org_id: orgId,
        name,
        exam_type: exam_type || 'Competitive Examination',
        duration_minutes: duration,
        exam_date,
        exam_time,
        instructions,
        blueprint,
      },
    });
  } catch (err: any) {
    console.error('handleSaveCompetitiveExam error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save examination.' });
  }
}

// 3. DELETE /api/competitive/exams/:id
export async function handleDeleteCompetitiveExam(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const examId = req.params.id;
    const pg = getPostgresPool();
    const db = await getDb();

    if (pg) {
      await pg.query('DELETE FROM competitive_questions WHERE exam_id = $1 AND org_id = $2', [examId, orgId]);
      await pg.query('DELETE FROM competitive_question_pool_files WHERE exam_id = $1 AND org_id = $2', [examId, orgId]);
      await pg.query('DELETE FROM competitive_question_pools WHERE exam_id = $1 AND org_id = $2', [examId, orgId]);
      await pg.query('DELETE FROM competitive_generated_papers WHERE exam_id = $1 AND org_id = $2', [examId, orgId]);
      await pg.query('DELETE FROM competitive_exams WHERE id = $1 AND org_id = $2', [examId, orgId]);
    }

    if (db) {
      executeRun(db, 'DELETE FROM competitive_questions WHERE exam_id = ? AND org_id = ?', [examId, orgId]);
      executeRun(db, 'DELETE FROM competitive_question_pool_files WHERE exam_id = ? AND org_id = ?', [examId, orgId]);
      executeRun(db, 'DELETE FROM competitive_question_pools WHERE exam_id = ? AND org_id = ?', [examId, orgId]);
      executeRun(db, 'DELETE FROM competitive_generated_papers WHERE exam_id = ? AND org_id = ?', [examId, orgId]);
      executeRun(db, 'DELETE FROM competitive_exams WHERE id = ? AND org_id = ?', [examId, orgId]);
    }

    return res.json({ success: true, message: 'Examination deleted.' });
  } catch (err: any) {
    console.error('handleDeleteCompetitiveExam error:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete examination.' });
  }
}

// 4. POST /api/competitive/upload-subject-pdf (Store PDF bytes in PostgreSQL BYTEA & extract questions)
export async function handleUploadSubjectPdf(req: Request, res: Response) {
  try {
    const pg = getPostgresPool();
    const db = await getDb();
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const {
      exam_id,
      subject_id,
      subject_name,
      subject,
      file_name,
      file_data,
      raw_text,
      marks_per_question,
      negative_marks,
    } = req.body;

    if (!exam_id) return res.status(400).json({ error: 'Exam ID is required.' });

    const effectiveSubjectId = (subject_id || '').trim();
    if (!effectiveSubjectId) {
      return res.status(400).json({ error: 'subject_id is required for isolated question pool management.' });
    }
    const effectiveSubjectName = (subject_name || subject || 'General').trim();

    if (!file_data && (!raw_text || raw_text.trim().length < 10)) {
      return res.status(400).json({ error: 'PDF file data or text stream is required.' });
    }

    const defaultMarks = Number(marks_per_question) || 4;
    const defaultNegative = Number(negative_marks) || 1;
    let extractedText = raw_text || '';
    let pageCount = 1;
    let fileSize = 0;
    let fileBuffer: Buffer = Buffer.alloc(0);

    if (file_data) {
      const cleanBase64 = file_data.includes(',') ? file_data.split(',')[1] : file_data;
      fileBuffer = Buffer.from(cleanBase64, 'base64');
      fileSize = fileBuffer.length;

      try {
        const parsed = await pdfParse(fileBuffer);
        extractedText = parsed.text || '';
        pageCount = parsed.numpages || 1;
      } catch (pdfErr) {
        console.warn('[ZeroLeak Competitive] pdfParse error, attempting AI fallback:', pdfErr);
      }
    }

    const fileId = `cpf-${uuidv4()}`;
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const now = new Date().toISOString();

    // 1. Persist ACTUAL PDF BYTES directly in PostgreSQL BYTEA (NO Cloudinary)
    if (pg) {
      try {
        await pg.query(
          `INSERT INTO competitive_question_pool_files (
            id, org_id, exam_id, subject_id, subject_name, file_name, mime_type, file_size, file_data, file_hash, status, question_count, uploaded_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PROCESSING', 0, $11)`,
          [
            fileId,
            orgId,
            exam_id,
            effectiveSubjectId,
            effectiveSubjectName,
            file_name || 'uploaded_document.pdf',
            'application/pdf',
            fileSize,
            fileBuffer,
            fileHash,
            now,
          ]
        );
      } catch (pgInsertErr) {
        console.warn('[ZeroLeak Competitive] PostgreSQL BYTEA insertion notice:', pgInsertErr);
      }
    }

    // Mirror to local SQLite metadata
    if (db) {
      executeRun(
        db,
        `INSERT INTO competitive_question_pool_files (
          id, org_id, exam_id, subject_id, subject_name, file_name, mime_type, file_size, file_hash, status, question_count, uploaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSING', 0, ?)`,
        [
          fileId,
          orgId,
          exam_id,
          effectiveSubjectId,
          effectiveSubjectName,
          file_name || 'uploaded_document.pdf',
          'application/pdf',
          fileSize,
          fileHash,
          now,
        ]
      );
    }

    // 2. Extract questions with LaTeX formulas, scientific notation, and diagrams handling
    let questions = parseQuestionsFromRawText(
      extractedText,
      effectiveSubjectName,
      file_name || 'uploaded_document.pdf',
      defaultMarks,
      defaultNegative
    );

    if (questions.length === 0 && file_data) {
      try {
        const aiResult = await extractQuestionsFromPaperWithAI(
          extractedText,
          effectiveSubjectName,
          'Competitive Exam',
          file_data.includes(',') ? file_data.split(',')[1] : file_data
        );

        if (aiResult?.extractedQuestions && aiResult.extractedQuestions.length > 0) {
          questions = aiResult.extractedQuestions.map((q, idx) => {
            const rawOpts = (q.options || []).map((opt: any, oIdx: number) => {
              if (typeof opt === 'string') {
                const label = ['A', 'B', 'C', 'D', 'E'][oIdx] || `${oIdx + 1}`;
                return { label, text: opt };
              }
              return { label: opt.label || opt.id || 'A', text: opt.text || opt.content || '' };
            });

            let optA = '';
            let optB = '';
            let optC = '';
            let optD = '';
            for (const o of rawOpts) {
              const l = o.label.toUpperCase();
              if (l === 'A' || l === '1') optA = o.text;
              else if (l === 'B' || l === '2') optB = o.text;
              else if (l === 'C' || l === '3') optC = o.text;
              else if (l === 'D' || l === '4') optD = o.text;
            }

            const content = (q as any).content || q.content_text || '';
            const hasDiagram = /\b(fig(?:ure)?\.?|diagram|circuit|graph|plot|chart|shown below)\b/i.test(content);

            return {
              id: `cq-${uuidv4()}`,
              questionNumber: `${idx + 1}`,
              subject: effectiveSubjectName,
              type: rawOpts.length >= 2 ? 'MCQ' : 'Descriptive',
              questionText: content,
              optionA: optA,
              optionB: optB,
              optionC: optC,
              optionD: optD,
              options: rawOpts,
              marks: defaultMarks,
              negativeMarks: defaultNegative,
              sourcePdf: file_name || 'uploaded_document.pdf',
              sourcePage: q.page_number || 1,
              sourceQuestionNumber: `${idx + 1}`,
              hasDiagram,
              verificationStatus: 'UNVERIFIED',
              translationStatus: 'ORIGINAL',
            };
          });
        }
      } catch (aiErr) {
        console.warn('[ZeroLeak Competitive] AI OCR fallback note:', aiErr);
      }
    }

    if (questions.length === 0) {
      const errMsg = `No extractable questions found in "${file_name || 'document'}". Please ensure the uploaded PDF contains valid examination questions.`;
      if (pg) {
        await pg.query('UPDATE competitive_question_pool_files SET status = $1, error_message = $2 WHERE id = $3', ['FAILED', errMsg, fileId]);
      }
      if (db) {
        executeRun(db, 'UPDATE competitive_question_pool_files SET status = ?, error_message = ? WHERE id = ?', ['FAILED', errMsg, fileId]);
      }
      return res.status(400).json({ error: errMsg });
    }

    // 3. Save Questions strictly referencing source_file_id & subject_id
    for (const q of questions) {
      const qId = q.id || `cq-${uuidv4()}`;

      if (pg) {
        try {
          await pg.query(
            `INSERT INTO competitive_questions (
              id, org_id, exam_id, subject_id, source_file_id, pool_id, subject, question_number, question_type,
              question_text, option_a, option_b, option_c, option_d, options_json, correct_option, sub_questions_json,
              marks, negative_marks, source_pdf, source_page, source_question_number, has_diagram, verification_status,
              translation_status, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)`,
            [
              qId,
              orgId,
              exam_id,
              effectiveSubjectId,
              fileId,
              fileId,
              effectiveSubjectName,
              q.questionNumber,
              q.type,
              q.questionText,
              q.optionA || '',
              q.optionB || '',
              q.optionC || '',
              q.optionD || '',
              JSON.stringify(q.options),
              q.correctOption || null,
              JSON.stringify(q.subQuestions || []),
              q.marks,
              q.negativeMarks,
              q.sourcePdf || file_name,
              q.sourcePage || 1,
              q.sourceQuestionNumber || q.questionNumber,
              Boolean(q.hasDiagram),
              'UNVERIFIED',
              'ORIGINAL',
              now,
              now,
            ]
          );
        } catch (pgQErr) {
          console.warn('[ZeroLeak Competitive] PG question insert notice:', pgQErr);
        }
      }

      if (db) {
        executeRun(
          db,
          `INSERT INTO competitive_questions (
            id, org_id, exam_id, subject_id, source_file_id, pool_id, subject, question_number, question_type,
            question_text, option_a, option_b, option_c, option_d, options_json, correct_option, sub_questions_json,
            marks, negative_marks, source_pdf, source_page, source_question_number, has_diagram, verification_status,
            translation_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            qId,
            orgId,
            exam_id,
            effectiveSubjectId,
            fileId,
            fileId,
            effectiveSubjectName,
            q.questionNumber,
            q.type,
            q.questionText,
            q.optionA || '',
            q.optionB || '',
            q.optionC || '',
            q.optionD || '',
            JSON.stringify(q.options),
            q.correctOption || null,
            JSON.stringify(q.subQuestions || []),
            q.marks,
            q.negativeMarks,
            q.sourcePdf || file_name,
            q.sourcePage || 1,
            q.sourceQuestionNumber || q.questionNumber,
            q.hasDiagram ? 1 : 0,
            'UNVERIFIED',
            'ORIGINAL',
            now,
            now,
          ]
        );
      }
    }

    // 4. Update file record to COMPLETED / EXTRACTED
    if (pg) {
      await pg.query(
        'UPDATE competitive_question_pool_files SET status = $1, question_count = $2, processed_at = $3 WHERE id = $4',
        ['COMPLETED', questions.length, now, fileId]
      );
    }
    if (db) {
      executeRun(
        db,
        'UPDATE competitive_question_pool_files SET status = ?, question_count = ?, processed_at = ? WHERE id = ?',
        ['COMPLETED', questions.length, now, fileId]
      );
    }

    return res.json({
      success: true,
      message: `Extracted ${questions.length} real questions from ${file_name} into ${effectiveSubjectName} pool.`,
      fileId,
      poolId: fileId,
      extractedCount: questions.length,
      pdf: {
        id: fileId,
        fileId,
        examId: exam_id,
        subjectId: effectiveSubjectId,
        subjectName: effectiveSubjectName,
        name: file_name || 'uploaded_document.pdf',
        size: fileSize,
        status: 'COMPLETED',
        extractedCount: questions.length,
        uploadedAt: now,
      },
      questions,
    });
  } catch (err: any) {
    console.error('handleUploadSubjectPdf error:', err);
    return res.status(500).json({ error: err.message || 'Failed to extract questions from uploaded PDF.' });
  }
}

// 5. GET /api/competitive/pool-files/:examId/:subjectId
export async function handleGetSubjectPoolFiles(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const { examId, subjectId } = req.params;
    const pg = getPostgresPool();
    const db = await getDb();

    let files: any[] = [];
    if (pg) {
      const result = await pg.query(
        "SELECT id, exam_id, subject_id, subject_name, file_name, mime_type, file_size, file_hash, status, question_count, error_message, uploaded_at, processed_at FROM competitive_question_pool_files WHERE exam_id = $1 AND subject_id = $2 AND org_id = $3 AND status <> 'DELETED' ORDER BY uploaded_at ASC",
        [examId, subjectId, orgId]
      );
      files = result.rows;
    } else if (db) {
      files = executeQuery(
        db,
        "SELECT id, exam_id, subject_id, subject_name, file_name, mime_type, file_size, file_hash, status, question_count, error_message, uploaded_at, processed_at FROM competitive_question_pool_files WHERE exam_id = ? AND subject_id = ? AND org_id = ? AND status <> 'DELETED' ORDER BY uploaded_at ASC",
        [examId, subjectId, orgId]
      );
    }

    return res.json({ success: true, files });
  } catch (err: any) {
    console.error('handleGetSubjectPoolFiles error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch subject pool files.' });
  }
}

// 6. GET /api/competitive/question-pools/:examId
export async function handleGetQuestionPools(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const examId = req.params.examId;
    const pg = getPostgresPool();
    const db = await getDb();

    let files: any[] = [];
    let questions: any[] = [];

    if (pg) {
      const fRes = await pg.query(
        "SELECT id, exam_id, subject_id, subject_name, file_name, mime_type, file_size, file_hash, status, question_count, error_message, uploaded_at, processed_at FROM competitive_question_pool_files WHERE exam_id = $1 AND org_id = $2 AND status <> 'DELETED' ORDER BY uploaded_at ASC",
        [examId, orgId]
      );
      files = fRes.rows;

      const qRes = await pg.query(
        'SELECT * FROM competitive_questions WHERE exam_id = $1 AND org_id = $2 ORDER BY subject ASC, source_page ASC, created_at ASC',
        [examId, orgId]
      );
      questions = qRes.rows;
    } else if (db) {
      files = executeQuery(
        db,
        "SELECT id, exam_id, subject_id, subject_name, file_name, mime_type, file_size, file_hash, status, question_count, error_message, uploaded_at, processed_at FROM competitive_question_pool_files WHERE exam_id = ? AND org_id = ? AND status <> 'DELETED' ORDER BY uploaded_at ASC",
        [examId, orgId]
      );

      questions = executeQuery(
        db,
        'SELECT * FROM competitive_questions WHERE exam_id = ? AND org_id = ? ORDER BY subject ASC, source_page ASC, created_at ASC',
        [examId, orgId]
      );
    }

    const formattedQuestions = questions.map(q => ({
      ...q,
      options: q.options_json ? (typeof q.options_json === 'string' ? JSON.parse(q.options_json) : q.options_json) : [],
      subQuestions: q.sub_questions_json ? (typeof q.sub_questions_json === 'string' ? JSON.parse(q.sub_questions_json) : q.sub_questions_json) : [],
      hasDiagram: Boolean(q.has_diagram),
    }));

    // Live counts grouped by subject
    const subjectStats: Record<string, { totalPdfs: number; totalExtracted: number; totalVerified: number; totalRejected: number }> = {};
    for (const f of files) {
      const key = (f.subject_id || f.subject_name || '').toLowerCase();
      if (!subjectStats[key]) subjectStats[key] = { totalPdfs: 0, totalExtracted: 0, totalVerified: 0, totalRejected: 0 };
      subjectStats[key].totalPdfs++;
    }

    for (const q of formattedQuestions) {
      const key = (q.subject_id || q.subject || '').toLowerCase();
      if (!subjectStats[key]) subjectStats[key] = { totalPdfs: 0, totalExtracted: 0, totalVerified: 0, totalRejected: 0 };
      subjectStats[key].totalExtracted++;
      if (q.verification_status === 'VERIFIED') subjectStats[key].totalVerified++;
      else if (q.verification_status === 'REJECTED') subjectStats[key].totalRejected++;
    }

    return res.json({
      success: true,
      pools: files,
      files,
      questions: formattedQuestions,
      subjectStats,
    });
  } catch (err: any) {
    console.error('handleGetQuestionPools error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch question pools.' });
  }
}

// 7. GET /api/competitive/pool-files/:fileId/download (Stream PDF directly from PostgreSQL BYTEA)
export async function handleDownloadPoolFile(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const fileId = req.params.fileId;
    const pg = getPostgresPool();

    if (!pg) {
      return res.status(503).json({ error: 'PostgreSQL binary storage is not available.' });
    }

    const result = await pg.query(
      'SELECT file_name, mime_type, file_data, file_size FROM competitive_question_pool_files WHERE id = $1 AND org_id = $2',
      [fileId, orgId]
    );

    if (result.rows.length === 0 || !result.rows[0].file_data) {
      return res.status(404).json({ error: 'File binary not found in database.' });
    }

    const row = result.rows[0];
    res.setHeader('Content-Type', row.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.file_name)}"`);
    return res.send(row.file_data);
  } catch (err: any) {
    console.error('handleDownloadPoolFile error:', err);
    return res.status(500).json({ error: err.message || 'Failed to download pool file.' });
  }
}

// 8. POST /api/competitive/questions/:id/status (Verify / Reject / Reset)
export async function handleUpdateQuestionStatus(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const questionId = req.params.id;
    const { status } = req.body;

    if (!['VERIFIED', 'REJECTED', 'UNVERIFIED'].includes(status)) {
      return res.status(400).json({ error: 'Status must be VERIFIED, REJECTED, or UNVERIFIED.' });
    }

    const now = new Date().toISOString();
    const pg = getPostgresPool();
    const db = await getDb();

    if (pg) {
      await pg.query(
        'UPDATE competitive_questions SET verification_status = $1, updated_at = $2 WHERE id = $3 AND org_id = $4',
        [status, now, questionId, orgId]
      );
    }

    if (db) {
      executeRun(
        db,
        'UPDATE competitive_questions SET verification_status = ?, updated_at = ? WHERE id = ? AND org_id = ?',
        [status, now, questionId, orgId]
      );
    }

    return res.json({ success: true, message: `Question marked as ${status}.`, questionId, status });
  } catch (err: any) {
    console.error('handleUpdateQuestionStatus error:', err);
    return res.status(500).json({ error: err.message || 'Failed to update question status.' });
  }
}

// 9. PUT /api/competitive/questions/:id (Edit Question)
export async function handleUpdateQuestion(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const questionId = req.params.id;
    const {
      question_text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_option,
      marks,
      negative_marks,
      question_type,
    } = req.body;

    const now = new Date().toISOString();
    const pg = getPostgresPool();
    const db = await getDb();

    // Reconstruct options array
    const options: Array<{ label: string; text: string }> = [];
    if (option_a) options.push({ label: 'A', text: option_a });
    if (option_b) options.push({ label: 'B', text: option_b });
    if (option_c) options.push({ label: 'C', text: option_c });
    if (option_d) options.push({ label: 'D', text: option_d });
    const optionsJson = JSON.stringify(options);

    if (pg) {
      await pg.query(
        `UPDATE competitive_questions
         SET question_text = COALESCE($1, question_text),
             option_a = COALESCE($2, option_a),
             option_b = COALESCE($3, option_b),
             option_c = COALESCE($4, option_c),
             option_d = COALESCE($5, option_d),
             options_json = $6,
             correct_option = COALESCE($7, correct_option),
             marks = COALESCE($8, marks),
             negative_marks = COALESCE($9, negative_marks),
             question_type = COALESCE($10, question_type),
             updated_at = $11
         WHERE id = $12 AND org_id = $13`,
        [
          question_text,
          option_a,
          option_b,
          option_c,
          option_d,
          optionsJson,
          correct_option,
          marks ? Number(marks) : null,
          negative_marks !== undefined ? Number(negative_marks) : null,
          question_type,
          now,
          questionId,
          orgId,
        ]
      );
    }

    if (db) {
      executeRun(
        db,
        `UPDATE competitive_questions
         SET question_text = COALESCE(?, question_text),
             option_a = COALESCE(?, option_a),
             option_b = COALESCE(?, option_b),
             option_c = COALESCE(?, option_c),
             option_d = COALESCE(?, option_d),
             options_json = ?,
             correct_option = COALESCE(?, correct_option),
             marks = COALESCE(?, marks),
             negative_marks = COALESCE(?, negative_marks),
             question_type = COALESCE(?, question_type),
             updated_at = ?
         WHERE id = ? AND org_id = ?`,
        [
          question_text,
          option_a,
          option_b,
          option_c,
          option_d,
          optionsJson,
          correct_option,
          marks ? Number(marks) : null,
          negative_marks !== undefined ? Number(negative_marks) : null,
          question_type,
          now,
          questionId,
          orgId,
        ]
      );
    }

    return res.json({ success: true, message: 'Question updated successfully.', questionId });
  } catch (err: any) {
    console.error('handleUpdateQuestion error:', err);
    return res.status(500).json({ error: err.message || 'Failed to update question.' });
  }
}

// 10. POST /api/competitive/questions/batch-verify (Batch Verify for Fast Onboarding)
export async function handleBatchVerifyQuestions(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const { exam_id, subject_id, status } = req.body;

    if (!exam_id) return res.status(400).json({ error: 'exam_id is required.' });
    const targetStatus = status === 'UNVERIFIED' ? 'UNVERIFIED' : 'VERIFIED';
    const now = new Date().toISOString();
    const pg = getPostgresPool();
    const db = await getDb();

    if (pg) {
      if (subject_id) {
        await pg.query(
          'UPDATE competitive_questions SET verification_status = $1, updated_at = $2 WHERE exam_id = $3 AND subject_id = $4 AND org_id = $5 AND verification_status <> $1',
          [targetStatus, now, exam_id, subject_id, orgId]
        );
      } else {
        await pg.query(
          'UPDATE competitive_questions SET verification_status = $1, updated_at = $2 WHERE exam_id = $3 AND org_id = $4 AND verification_status <> $1',
          [targetStatus, now, exam_id, orgId]
        );
      }
    }

    if (db) {
      if (subject_id) {
        executeRun(
          db,
          'UPDATE competitive_questions SET verification_status = ?, updated_at = ? WHERE exam_id = ? AND subject_id = ? AND org_id = ?',
          [targetStatus, now, exam_id, subject_id, orgId]
        );
      } else {
        executeRun(
          db,
          'UPDATE competitive_questions SET verification_status = ?, updated_at = ? WHERE exam_id = ? AND org_id = ?',
          [targetStatus, now, exam_id, orgId]
        );
      }
    }

    return res.json({ success: true, message: `Batch updated questions to ${targetStatus}.` });
  } catch (err: any) {
    console.error('handleBatchVerifyQuestions error:', err);
    return res.status(500).json({ error: err.message || 'Failed to batch update questions.' });
  }
}

// 11. POST /api/competitive/validate-blueprint (Strict Quota Validation against Verified Questions)
export async function handleValidateBlueprint(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const { exam_id, blueprint } = req.body;

    if (!blueprint || !Array.isArray(blueprint.subjects) || blueprint.subjects.length === 0) {
      return res.status(400).json({ error: 'Blueprint must contain at least one configured subject.' });
    }

    const pg = getPostgresPool();
    const db = await getDb();

    // Query VERIFIED questions for this exam
    let questions: any[] = [];
    if (pg) {
      const qRes = await pg.query(
        "SELECT id, subject, subject_id, source_pdf FROM competitive_questions WHERE exam_id = $1 AND org_id = $2 AND verification_status = 'VERIFIED'",
        [exam_id, orgId]
      );
      questions = qRes.rows;
    } else if (db) {
      questions = executeQuery(
        db,
        "SELECT id, subject, subject_id, source_pdf FROM competitive_questions WHERE exam_id = ? AND org_id = ? AND verification_status = 'VERIFIED'",
        [exam_id, orgId]
      );
    }

    // Query VERIFIED translations for this exam
    let translations: any[] = [];
    if (pg) {
      const tRes = await pg.query(
        "SELECT id, subject_id, source_question_id, language FROM competitive_question_translations WHERE exam_id = $1 AND org_id = $2 AND verification_status = 'VERIFIED'",
        [exam_id, orgId]
      );
      translations = tRes.rows;
    } else if (db) {
      translations = executeQuery(
        db,
        "SELECT id, subject_id, source_question_id, language FROM competitive_question_translations WHERE exam_id = ? AND org_id = ? AND verification_status = 'VERIFIED'",
        [exam_id, orgId]
      );
    }

    // Group available questions by subject
    const countBySubject: Record<string, number> = {};
    const sourcesBySubject: Record<string, Set<string>> = {};
    const verifiedQuestionIds = new Set<string>();

    for (const q of questions) {
      verifiedQuestionIds.add(q.id);
      const keyById = (q.subject_id || '').trim().toLowerCase();
      const keyByName = (q.subject || '').trim().toLowerCase();

      if (keyById) {
        countBySubject[keyById] = (countBySubject[keyById] || 0) + 1;
        if (!sourcesBySubject[keyById]) sourcesBySubject[keyById] = new Set();
        if (q.source_pdf) sourcesBySubject[keyById].add(q.source_pdf);
      }
      if (keyByName) {
        countBySubject[keyByName] = (countBySubject[keyByName] || 0) + 1;
        if (!sourcesBySubject[keyByName]) sourcesBySubject[keyByName] = new Set();
        if (q.source_pdf) sourcesBySubject[keyByName].add(q.source_pdf);
      }
    }

    // Group verified translations by subject and language that match verified source questions
    const validTranslationsBySubjectLang: Record<string, number> = {};
    for (const t of translations) {
      if (verifiedQuestionIds.has(t.source_question_id)) {
        const langKey = (t.language || '').trim().toLowerCase();
        const subKey = (t.subject_id || '').trim().toLowerCase();
        const comboKey = `${subKey}::${langKey}`;
        validTranslationsBySubjectLang[comboKey] = (validTranslationsBySubjectLang[comboKey] || 0) + 1;
      }
    }

    let allValid = true;
    const subjectResults: Array<{
      subject: string;
      subjectId?: string;
      required: number;
      available: number;
      deficit: number;
      sourceCount: number;
      translationRequired?: boolean;
      translationLanguage?: string;
      translatedAvailable?: number;
      translatedRequired?: number;
      translationDeficit?: number;
      passed: boolean;
      message: string;
    }> = [];

    for (const s of blueprint.subjects) {
      const keyById = (s.id || '').trim().toLowerCase();
      const keyByName = (s.subjectName || '').trim().toLowerCase();

      const perPaper = Number(s.numberOfQuestions) || 0;
      // 3 Unique Disjoint Papers require 3 * N verified questions
      const required = perPaper * 3;
      const available = countBySubject[keyById] || countBySubject[keyByName] || 0;
      const sourceCount = (sourcesBySubject[keyById] || sourcesBySubject[keyByName])?.size || 0;
      let passed = available >= required;
      let deficit = Math.max(0, required - available);

      let translatedAvailable = 0;
      let translatedRequired = 0;
      let translationDeficit = 0;

      if (s.translationRequired) {
        const targetLang = (s.translationLanguage || 'Hindi').trim().toLowerCase();
        translatedRequired = required;
        const comboKey = `${keyById}::${targetLang}`;
        translatedAvailable = validTranslationsBySubjectLang[comboKey] || 0;
        translationDeficit = Math.max(0, translatedRequired - translatedAvailable);

        if (translatedAvailable < translatedRequired) {
          passed = false;
        }
      }

      if (!passed) {
        allValid = false;
      }

      let advisory = '';
      if (passed) {
        advisory = s.translationRequired
          ? `${s.subjectName} meets 3-Paper quota: ${available} verified source questions and ${translatedAvailable} verified ${s.translationLanguage} translations (Quota: ${required}) — Ready.`
          : `${s.subjectName} meets 3-Paper quota: ${available} verified questions from ${sourceCount} source PDF(s) (Quota: ${required}) — Ready.`;
      } else {
        const errs: string[] = [];
        if (available < required) {
          errs.push(`Source pool has ${available}/${required} verified questions (Deficit: ${deficit})`);
        }
        if (s.translationRequired && translatedAvailable < translatedRequired) {
          errs.push(`${s.translationLanguage || 'Regional'} translations have ${translatedAvailable}/${translatedRequired} verified (Translation Deficit: ${translationDeficit})`);
        }
        advisory = `${s.subjectName} quota not met: ${errs.join('; ')}.`;
      }

      subjectResults.push({
        subject: s.subjectName,
        subjectId: s.id,
        required,
        available,
        deficit,
        sourceCount,
        translationRequired: Boolean(s.translationRequired),
        translationLanguage: s.translationLanguage,
        translatedAvailable,
        translatedRequired,
        translationDeficit,
        passed,
        message: advisory,
      });
    }

    return res.json({
      success: true,
      valid: allValid,
      subjectResults,
      overallMessage: allValid
        ? 'All subjects meet 3-Paper combination and translation quotas. Synthesis of 3 Unique Papers is authorized.'
        : 'One or more subjects have insufficient verified questions or verified translations for 3 unique disjoint papers. Please upload additional PDF pools or complete translations.',
    });
  } catch (err: any) {
    console.error('handleValidateBlueprint error:', err);
    return res.status(500).json({ error: err.message || 'Blueprint validation failed.' });
  }
}

// Helper: shuffle array
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 12. POST /api/competitive/generate-final-paper (Synthesize 3 Unique Disjoint Paper Combinations)
export async function handleGenerateCompetitivePaper(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const { exam_id, blueprint } = req.body;

    if (!exam_id) return res.status(400).json({ error: 'Exam ID is required.' });
    if (!blueprint || !Array.isArray(blueprint.subjects) || blueprint.subjects.length === 0) {
      return res.status(400).json({ error: 'A valid blueprint with at least one subject is required.' });
    }

    const pg = getPostgresPool();
    const db = await getDb();

    let exam: any = null;
    if (pg) {
      const eRes = await pg.query('SELECT * FROM competitive_exams WHERE id = $1 AND org_id = $2', [exam_id, orgId]);
      if (eRes.rows.length > 0) exam = eRes.rows[0];
    } else if (db) {
      const examRows = executeQuery(db, 'SELECT * FROM competitive_exams WHERE id = ? AND org_id = ?', [exam_id, orgId]);
      if (examRows && examRows[0]) exam = examRows[0];
    }

    const examName = exam?.name || 'Competitive Examination';
    const examType = exam?.exam_type || 'Competitive Examination';

    // 1. Fetch all VERIFIED questions for this exam
    let allQuestions: any[] = [];
    if (pg) {
      const qRes = await pg.query(
        "SELECT * FROM competitive_questions WHERE exam_id = $1 AND org_id = $2 AND verification_status = 'VERIFIED' ORDER BY created_at ASC",
        [exam_id, orgId]
      );
      allQuestions = qRes.rows;
    } else if (db) {
      allQuestions = executeQuery(
        db,
        "SELECT * FROM competitive_questions WHERE exam_id = ? AND org_id = ? AND verification_status = 'VERIFIED' ORDER BY created_at ASC",
        [exam_id, orgId]
      );
    }

    // 2. Fetch all VERIFIED translations for this exam
    let allTranslations: any[] = [];
    if (pg) {
      const tRes = await pg.query(
        "SELECT * FROM competitive_question_translations WHERE exam_id = $1 AND org_id = $2 AND verification_status = 'VERIFIED'",
        [exam_id, orgId]
      );
      allTranslations = tRes.rows;
    } else if (db) {
      allTranslations = executeQuery(
        db,
        "SELECT * FROM competitive_question_translations WHERE exam_id = ? AND org_id = ? AND verification_status = 'VERIFIED'",
        [exam_id, orgId]
      );
    }

    // Map verified translations by source_question_id and language
    const translationsMap = new Map<string, any>();
    for (const t of allTranslations) {
      const key = `${t.source_question_id}::${(t.language || '').trim().toLowerCase()}`;
      translationsMap.set(key, t);
    }

    // Group verified questions by subject
    const subjectQuestionsMap: Record<string, any[]> = {};
    for (const q of allQuestions) {
      const keyById = (q.subject_id || '').trim().toLowerCase();
      const keyByName = (q.subject || '').trim().toLowerCase();

      if (keyById) {
        if (!subjectQuestionsMap[keyById]) subjectQuestionsMap[keyById] = [];
        subjectQuestionsMap[keyById].push(q);
      }
      if (keyByName && keyByName !== keyById) {
        if (!subjectQuestionsMap[keyByName]) subjectQuestionsMap[keyByName] = [];
        subjectQuestionsMap[keyByName].push(q);
      }
    }

    // 3. Strict Quota Enforcement for 3 Disjoint Papers:
    // Total verified questions needed = 3 * questions_per_paper
    // When translation is required, each question must have a verified translation
    const sortedSubjectRules = [...blueprint.subjects].sort((a, b) => (a.subjectOrder || 0) - (b.subjectOrder || 0));

    // Per subject: partition into 3 disjoint subsets
    const partitionedSubjectQuestions: Record<string, [any[], any[], any[]]> = {};

    for (const rule of sortedSubjectRules) {
      const keyById = (rule.id || '').trim().toLowerCase();
      const keyByName = (rule.subjectName || '').trim().toLowerCase();
      const rawPool = subjectQuestionsMap[keyById] || subjectQuestionsMap[keyByName] || [];
      const perPaper = Number(rule.numberOfQuestions) || 0;
      const requiredTotal = perPaper * 3;

      let validPool: any[] = [];
      if (rule.translationRequired) {
        const targetLang = (rule.translationLanguage || 'Hindi').trim().toLowerCase();
        // Intersection: must be verified in questions AND have verified translation in targetLang
        validPool = rawPool.filter(q => translationsMap.has(`${q.id}::${targetLang}`));
        if (validPool.length < requiredTotal) {
          const deficit = requiredTotal - validPool.length;
          return res.status(400).json({
            error: `${rule.subjectName} requires ${requiredTotal} verified translated questions for 3 unique paper combinations (${perPaper} per paper x 3), but only ${validPool.length} are verified in ${rule.translationLanguage || 'Regional'}. (Deficit: ${deficit}). Generation blocked.`,
          });
        }
      } else {
        validPool = [...rawPool];
        if (validPool.length < requiredTotal) {
          const deficit = requiredTotal - validPool.length;
          return res.status(400).json({
            error: `${rule.subjectName} requires ${requiredTotal} verified source questions for 3 unique paper combinations (${perPaper} per paper x 3), but only ${validPool.length} are verified. (Deficit: ${deficit}). Generation blocked.`,
          });
        }
      }

      // Shuffle and partition valid pool into 3 completely disjoint sets
      const shuffled = shuffleArray(validPool);
      const setA = shuffled.slice(0, perPaper);
      const setB = shuffled.slice(perPaper, perPaper * 2);
      const setC = shuffled.slice(perPaper * 2, perPaper * 3);

      // Verify mathematical disjointness
      const idsA = new Set(setA.map(q => q.id));
      const idsB = new Set(setB.map(q => q.id));
      const idsC = new Set(setC.map(q => q.id));

      for (const id of idsA) {
        if (idsB.has(id) || idsC.has(id)) {
          throw new Error(`Integrity error: Duplicate question detected in disjoint partition for ${rule.subjectName}`);
        }
      }
      for (const id of idsB) {
        if (idsC.has(id)) {
          throw new Error(`Integrity error: Duplicate question detected in disjoint partition for ${rule.subjectName}`);
        }
      }

      partitionedSubjectQuestions[rule.id || rule.subjectName] = [setA, setB, setC];
    }

    // Now generate Paper 1, Paper 2, Paper 3
    const now = new Date().toISOString();
    const generatedPaperSets: any[] = [];

    for (let paperIdx = 0; paperIdx < 3; paperIdx++) {
      const paperNum = paperIdx + 1;
      const paperId = `cpaper-${uuidv4()}`;
      const paperStatus = paperNum === 1 ? 'AVAILABLE' : 'LOCKED';
      const paperTitle = `${examName} (Paper ${paperNum})`;

      const generatedSections: any[] = [];
      const finalQuestions: any[] = [];
      const sourceProvenanceList: any[] = [];
      let globalQuestionNumber = 1;
      let totalMarks = 0;
      let totalPositiveMarks = 0;
      let totalNegativeMarks = 0;

      for (let sIdx = 0; sIdx < sortedSubjectRules.length; sIdx++) {
        const rule = sortedSubjectRules[sIdx];
        const partitionKey = rule.id || rule.subjectName;
        const selectedForSubject = partitionedSubjectQuestions[partitionKey][paperIdx];

        const sectionLetter = String.fromCharCode(65 + sIdx);
        const sectionName = `SECTION ${sectionLetter} — ${rule.subjectName.toUpperCase()}`;
        const sectionQuestions: any[] = [];

        for (const rawQ of selectedForSubject) {
          const qOptions = rawQ.options_json ? (typeof rawQ.options_json === 'string' ? JSON.parse(rawQ.options_json) : rawQ.options_json) : [];
          let translatedText: string | undefined = undefined;
          let translatedOptions: any[] | undefined = undefined;

          if (rule.translationRequired && rule.translationLanguage) {
            const trKey = `${rawQ.id}::${(rule.translationLanguage || 'Hindi').trim().toLowerCase()}`;
            const trRecord = translationsMap.get(trKey);
            if (trRecord) {
              translatedText = trRecord.translated_question_text || trRecord.translated_text || undefined;
              if (trRecord.translated_options_json) {
                try {
                  const parsedTrOpts = JSON.parse(trRecord.translated_options_json);
                  if (Array.isArray(parsedTrOpts)) {
                    translatedOptions = parsedTrOpts;
                  }
                } catch {
                  // Fallback to individual columns
                }
              }
              if (!translatedOptions && (trRecord.translated_option_a || trRecord.translated_option_b)) {
                translatedOptions = [
                  { label: 'A', text: trRecord.translated_option_a || '' },
                  { label: 'B', text: trRecord.translated_option_b || '' },
                  { label: 'C', text: trRecord.translated_option_c || '' },
                  { label: 'D', text: trRecord.translated_option_d || '' },
                ];
              }
            }
          }

          const qMarks = Number(rule.marksPerQuestion) || 4;
          const qNeg = Number(rule.negativeMarks) || 0;

          const assembledQuestion = {
            id: `final-q-${uuidv4()}`,
            originalQuestionId: rawQ.id,
            displayNumber: `Q${globalQuestionNumber}`,
            questionNumber: globalQuestionNumber,
            sectionName,
            subject: rule.subjectName,
            questionType: rule.questionType,
            questionText: rawQ.question_text,
            options: qOptions,
            optionA: rawQ.option_a,
            optionB: rawQ.option_b,
            optionC: rawQ.option_c,
            optionD: rawQ.option_d,
            hasDiagram: Boolean(rawQ.has_diagram),
            translatedText,
            translatedOptions,
            marks: qMarks,
            negativeMarks: qNeg,
            translationRequired: Boolean(rule.translationRequired),
            translationLanguage: rule.translationLanguage,
            sourcePdf: rawQ.source_pdf,
            sourcePage: rawQ.source_page,
            sourceQuestionNumber: rawQ.source_question_number,
          };

          sectionQuestions.push(assembledQuestion);
          finalQuestions.push(assembledQuestion);

          sourceProvenanceList.push({
            questionNumber: `Q${globalQuestionNumber}`,
            subject: rule.subjectName,
            sourcePdf: rawQ.source_pdf,
            sourcePage: rawQ.source_page,
            sourceQuestionNumber: rawQ.source_question_number,
          });

          totalMarks += qMarks;
          totalPositiveMarks += qMarks;
          totalNegativeMarks += qNeg;
          globalQuestionNumber++;
        }

        generatedSections.push({
          sectionLetter,
          sectionName,
          subject: rule.subjectName,
          questionType: rule.questionType,
          marksPerQuestion: rule.marksPerQuestion,
          negativeMarks: rule.negativeMarks,
          translationRequired: rule.translationRequired,
          translationLanguage: rule.translationLanguage,
          totalQuestions: sectionQuestions.length,
          totalSectionMarks: sectionQuestions.length * rule.marksPerQuestion,
          questions: sectionQuestions,
        });
      }

      // SHA-256 fingerprint for paper
      const fingerprintPayload = `${paperId}:${exam_id}:${paperNum}:${totalMarks}:${finalQuestions.map(q => q.originalQuestionId).join(',')}`;
      const paperFingerprint = crypto.createHash('sha256').update(fingerprintPayload).digest('hex');

      // Persist to PostgreSQL
      if (pg) {
        await pg.query(
          `INSERT INTO competitive_generated_papers (
            id, org_id, exam_id, title, exam_type, total_questions, total_marks, total_positive_marks, total_negative_marks,
            sections_json, questions_json, blueprint_snapshot_json, source_provenance_json, paper_fingerprint,
            paper_number, status, generated_by, generated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            paperId,
            orgId,
            exam_id,
            paperTitle,
            examType,
            finalQuestions.length,
            totalMarks,
            totalPositiveMarks,
            totalNegativeMarks,
            JSON.stringify(generatedSections),
            JSON.stringify(finalQuestions),
            JSON.stringify(blueprint),
            JSON.stringify(sourceProvenanceList),
            paperFingerprint,
            paperNum,
            paperStatus,
            req.user?.id || 'admin',
            now,
          ]
        );

        // Persist mapped questions into competitive_generated_paper_questions
        for (let qIdx = 0; qIdx < finalQuestions.length; qIdx++) {
          const q = finalQuestions[qIdx];
          await pg.query(
            `INSERT INTO competitive_generated_paper_questions (
              id, paper_id, question_id, sequence_number, subject, marks, negative_marks,
              original_question_id, question_text, options_json, translated_text, translated_options_json,
              source_pdf, source_page, source_question_number, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
            [
              `cgpq-${uuidv4()}`,
              paperId,
              q.id,
              qIdx + 1,
              q.subject,
              q.marks,
              q.negativeMarks,
              q.originalQuestionId,
              q.questionText,
              JSON.stringify(q.options || []),
              q.translatedText || null,
              q.translatedOptions ? JSON.stringify(q.translatedOptions) : null,
              q.sourcePdf || null,
              q.sourcePage || null,
              q.sourceQuestionNumber || null,
              now,
            ]
          );
        }
      }

      if (db) {
        executeRun(
          db,
          `INSERT INTO competitive_generated_papers (
            id, org_id, exam_id, title, exam_type, total_questions, total_marks, total_positive_marks, total_negative_marks,
            sections_json, questions_json, blueprint_snapshot_json, source_provenance_json, paper_fingerprint,
            paper_number, status, generated_by, generated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            paperId,
            orgId,
            exam_id,
            paperTitle,
            examType,
            finalQuestions.length,
            totalMarks,
            totalPositiveMarks,
            totalNegativeMarks,
            JSON.stringify(generatedSections),
            JSON.stringify(finalQuestions),
            JSON.stringify(blueprint),
            JSON.stringify(sourceProvenanceList),
            paperFingerprint,
            paperNum,
            paperStatus,
            req.user?.id || 'admin',
            now,
          ]
        );

        for (let qIdx = 0; qIdx < finalQuestions.length; qIdx++) {
          const q = finalQuestions[qIdx];
          executeRun(
            db,
            `INSERT INTO competitive_generated_paper_questions (
              id, paper_id, question_id, sequence_number, subject, marks, negative_marks,
              original_question_id, question_text, options_json, translated_text, translated_options_json,
              source_pdf, source_page, source_question_number, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              `cgpq-${uuidv4()}`,
              paperId,
              q.id,
              qIdx + 1,
              q.subject,
              q.marks,
              q.negativeMarks,
              q.originalQuestionId,
              q.questionText,
              JSON.stringify(q.options || []),
              q.translatedText || null,
              q.translatedOptions ? JSON.stringify(q.translatedOptions) : null,
              q.sourcePdf || null,
              q.sourcePage || null,
              q.sourceQuestionNumber || null,
              now,
            ]
          );
        }
      }

      generatedPaperSets.push({
        id: paperId,
        examId: exam_id,
        paperNumber: paperNum,
        status: paperStatus,
        title: paperTitle,
        examType,
        durationMinutes: exam?.duration_minutes || 180,
        examDate: exam?.exam_date,
        examTime: exam?.exam_time,
        instructions: exam?.instructions,
        totalQuestions: finalQuestions.length,
        totalMarks,
        totalPositiveMarks,
        totalNegativeMarks,
        sections: generatedSections,
        questions: finalQuestions,
        sourceProvenance: sourceProvenanceList,
        paperFingerprint,
        generatedAt: now,
      });
    }

    return res.json({
      success: true,
      message: '3 Unique Competitive Examination Paper Combinations generated successfully.',
      papers: generatedPaperSets,
      paper: generatedPaperSets[0], // Paper 1 returned as active default
    });
  } catch (err: any) {
    console.error('handleGenerateCompetitivePaper error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate competitive papers.' });
  }
}

// 13. GET /api/competitive/generated-papers/:paperId (With Backend Sequential Unlocking Control)
export async function handleGetGeneratedPaper(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const paperId = req.params.paperId;
    const pg = getPostgresPool();
    const db = await getDb();

    let rows: any[] = [];
    if (pg) {
      const result = await pg.query(
        'SELECT * FROM competitive_generated_papers WHERE id = $1 AND org_id = $2',
        [paperId, orgId]
      );
      rows = result.rows;
    } else if (db) {
      rows = executeQuery(
        db,
        'SELECT * FROM competitive_generated_papers WHERE id = ? AND org_id = ?',
        [paperId, orgId]
      );
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Generated competitive paper not found.' });
    }

    const row = rows[0];
    const paperNum = Number(row.paper_number) || 1;

    // Sequential Access Control Check:
    // Paper 2 requires Paper 1 to be COMPLETED
    // Paper 3 requires Paper 2 to be COMPLETED
    if (paperNum > 1) {
      const prevNum = paperNum - 1;
      let prevRows: any[] = [];
      if (pg) {
        const pRes = await pg.query(
          'SELECT status FROM competitive_generated_papers WHERE exam_id = $1 AND org_id = $2 AND paper_number = $3',
          [row.exam_id, orgId, prevNum]
        );
        prevRows = pRes.rows;
      } else if (db) {
        prevRows = executeQuery(
          db,
          'SELECT status FROM competitive_generated_papers WHERE exam_id = ? AND org_id = ? AND paper_number = ?',
          [row.exam_id, orgId, prevNum]
        );
      }

      const prevStatus = prevRows[0]?.status;
      if (prevStatus !== 'COMPLETED') {
        return res.status(403).json({
          error: `Paper ${paperNum} is LOCKED. You must complete and lock Paper ${prevNum} before Paper ${paperNum} can be accessed.`,
          paperNumber: paperNum,
          locked: true,
        });
      }
    }

    return res.json({
      success: true,
      paper: {
        id: row.id,
        examId: row.exam_id,
        paperNumber: row.paper_number || 1,
        status: row.status || 'AVAILABLE',
        title: row.title,
        examType: row.exam_type,
        totalQuestions: row.total_questions,
        totalMarks: row.total_marks,
        totalPositiveMarks: row.total_positive_marks,
        totalNegativeMarks: row.total_negative_marks,
        sections: row.sections_json ? JSON.parse(row.sections_json) : [],
        questions: row.questions_json ? JSON.parse(row.questions_json) : [],
        blueprint: row.blueprint_snapshot_json ? JSON.parse(row.blueprint_snapshot_json) : null,
        sourceProvenance: row.source_provenance_json ? JSON.parse(row.source_provenance_json) : [],
        paperFingerprint: row.paper_fingerprint,
        generatedAt: row.generated_at,
      },
    });
  } catch (err: any) {
    console.error('handleGetGeneratedPaper error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch generated paper.' });
  }
}

// 13b. GET /api/competitive/generated-papers-set/:examId (Fetch 3-Paper Set for Exam)
export async function handleGetGeneratedPaperSet(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const examId = req.params.examId;
    const pg = getPostgresPool();
    const db = await getDb();

    let rows: any[] = [];
    if (pg) {
      const result = await pg.query(
        'SELECT * FROM competitive_generated_papers WHERE exam_id = $1 AND org_id = $2 ORDER BY paper_number ASC, generated_at DESC',
        [examId, orgId]
      );
      rows = result.rows;
    } else if (db) {
      rows = executeQuery(
        db,
        'SELECT * FROM competitive_generated_papers WHERE exam_id = ? AND org_id = ? ORDER BY paper_number ASC, generated_at DESC',
        [examId, orgId]
      );
    }

    // Keep unique paper_number (1, 2, 3)
    const papersByNum = new Map<number, any>();
    for (const r of rows) {
      const pNum = Number(r.paper_number) || 1;
      if (!papersByNum.has(pNum)) {
        papersByNum.set(pNum, {
          id: r.id,
          examId: r.exam_id,
          paperNumber: pNum,
          status: r.status || (pNum === 1 ? 'AVAILABLE' : 'LOCKED'),
          title: r.title,
          examType: r.exam_type,
          totalQuestions: r.total_questions,
          totalMarks: r.total_marks,
          totalPositiveMarks: r.total_positive_marks,
          totalNegativeMarks: r.total_negative_marks,
          sections: r.sections_json ? JSON.parse(r.sections_json) : [],
          questions: r.questions_json ? JSON.parse(r.questions_json) : [],
          blueprint: r.blueprint_snapshot_json ? JSON.parse(r.blueprint_snapshot_json) : null,
          sourceProvenance: r.source_provenance_json ? JSON.parse(r.source_provenance_json) : [],
          paperFingerprint: r.paper_fingerprint,
          generatedAt: r.generated_at,
          startedAt: r.started_at,
          completedAt: r.completed_at,
        });
      }
    }

    const papers = Array.from(papersByNum.values()).sort((a, b) => a.paperNumber - b.paperNumber);
    return res.json({ success: true, papers });
  } catch (err: any) {
    console.error('handleGetGeneratedPaperSet error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch paper set.' });
  }
}

// 13c. POST /api/competitive/generated-papers/:paperId/complete (Complete Paper & Unlock Next)
export async function handleCompleteGeneratedPaper(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const paperId = req.params.paperId;
    const pg = getPostgresPool();
    const db = await getDb();
    const now = new Date().toISOString();

    let targetPaper: any = null;
    if (pg) {
      const r = await pg.query('SELECT * FROM competitive_generated_papers WHERE id = $1 AND org_id = $2', [paperId, orgId]);
      if (r.rows.length > 0) targetPaper = r.rows[0];
    } else if (db) {
      const rows = executeQuery(db, 'SELECT * FROM competitive_generated_papers WHERE id = ? AND org_id = ?', [paperId, orgId]);
      if (rows.length > 0) targetPaper = rows[0];
    }

    if (!targetPaper) {
      return res.status(404).json({ error: 'Paper not found.' });
    }

    const paperNum = Number(targetPaper.paper_number) || 1;
    const nextNum = paperNum + 1;

    // Mark current paper as COMPLETED
    if (pg) {
      await pg.query(
        "UPDATE competitive_generated_papers SET status = 'COMPLETED', completed_at = $1 WHERE id = $2 AND org_id = $3",
        [now, paperId, orgId]
      );
      if (nextNum <= 3) {
        // Unlock next paper
        await pg.query(
          "UPDATE competitive_generated_papers SET status = 'AVAILABLE', started_at = $1 WHERE exam_id = $2 AND org_id = $3 AND paper_number = $4 AND status = 'LOCKED'",
          [now, targetPaper.exam_id, orgId, nextNum]
        );
      }
    }

    if (db) {
      executeRun(
        db,
        "UPDATE competitive_generated_papers SET status = 'COMPLETED', completed_at = ? WHERE id = ? AND org_id = ?",
        [now, paperId, orgId]
      );
      if (nextNum <= 3) {
        executeRun(
          db,
          "UPDATE competitive_generated_papers SET status = 'AVAILABLE', started_at = ? WHERE exam_id = ? AND org_id = ? AND paper_number = ? AND status = 'LOCKED'",
          [now, targetPaper.exam_id, orgId, nextNum]
        );
      }
    }

    return res.json({
      success: true,
      message: `Paper ${paperNum} marked as COMPLETED.${nextNum <= 3 ? ` Paper ${nextNum} is now UNLOCKED.` : ''}`,
      completedPaperId: paperId,
      unlockedPaperNumber: nextNum <= 3 ? nextNum : null,
    });
  } catch (err: any) {
    console.error('handleCompleteGeneratedPaper error:', err);
    return res.status(500).json({ error: err.message || 'Failed to complete paper.' });
  }
}

// =========================================================================
// TRANSLATION ENDPOINTS (Requirements 2, 3, 4, 5, 6, 7)
// =========================================================================

// 15. GET /api/competitive/translators (Authorized translators in same organization)
export async function handleGetCompetitiveTranslators(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const pg = getPostgresPool();
    const db = await getDb();

    let translators: any[] = [];
    if (pg) {
      const resPg = await pg.query(
        "SELECT id, full_name, email, role, org_id FROM users WHERE org_id = $1 AND role = 'TRANSLATOR' ORDER BY full_name ASC",
        [orgId]
      );
      translators = resPg.rows;
    } else if (db) {
      translators = executeQuery(
        db,
        "SELECT id, full_name, email, role, org_id FROM users WHERE org_id = ? AND role = 'TRANSLATOR' ORDER BY full_name ASC",
        [orgId]
      );
    }

    return res.json({ success: true, translators });
  } catch (err: any) {
    console.error('handleGetCompetitiveTranslators error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch authorized translators.' });
  }
}

// 16. POST /api/competitive/assign-translation (Assign Verified Question Pool to Authorized Translator)
export async function handleAssignTranslation(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const { exam_id, subject_id, subject_name, language, translator_id, question_ids } = req.body;

    if (!exam_id || !subject_id || !language || !translator_id) {
      return res.status(400).json({ error: 'exam_id, subject_id, language, and translator_id are required.' });
    }

    const pg = getPostgresPool();
    const db = await getDb();

    // Verify translator is in same org and role = TRANSLATOR
    let translator: any = null;
    if (pg) {
      const tRes = await pg.query("SELECT * FROM users WHERE id = $1 AND org_id = $2 AND role = 'TRANSLATOR'", [translator_id, orgId]);
      if (tRes.rows.length > 0) translator = tRes.rows[0];
    } else if (db) {
      const rows = executeQuery(db, "SELECT * FROM users WHERE id = ? AND org_id = ? AND role = 'TRANSLATOR'", [translator_id, orgId]);
      if (rows.length > 0) translator = rows[0];
    }

    if (!translator) {
      return res.status(403).json({ error: 'Selected translator is not authorized or belongs to a different organization.' });
    }

    // Query verified questions to be assigned
    let targetQuestions: any[] = [];
    if (Array.isArray(question_ids) && question_ids.length > 0) {
      if (pg) {
        const qRes = await pg.query(
          "SELECT * FROM competitive_questions WHERE id = ANY($1) AND exam_id = $2 AND org_id = $3 AND verification_status = 'VERIFIED'",
          [question_ids, exam_id, orgId]
        );
        targetQuestions = qRes.rows;
      } else if (db) {
        const placeholders = question_ids.map(() => '?').join(',');
        targetQuestions = executeQuery(
          db,
          `SELECT * FROM competitive_questions WHERE id IN (${placeholders}) AND exam_id = ? AND org_id = ? AND verification_status = 'VERIFIED'`,
          [...question_ids, exam_id, orgId]
        );
      }
    } else {
      // Assign all verified questions for this subject
      if (pg) {
        const qRes = await pg.query(
          "SELECT * FROM competitive_questions WHERE exam_id = $1 AND subject_id = $2 AND org_id = $3 AND verification_status = 'VERIFIED'",
          [exam_id, subject_id, orgId]
        );
        targetQuestions = qRes.rows;
      } else if (db) {
        targetQuestions = executeQuery(
          db,
          "SELECT * FROM competitive_questions WHERE exam_id = ? AND subject_id = ? AND org_id = ? AND verification_status = 'VERIFIED'",
          [exam_id, subject_id, orgId]
        );
      }
    }

    if (targetQuestions.length === 0) {
      return res.status(400).json({ error: 'No verified source questions found to assign for translation.' });
    }

    const assignmentId = `trans-asgn-${uuidv4()}`;
    const now = new Date().toISOString();
    const assignedQuestionIds = targetQuestions.map(q => q.id);

    // Save Assignment Record
    if (pg) {
      await pg.query(
        `INSERT INTO competitive_translation_assignments (
          id, org_id, exam_id, subject_id, subject_name, language, translator_id, translator_name,
          question_ids_json, status, total_questions, translated_count, verified_count, created_by, assigned_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ASSIGNED', $10, 0, 0, $11, $12, $12)`,
        [
          assignmentId,
          orgId,
          exam_id,
          subject_id,
          subject_name || targetQuestions[0]?.subject || 'Subject',
          language,
          translator.id,
          translator.full_name || translator.username,
          JSON.stringify(assignedQuestionIds),
          targetQuestions.length,
          req.user?.id || 'admin',
          now,
        ]
      );
    }

    if (db) {
      executeRun(
        db,
        `INSERT INTO competitive_translation_assignments (
          id, org_id, exam_id, subject_id, subject_name, language, translator_id, translator_name,
          question_ids_json, status, total_questions, translated_count, verified_count, created_by, assigned_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ASSIGNED', ?, 0, 0, ?, ?, ?)`,
        [
          assignmentId,
          orgId,
          exam_id,
          subject_id,
          subject_name || targetQuestions[0]?.subject || 'Subject',
          language,
          translator.id,
          translator.full_name || translator.username,
          JSON.stringify(assignedQuestionIds),
          targetQuestions.length,
          req.user?.id || 'admin',
          now,
          now,
        ]
      );
    }

    // Seed draft question translations with AI draft if not already present
    for (const q of targetQuestions) {
      const qOptions = q.options_json ? (typeof q.options_json === 'string' ? JSON.parse(q.options_json) : q.options_json) : [];
      let trText: string = '';
      let trOptA: string = '';
      let trOptB: string = '';
      let trOptC: string = '';
      let trOptD: string = '';

      try {
        const rawOptTexts = qOptions.map((o: any) => o.text);
        const aiTr = await translateQuestionWithAI(q.question_text, rawOptTexts.length > 0 ? rawOptTexts : null, language, q.subject);
        if (aiTr?.translatedContent) {
          trText = aiTr.translatedContent;
          if (aiTr.translatedOptions && aiTr.translatedOptions.length > 0) {
            trOptA = aiTr.translatedOptions[0] || '';
            trOptB = aiTr.translatedOptions[1] || '';
            trOptC = aiTr.translatedOptions[2] || '';
            trOptD = aiTr.translatedOptions[3] || '';
          }
        }
      } catch (aiErr) {
        console.warn('Initial AI translation seed note:', aiErr);
      }

      const qTransId = `qtrans-${uuidv4()}`;
      const trOptsJson = JSON.stringify([
        { label: 'A', text: trOptA },
        { label: 'B', text: trOptB },
        { label: 'C', text: trOptC },
        { label: 'D', text: trOptD },
      ]);

      if (pg) {
        // Upsert by org_id, exam_id, source_question_id, language
        await pg.query(
          `INSERT INTO competitive_question_translations (
            id, org_id, exam_id, subject_id, source_file_id, source_question_id, translator_id, language,
            translated_text, translated_question_text, translated_option_a, translated_option_b, translated_option_c, translated_option_d,
            translated_options_json, status, verification_status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, $12, $13, $14, 'DRAFT', 'PENDING', $15, $15)
          ON CONFLICT (id) DO NOTHING`,
          [
            qTransId,
            orgId,
            exam_id,
            subject_id,
            q.source_file_id || null,
            q.id,
            translator.id,
            language,
            trText,
            trOptA,
            trOptB,
            trOptC,
            trOptD,
            trOptsJson,
            now,
          ]
        );
      }

      if (db) {
        executeRun(
          db,
          `INSERT OR IGNORE INTO competitive_question_translations (
            id, org_id, exam_id, subject_id, source_file_id, source_question_id, translator_id, language,
            translated_text, translated_question_text, translated_option_a, translated_option_b, translated_option_c, translated_option_d,
            translated_options_json, status, verification_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 'PENDING', ?, ?)`,
          [
            qTransId,
            orgId,
            exam_id,
            subject_id,
            q.source_file_id || null,
            q.id,
            translator.id,
            language,
            trText,
            trText,
            trOptA,
            trOptB,
            trOptC,
            trOptD,
            trOptsJson,
            now,
            now,
          ]
        );
      }
    }

    return res.json({
      success: true,
      message: `Assigned ${targetQuestions.length} questions for ${language} translation to ${translator.full_name || translator.username}.`,
      assignmentId,
      assignedCount: targetQuestions.length,
    });
  } catch (err: any) {
    console.error('handleAssignTranslation error:', err);
    return res.status(500).json({ error: err.message || 'Failed to assign translation.' });
  }
}

// 17. GET /api/competitive/translator-tasks (Assigned Tasks for Logged-In Translator)
export async function handleGetTranslatorTasks(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const translatorId = req.user?.id;
    const pg = getPostgresPool();
    const db = await getDb();

    let assignments: any[] = [];
    let translationRows: any[] = [];

    if (pg) {
      const aRes = await pg.query(
        'SELECT * FROM competitive_translation_assignments WHERE org_id = $1 AND translator_id = $2 ORDER BY assigned_at DESC',
        [orgId, translatorId]
      );
      assignments = aRes.rows;

      const tRes = await pg.query(
        `SELECT qt.*, q.question_text as original_text, q.options_json as original_options_json,
                q.option_a as orig_opt_a, q.option_b as orig_opt_b, q.option_c as orig_opt_c, q.option_d as orig_opt_d,
                q.subject, q.has_diagram, q.marks
         FROM competitive_question_translations qt
         JOIN competitive_questions q ON qt.source_question_id = q.id
         WHERE qt.org_id = $1 AND qt.translator_id = $2
         ORDER BY qt.created_at ASC`,
        [orgId, translatorId]
      );
      translationRows = tRes.rows;
    } else if (db) {
      assignments = executeQuery(
        db,
        'SELECT * FROM competitive_translation_assignments WHERE org_id = ? AND translator_id = ? ORDER BY assigned_at DESC',
        [orgId, translatorId]
      );

      translationRows = executeQuery(
        db,
        `SELECT qt.*, q.question_text as original_text, q.options_json as original_options_json,
                q.option_a as orig_opt_a, q.option_b as orig_opt_b, q.option_c as orig_opt_c, q.option_d as orig_opt_d,
                q.subject, q.has_diagram, q.marks
         FROM competitive_question_translations qt
         JOIN competitive_questions q ON qt.source_question_id = q.id
         WHERE qt.org_id = ? AND qt.translator_id = ?
         ORDER BY qt.created_at ASC`,
        [orgId, translatorId]
      );
    }

    return res.json({ success: true, assignments, tasks: translationRows });
  } catch (err: any) {
    console.error('handleGetTranslatorTasks error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch translator tasks.' });
  }
}

// 18. POST /api/competitive/submit-translation (Translator Saves/Updates Translation for exact sourceQuestionId)
export async function handleSubmitTranslation(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const translatorId = req.user?.id;
    const {
      source_question_id,
      language,
      translated_question_text,
      translated_option_a,
      translated_option_b,
      translated_option_c,
      translated_option_d,
    } = req.body;

    if (!source_question_id || !language || !translated_question_text) {
      return res.status(400).json({ error: 'source_question_id, language, and translated_question_text are required.' });
    }

    const pg = getPostgresPool();
    const db = await getDb();
    const now = new Date().toISOString();

    const translatedOptionsJson = JSON.stringify([
      { label: 'A', text: translated_option_a || '' },
      { label: 'B', text: translated_option_b || '' },
      { label: 'C', text: translated_option_c || '' },
      { label: 'D', text: translated_option_d || '' },
    ]);

    if (pg) {
      await pg.query(
        `UPDATE competitive_question_translations
         SET translated_text = $1,
             translated_question_text = $1,
             translated_option_a = $2,
             translated_option_b = $3,
             translated_option_c = $4,
             translated_option_d = $5,
             translated_options_json = $6,
             status = 'SUBMITTED',
             updated_at = $7
         WHERE source_question_id = $8 AND language = $9 AND org_id = $10 AND translator_id = $11`,
        [
          translated_question_text,
          translated_option_a || '',
          translated_option_b || '',
          translated_option_c || '',
          translated_option_d || '',
          translatedOptionsJson,
          now,
          source_question_id,
          language,
          orgId,
          translatorId,
        ]
      );
    }

    if (db) {
      executeRun(
        db,
        `UPDATE competitive_question_translations
         SET translated_text = ?,
             translated_question_text = ?,
             translated_option_a = ?,
             translated_option_b = ?,
             translated_option_c = ?,
             translated_option_d = ?,
             translated_options_json = ?,
             status = 'SUBMITTED',
             updated_at = ?
         WHERE source_question_id = ? AND language = ? AND org_id = ? AND translator_id = ?`,
        [
          translated_question_text,
          translated_question_text,
          translated_option_a || '',
          translated_option_b || '',
          translated_option_c || '',
          translated_option_d || '',
          translatedOptionsJson,
          now,
          source_question_id,
          language,
          orgId,
          translatorId,
        ]
      );
    }

    return res.json({ success: true, message: 'Translation submitted for review.' });
  } catch (err: any) {
    console.error('handleSubmitTranslation error:', err);
    return res.status(500).json({ error: err.message || 'Failed to submit translation.' });
  }
}

// 19. GET /api/competitive/translations/:examId/:subjectId (Exam Manager Reviews Translations)
export async function handleGetSubjectTranslations(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const { examId, subjectId } = req.params;
    const pg = getPostgresPool();
    const db = await getDb();

    let items: any[] = [];
    if (pg) {
      const result = await pg.query(
        `SELECT qt.*, q.question_text as original_text, q.options_json as original_options_json,
                q.option_a as orig_opt_a, q.option_b as orig_opt_b, q.option_c as orig_opt_c, q.option_d as orig_opt_d,
                q.subject, q.has_diagram, q.marks, u.full_name as translator_name
         FROM competitive_question_translations qt
         JOIN competitive_questions q ON qt.source_question_id = q.id
         LEFT JOIN users u ON qt.translator_id = u.id
         WHERE qt.exam_id = $1 AND (qt.subject_id = $2 OR q.subject = $2) AND qt.org_id = $3
         ORDER BY q.created_at ASC`,
        [examId, subjectId, orgId]
      );
      items = result.rows;
    } else if (db) {
      items = executeQuery(
        db,
        `SELECT qt.*, q.question_text as original_text, q.options_json as original_options_json,
                q.option_a as orig_opt_a, q.option_b as orig_opt_b, q.option_c as orig_opt_c, q.option_d as orig_opt_d,
                q.subject, q.has_diagram, q.marks, u.full_name as translator_name
         FROM competitive_question_translations qt
         JOIN competitive_questions q ON qt.source_question_id = q.id
         LEFT JOIN users u ON qt.translator_id = u.id
         WHERE qt.exam_id = ? AND (qt.subject_id = ? OR q.subject = ?) AND qt.org_id = ?
         ORDER BY q.created_at ASC`,
        [examId, subjectId, subjectId, orgId]
      );
    }

    return res.json({ success: true, translations: items });
  } catch (err: any) {
    console.error('handleGetSubjectTranslations error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch translations.' });
  }
}

// 20. POST /api/competitive/verify-translation/:id (Exam Manager Approves Translation)
export async function handleVerifyTranslation(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const translationId = req.params.id;
    const { verification_status } = req.body;
    const targetStatus = verification_status === 'REJECTED' ? 'REJECTED' : 'VERIFIED';
    const now = new Date().toISOString();

    const pg = getPostgresPool();
    const db = await getDb();

    if (pg) {
      await pg.query(
        'UPDATE competitive_question_translations SET verification_status = $1, verified_at = $2, updated_at = $2 WHERE id = $3 AND org_id = $4',
        [targetStatus, now, translationId, orgId]
      );
    }

    if (db) {
      executeRun(
        db,
        'UPDATE competitive_question_translations SET verification_status = ?, verified_at = ?, updated_at = ? WHERE id = ? AND org_id = ?',
        [targetStatus, now, now, translationId, orgId]
      );
    }

    return res.json({ success: true, message: `Translation status updated to ${targetStatus}.`, translationId });
  } catch (err: any) {
    console.error('handleVerifyTranslation error:', err);
    return res.status(500).json({ error: err.message || 'Failed to verify translation.' });
  }
}

// 14. POST /api/competitive/delete-pool-file
export async function handleDeletePoolFile(req: Request, res: Response) {
  try {
    const orgId = req.user?.org_id || 'ORG-DEV-001';
    const { exam_id, subject, subject_id, source_pdf, file_id } = req.body;

    if (!exam_id || (!source_pdf && !file_id)) {
      return res.status(400).json({ error: 'exam_id and either file_id or source_pdf are required.' });
    }

    const pg = getPostgresPool();
    const db = await getDb();
    const now = new Date().toISOString();

    if (pg) {
      try {
        if (file_id) {
          await pg.query(
            'DELETE FROM competitive_questions WHERE (source_file_id = $1 OR (exam_id = $2 AND source_pdf = $3)) AND org_id = $4',
            [file_id, exam_id, source_pdf || '', orgId]
          );
          await pg.query(
            'DELETE FROM competitive_question_pool_files WHERE (id = $1 OR (exam_id = $2 AND file_name = $3)) AND org_id = $4',
            [file_id, exam_id, source_pdf || '', orgId]
          );
          await pg.query(
            'DELETE FROM competitive_question_pools WHERE (id = $1 OR (exam_id = $2 AND source_pdf_name = $3)) AND org_id = $4',
            [file_id, exam_id, source_pdf || '', orgId]
          );
        } else {
          await pg.query('DELETE FROM competitive_questions WHERE exam_id = $1 AND org_id = $2 AND source_pdf = $3', [
            exam_id,
            orgId,
            source_pdf,
          ]);
          await pg.query('DELETE FROM competitive_question_pool_files WHERE exam_id = $1 AND org_id = $2 AND file_name = $3', [
            exam_id,
            orgId,
            source_pdf,
          ]);
          await pg.query('DELETE FROM competitive_question_pools WHERE exam_id = $1 AND org_id = $2 AND source_pdf_name = $3', [
            exam_id,
            orgId,
            source_pdf,
          ]);
        }
      } catch (pgErr) {
        console.warn('[ZeroLeak Competitive] PG delete notice:', pgErr);
      }
    }

    if (db) {
      if (file_id) {
        executeRun(
          db,
          'DELETE FROM competitive_questions WHERE (source_file_id = ? OR (exam_id = ? AND source_pdf = ?)) AND org_id = ?',
          [file_id, exam_id, source_pdf || '', orgId]
        );
        executeRun(
          db,
          'DELETE FROM competitive_question_pool_files WHERE (id = ? OR (exam_id = ? AND file_name = ?)) AND org_id = ?',
          [file_id, exam_id, source_pdf || '', orgId]
        );
        executeRun(
          db,
          'DELETE FROM competitive_question_pools WHERE (id = ? OR (exam_id = ? AND source_pdf_name = ?)) AND org_id = ?',
          [file_id, exam_id, source_pdf || '', orgId]
        );
      } else {
        executeRun(
          db,
          'DELETE FROM competitive_questions WHERE exam_id = ? AND org_id = ? AND source_pdf = ?',
          [exam_id, orgId, source_pdf]
        );
        executeRun(
          db,
          'DELETE FROM competitive_question_pool_files WHERE exam_id = ? AND org_id = ? AND file_name = ?',
          [exam_id, orgId, source_pdf]
        );
        executeRun(
          db,
          'DELETE FROM competitive_question_pools WHERE exam_id = ? AND org_id = ? AND source_pdf_name = ?',
          [exam_id, orgId, source_pdf]
        );
      }
    }

    // Update blueprint_json in competitive_exams
    try {
      let bpJson: string | null = null;
      if (pg) {
        const row = await pg.query('SELECT blueprint_json FROM competitive_exams WHERE id = $1 AND org_id = $2', [exam_id, orgId]);
        if (row.rows.length > 0) bpJson = row.rows[0].blueprint_json;
      } else if (db) {
        const rows = executeQuery(db, 'SELECT blueprint_json FROM competitive_exams WHERE id = ? AND org_id = ?', [exam_id, orgId]);
        if (rows && rows[0]) bpJson = rows[0].blueprint_json;
      }

      if (bpJson) {
        const bp = JSON.parse(bpJson);
        if (bp && Array.isArray(bp.subjects)) {
          bp.subjects = bp.subjects.map((s: any) => {
            const matchesSubject =
              (subject_id && s.id === subject_id) ||
              (subject && (s.subjectName || '').trim().toLowerCase() === subject.trim().toLowerCase());

            if (matchesSubject && Array.isArray(s.pdfs)) {
              s.pdfs = s.pdfs.filter((p: any) => {
                if (file_id && (p.id === file_id || p.fileId === file_id)) return false;
                if (source_pdf && (p.name === source_pdf || p.fileName === source_pdf)) return false;
                return true;
              });
            }
            return s;
          });

          const bpStr = JSON.stringify(bp);
          if (pg) {
            await pg.query('UPDATE competitive_exams SET blueprint_json = $1, updated_at = $2 WHERE id = $3 AND org_id = $4', [
              bpStr,
              now,
              exam_id,
              orgId,
            ]);
          }
          if (db) {
            executeRun(db, 'UPDATE competitive_exams SET blueprint_json = ?, updated_at = ? WHERE id = ? AND org_id = ?', [
              bpStr,
              now,
              exam_id,
              orgId,
            ]);
          }
        }
      }
    } catch (syncErr) {
      console.warn('[ZeroLeak Competitive] Blueprint delete sync notice:', syncErr);
    }

    return res.json({
      success: true,
      message: `Removed ${source_pdf || file_id} from ${subject || 'pool'}.`,
      file_id,
      exam_id,
    });
  } catch (err: any) {
    console.error('handleDeletePoolFile error:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete pool file.' });
  }
}
