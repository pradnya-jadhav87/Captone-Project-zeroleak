import fs from 'fs';
import path from 'path';
import multer from 'multer';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import Tesseract from 'tesseract.js';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';
import { getDb, executeQuery, executeRun, saveDb } from './db.ts';

// Configure temporary upload storage directory
const UPLOAD_TEMP_DIR = path.join(process.cwd(), 'uploads', 'tmp');
if (!fs.existsSync(UPLOAD_TEMP_DIR)) {
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `draft-paper-${uniqueSuffix}${path.extname(file.originalname).toLowerCase()}`);
  },
});

// Multer Upload Middleware configured for 3 to 5 PDF files (allows up to 20 files at middleware level for safety)
export const uploadDraftPapersMulter = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB per file limit
    files: 20, // Allow up to 20 files at Multer layer so handler can deduplicate & report exact count
  },
  fileFilter: (req, file, cb) => {
    const mimeType = (file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname).toLowerCase();
    const isPdfMime = mimeType === 'application/pdf' || mimeType === 'application/x-pdf' || mimeType === 'application/acrobat';
    const isPdfExt = ext === '.pdf';

    if (isPdfMime && isPdfExt) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FILE_TYPE: Only authentic PDF files (.pdf) are allowed.'));
    }
  },
});

export interface ParsedDraftQuestion {
  id: string;
  draft_paper_id: string;
  exam_id: string;
  paper_index: number;
  source_paper: string;
  section: string;
  question_number: string;
  question_text: string;
  question_type: 'MCQ' | 'THEORY';
  options?: string[];
  correct_answer?: string;
  marks: number;
  sub_question_pattern?: string;
  diagram_url?: string;
  confidence?: 'HIGH' | 'LOW';
  review_flag?: boolean;
  created_at: string;
}

/**
 * Extract raw text from PDF file using pdf-parse with fallback to Tesseract OCR for scanned PDFs.
 */
export async function extractTextFromPdfFile(filePath: string): Promise<{ text: string; method: 'PDF_PARSE' | 'TESSERACT_OCR' | 'HYBRID' }> {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const parsedData = await pdfParse(fileBuffer);
    const extractedText = (parsedData.text || '').trim();

    // If pdf-parse extracted sufficient text, return directly
    if (extractedText.length >= 60) {
      return { text: extractedText, method: 'PDF_PARSE' };
    }

    console.log(`[University Ingestion] Insufficient text extracted by pdf-parse (${extractedText.length} chars). Triggering Tesseract OCR fallback for scanned PDF: ${path.basename(filePath)}`);
    
    // Tesseract OCR Fallback (PDFs may not be natively supported by Tesseract without rendering to image)
    try {
      const ocrResult = await Tesseract.recognize(filePath, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            // Progress output optional
          }
        }
      });

      const ocrText = (ocrResult.data.text || '').trim();
      const combinedText = ocrText.length > 0 ? ocrText : extractedText;
      const method = extractedText.length > 0 ? 'HYBRID' : 'TESSERACT_OCR';

      return { text: combinedText, method };
    } catch (ocrErr) {
      console.warn(`[University Ingestion] Tesseract OCR note for ${path.basename(filePath)}:`, (ocrErr as any)?.message || ocrErr);
      return { text: extractedText, method: 'PDF_PARSE' };
    }
  } catch (err) {
    console.error(`[University Ingestion] pdf-parse error for ${filePath}, attempting Tesseract OCR:`, err);
    try {
      const ocrResult = await Tesseract.recognize(filePath, 'eng');
      return { text: (ocrResult.data.text || '').trim(), method: 'TESSERACT_OCR' };
    } catch (ocrErr) {
      console.error(`[University Ingestion] Tesseract OCR error for ${filePath}:`, ocrErr);
      return { text: '', method: 'PDF_PARSE' };
    }
  }
}

/**
 * Detects whether a line represents pagination, running headers, or document footers
 * that should be excluded from question bodies and should NOT cause questions to terminate across page breaks.
 */
