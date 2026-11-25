import { RagQuestionMetadata } from './universityRagPipeline.ts';
import {
  renderExactUniversityPaperPdf,
  extractTableFromQuestionText,
  UniversityPaperTemplateInput,
  UniversityTemplateQuestion,
} from './universityPaperTemplate.ts';

export interface UniversityPaperPdfInput {
  universityName?: string;
  examName?: string;
  subject?: string;
  paperCode?: string;
  setLetter: string; // 'P', 'Q', 'R', 'S'
  examDate?: string;
  durationMinutes?: number;
  totalMarks?: number;
  markingScheme?: string;
  mcqs: RagQuestionMetadata[];
  section1Theory: RagQuestionMetadata[];
  section2Theory: RagQuestionMetadata[];
  totalSetsToRender?: number; // 1 for single set, 4 for P+Q+R+S
}

/**
 * Generates an official, publication-quality University Question Paper PDF
 * following the exact structure, layout, typography, borders, and question-numbering
 * of the authoritative university paper format.
 */
export async function generateUniversityPaperPdf(input: UniversityPaperPdfInput): Promise<Buffer> {
  // 1. Process MCQs (Q.1) - exactly 14 questions
  const rawMcqs = input.mcqs.length > 0 ? input.mcqs : [
    {
      questionId: 'default-mcq',
      sourcePaper: 'Paper 1',
      paperIndex: 1,
      section: 'Section I',
      questionType: 'MCQ' as const,
      marks: 1,
      questionText: 'The primary responsibility of the operating-system kernel is to manage hardware resources.',
      options: ['compile application programs', 'manage hardware resources', 'design database schemas', 'translate high-level languages'],
    }
  ];

  const mcqQuestions: UniversityTemplateQuestion[] = [];
  for (let i = 0; i < 14; i++) {
    const q = rawMcqs[i % rawMcqs.length];
    let options = q.options || [];
    if (typeof options === 'string') {
      try {
        options = JSON.parse(options);
      } catch {
        options = [];
      }
    }
    mcqQuestions.push({
      id: `${q.questionId}-${i + 1}`,
      questionText: q.questionText,
      marks: 1,
      options,
    });
  }

  // 2. Process Section 1 Theory:
  const rawSec1 = input.section1Theory.length > 0 ? input.section1Theory : [
    {
      questionId: 'default-sec1',
      sourcePaper: 'Paper 1',
      paperIndex: 1,
      section: 'Section I',
      questionType: 'THEORY' as const,
      marks: 4,
      questionText: 'Explain any four services provided by an operating system. Give one suitable system call for each service.',
    }
  ];

  // Q.2: Attempt any four: 5 questions (a-e), 4 marks each = 16 marks
  const sec1Q2: UniversityTemplateQuestion[] = [];
  for (let i = 0; i < 5; i++) {
    const q = rawSec1[i % rawSec1.length];
    const { cleanText, table } = extractTableFromQuestionText(q.questionText);
    sec1Q2.push({
      id: `${q.questionId}-q2-${i}`,
      subLabel: String.fromCharCode(97 + i),
      questionText: cleanText,
      marks: 4,
      table,
    });
  }

  // Q.3: Attempt any two: 3 questions (a-c), 6 marks each = 12 marks
  const sec1Q3: UniversityTemplateQuestion[] = [];
  for (let i = 0; i < 3; i++) {
    const srcIndex = (i + 5) < rawSec1.length ? (i + 5) : (i % rawSec1.length);
    const q = rawSec1[srcIndex];
    const { cleanText, table } = extractTableFromQuestionText(q.questionText);
    sec1Q3.push({
      id: `${q.questionId}-q3-${i}`,
      subLabel: String.fromCharCode(97 + i),
      questionText: cleanText,
      marks: 6,
      table,
    });
  }

  // 3. Process Section 2 Theory:
  const rawSec2 = input.section2Theory.length > 0 ? input.section2Theory : (rawSec1.length > 8 ? rawSec1.slice(8) : rawSec1);

  // Q.4: Attempt any four: 5 questions (a-e), 4 marks each = 16 marks
  const sec2Q4: UniversityTemplateQuestion[] = [];
  for (let i = 0; i < 5; i++) {
    const q = rawSec2[i % rawSec2.length];
    const { cleanText, table } = extractTableFromQuestionText(q.questionText);
    sec2Q4.push({
      id: `${q.questionId}-q4-${i}`,
      subLabel: String.fromCharCode(97 + i),
      questionText: cleanText,
      marks: 4,
      table,
    });
  }

  // Q.5: Attempt any two: 3 questions (a-c), 6 marks each = 12 marks
  const sec2Q5: UniversityTemplateQuestion[] = [];
  for (let i = 0; i < 3; i++) {
    const srcIndex = (i + 5) < rawSec2.length ? (i + 5) : (i % rawSec2.length);
    const q = rawSec2[srcIndex];
    const { cleanText, table } = extractTableFromQuestionText(q.questionText);
    sec2Q5.push({
      id: `${q.questionId}-q5-${i}`,
      subLabel: String.fromCharCode(97 + i),
      questionText: cleanText,
      marks: 6,
      table,
    });
  }

  const templateInput: UniversityPaperTemplateInput = {
    paperCode: input.paperCode || 'SLR-EXAM-2026',
    setLetter: input.setLetter || 'P',
    examTitle: input.examName || 'Annual University Examination 2026',
    branchName: (input as any).branchName || 'ENGINEERING & TECHNOLOGY',
    subjectName: input.subject || 'Core Engineering Subject',
    dayDate: input.examDate || '_______________________',
    timeRange: input.durationMinutes ? `${Math.floor(input.durationMinutes / 60)}:00 Hours` : '10:00 AM to 01:00 PM',
    maxMarksTotal: input.totalMarks || 70,
    maxMarksTheory: (input.totalMarks || 70) - 14,
    mcqs: mcqQuestions,
    section1Q2: sec1Q2,
    section1Q3: sec1Q3,
    section2Q4: sec2Q4,
    section2Q5: sec2Q5,
    totalSetsToRender: input.totalSetsToRender || 1,
  };

  return await renderExactUniversityPaperPdf(templateInput);
}