function isFooterOrPageBreak(line: string): boolean {
  const trimmed = line.trim();
  if (/^Page\s*\d+\s*(?:of\s*\d+)?$/i.test(trimmed)) return true;
  if (/^\[\s*\d+\s*\]$/.test(trimmed)) return true;
  if (/^-\s*\d+\s*-$/.test(trimmed)) return true;
  if (/^Total\s*(?:No\.?\s*of\s*)?Pages?\s*[-–:]*\s*\d+$/i.test(trimmed)) return true;
  if (/^\[?\s*(?:P\.?T\.?O\.?|PTO|Contd\.{2,}|Turn\s*Over)\s*\]?$/i.test(trimmed)) return true;
  if (/^SLR\s*[-–]\s*[A-Z\d\-]+(?:\s+-\s*\d+\s*-)?$/i.test(trimmed)) return true;
  if (/(?:ZEROLEAK|CONFIDENTIAL EXAMINATION|TRK-(?:UNIV|COMP)|LICENSED TO:|Location:|GPS:|IP:|TRACK:)/i.test(trimmed)) return true;
  return false;
}

/**
 * Detects whether a line represents examination front-matter metadata (University name,
 * seat number prompts, subject code, duration, total marks, or general instructions)
 * which should be completely stripped from question stems.
 */
function isExamMetadataLine(line: string): boolean {
  const trimmed = line.trim();
  // University / Board / Institute name
  if (/^[A-Z\s.,&'()-]*(?:UNIVERSITY|VIDYAPEETH|COLLEGE|INSTITUTE|BOARD\s+OF\s+(?:TECHNICAL\s+)?EXAMINATION)[A-Z\s.,&'()-]*$/i.test(trimmed)) {
    return true;
  }
  // Examination / Degree / Semester / CBCS
  if (/^(?:(?:T\.?Y\.?|S\.?Y\.?|F\.?Y\.?|B\.?E\.?|B\.?Tech\.?|M\.?Tech\.?|M\.?B\.?A\.?|M\.?C\.?A\.?|B\.?Sc\.?|M\.?Sc\.?|Diploma)\b|Faculty\s+of|Choice\s+Based\s+Credit\s+System|CBCS\b|Annual\s+Exam|End\s+Semester\s+Exam|Semester\s*[-–:]*\s*(?:I|II|III|IV|V|VI|VII|VIII|\d+)\s*Examination)/i.test(trimmed)) {
    return true;
  }
  // Seat Number prompt
  if (/^[\|\s\[\(]*Seat\s*No\.?[\s\S]*$/i.test(trimmed)) return true;
  if (/^Center\s*Code\s*[-–:]*/i.test(trimmed)) return true;
  // Subject, Paper code, Course code
  if (/^(?:Sub(?:ject)?(?:\s*Name)?|Course(?:\s*Code)?|Paper(?:\s*Code)?|Branch|Department)\s*[-–:]+/i.test(trimmed)) return true;
  // Day & Date, Time, Duration, Max Marks
  if (/^(?:Day\s*(&|and)?\s*Date|Date)\s*[-–:]+/i.test(trimmed)) return true;
  if (/^(?:Time|Duration)\s*[-–:]+/i.test(trimmed)) return true;
  if (/^(?:Total\s*Marks|Max\.?\s*Marks|Maximum\s*Marks)\s*[-–:]*\s*\d+/i.test(trimmed)) return true;
  if (/^\d+\s*Hours?\s*$/i.test(trimmed)) return true;
  // General candidate instructions headers & items
  if (/^(?:Instructions?\s*(?:to\s*candidates?|for\s*candidates?)?|N\.?B\.?|Notes?)\s*[-–:]*$/i.test(trimmed)) return true;
  if (/^(?:\d+[\.\)]|\([a-z\d]+\))\s*(?:All\s*questions\s*are\s*compulsory|Figures\s*to\s*the\s*right\s*indicate|Assume\s*suitable\s*data|Use\s*of\s*(?:non-programmable|scientific|calculator|log)|Draw\s*neat\s*diagrams?|Write\s*your\s*seat\s*number|Write\s*answers\s*to\s*both\s*sections|Do\s*not\s*write\s*anything|Q\.?\s*No\.?\s*1\s*is\s*compulsory|Mention\s*the\s*question-paper\s*set|Start\s*each\s*question\s*on\s*a\s*new\s*page)/i.test(trimmed)) {
    return true;
  }
  if (/^(?:Figures\s*to\s*the\s*right\s*indicate\s*full\s*marks|Assume\s*suitable\s*data\s*wherever\s*necessary|Use\s*of\s*non-programmable\s*calculator\s*is\s*permitted|Draw\s*neat\s*diagrams?\s*wherever\s*necessary|All\s*questions\s*are\s*compulsory)\.?$/i.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Extracts distinct MCQ options from a single line.
 * Supports single-line options and multiple options on a single line
 * e.g. "A) Opt 1   B) Opt 2" or "(a) Opt 1   (b) Opt 2".
 */
function extractOptionsFromLine(line: string): Array<{ label: string; text: string }> | null {
  const tokenRegex = /(?:^|\s{2,}|\t|\s+(?=\([A-Da-d1-4]\)|[A-Da-d1-4][\.\)]|\[[A-Da-d1-4]\]))(?:\(([A-Da-d1-4])\)|([A-Da-d1-4])[\.\)]|\[([A-Da-d1-4])\])\s*/g;
  
  const matches: Array<{ label: string; index: number; markerLength: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(line)) !== null) {
    const rawLabel = (match[1] || match[2] || match[3] || '').toUpperCase();
    matches.push({
      label: rawLabel,
      index: match.index,
      markerLength: match[0].length,
    });
  }

  if (matches.length === 0) return null;

  const results: Array<{ label: string; text: string }> = [];
  for (let m = 0; m < matches.length; m++) {
    const start = matches[m].index + matches[m].markerLength;
    const end = (m + 1 < matches.length) ? matches[m + 1].index : line.length;
    const optText = line.substring(start, end).trim();
    results.push({
      label: matches[m].label,
      text: optText,
    });
  }

  return results;
}

/**
 * Parses raw text extracted from a University Question Paper into structured Question objects.
 * Preserves the original question wording with 100% fidelity.
 */
export function parseDraftPaperQuestions(
  rawText: string,
  paperIndex: number,
  draftPaperId: string,
  examId: string
): ParsedDraftQuestion[] {
  const questions: ParsedDraftQuestion[] = [];
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const paperName = `Paper ${paperIndex}`;

  let currentSection = 'Section I';
  let currentQuestionNo = '';
  let currentQuestionLines: string[] = [];
  let currentOptions: string[] = [];
  let currentMarks: number | null = null;
  let currentType: 'MCQ' | 'THEORY' = 'THEORY';
  let subPattern = '';
  let isMcqGroup = false;
  let inOption = false;

  const finalizeQuestion = () => {
    if (currentQuestionLines.length === 0) return;

    // Check if table rows exist (| ... |) - if so, preserve newlines, else join with space
    const hasTable = currentQuestionLines.some(l => l.startsWith('|') && l.endsWith('|'));
    const fullText = hasTable
      ? currentQuestionLines.join('\n').trim()
      : currentQuestionLines.join(' ').trim();
    if (fullText.length < 5) return;

    // Detect if MCQ based on options or group context
    const isMcq = currentOptions.length >= 2 || (isMcqGroup && currentOptions.length > 0);
    const finalType: 'MCQ' | 'THEORY' = isMcq ? 'MCQ' : currentType;
    const finalMarks = isMcq ? 1 : (currentMarks && currentMarks > 1 ? currentMarks : (fullText.length > 100 ? 6 : 4));

    // Confidence & Review Flag calculation
    const isLowConfidence = isMcq ? currentOptions.length < 2 : fullText.length < 15;
    const confidence: 'HIGH' | 'LOW' = isLowConfidence ? 'LOW' : 'HIGH';
    const review_flag = isLowConfidence;

    questions.push({
      id: uuidv4(),
      draft_paper_id: draftPaperId,
      exam_id: examId,
      paper_index: paperIndex,
      source_paper: paperName,
      section: currentSection,
      question_number: currentQuestionNo || `Q.${questions.length + 1}`,
      question_text: fullText,
      question_type: finalType,
      options: currentOptions.length > 0 ? [...currentOptions] : undefined,
      marks: finalMarks,
      sub_question_pattern: subPattern || undefined,
      confidence,
      review_flag,
      created_at: new Date().toISOString(),
    });

    currentQuestionLines = [];
    currentOptions = [];
    currentQuestionNo = '';
    currentMarks = null;
    currentType = 'THEORY';
    inOption = false;
  };

  const sectionRegex = /^(?:SECTION|PART)\s*[-–:]*\s*(?:I|II|1|2|A|B)\b/i;
  const choicePatternRegex = /(Attempt any (?:FOUR|ONE|TWO|THREE|FIVE|\d+)|compulsory|Answer the following)/i;
  const mcqGroupRegex = /^(?:Q\.?\s*\d+[\.\:\)]?\s*)?(?:Choose|Select|Tick)\s+(?:the\s+)?correct\s+(?:alternatives?|options?|answers?)|(?:Multiple\s*Choice\s*Questions?)|^(?:Objective\s*(?:Type\s*)?Questions?)/i;

  const topQuestionHeaderRegex = /^(?:Q\.?\s*No\.?\s*|Question\s*|Q\.?\s*)(\d+)[\.\:\)]?\s*(.*)/i;
  const numberedItemRegex = /^(?:Q\.?\s*\d+[\.\:\)]?\s*)?(\d{1,2})[\.\)]\s*(.*)/i;
  const subQuestionItemRegex = /^(?:Q\.?\s*\d+[\.\:\)]?\s*)?\(([a-zA-Z\d]+|[ivxlcdm]+)\)\s*(.*)/i;
  const romanItemRegex = /^(?:Q\.?\s*\d+[\.\:\)]?\s*)?([ivxlcdm]+)[\.\)]\s*(.*)/i;

    const getMarks = (text: string): number | null => {
    const eqMatch = text.match(/\((?:[^)]*?[=xX*×])?\s*(\d+)\s*(?:Marks?|M)?\)/i);
    if (eqMatch) {
      const num = parseInt(eqMatch[1], 10);
      if (!isNaN(num) && num > 0) return num;
    }
    const m = text.match(/(?:\[(\d+)\s*(?:Marks?|M)?\]|\((\d+)\s*(?:Marks?|M)?\)|\b(\d+)\s*Marks?\b)/i);
    if (m) {
      const num = parseInt(m[1] || m[2] || m[3], 10);
      if (!isNaN(num) && num > 0) return num;
    }
    const endMatch = text.match(/(?:^|[.\s:])\s*(\d{1,2})\s*$/);
    if (endMatch) {
      const num = parseInt(endMatch[1], 10);
      if (!isNaN(num) && [2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20].includes(num)) {
        return num;
      }
    }
    return null;
  };

  const stripTrailingMarks = (text: string): string => {
    return text.replace(/\s*(?:\[\d+\s*(?:Marks?|M)?\]|\(\d+\s*(?:Marks?|M)?\)|\b\d+\s*Marks?\b)\s*$/i, '').trim();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Check for Footers, Page numbers, and P.T.O. (never break ongoing question, skip line)
    if (isFooterOrPageBreak(line)) {
      continue;
    }

    // 2. Check for Section Header
    if (sectionRegex.test(line)) {
      finalizeQuestion();
      const secMatch = line.match(sectionRegex);
      if (secMatch) {
        currentSection = secMatch[0].toUpperCase();
      }
      isMcqGroup = /SECTION\s*[-–:]*\s*(?:I|1|A)\b/i.test(line) && /MCQ|PART\s*1/i.test(line);
      subPattern = '';
      continue;
    }

    // 3. Check for Examination Metadata / Front matter (skip if no question active or repeated on page break)
    if (isExamMetadataLine(line)) {
      if (!currentQuestionNo && currentQuestionLines.length === 0) {
        continue;
      }
      if (/^[A-Z\s.,&'()-]*(?:UNIVERSITY|BOARD|EXAMINATION)|^[\|\s\[\(]*Seat\s*No\.?/i.test(line)) {
        continue;
      }
    }

    // 4. Check for Choice Pattern in line (e.g. "Attempt any FOUR of the following")
    if (choicePatternRegex.test(line)) {
      const match = line.match(choicePatternRegex);
      if (match) {
        subPattern = match[1];
      }
    }

    // 5. Check for Marks in line
    const detectedMark = getMarks(line);
    if (detectedMark && detectedMark > 0) {
      currentMarks = detectedMark;
    }

    // 6. Check for MCQ Group Instruction (e.g. "Q.1 Choose the correct alternatives from the options.")
    if (mcqGroupRegex.test(line)) {
      finalizeQuestion();
      isMcqGroup = true;
      subPattern = line.replace(/^(?:Q\.?\s*\d+[\.\:\)]?\s*)/i, '').trim();
      currentType = 'MCQ';
      currentQuestionNo = '';
      currentQuestionLines = [];
      continue;
    }

    // 7. Check for MCQ Options (e.g. "A) ...", "(A) ...", or inline "(A) ... (B) ...")
    // 7. Check for MCQ Options (e.g. "A) ...", "(A) ...", "a) ...", "(a) ...", or inline "(A) ... (B) ...")
    const isStrictCapitalOpt = /^[\(\[]?[A-D][\)\]\.]\s*/.test(line); // A-D
    const isDescriptiveVerb = /^(?:Explain|Discuss|Describe|Define|Differentiate|What\s+is|Prove|Calculate|Derive|State|Compare|Illustrate|Write|Draw|Which|Why|How)\b/i.test(line.replace(/^[\(\[]?[a-zA-Z\d]+[\)\]\.]\s*/, ''));
    const isOptionStart = (isMcqGroup || currentOptions.length > 0) && !isDescriptiveVerb && /^[\(\[]?(?:[A-Da-d]|[1-4])[\)\]\.]\s*/.test(line);
    const isInlineOptions = /(?:[A-D][\.\)]|\([A-D]\))\s*.*\s+(?:[B-D][\.\)]|\([B-D]\))\s*/.test(line) ||
      /(?:\([a-d]\)|[a-d][\.\)])\s*.*\s+(?:\([b-d]\)|[b-d][\.\)])\s*/.test(line);

    if ((isStrictCapitalOpt || isOptionStart || isInlineOptions) && (currentQuestionNo || currentQuestionLines.length > 0)) {
      const extractedOpts = extractOptionsFromLine(line);
      if (extractedOpts && extractedOpts.length > 0) {
        currentType = 'MCQ';
        inOption = true;
        for (const opt of extractedOpts) {
          const normLabel = opt.label.toUpperCase();
          currentOptions.push(`${normLabel}) ${opt.text}`);
        }
        continue;
      }
    }

    // 8. If actively inside an MCQ option, check if this line is a multi-line continuation of the option
    if (inOption && currentOptions.length > 0) {
      const isNewQ = topQuestionHeaderRegex.test(line) || (isMcqGroup && (numberedItemRegex.test(line) || subQuestionItemRegex.test(line)));
      if (!isNewQ && !sectionRegex.test(line) && !isFooterOrPageBreak(line)) {
        currentOptions[currentOptions.length - 1] += ' ' + line.trim();
        continue;
      } else {
        inOption = false;
      }
    }

    // 9. Check for Top-Level Question Header (e.g. "Q.1", "Q. 2", "Question 1")
    const topQMatch = line.match(topQuestionHeaderRegex);
    if (topQMatch) {
      finalizeQuestion();
      const qNum = topQMatch[1];
      const qNumInt = parseInt(qNum, 10);
      const rest = (topQMatch[2] || '').trim();

      // Auto-route Q.4 and Q.5 to Section II if not already partitioned
      if (qNumInt >= 4 && /Section\s*I\b/i.test(currentSection) && !/Section\s*II\b/i.test(currentSection)) {
        currentSection = 'SECTION II';
      }

      // Check if rest is an MCQ group instruction
      const isMcqHeader = mcqGroupRegex.test(rest) || (qNumInt === 1 && (/Choose|Select|Alternative|Option|Answer|Multiple|MCQ|Objective/i.test(rest) || (!rest && lines.slice(i + 1, i + 5).some(l => /^\(?1\)?\s+|Choose|Select|Option|\([a-d]\)/i.test(l)))));
      if (isMcqHeader) {
        isMcqGroup = true;
        subPattern = rest || 'Choose the correct alternative.';
        currentType = 'MCQ';
        currentQuestionNo = '';
        currentQuestionLines = [];
        continue;
      } else if (qNumInt > 1) {
        isMcqGroup = false;
      }

      currentQuestionNo = `Q.${qNum}`;

      // Check if rest contains marks
      const restMark = getMarks(rest);
      if (restMark) {
        currentMarks = restMark;
      }

      if (rest) {
        currentQuestionLines.push(stripTrailingMarks(rest));
      }
      continue;
    }

    // 10. Check for Sub-question under MCQ Group (e.g. "1) ...", "(a) ...")
    // 10. Check for Sub-question under MCQ Group (e.g. "1) ...", "(a) ...", "i) ...", "(i) ...", "Q.1(1) ...")
    if (isMcqGroup) {
      const numMatch = line.match(numberedItemRegex);
      const subMatch = line.match(subQuestionItemRegex);
      const romanMatch = line.match(romanItemRegex);
      const itemMatch = numMatch || romanMatch || subMatch;
      if (itemMatch) {
        finalizeQuestion();
        currentQuestionNo = `Q.${questions.length + 1}`;
        currentType = 'MCQ';
        currentMarks = 1;
        const rest = itemMatch[itemMatch.length - 1].trim();
        if (rest) {
          currentQuestionLines.push(rest);
        }
        continue;
      }
    }

    // 11. Check for Sub-question under "Attempt any" or choice group
    if (subPattern && /Attempt\s+any/i.test(subPattern)) {
      const subMatch = line.match(subQuestionItemRegex);
      if (subMatch) {
        finalizeQuestion();
        currentQuestionNo = `Q.${questions.length + 1}(${subMatch[1]})`;
        currentType = 'THEORY';
        const rest = subMatch[2].trim();
        const mMatch = getMarks(rest);
        if (mMatch) {
          currentMarks = mMatch;
        }
        if (rest) {
          currentQuestionLines.push(stripTrailingMarks(rest));
        }
        continue;
      }
    }

    // 12. If a question is open, append to current question lines
    if (currentQuestionNo || currentQuestionLines.length > 0) {
      const lineMark = getMarks(line);
      if (lineMark && !currentMarks) {
        currentMarks = lineMark;
      }
      currentQuestionLines.push(stripTrailingMarks(line));
    } else {
      // Do not start a question on front-matter noise. Only start if line is a numbered question e.g. "1. Explain..."
      const numStartMatch = line.match(/^(\d{1,2})[\.\)]\s+(.{8,})/);
      if (numStartMatch) {
        currentQuestionNo = `Q.${numStartMatch[1]}`;
        currentQuestionLines.push(numStartMatch[2].trim());
      }
    }
  }

  finalizeQuestion();

  // If fallback parsing yielded no questions, create structured chunk items per section
  if (questions.length === 0 && rawText.trim().length > 0) {
    const defaultSec = 'Section I';
    const chunks = rawText.split(/(?=\b(?:Q\.\d+|Question \d+|\d+\.)\b)/i).filter(c => c.trim().length > 10);

    chunks.forEach((chunk, idx) => {
      const isMcq = /MCQ|option|\([a-d]\)/i.test(chunk);
      questions.push({
        id: uuidv4(),
        draft_paper_id: draftPaperId,
        exam_id: examId,
        paper_index: paperIndex,
        source_paper: paperName,
        section: defaultSec,
        question_number: `Q.${idx + 1}`,
        question_text: chunk.trim(),
        question_type: isMcq ? 'MCQ' : 'THEORY',
        marks: isMcq ? 1 : 6,
        confidence: 'LOW',
        review_flag: true,
        created_at: new Date().toISOString(),
      });
    });
  }

  return questions;
}

import { uploadDocumentToCloudinary } from './cloudinary.ts';
import { analyzeConsolidatedExamPattern } from './ai.ts';

/**
 * Express Route Handler: Ingest EXACTLY 3 University Draft Paper PDFs
 */
export async function handleUploadUniversityDrafts(req: Request, res: Response) {
  const tempFiles: string[] = [];
  try {
    const rawFiles = (req.files as Express.Multer.File[]) || [];
    const files: Express.Multer.File[] = [];
    const seen = new Set<string>();
    for (const f of rawFiles) {
      const key = `${f.originalname}_${f.size}`;
      if (!seen.has(key)) {
        seen.add(key);
        files.push(f);
      } else {
        if (f.path && fs.existsSync(f.path)) {
          try { fs.unlinkSync(f.path); } catch {}
        }
      }
    }

    const exam_id = (req.body.exam_id || 'EXAM-UNIV-MASTER-2026').trim();
    const org_id = (req.user?.org_id || 'ORG-ZEROLEAK-NATIONAL').trim();
    const user_id = (req.user?.id || 'usr-system').trim();

    // Requirement: Support 3 to 5 source question-paper uploads. Hard stop if < 3 or > 5.
    if (!files || !Array.isArray(files) || files.length < 3 || files.length > 5) {
      // Clean up any uploaded files
      if (files && Array.isArray(files)) {
        files.forEach(f => {
          if (f.path && fs.existsSync(f.path)) {
            try { fs.unlinkSync(f.path); } catch {}
          }
        });
      }
      return res.status(400).json({
        success: false,
        error: `INVALID_FILE_COUNT: Upload at least 3 and up to 5 source question papers (min 3, max 5). Received ${files?.length || 0}.`,
      });
    }

    files.forEach(f => tempFiles.push(f.path));

    // Validate MIME types and file extensions
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const mime = (f.mimetype || '').toLowerCase();
      const ext = path.extname(f.originalname).toLowerCase();
      const isPdf = (mime.includes('pdf') || mime === 'application/octet-stream') && ext === '.pdf';
      if (!isPdf) {
        tempFiles.forEach(p => { if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch {} });
        return res.status(400).json({
          success: false,
          error: `INVALID_FILE_FORMAT: File "${f.originalname}" is not a valid PDF file.`,
        });
      }
    }

    const db = await getDb();
    const nowIso = new Date().toISOString();

    // Fetch existing exam info for syllabus and subject metadata
    const examRows = executeQuery(db, 'SELECT * FROM examinations WHERE id = ?', [exam_id]);
    const exam = examRows.length > 0 ? examRows[0] : null;
    const examSubject = exam?.subject || 'Academic Examination';
    const examCategory = exam?.category || 'University Exam';
    const examSyllabus = exam?.syllabus || examSubject;

    // Clear previous draft papers for this exam to ensure fresh clean ingestion
    executeRun(db, 'DELETE FROM draft_questions WHERE exam_id = ?', [exam_id]);
    executeRun(db, 'DELETE FROM draft_papers WHERE exam_id = ?', [exam_id]);

    const ingestedDraftPapers: any[] = [];
    const allExtractedQuestions: ParsedDraftQuestion[] = [];
    const papersTextForPattern: Array<{ paperIndex: number; filename: string; text: string }> = [];

    const paperCounts: Record<string, number> = {
      paper1Count: 0,
      paper2Count: 0,
      paper3Count: 0,
      paper4Count: 0,
      paper5Count: 0,
    };

    // Process each of the uploaded draft papers (3 to 5) sequentially
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const paperIndex = i + 1; // 1, 2, 3, 4, 5
      const draftPaperId = uuidv4();

      // Extract text using pdf-parse with Tesseract OCR fallback
      const extractionResult = await extractTextFromPdfFile(file.path);
      const extractedText = extractionResult.text;
      const extractionMethod = extractionResult.method;

      papersTextForPattern.push({
        paperIndex,
        filename: file.originalname,
        text: extractedText,
      });

      // Upload to Cloudinary if available
      let cloudinaryUrl: string | undefined;
      let cloudinaryPublicId: string | undefined;
      try {
        const fileData = fs.readFileSync(file.path);
        const dataUri = `data:application/pdf;base64,${fileData.toString('base64')}`;
        const cRes = await uploadDocumentToCloudinary(dataUri, file.originalname, 'zeroleak/draft-papers');
        if (cRes && cRes.secure_url) {
          cloudinaryUrl = cRes.secure_url;
          cloudinaryPublicId = cRes.public_id;
        }
      } catch (cErr) {
        console.warn(`[University Ingestion] Cloudinary upload notice for ${file.originalname}:`, cErr);
      }

      // Parse structured questions
      const parsedQuestions = parseDraftPaperQuestions(extractedText, paperIndex, draftPaperId, exam_id);

      const mcqCount = parsedQuestions.filter(q => q.question_type === 'MCQ').length;
      const theoryCount = parsedQuestions.filter(q => q.question_type === 'THEORY').length;

      paperCounts[`paper${paperIndex}Count`] = parsedQuestions.length;

      // 1. Insert into draft_papers table
      executeRun(
        db,
        `INSERT INTO draft_papers (id, exam_id, paper_index, file_name, file_size, mime_type, storage_path, extracted_text, extraction_method, question_count, mcq_count, theory_count, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          draftPaperId,
          exam_id,
          paperIndex,
          file.originalname,
          file.size,
          file.mimetype,
          cloudinaryUrl || file.path,
          extractedText.substring(0, 5000), // store preview excerpt
          extractionMethod,
          parsedQuestions.length,
          mcqCount,
          theoryCount,
          nowIso,
        ]
      );

      // 2. Insert/Update question_papers table for unified Question Paper Studio display
      const qpExists = executeQuery(db, 'SELECT id FROM question_papers WHERE exam_id = ? AND original_filename = ?', [exam_id, file.originalname])[0];
      if (!qpExists) {
        executeRun(
          db,
          `INSERT INTO question_papers (id, org_id, exam_id, original_filename, subject, examination_category, processing_status, page_count, question_count, auto_extracted_count, needs_review_count, manually_corrected_count, cloudinary_url, cloudinary_public_id, uploaded_at)
           VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, 0, 0, ?, ?, ?)`,
          [
            draftPaperId,
            org_id,
            exam_id,
            file.originalname,
            examSubject,
            examCategory,
            Math.max(1, Math.ceil(extractedText.length / 2500)),
            parsedQuestions.length,
            parsedQuestions.length,
            cloudinaryUrl || null,
            cloudinaryPublicId || null,
            nowIso,
          ]
        );
      }

      // 3. Insert Parsed Structured Questions into draft_questions & questions tables
      for (const q of parsedQuestions) {
        executeRun(
          db,
          `INSERT INTO draft_questions (id, draft_paper_id, exam_id, paper_index, source_paper, section, question_number, question_text, question_type, options_json, marks, sub_question_pattern, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            q.id,
            q.draft_paper_id,
            q.exam_id,
            q.paper_index,
            q.source_paper,
            q.section,
            q.question_number,
            q.question_text,
            q.question_type,
            q.options ? JSON.stringify(q.options) : null,
            q.marks,
            q.sub_question_pattern || null,
            q.created_at,
          ]
        );

        // Sync into unified questions table ensuring non-null syllabus
        executeRun(
          db,
          `INSERT OR REPLACE INTO questions (
            id, org_id, exam_id, question_paper_id, source_file, source_page, question_number,
            subject, topic, difficulty, marks, negative_marks, correct_answer, language,
            syllabus, question_type, content_text, options_json, diagram_url, status, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ELIGIBLE_FOR_PAPER', ?, ?, ?)`,
          [
            q.id,
            org_id,
            exam_id,
            draftPaperId,
            file.originalname,
            1,
            q.question_number,
            examSubject,
            q.section || 'General',
            'MEDIUM',
            q.marks || (q.question_type === 'MCQ' ? 1 : 4),
            0,
            q.correct_answer || (q.options?.length ? 'A' : ''),
            'English',
            examSyllabus,
            q.question_type,
            q.question_text,
            q.options ? JSON.stringify(q.options) : null,
            q.diagram_url || null,
            user_id,
            nowIso,
            nowIso,
          ]
        );

        allExtractedQuestions.push(q);
      }

      ingestedDraftPapers.push({
        id: draftPaperId,
        exam_id,
        paper_index: paperIndex,
        file_name: file.originalname,
        file_size: file.size,
        mime_type: file.mimetype,
        cloudinary_url: cloudinaryUrl,
        storage_path: cloudinaryUrl || file.path,
        extraction_method: extractionMethod,
        question_count: parsedQuestions.length,
        mcq_count: mcqCount,
        theory_count: theoryCount,
        uploaded_at: nowIso,
      });
    }

    // Analyze Common Examination Pattern across all 3 source papers
    let detectedPattern: any = null;
    try {
      detectedPattern = await analyzeConsolidatedExamPattern(papersTextForPattern, examSubject, examCategory);
      if (detectedPattern) {
        // Save detected pattern to examination_configurations table
        const patternJson = JSON.stringify(detectedPattern);
        const configId = uuidv4();
        const existingConfig = executeQuery(db, 'SELECT id FROM examination_configurations WHERE exam_id = ?', [exam_id])[0];
        if (existingConfig) {
          executeRun(
            db,
            'UPDATE examination_configurations SET blueprint_json = ?, theory_pattern_json = ?, pattern_confirmed = 1, updated_at = ? WHERE exam_id = ?',
            [patternJson, patternJson, nowIso, exam_id]
          );
        } else {
          executeRun(
            db,
            'INSERT INTO examination_configurations (id, exam_id, blueprint_json, theory_pattern_json, pattern_confirmed, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
            [configId, exam_id, patternJson, patternJson, nowIso, nowIso]
          );
        }
      }
    } catch (patErr) {
      console.warn('[University Ingestion] Pattern analysis notice:', patErr);
    }

    saveDb();

    // Clean up temporary local files after processing
    tempFiles.forEach(filePath => {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          console.warn(`[University Ingestion] Unlink warning for ${filePath}:`, unlinkErr);
        }
      }
    });

    const totalQuestions = allExtractedQuestions.length;
    const mcqCount = allExtractedQuestions.filter(q => q.question_type === 'MCQ').length;
    const theoryCount = allExtractedQuestions.filter(q => q.question_type === 'THEORY').length;

    return res.json({
      success: true,
      message: `Successfully ingested ${files.length} University draft papers. Extracted ${totalQuestions} questions across ${files.length} source papers.`,
      draftPapers: ingestedDraftPapers,
      detectedPattern,
      paperCounts: {
        ...paperCounts,
        totalQuestions,
        mcqCount,
        theoryCount,
      },
      questions: allExtractedQuestions,
    });
  } catch (err: any) {
    console.error('[University Ingestion Error]:', err);
    // Cleanup temp files on exception
    tempFiles.forEach(filePath => {
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    });
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to process University Exam draft paper upload.',
    });
  }
}


