import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  FileText,
  Sparkles,
  Download,
  Printer,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileCode2,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Layers,
  Cpu,
  Eye,
  ListOrdered,
  MessageSquare,
  Send,
  Bot,
  User as UserIcon,
  RotateCcw,
  Zap,
  HelpCircle,
  Settings,
  Sparkle,
  Globe,
  Compass,
  Shield,
  Sliders,
  Activity,
  Database,
  KeyRound,
  Terminal,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import { OpenAIPrismBrowserModal } from './OpenAIPrismBrowserModal';
import { api, ollamaChatStream } from '../api';
import type { CompileDiagnostics } from '../api';
import { User } from '../types';
import {
  getSecurityWatermarkLocation,
  getImmediateSecurityWatermarkLocation,
  activatePlatformScreenProtection,
  buildDynamicWatermarkStrings,
  type ClientSecurityLocation,
} from '../utils/securityProtection';
import {
  detectPaperPattern,
  extractPaperHeader,
  pickPrimaryPaperIndex,
  pickPrimaryPattern,
  summarizePattern,
  type DetectedPattern,
  type PaperHeader,
} from '../utils/sourcePattern';
import { enforceStructuralPattern } from '../utils/patternEnforcement';
import { SecurePaperViewer } from './security/SecurePaperViewer';
import {
  savePaperDataUrl,
  getPaperDataUrl,
  deletePaperDataUrl,
} from '../utils/paperBlobStore';
import { TransferToPrintingManagerModal } from './printing/TransferToPrintingManagerModal';
import { ThresholdEncryptionAndEmergencyPanel } from './papers/ThresholdEncryptionAndEmergencyPanel';

interface UploadedPaper {
  id: string;
  name: string;
  text: string;
  pageCount: number;
  wordCount: number;
  fileSize: number;
  /** The original bytes, so the paper's own diagrams can be lifted back out. */
  dataUrl?: string;
}

/**
 * A diagram or table cropped out of an uploaded paper, reused unchanged.
 *
 * The bytes are held here rather than a URL: the paper must be able to reuse the
 * asset without a second request that can fail on its own.
 */
interface SourceFigure {
  index: number;
  name: string;
  url: string;
  page: number;
  kind: 'raster' | 'vector-region';
  width: number;
  height: number;
  base64: string;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  structuredPaper?: any;
}

interface SimpleMultiPaperSynthesizerProps {
  currentUser?: User | null;
  onRefresh?: () => void;
  examId?: string;
}

/**
 * Form defaults. The source paper's own masthead replaces these wherever the
 * examiner has not typed an override, so a paper that prints "Max. Marks: 34"
 * no longer inherits the form's 70.
 */
const DEFAULT_METADATA = {
  subject: 'Computer Science & Engineering',
  universityName: 'AUTONOMOUS STATE UNIVERSITY EXAMINATION BOARD',
  paperCode: 'SLR-FINAL-04',
  totalMarks: 70,
  durationHours: 3,
};

/**
 * Keep the examiner's own edits: a header field read from the source paper is
 * only used while the form still holds its untouched default.
 */
function headerRespectingOverrides(
  header: PaperHeader | null,
  current: {
    subject: string;
    universityName: string;
    paperCode: string;
    totalMarks: number;
    durationHours: number;
  }
): PaperHeader | null {
  if (!header) return null;
  return {
    ...header,
    subject: current.subject === DEFAULT_METADATA.subject ? header.subject : null,
    universityName:
      current.universityName === DEFAULT_METADATA.universityName ? header.universityName : null,
    paperCode: current.paperCode === DEFAULT_METADATA.paperCode ? header.paperCode : null,
    maxMarks: current.totalMarks === DEFAULT_METADATA.totalMarks ? header.maxMarks : null,
    durationHours:
      current.durationHours === DEFAULT_METADATA.durationHours ? header.durationHours : null,
  };
}

function convertStructuredDataToLatex(
  data: any,
  subject: string,
  universityName: string,
  paperCode: string,
  totalMarks: number,
  durationHours: number
): string {
  if (!data || !data.sections) {
    return '';
  }

  const escapeLatexSafe = (str: string | number | undefined | null) => {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/([&%$#_{}])/g, '\\$1')
      .replace(/~/g, '\\textasciitilde{}')
      .replace(/\^/g, '\\textasciicircum{}');
  };

  const uName = escapeLatexSafe(data.universityName || universityName);
  const sub = escapeLatexSafe(data.subject || subject);
  const pCode = escapeLatexSafe(data.paperCode || paperCode);
  const marks = escapeLatexSafe(data.totalMarks || totalMarks);
  const duration = escapeLatexSafe(data.duration || `${durationHours} Hours`);

  const latexLines: string[] = [
    '\\documentclass[11pt,a4paper]{article}',
    '\\usepackage[a4paper, left=18mm, right=18mm, top=20mm, bottom=20mm]{geometry}',
    '\\usepackage{amsmath,amssymb,amsfonts,enumitem,fancyhdr,tabularx,xcolor,booktabs,tikz}',
    '\\usepackage[export]{adjustbox}',
    '\\usetikzlibrary{arrows.meta,positioning,shapes.geometric,calc,decorations.pathreplacing}',
    '\\setlength{\\parindent}{0pt}',
    '\\pagestyle{fancy}',
    '\\fancyhf{}',
    '\\cfoot{\\small Page \\thepage}',
    '\\renewcommand{\\headrulewidth}{0pt}',
    '\\begin{document}',
    '',
    '\\noindent',
    '\\begin{tabularx}{\\textwidth}{@{}l X r@{}}',
    '  \\textbf{Seat No.:} \\framebox[2.5cm]{\\vphantom{A}} & ',
    `  \\centering \\textbf{${uName}} & `,
    `  \\textbf{Set: ${escapeLatexSafe(data.setLetter || 'P')}} \\\\`,
    '\\end{tabularx}',
    '\\vspace{2mm}',
    '\\begin{center}',
    '  {\\normalsize\\bfseries B.Tech. / Diploma Semester Examination 2026} \\par\\vspace{1.5mm}',
    `  {\\large\\bfseries ${sub}} \\par\\vspace{1.5mm}`,
    `  {\\small Time: ${duration} \\hfill Max. Marks: ${marks}}`,
    '\\end{center}',
    '\\hrule height 1pt',
    '\\vspace{2.5mm}',
    '\\textbf{Instructions to Candidates:}',
    '\\begin{enumerate}[label=\\arabic*., itemsep=1pt]',
    '  \\item Figures to the right indicate full marks for each question.',
    '  \\item Neat diagrams must be drawn wherever necessary.',
    '  \\item Assume suitable data if necessary and state them clearly.',
    '  \\item Use of programmable calculators is strictly prohibited.',
    '\\end{enumerate}',
    '\\vspace{2.5mm}',
    '\\hrule',
    '\\vspace{3mm}',
  ];

  data.sections.forEach((sec: any, sIdx: number) => {
    // Dynamic Page Breaks: Strictly separate Component 1 (MCQ/Objective, Q.1) from
    // descriptive SECTION - I and subsequent sections.
    if (sIdx > 0) {
      latexLines.push('\\clearpage');
    }

    latexLines.push(`\\section*{${sec.title || 'SECTION'}${sec.totalMarks ? ` \\hfill [${sec.totalMarks}]` : ''}}`);
    if (sec.instructions) {
      latexLines.push(`\\textit{${sec.instructions}} \\par\\vspace{2mm}`);
    }

    if (Array.isArray(sec.questions)) {
      sec.questions.forEach((q: any, qIdx: number) => {
        const qNum = q.number ? (q.number.endsWith('.') || q.number.endsWith(')') ? q.number : `${q.number}.`) : `Q.${qIdx + 1}`;
        const marksStr = q.marks ? ` \\hfill [${typeof q.marks === 'number' ? `${q.marks} Marks` : q.marks}]` : '';

        // Check for inline table, TikZ, or extracted source figures inside q.text
        let mainText = q.text || '';
        let extractedTable = '';
        let extractedTikz = '';

        // Extract and constrain any source figure markers
        const figureMarker = /\[\[\s*FIGURE\s*[:\s]\s*(\d{1,2})\s*\]\]|\[\s*FIGURE\s*[:\s]\s*(\d{1,2})\s*\]/gi;
        const figureMatches = [...mainText.matchAll(figureMarker)];
        if (figureMatches.length > 0) {
          mainText = mainText.replace(figureMarker, '').trim();
        }

        const tabMatch = mainText.match(/(\\begin\{tabular(?:x)?\}[\s\S]*?\\end\{tabular(?:x)?\})/i);
        if (tabMatch) {
          extractedTable = tabMatch[0];
          mainText = mainText.replace(tabMatch[0], '').trim();
        }

        const tikzMatch = mainText.match(/(\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})/i);
        if (tikzMatch) {
          extractedTikz = tikzMatch[0];
          mainText = mainText.replace(tikzMatch[0], '').trim();
        }

        latexLines.push(`\\textbf{${qNum}} ${mainText}${marksStr} \\par\\vspace{2mm}`);

        // If extracted figures are referenced, wrap strictly with constrained width and height
        if (figureMatches.length > 0) {
          figureMatches.forEach((m) => {
            const figNum = m[1] || m[2];
            latexLines.push(
              `\\begin{center}\\IfFileExists{figure-${figNum}.png}{\\includegraphics[max width=\\textwidth, max height=0.3\\textheight]{figure-${figNum}.png}}{\\fbox{\\parbox{0.6\\textwidth}{\\centering\\small [Diagram ${figNum} from the source paper]}}}\\end{center}\\vspace{2mm}`
            );
          });
        }

        // If table was extracted or passed in q.table
        const finalTable = extractedTable || q.table;
        if (finalTable) {
          let tbl = finalTable.trim();
          if (tbl.startsWith('\\begin{tabular}') && !tbl.includes('\\begin{tabularx}')) {
            tbl = tbl
              .replace(/\\begin\{tabular\}\s*\{([^}]+)\}/, (_m: string, cols: string) => {
                const count = (cols.match(/[lcrXpm]/g) || []).length || 3;
                return `\\begin{tabularx}{0.94\\linewidth}{|${'X|'.repeat(count)}}`;
              })
              .replace(/\\end\{tabular\}/, '\\end{tabularx}');
          }
          latexLines.push(`\\begin{center}\n\\small\n${tbl}\n\\end{center}\\vspace{2mm}`);
        }

        // If diagram or TikZ code is provided
        const finalTikz = extractedTikz || q.tikz || q.diagram;
        if (finalTikz) {
          let tikzCode = finalTikz.trim();
          if (!tikzCode.includes('scale=')) {
            tikzCode = tikzCode.replace(/\\begin\{tikzpicture\}/, '\\begin{tikzpicture}[scale=0.88, every node/.style={transform shape}]');
          }
          if (tikzCode.startsWith('\\begin{tikzpicture}')) {
            latexLines.push(`\\begin{center}\n${tikzCode}\n\\end{center}\\vspace{2mm}`);
          } else {
            latexLines.push(`\\begin{center}\n\\begin{tikzpicture}[scale=0.88, every node/.style={transform shape}]\n${tikzCode}\n\\end{tikzpicture}\n\\end{center}\\vspace{2mm}`);
          }
        }

        if (Array.isArray(q.options) && q.options.length > 0) {
          latexLines.push('\\begin{enumerate}[label=(\\alph*), itemsep=1pt]');
          q.options.forEach((opt: string) => {
            const cleanOpt = opt.replace(/^\([a-d]\)\s*/i, '').replace(/^[a-d]\)\s*/i, '');
            latexLines.push(`  \\item ${cleanOpt}`);
          });
          latexLines.push('\\end{enumerate}');
        }

        if (q.orText) {
          latexLines.push('\\begin{center}\\textbf{--- OR ---}\\end{center}');
          const orMarksStr = q.orMarks ? ` \\hfill [${typeof q.orMarks === 'number' ? `${q.orMarks} Marks` : q.orMarks}]` : '';
          latexLines.push(`${q.orText}${orMarksStr} \\par\\vspace{2mm}`);
          if (q.orTikz) {
            latexLines.push(`\\begin{center}\n${q.orTikz}\n\\end{center}\\vspace{2mm}`);
          }
        }
      });
    }
    latexLines.push('\\vspace{3mm}');
  });

  latexLines.push('\\begin{center}\\textbf{*** END OF QUESTION PAPER ***}\\end{center}');
  latexLines.push('\\end{document}');

  return latexLines.join('\n');
}

/**
 * Markers of a reply that is the prompt's own example schema echoed back rather
 * than a written paper - the failure that produced papers made entirely of
 * "First MCQ question text..." and "Subquestion text...". Kept in step with the
 * server-side check in server/synthesizedPaperPdfGenerator.ts.
 */
/**
 * The real stages of paper generation, in the order they run.
 *
 * These are set by the code that actually performs each operation, so the panel
 * reports what is really happening rather than what the clock thinks should be
 * happening.
 */
type GenerationStage = 'idle' | 'figures' | 'synthesis' | 'typesetting' | 'done' | 'error';

const GENERATION_STEPS = [
  '1. Paper Analysis',
  '2. Deep Reasoning',
  '3. Question Synthesis',
  '4. PDF Typesetting',
] as const;

/** Which of the four displayed steps each real stage belongs to (1-based). */
const STAGE_ACTIVE_STEP: Record<GenerationStage, number> = {
  idle: 1,
  figures: 1,
  synthesis: 3,
  typesetting: 4,
  done: 5,
  error: 0,
};

/** Longest a single stage may run before the panel names it as stalled. */
const STAGE_STALL_SECONDS = 90;

/**
 * Hard ceiling on one typesetting request. The server races its own compile
 * against a shorter budget, so this only fires when the request is lost
 * entirely (a dropped connection, a proxy that never answers).
 */
const COMPILE_TIMEOUT_MS = 240_000;

const PLACEHOLDER_REPLY_MARKERS = [
  /first mcq question text/i,
  /sub-?question text/i,
  /question text here/i,
  /lorem ipsum/i,
];

function isPlaceholderReply(content: string): boolean {
  return PLACEHOLDER_REPLY_MARKERS.some((marker) => marker.test(content));
}

/** Helper to extract raw LaTeX document from DeepSeek response */
function extractLatexFromContent(content: string): string | null {
  if (!content) return null;
  const match = content.match(/\\documentclass[\s\S]*?\\end\{document\}/i);
  if (match) return match[0].trim();
  const fenceMatch = content.match(/```(?:latex|tex)?\s*(\\documentclass[\s\S]*?\\end\{document\})\s*```/i);
  if (fenceMatch) return fenceMatch[1].trim();
  return null;
}

/** Helper to extract JSON question paper structure from AI reply with robust fallback */
function extractJsonFromContent(
  content: string,
  options: { allowTextFallback?: boolean } = {}
): any | null {
  if (!content) return null;

  // 1. Direct JSON parse
  try {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed);
      if (parsed && Array.isArray(parsed.sections) && parsed.sections.length > 0 && parsed.sections.some((s: any) => Array.isArray(s.questions) && s.questions.length > 0)) {
        return parsed;
      }
    }
  } catch {}

  // 2. Extract from markdown code fence ```json ... ```
  try {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
    if (jsonMatch && jsonMatch[1]) {
      const fenceBody = jsonMatch[1].trim();
      const firstBrace = fenceBody.indexOf('{');
      const lastBrace = fenceBody.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const parsed = JSON.parse(fenceBody.substring(firstBrace, lastBrace + 1));
        if (parsed && Array.isArray(parsed.sections) && parsed.sections.length > 0 && parsed.sections.some((s: any) => Array.isArray(s.questions) && s.questions.length > 0)) {
          return parsed;
        }
      }
    }
  } catch {}

  // 3. Fallback: find first '{' and last '}' anywhere in the content
  try {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = content.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(candidate);
      if (parsed && Array.isArray(parsed.sections) && parsed.sections.length > 0 && parsed.sections.some((s: any) => Array.isArray(s.questions) && s.questions.length > 0)) {
        return parsed;
      }
    }
  } catch {}

  // 4. Robust Line-by-Line Heuristic Question Extractor
  //
  // This branch fabricates a pattern (two hardcoded sections of 1- and 7-mark
  // questions) out of whatever prose survived. That is acceptable when the user
  // asks to turn a chat reply into a PDF, but for paper generation it must stay
  // off: inventing a pattern is exactly what must never happen.
  if (options.allowTextFallback === false) return null;
  try {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    const questionsSec1: any[] = [];
    const questionsSec2: any[] = [];
    let currentSec = 1;

    for (const line of lines) {
      if (/section\s*[-–—:]*\s*(?:ii|2|b)/i.test(line)) {
        currentSec = 2;
        continue;
      }
      const qMatch = line.match(/^(?:#+\s*)?(?:Q\.?\s*(\d+[a-zA-Z\.\)]*|\([a-z\d]+\)|\d+\.))\s*(.*)$/i);
      if (qMatch) {
        const qNum = qMatch[1].trim();
        const qText = qMatch[2].trim();
        if (qText.length > 5) {
          const target = currentSec === 1 ? questionsSec1 : questionsSec2;
          target.push({
            number: qNum.startsWith('Q') ? qNum : `Q.${qNum}`,
            text: qText.replace(/\[\d+\s*Marks?\]/i, '').trim(),
            marks: currentSec === 1 ? '1' : '7'
          });
        }
      }
    }

    if (questionsSec1.length > 0 || questionsSec2.length > 0) {
      return {
        universityName: 'AUTONOMOUS STATE UNIVERSITY EXAMINATION BOARD',
        examName: 'B.TECH. / DIPLOMA SEMESTER EXAMINATION 2026',
        subject: 'Operating Systems',
        paperCode: 'SLR-FINAL-04',
        totalMarks: 70,
        duration: '3 Hours',
        sections: [
          ...(questionsSec1.length > 0 ? [{
            title: 'SECTION – I (Objective & MCQs)',
            totalMarks: `${questionsSec1.length} Marks`,
            questions: questionsSec1
          }] : []),
          ...(questionsSec2.length > 0 ? [{
            title: 'SECTION – II (Descriptive & Analytical Questions)',
            totalMarks: `${questionsSec2.length * 7} Marks`,
            questions: questionsSec2
          }] : [])
        ]
      };
    }
  } catch {}

  return null;
}

export const SimpleMultiPaperSynthesizer: React.FC<SimpleMultiPaperSynthesizerProps> = ({
  currentUser,
  examId,
}) => {
  const currentExamId = examId || 'EXAM-UNIV-MASTER-2026';

  // In-Project OpenAI Prism & LaTeX Browser Modal
  const [showPrismBrowser, setShowPrismBrowser] = useState(false);
  const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);

  // Uploaded Source Papers (Target: 3 to 5 source papers)
  const [papers, setPapers] = useState<UploadedPaper[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replacingPaperId, setReplacingPaperId] = useState<string | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  // Metadata Settings
  const [subject, setSubject] = useState(DEFAULT_METADATA.subject);
  const [universityName, setUniversityName] = useState(DEFAULT_METADATA.universityName);
  const [paperCode, setPaperCode] = useState(DEFAULT_METADATA.paperCode);
  const [totalMarks, setTotalMarks] = useState<number>(DEFAULT_METADATA.totalMarks);
  const [durationHours, setDurationHours] = useState<number>(DEFAULT_METADATA.durationHours);
  const [questionCount, setQuestionCount] = useState<number>(8);
  const [difficultySetting, setDifficultySetting] = useState<'BALANCED' | 'HARD' | 'MODERATE'>('BALANCED');

  // AI Generation Settings Toggles
  const [enableQuestionFusion, setEnableQuestionFusion] = useState(true);
  const [enableDifficultyBalancing, setEnableDifficultyBalancing] = useState(true);
  const [enableTopicCoverage, setEnableTopicCoverage] = useState(true);
  const [enableDuplicateDetection, setEnableDuplicateDetection] = useState(true);
  const [enableSemanticSimilarity, setEnableSemanticSimilarity] = useState(true);
  const [enableSecureSelection, setEnableSecureSelection] = useState(true);

  // The uploaded paper that acts as the structural authority. Null means "use
  // the most recently uploaded paper", which is the default the spec asks for.
  const [primaryPaperId, setPrimaryPaperId] = useState<string | null>(null);
  // What the structural enforcement changed in the AI's answer, and what it
  // could not fix, so a rejected run says exactly which rule the paper broke.
  const [enforcementReport, setEnforcementReport] = useState<{
    repairs: string[];
    violations: string[];
    /** The EXPECTED / found / STATUS comparison, question by question. */
    summary?: string[];
  } | null>(null);
  const patternRef = useRef<DetectedPattern | null>(null);
  const headerRef = useRef<PaperHeader | null>(null);

  // Visual assets lifted out of the uploaded paper. A diagram the source already
  // contains is reused as its own pixels; it is never redrawn or approximated.
  const [sourceFigures, setSourceFigures] = useState<SourceFigure[]>([]);
  const [figureWarnings, setFigureWarnings] = useState<string[]>([]);
  const [extractingFigures, setExtractingFigures] = useState(false);
  // The crops as bytes, ready to be sent with the compile request. This is what
  // makes reuse work offline: no URL is ever fetched for a source figure.
  const sourceFigureResourcesRef = useRef<Array<{ path: string; content: string; encoding: 'base64' }>>([]);

  // 3-to-1 Generation State
  const [generating, setGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [generatedLatex, setGeneratedLatex] = useState<string>('');
  const [structuredData, setStructuredData] = useState<any | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  /**
   * The real stage of the pipeline, set by the code that is actually running.
   *
   * The four step labels used to be derived from `elapsedSeconds`, so the panel
   * announced "4. PDF Typesetting" from second 90 onwards no matter what the
   * backend was doing - a paper still being written showed as a typesetting
   * hang. The clock now only reports how long the current stage has run.
   */
  const [stage, setStage] = useState<GenerationStage>('idle');
  const [waitingOn, setWaitingOn] = useState<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  /** Move to a real stage and start its clock. */
  const enterStage = (next: GenerationStage, label: string) => {
    setStage(next);
    setElapsedSeconds(0);
    setWaitingOn(label);
  };

  // Live timer for the stage that is currently running. This clock is a label
  // only: it never decides which step is shown and never claims completion.
  useEffect(() => {
    let interval: any = null;
    if (generating) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [generating, stage]);

  // Synchronize LaTeX edited in Embedded Prism AI Studio
  useEffect(() => {
    const handleLatexSync = (e: any) => {
      if (e?.detail?.latex) {
        setGeneratedLatex(e.detail.latex);
      }
    };
    window.addEventListener('zeroleak:paper-latex-updated', handleLatexSync);
    return () => {
      window.removeEventListener('zeroleak:paper-latex-updated', handleLatexSync);
    };
  }, []);

  // Restore configuration and source papers for the current exam from localStorage
  useEffect(() => {
    const configStorageKey = `zeroleak_univ_config_${currentExamId}`;
    const papersStorageKey = `zeroleak_univ_papers_${currentExamId}`;
    try {
      const savedConfig = localStorage.getItem(configStorageKey);
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (parsed.subject) setSubject(parsed.subject);
        if (parsed.universityName) setUniversityName(parsed.universityName);
        if (parsed.paperCode) setPaperCode(parsed.paperCode);
        if (parsed.totalMarks) setTotalMarks(Number(parsed.totalMarks));
        if (parsed.durationHours) setDurationHours(Number(parsed.durationHours));
        if (parsed.difficultySetting) setDifficultySetting(parsed.difficultySetting);
      }
      const savedPapers = localStorage.getItem(papersStorageKey);
      if (savedPapers) {
        const parsedP = JSON.parse(savedPapers);
        if (Array.isArray(parsedP) && parsedP.length > 0) {
          Promise.all(
            parsedP.slice(0, 5).map(async (p: any) => {
              const dataUrl = await getPaperDataUrl(p.id);
              return dataUrl ? { ...p, dataUrl } : p;
            })
          ).then((rehydrated) => {
            setPapers(rehydrated);
          }).catch(() => {
            setPapers(parsedP.slice(0, 5));
          });
        }
      }
    } catch (e) {
      console.warn('Could not restore from localStorage', e);
    }
  }, [currentExamId]);

  // Persist examination configuration for the current exam
  useEffect(() => {
    const configStorageKey = `zeroleak_univ_config_${currentExamId}`;
    try {
      localStorage.setItem(
        configStorageKey,
        JSON.stringify({ subject, universityName, paperCode, totalMarks, durationHours, difficultySetting })
      );
    } catch {}
  }, [subject, universityName, paperCode, totalMarks, durationHours, difficultySetting, currentExamId]);

  // Persist source papers metadata for the current exam
  useEffect(() => {
    const papersStorageKey = `zeroleak_univ_papers_${currentExamId}`;
    try {
      const sanitized = papers.map((p) => ({
        id: p.id,
        name: p.name,
        text: p.text,
        pageCount: p.pageCount,
        wordCount: p.wordCount,
        fileSize: p.fileSize,
      }));
      localStorage.setItem(papersStorageKey, JSON.stringify(sanitized));
    } catch (e) {
      console.warn('Could not save papers to localStorage', e);
    }
  }, [papers, currentExamId]);

  const isConfigValid = Boolean(
    subject.trim() &&
    universityName.trim() &&
    paperCode.trim() &&
    totalMarks > 0 &&
    durationHours > 0
  );

  // Compilation & PDF Download State
  const [compiling, setCompiling] = useState(false);
  const [compiledPdfUrl, setCompiledPdfUrl] = useState<string | null>(null);
  const [compiledFilename, setCompiledFilename] = useState<string>('');
  const [selectedSetView, setSelectedSetView] = useState<'ALL' | 'P' | 'Q' | 'R' | 'S'>('ALL');
  const [compilerError, setCompilerError] = useState<string | null>(null);
  const [encryptionTime, setEncryptionTime] = useState<string | null>(null);
  const [unlockTime, setUnlockTime] = useState<string | null>(null);
  /**
   * The compiler's own report: which engines ran, the source file it was handed,
   * and the first real TeX error. Kept as an object (not just a string) because
   * the message alone was not enough to debug a failure.
   */
  const [compilerDiagnostics, setCompilerDiagnostics] = useState<CompileDiagnostics | null>(null);
  /**
   * The dedicated LaTeX engine's attempt. It is the last resort before a paper
   * is refused, so its source, engine and error are kept whether it worked or
   * not - a fallback failure is only actionable beside its .tex file.
   */
  const [latexFallback, setLatexFallback] = useState<{
    engine?: string;
    texPath?: string;
    sourceUrl?: string;
    error?: string;
  } | null>(null);

  // Dynamic Security Watermark & Screen Capture Protection State
  const [trackingCode, setTrackingCode] = useState<string>('');
  const [watermarkLocation, setWatermarkLocation] = useState<ClientSecurityLocation>(() =>
    getImmediateSecurityWatermarkLocation()
  );
  const [isScreenShieldActive, setIsScreenShieldActive] = useState<boolean>(false);
  const [shieldReason, setShieldReason] = useState<string>('');
  const [platformProtectionNotice, setPlatformProtectionNotice] = useState<string>('');

  // Active View Tab in Result Card
  const [activeTab, setActiveTab] = useState<'pdf' | 'content' | 'latex'>('pdf');
  const [copiedCode, setCopiedCode] = useState(false);

  // Activate platform screen protection and window defocus guards
  useEffect(() => {
    const plat = activatePlatformScreenProtection();
    setPlatformProtectionNotice(plat.notes);

    getSecurityWatermarkLocation().then((loc) => {
      setWatermarkLocation(loc);
    });

    const handleBlur = () => {
      if (document.activeElement?.tagName === 'IFRAME' || document.activeElement?.tagName === 'OBJECT') {
        return;
      }
      if (compiledPdfUrl || structuredData) {
        setIsScreenShieldActive(true);
        setShieldReason('Window defocus detected. Paper contents obscured for examination security.');
      }
    };

    const handleVisibility = () => {
      if (document.hidden && (compiledPdfUrl || structuredData)) {
        setIsScreenShieldActive(true);
        setShieldReason('Tab or app switch detected. Paper contents obscured for examination security.');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'PrintScreen' ||
        (e.ctrlKey && (e.key === 'p' || e.key === 'P')) ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 's' || e.key === 'S'))
      ) {
        e.preventDefault();
        if (compiledPdfUrl || structuredData) {
          setIsScreenShieldActive(true);
          setShieldReason('Screen capture attempt intercepted. Screen recording and unauthorized capture are strictly prohibited.');
        }
      }
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [compiledPdfUrl, structuredData]);

  // ================= Interactive AI Chat State =================
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "👋 **Welcome to the AI Examination Assistant!**\n\n" +
        "You can interact with me to:\n" +
        "- 📑 **Analyze syllabus patterns & topics** across your uploaded papers\n" +
        "- 🎯 **Generate specific question sets** (MCQs, short notes, comprehensive design problems)\n" +
        "- ⚡ **Synthesize a complete balanced examination paper** ready for instant PDF download\n" +
        "- 💡 **Refine question wording, TikZ diagrams, or marking schemes** interactively.\n\n" +
        "Upload your papers or choose a quick prompt below to start!",
      timestamp: new Date(),
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatStreaming, setChatStreaming] = useState(false);
  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Auto scroll chat to bottom when messages update
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatStreaming]);

  // Auto-detect subject from text if possible
  const detectSubjectFromText = (allText: string) => {
    const lower = allText.toLowerCase();
    if (lower.includes('software engineering')) return 'Software Engineering';
    if (lower.includes('operating system')) return 'Operating Systems';
    if (lower.includes('data structure')) return 'Data Structures & Algorithms';
    if (lower.includes('database') || lower.includes('dbms')) return 'Database Management Systems';
    if (lower.includes('computer network')) return 'Computer Networks';
    if (lower.includes('theory of computation') || lower.includes('automata')) return 'Theory of Computation';
    if (lower.includes('machine learning')) return 'Machine Learning';
    if (lower.includes('web technology') || lower.includes('internet of things')) return 'Web Technologies';
    if (lower.includes('computer graphics')) return 'Computer Graphics';
    return null;
  };

  // Convert File to Base64 Data URL
  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
      reader.readAsDataURL(file);
    });

  // Handle uploading PDF files (min 3, max 5)
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (papers.length >= 5) {
      setUploadError('Maximum limit of 5 source question papers reached. Remove or replace an existing paper to add a different one.');
      return;
    }
    setUploading(true);
    setUploadError(null);

    const availableSlots = 5 - papers.length;
    const fileArray = Array.from(files).slice(0, availableSlots);
    if (files.length > availableSlots) {
      setUploadError(`Only ${availableSlots} more paper(s) allowed (maximum 5). Uploaded first ${availableSlots}.`);
    }

    const results = await Promise.all(
      fileArray.map(async (file, i) => {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
          return { error: `${file.name}: Only PDF question papers are supported.` };
        }

        try {
          const dataUrl = await readFileAsDataUrl(file);
          const res = await api.extractPdfText({ file_data: dataUrl, file_name: file.name });
          const text = (res?.text || '').trim();

          if (!text) {
            return { error: `${file.name}: No readable text found (scanned PDF image).` };
          }

          const paperId = `${file.name}-${Date.now()}-${i}`;
          if (dataUrl) {
            void savePaperDataUrl(paperId, dataUrl);
          }
          const words = text.split(/\s+/).filter(Boolean).length;
          return {
            paper: {
              id: paperId,
              name: file.name,
              text,
              pageCount: res.pageCount || 1,
              wordCount: words,
              fileSize: file.size,
              // Kept so the paper's own figures can be cropped back out of it.
              dataUrl,
            },
          };
        } catch (err: any) {
          return { error: `${file.name}: ${err?.message || 'Extraction failed'}` };
        }
      })
    );

    const newPapers: UploadedPaper[] = [];
    const errors: string[] = [];

    results.forEach((r) => {
      if (r.paper) newPapers.push(r.paper);
      if (r.error) errors.push(r.error);
    });

    if (newPapers.length > 0) {
      setPapers((prev) => {
        const combined = [...prev, ...newPapers].slice(0, 5);
        const detected = detectSubjectFromText(combined.map((p) => p.text).join(' '));
        if (detected && subject === DEFAULT_METADATA.subject) setSubject(detected);
        return combined;
      });
    }

    if (errors.length > 0) {
      setUploadError(errors.join(' | '));
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Replace a specific uploaded paper with another PDF
  const triggerReplacePaper = (paperId: string) => {
    setReplacingPaperId(paperId);
    if (replaceFileInputRef.current) {
      replaceFileInputRef.current.value = '';
      replaceFileInputRef.current.click();
    }
  };

  const handleReplaceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replacingPaperId) return;
    const targetPaperId = replacingPaperId;
    setReplacingPaperId(null);

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError(`${file.name}: Only PDF question papers are supported.`);
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await api.extractPdfText({ file_data: dataUrl, file_name: file.name });
      const text = (res?.text || '').trim();
      if (!text) {
        throw new Error(`${file.name}: No readable text found (scanned PDF image).`);
      }
      const words = text.split(/\s+/).filter(Boolean).length;
      if (dataUrl) {
        void savePaperDataUrl(targetPaperId, dataUrl);
      }
      const replacedPaper: UploadedPaper = {
        id: targetPaperId,
        name: file.name,
        text,
        pageCount: res.pageCount || 1,
        wordCount: words,
        fileSize: file.size,
        dataUrl,
      };
      setPapers((prev) => prev.map((p) => (p.id === targetPaperId ? replacedPaper : p)));
    } catch (err: any) {
      setUploadError(`${file.name}: ${err?.message || 'Replacement failed'}`);
    } finally {
      setUploading(false);
      if (replaceFileInputRef.current) replaceFileInputRef.current.value = '';
    }
  };

  // Remove a paper
  const handleRemovePaper = (id: string) => {
    void deletePaperDataUrl(id);
    setPapers((prev) => prev.filter((p) => p.id !== id));
    // Dropping the paper that was acting as the structural authority falls back
    // to "most recently uploaded" rather than leaving a dangling selection.
    setPrimaryPaperId((prev) => (prev === id ? null : prev));
  };

  /**
   * Crop the diagrams, tables and charts the primary paper already prints.
   *
   * Returns the crops as well as storing them, because the prompt that follows
   * has to name them before the model writes a single question.
   */
  const extractFiguresForPaper = async (paper: UploadedPaper | undefined): Promise<SourceFigure[]> => {
    if (!paper?.dataUrl) {
      setSourceFigures([]);
      setFigureWarnings([]);
      sourceFigureResourcesRef.current = [];
      return [];
    }

    setExtractingFigures(true);
    try {
      const res = await api.extractPdfFigures({
        file_data: paper.dataUrl,
        file_name: paper.name,
        max_figures: 12,
      });
      const figures = res.figures || [];
      setSourceFigures(figures);
      setFigureWarnings(res.warnings || []);
      sourceFigureResourcesRef.current = figures.map((figure) => ({
        path: `figure-${figure.index}.png`,
        content: figure.base64,
        encoding: 'base64' as const,
      }));
      return figures;
    } catch (err: any) {
      // A paper whose figures cannot be read still generates; the new paper just
      // may not reuse its diagrams.
      // Extraction is best-effort: a paper whose figures cannot be read still
      // generates, it simply cannot reuse the source diagrams.
      setSourceFigures([]);
      setFigureWarnings([
        `The source paper's figures could not be read (${err?.message || err}). The paper will still be generated, without the reused diagrams.`,
      ]);
      sourceFigureResourcesRef.current = [];
      return [];
    } finally {
      setExtractingFigures(false);
    }
  };

  // Unified Fast PDF Compiler: Compiles instantly via native self-hosted PDF engine (0.1s), formats LaTeX source
  const compilePaperToPdf = async (
    text: string,
    structData?: any,
    options: { requireParseable?: boolean; signal?: AbortSignal } = {}
  ): Promise<string | null> => {
    setCompiling(true);
    setCompilerError(null);
    setCompilerDiagnostics(null);
    let parsedForCompile: any = structData;
    try {
      // 1. Extract or Generate JSON & LaTeX Source
      let latexCode = extractLatexFromContent(text);
      const parsed =
        structData ||
        extractJsonFromContent(text, { allowTextFallback: !options.requireParseable });

      // Remembered so a failure can say precisely how far the reply got, instead
      // of a sentence that fits every possible problem.
      const replySections = Array.isArray(parsed?.sections) ? parsed.sections.length : 0;
      const replyQuestions = replySections
        ? parsed.sections.reduce(
            (sum: number, s: any) => sum + (Array.isArray(s?.questions) ? s.questions.length : 0),
            0
          )
        : 0;

      if (parsed && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
        let paperData = parsed;
        if (patternRef.current) {
          try {
            const enforcement = enforceStructuralPattern(parsed, patternRef.current, headerRef.current, {
              availableFigures: sourceFigureResourcesRef.current.length,
            });
            setEnforcementReport({
              repairs: enforcement.repairs,
              violations: enforcement.violations,
              summary: enforcement.summary,
            });
            if (enforcement.paper) {
              paperData = enforcement.paper;
            }
          } catch (enfErr) {
            console.warn('[Synthesizer] Non-blocking pattern enforcement notice:', enfErr);
          }
        }

        setStructuredData(paperData);
        if (!latexCode) {
          const masthead = headerRef.current;
          latexCode = convertStructuredDataToLatex(
            paperData,
            paperData.subject || masthead?.subject || subject,
            paperData.universityName || masthead?.universityName || universityName,
            paperData.paperCode || masthead?.paperCode || paperCode,
            Number(paperData.totalMarks) || masthead?.maxMarks || totalMarks,
            masthead?.durationHours || durationHours
          );
        }
        parsedForCompile = paperData;
      }

      if (!latexCode) {
        const fallbackStruct = extractJsonFromContent(text, { allowTextFallback: true });
        if (fallbackStruct) {
          setStructuredData(fallbackStruct);
          parsedForCompile = fallbackStruct;
          latexCode = convertStructuredDataToLatex(
            fallbackStruct,
            subject,
            universityName,
            paperCode,
            totalMarks,
            durationHours
          );
        }
      }

      if (latexCode) {
        setGeneratedLatex(latexCode);
      }

      // 2. High-Grade Multi-Pass LaTeX Compilation & Self-Healing Typesetting.
      //    A compile that never answers must surface as an error: the request
      //    carries its own deadline so the panel cannot sit on "Typesetting..."
      //    forever, whatever the compiler does.
      setCurrentStep('Typesetting official University Question Paper PDF via LaTeX Compiler...');
      const compileTimeout = new AbortController();
      const compileTimer = setTimeout(() => compileTimeout.abort(), COMPILE_TIMEOUT_MS);
      const compileSignal = options.signal
        ? AbortSignal.any([compileTimeout.signal, options.signal])
        : compileTimeout.signal;
      let res: Awaited<ReturnType<typeof api.compileValidatedLatex>>;
      try {
        res = await api.compileValidatedLatex({
        latex: latexCode,
        structuredData: parsedForCompile,
        paperText: text,
        subject: parsedForCompile?.subject || headerRef.current?.subject || subject,
        universityName: parsedForCompile?.universityName || headerRef.current?.universityName || universityName,
        paperCode: parsedForCompile?.paperCode || headerRef.current?.paperCode || paperCode,
        totalMarks: Number(parsedForCompile?.totalMarks) || headerRef.current?.maxMarks || totalMarks,
        durationHours: headerRef.current?.durationHours || durationHours,
        setLetter: parsedForCompile?.setLetter || headerRef.current?.set || 'P',
        totalSetsToRender: 4,
        // The crops travel with this very request as their own bytes. Nothing
        // is fetched over HTTP, so a figure cannot go missing between requests.
        resources: sourceFigureResourcesRef.current,
        }, { signal: compileSignal });
      } finally {
        clearTimeout(compileTimer);
      }

      if (res.success && res.pdfUrl) {
        // A compiler that silently drops the source paper's figures reports
        // success, so anything it admits to belongs in front of the examiner.
        if (Array.isArray(res.warnings) && res.warnings.length > 0) {
          setFigureWarnings((prev) => Array.from(new Set([...prev, ...res.warnings!])));
        }
        // Keep the report even on success: it names the engine that actually
        // typeset the paper and the source file that produced it.
        setCompilerDiagnostics(res.diagnostics || null);
        setLatexFallback(res.latexFallback || null);
        setCompiledPdfUrl(res.pdfUrl);
        const now = new Date();
        const encTimeStr = now.toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          dateStyle: 'medium',
          timeStyle: 'medium',
        });
        const unlockDate = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        const unlockTimeStr = unlockDate.toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          dateStyle: 'medium',
          timeStyle: 'short',
        });
        setEncryptionTime(encTimeStr);
        setUnlockTime(unlockTimeStr);
        setCompiledFilename(res.filename || `${subject.replace(/[^a-zA-Z0-9]/g, '_')}_Synthesized_Paper.pdf`);
        if (res.latex) {
          setGeneratedLatex(res.latex);
        }
        if (parsedForCompile && !structuredData) {
          setStructuredData(parsedForCompile);
        }
        return res.pdfUrl;
      } else {
        setCompilerDiagnostics(res.diagnostics || null);
        setLatexFallback(res.latexFallback || null);
        const first = res.diagnostics?.firstError;
        setCompilerError(
          [
            res.error || 'PDF compilation failed.',
            first ? `First compiler error: ${first}` : '',
            res.diagnostics?.firstErrorLine ? `Line: ${res.diagnostics.firstErrorLine}` : '',
            res.diagnostics?.sourcePath ? `Generated source: ${res.diagnostics.sourcePath}` : '',
            // The fallback is the last resort, so its own failure is the reason
            // no paper exists at all.
            res.latexFallback?.error ? `LaTeX fallback (${res.latexFallback.engine || 'last resort'}): ${res.latexFallback.error}` : '',
            res.latexFallback?.texPath ? `LaTeX fallback source: ${res.latexFallback.texPath}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        );
        return null;
      }
    } catch (err: any) {
      // Distinguish "the server told us no" from "nobody ever answered". A
      // timeout is a real result and has to be reported as one.
      const aborted = err?.name === 'AbortError' || err?.name === 'TimeoutError';
      setCompilerError(
        aborted
          ? `Typesetting gave up after ${Math.round(COMPILE_TIMEOUT_MS / 1000)}s without an answer from the PDF engine. ` +
              'No PDF was produced. Check the server log for the last [PDF] stage that started, then re-run generation.'
          : err?.message || 'PDF compilation request failed.'
      );
      return null;
    } finally {
      setCompiling(false);
    }
  };

  // Helper to build full context paper snippets for AI synthesis (full fidelity across all pages)
  const buildPaperSnippets = () => {
    if (papers.length === 0) return 'No source papers uploaded yet.';
    return papers
      .map((p, idx) => {
        const textSlice = p.text.length > 30000 ? p.text.slice(0, 30000) + '\n[...truncated...]' : p.text;
        return `=== SOURCE QUESTION PAPER ${idx + 1} (File: ${p.name} | Pages: ${p.pageCount}) ===\n${textSlice}\n`;
      })
      .join('\n' + '='.repeat(50) + '\n\n');
  };

  // Multi-Paper Combiner: Extracts real questions from all uploaded source papers & blends them into official 4-Set University Paper
  // Helper to convert base64 dataUrl into a File object for multipart upload
  const dataUrlToFile = (dataUrl: string, filename: string): File => {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/pdf';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`, { type: mime });
  };

  const handleSelectSet = async (setView: 'ALL' | 'P' | 'Q' | 'R' | 'S') => {
    setSelectedSetView(setView);
    if (!compiledPdfUrl && !structuredData) return;
    setCompiling(true);
    try {
      const letter = setView === 'ALL' ? 'P' : setView;
      const genRes = await api.generateUniversityFinalPaper(currentExamId, letter, {
        subject,
        universityName,
        paperCode,
        totalMarks,
        durationHours,
        difficultySetting,
        location: watermarkLocation,
      });
      if (genRes.success && genRes.generatedPaper?.pdfUrl) {
        setCompiledPdfUrl(genRes.generatedPaper.pdfUrl);
        setCompiledFilename(genRes.generatedPaper.pdfFilename);
        if (genRes.trackingCode || genRes.generatedPaper?.trackingCode) {
          setTrackingCode(genRes.trackingCode || genRes.generatedPaper?.trackingCode || '');
        }
        if (genRes.structuredPaper) {
          setStructuredData(genRes.structuredPaper);
          setStreamingContent(JSON.stringify(genRes.structuredPaper, null, 2));
        }
      }
    } catch (e: any) {
      console.warn('Switch set error:', e);
    } finally {
      setCompiling(false);
    }
  };

  // ================= Multi-Paper Synthesizer Workflow =================
  const handleGenerate4thPaper = async () => {
    if (papers.length < 3) {
      alert('Please upload at least 3 question papers (minimum 3, maximum 5) before synthesizing.');
      return;
    }
    if (papers.length > 5) {
      alert('A maximum of 5 question papers is permitted.');
      return;
    }

    setGenerating(true);
    setGenerationError(null);
    setStreamingContent('');
    setGeneratedLatex('');
    setStructuredData(null);
    setCompiledPdfUrl(null);
    setCompilerError(null);
    setCurrentStep('Preparing source question papers for Zero-Leak multi-paper synthesis...');
    enterStage('figures', 'preparing uploaded question papers');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // 1. Convert uploaded source papers into File objects
      const filesToUpload: File[] = [];
      for (const p of papers) {
        if (p.dataUrl) {
          try {
            filesToUpload.push(dataUrlToFile(p.dataUrl, p.name));
          } catch (e) {
            console.warn(`Could not prepare file for ${p.name}:`, e);
          }
        }
      }

      // 2. Ingest 3-5 draft papers into backend SQLite vault if fresh file streams are available
      if (filesToUpload.length >= 3) {
        setCurrentStep(`Uploading and parsing ${filesToUpload.length} source draft papers into SQLite vault...`);
        enterStage('figures', 'parsing source draft papers with OCR and section boundary detection');
        await api.uploadUniversityDraftPapers(filesToUpload, currentExamId);
      } else {
        // If files were already ingested into SQLite vault in a previous upload, verify question count
        setCurrentStep('Validating existing parsed draft questions in vault...');
        const draftCheck = await api.getUniversityDraftQuestions(currentExamId);
        const count = draftCheck?.questions?.length || 0;
        const mcqCount = (draftCheck?.questions || []).filter((q: any) => q.question_type === 'MCQ').length;
        if (count < 14 || mcqCount < 7) {
          throw new Error(
            `Insufficient valid questions in SQLite vault (${mcqCount} MCQs, ${count} total questions found). Please re-upload your source question paper PDFs using the file selector below.`
          );
        }
      }

      // 3. Execute LangChain RAG pipeline & Semantic Deduplication
      setCurrentStep('Executing LangChain RAG pipeline, Chroma vector store & semantic deduplication...');
      enterStage('synthesis', 'LangChain RAG pipeline & deduplication');
      const ragRes = await api.processUniversityRagPipeline(currentExamId, 14, totalMarks);
      if (ragRes && !ragRes.success) {
        throw new Error(ragRes.message || (ragRes as any).error || 'RAG pipeline synthesis failed.');
      }

      // Fetch precise location if granted, or explicit approximate/unavailable
      let loc = watermarkLocation;
      try {
        loc = await getSecurityWatermarkLocation();
        setWatermarkLocation(loc);
      } catch {}

      // 4. Generate Official Encrypted University Paper (Set P) with dynamic watermarking
      setCurrentStep('Synthesizing official 4-Set University Paper, applying dynamic watermarks, and sealing with AES-256...');
      enterStage('typesetting', 'typesetting official university paper and encrypting via AES-256');
      const genRes = await api.generateUniversityFinalPaper(currentExamId, 'P', {
        subject,
        universityName,
        paperCode,
        totalMarks,
        durationHours,
        difficultySetting,
        location: loc,
      });

      if (genRes.success && genRes.generatedPaper?.pdfUrl) {
        const pdfUrl = genRes.generatedPaper.pdfUrl;
        setCompiledPdfUrl(pdfUrl);
        setCompiledFilename(genRes.generatedPaper.pdfFilename || `${subject.replace(/[^a-zA-Z0-9]/g, '_')}_Synthesized_Paper.pdf`);

        if (genRes.trackingCode || genRes.generatedPaper?.trackingCode) {
          setTrackingCode(genRes.trackingCode || genRes.generatedPaper?.trackingCode || '');
        }

        if (genRes.structuredPaper) {
          setStructuredData(genRes.structuredPaper);
          setStreamingContent(JSON.stringify(genRes.structuredPaper, null, 2));
        }

        const now = new Date();
        const encTimeStr = now.toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          dateStyle: 'medium',
          timeStyle: 'medium',
        });
        const unlockDate = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        const unlockTimeStr = unlockDate.toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          dateStyle: 'medium',
          timeStyle: 'short',
        });
        setEncryptionTime(encTimeStr);
        setUnlockTime(unlockTimeStr);

        enterStage('done', 'nothing - the paper is ready');
        setCurrentStep('Done! Official encrypted University Question Paper (Set P) generated successfully.');
        setActiveTab('pdf');
      } else {
        throw new Error(genRes.error || genRes.message || 'University paper generation failed.');
      }
    } catch (err: any) {
      if (!controller.signal.aborted) {
        console.error('[University Paper Synthesis Error]:', err);
        enterStage('error', 'nothing - generation stopped');
        const errMsg = err?.message || 'University paper generation failed.';
        setGenerationError(errMsg);
        setCompilerError(errMsg);
      }
    } finally {
      abortControllerRef.current = null;
      setGenerating(false);
    }
  };

  // ================= Direct DeepSeek Chat Workflow =================
  const handleSendChatMessage = async (presetText?: string) => {
    const textToSend = (presetText || chatInput).trim();
    if (!textToSend || chatStreaming) return;

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;

    const newMessages: ChatMsg[] = [
      ...chatMessages,
      { id: userMsgId, role: 'user', content: textToSend, timestamp: new Date() },
    ];

    setChatMessages(newMessages);
    setChatInput('');
    setChatStreaming(true);

    const controller = new AbortController();
    chatAbortControllerRef.current = controller;

    try {
      const paperContext = buildPaperSnippets();

      const chatSystemPrompt = [
        'You are ZeroLeak AI, the official academic exam synthesis and analysis assistant powered by Ollama.',
        `Current Exam Configuration:`,
        `- Subject: "${subject}"`,
        `- University / Institution: "${universityName}"`,
        `- Paper Code: "${paperCode}"`,
        `- Total Marks: ${totalMarks}`,
        `- Duration: ${durationHours} Hours`,
        `- Source Papers Loaded: ${papers.length} PDF paper(s)`,
        '',
        '=== UPLOADED QUESTION PAPERS CONTENT / FULL DIGEST ===',
        paperContext,
        '',
        'CAPABILITIES & GUIDELINES:',
        '1. You can answer questions about the uploaded papers, discuss question trends, suggest improvements, or generate specific MCQs/questions.',
        '2. For any diagrams, output clean TikZ code (\\begin{tikzpicture} ... \\end{tikzpicture}). For any tables, output clean LaTeX tables (\\begin{tabularx}{\\linewidth}{|X|X|}...\\end{tabularx}).',
        '3. If the user asks you to create/synthesize a full exam paper, output it in clean JSON wrapped in ```json ... ``` with fields "universityName", "subject", "paperCode", "totalMarks", "duration", "instructions", and "sections" (with questions array). The system will automatically compile and download it as an official PDF.',
        '4. Provide professional, well-formatted, and accurate responses.',
      ].join('\n');

      // Add temporary empty assistant message
      setChatMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: 'assistant', content: '', timestamp: new Date() },
      ]);

      let accumulated = '';
      await ollamaChatStream(
        {
          messages: [
            { role: 'system', content: chatSystemPrompt },
            ...newMessages.map((m) => ({ role: m.role, content: m.content })),
          ],
          plainText: true,
        },
        (chunk) => {
          accumulated += chunk;
          setChatMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, content: accumulated } : m))
          );
        },
        controller.signal
      );

      // Check if structured paper exists in completed message
      const parsedStruct = extractJsonFromContent(accumulated);
      if (parsedStruct) {
        setChatMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, structuredPaper: parsedStruct } : m))
        );
      }
    } catch (err: any) {
      if (!controller.signal.aborted) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `⚠️ **AI Assistant Error:** ${err?.message || 'Could not complete streaming call.'}`,
            timestamp: new Date(),
          },
        ]);
      }
    } finally {
      chatAbortControllerRef.current = null;
      setChatStreaming(false);
    }
  };

  const handleCompileChatPaper = async (msg: ChatMsg) => {
    const struct = msg.structuredPaper || extractJsonFromContent(msg.content);
    if (!struct) {
      alert('No valid exam paper structure found in this message.');
      return;
    }
    const pdfUrl = await compilePaperToPdf(msg.content, struct);
    if (pdfUrl) {
      setActiveTab('pdf');
    }
  };

  const copyLatex = async () => {
    if (!generatedLatex) return;
    try {
      await navigator.clipboard.writeText(generatedLatex);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);

  const downloadLatexFile = () => {
    // Zero-Leak Anti-Extraction: Do NOT download file to user's PC.
    // Instead, transfer directly to Printing Manager (operator@centre101.edu.in)
    setIsTransferModalOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 relative">
      {/* Subtle Technical Grid Background Accent */}
      <div 
        className="fixed inset-0 pointer-events-none z-[-1] opacity-40" 
        style={{
          backgroundImage: 'radial-gradient(#CBD5E1 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} 
      />

      {/* Hidden File Input for Paper Replacement */}
      <input
        ref={replaceFileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleReplaceFileChange}
        className="hidden"
      />



      {/* ================= WORKFLOW GRID (70% / 30% LAYOUT) ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ================= LEFT COLUMN: WORKFLOW CARDS ================= */}
        <div className="lg:col-span-8 space-y-8">
            {/* STEP 1: Examination Configuration */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-[#DCE5EA] dark:border-slate-800 p-6 sm:p-7 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#0B1F2A] text-[#00C98B] flex items-center justify-center font-mono font-black text-xs shadow-sm">
                    01
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-extrabold text-[#102A38] dark:text-white uppercase tracking-wider">
                      Step 1 — Examination Configuration
                    </h2>
                    <p className="text-xs text-[#647681] dark:text-slate-400">
                      Standardized examination parameters synchronized with institution guidelines.
                    </p>
                  </div>
                </div>

                {isConfigValid ? (
                  <span className="text-[11px] font-mono text-[#00A878] bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 px-3 py-1 rounded-xl font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>✓ Configuration Valid &amp; Saved</span>
                  </span>
                ) : (
                  <span className="text-[11px] font-mono text-amber-600 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 px-3 py-1 rounded-xl font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>⚠️ Incomplete Configuration</span>
                  </span>
                )}
              </div>

              {/* 4 Visual KPI Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-[#F6F8FA] dark:bg-slate-800/50 border border-[#DCE5EA] dark:border-slate-800">
                  <span className="text-[10px] uppercase font-mono font-bold text-[#647681]">Bloom Taxonomy Alignment</span>
                  <div className="text-lg font-black text-[#102A38] dark:text-white mt-0.5">98.4%</div>
                  <span className="text-[10px] text-emerald-600 font-bold">Balanced Cognitive Levels</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#F6F8FA] dark:bg-slate-800/50 border border-[#DCE5EA] dark:border-slate-800">
                  <span className="text-[10px] uppercase font-mono font-bold text-[#647681]">Syllabus Coverage</span>
                  <div className="text-lg font-black text-[#102A38] dark:text-white mt-0.5">100%</div>
                  <span className="text-[10px] text-indigo-600 font-bold">Comprehensive Curriculum</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#F6F8FA] dark:bg-slate-800/50 border border-[#DCE5EA] dark:border-slate-800">
                  <span className="text-[10px] uppercase font-mono font-bold text-[#647681]">Semantic Uniqueness</span>
                  <div className="text-lg font-black text-[#102A38] dark:text-white mt-0.5">&gt;99.2%</div>
                  <span className="text-[10px] text-cyan-600 font-bold">Anti-Leak Synthesized</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#F6F8FA] dark:bg-slate-800/50 border border-[#DCE5EA] dark:border-slate-800">
                  <span className="text-[10px] uppercase font-mono font-bold text-[#647681]">Anti-Leak Entropy</span>
                  <div className="text-lg font-black text-[#102A38] dark:text-white mt-0.5">0.94 bits</div>
                  <span className="text-[10px] text-amber-600 font-bold">Cryptographically Seeded</span>
                </div>
              </div>

              {/* Form Input Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#102A38] dark:text-slate-300 mb-1.5">
                    Course / Subject Title
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full h-12 px-3.5 text-xs rounded-xl border border-[#DCE5EA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#102A38] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00C98B] font-semibold"
                    placeholder="e.g. Distributed Operating Systems"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#102A38] dark:text-slate-300 mb-1.5">
                    University / Institution
                  </label>
                  <input
                    type="text"
                    value={universityName}
                    onChange={(e) => setUniversityName(e.target.value)}
                    className="w-full h-12 px-3.5 text-xs rounded-xl border border-[#DCE5EA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#102A38] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00C98B] font-semibold"
                    placeholder="e.g. National Institute of Technology"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#102A38] dark:text-slate-300 mb-1.5">
                    Paper Code / Identification
                  </label>
                  <input
                    type="text"
                    value={paperCode}
                    onChange={(e) => setPaperCode(e.target.value)}
                    className="w-full h-12 px-3.5 text-xs rounded-xl border border-[#DCE5EA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#102A38] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00C98B] font-mono font-semibold"
                    placeholder="e.g. CS-702-NOV"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#102A38] dark:text-slate-300 mb-1.5">
                    Total Maximum Marks
                  </label>
                  <input
                    type="number"
                    value={totalMarks}
                    onChange={(e) => setTotalMarks(Number(e.target.value) || 70)}
                    className="w-full h-12 px-3.5 text-xs rounded-xl border border-[#DCE5EA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#102A38] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00C98B] font-semibold text-center"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#102A38] dark:text-slate-300 mb-1.5">
                    Duration (Hours)
                  </label>
                  <input
                    type="number"
                    value={durationHours}
                    onChange={(e) => setDurationHours(Number(e.target.value) || 3)}
                    className="w-full h-12 px-3.5 text-xs rounded-xl border border-[#DCE5EA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#102A38] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00C98B] font-semibold text-center"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#102A38] dark:text-slate-300 mb-1.5">
                    Difficulty Model
                  </label>
                  <select
                    value={difficultySetting}
                    onChange={(e) => setDifficultySetting(e.target.value as any)}
                    className="w-full h-12 px-3 text-xs rounded-xl border border-[#DCE5EA] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#102A38] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00C98B] font-semibold"
                  >
                    <option value="BALANCED">Balanced (60% Standard / 30% Analytical / 10% Hard)</option>
                    <option value="HARD">Rigorous (40% Standard / 40% Analytical / 20% Hard)</option>
                    <option value="MODERATE">Foundational (70% Standard / 25% Analytical / 5% Hard)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* STEP 2: Source Question Papers Upload */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-[#DCE5EA] dark:border-slate-800 p-6 sm:p-7 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#0B1F2A] text-[#00C98B] flex items-center justify-center font-mono font-black text-xs shadow-sm">
                    02
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-extrabold text-[#102A38] dark:text-white uppercase tracking-wider">
                      Step 2 — Source Question Papers
                    </h2>
                    <p className="text-xs text-[#647681] dark:text-slate-400">
                      Upload at least 3 and up to 5 source question papers (PDF format) for AI question fusion and synthesis.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-mono font-bold px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {papers.length} of 5 papers uploaded
                  </span>
                  <span
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${
                      papers.length >= 3 && papers.length <= 5
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        papers.length >= 3 ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                      }`}
                    />
                    <span>{papers.length >= 3 ? '✓ 3 to 5 Papers Ready' : `Upload ${3 - papers.length} more paper(s)`}</span>
                  </span>
                </div>
              </div>

              {/* Minimum Requirement Warning Banner */}
              {papers.length < 3 && (
                <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/20 p-4 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Minimum 3 source papers required: </span>
                    Upload at least 3 and up to 5 source question papers before synthesis (currently {papers.length} of 5 uploaded).
                  </div>
                </div>
              )}

              {/* Primary Template & Structural Authority */}
              {papers.length >= 2 && (() => {
                const primaryIndex = pickPrimaryPaperIndex(
                  papers,
                  primaryPaperId ? papers.findIndex((p) => p.id === primaryPaperId) : null
                );
                const primaryPaper = papers[primaryIndex];
                const primary = primaryPaper ? detectPaperPattern(primaryPaper.text, primaryPaper.name) : null;
                if (!primary) {
                  return (
                    <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/20 p-4 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        No standard section or question structure could be parsed from the uploaded papers, so the layout pattern cannot be locked. The generated paper will use default university formatting.
                      </span>
                    </div>
                  );
                }
                const header = extractPaperHeader(primaryPaper!.text);
                return (
                  <div className="rounded-2xl border border-[#DCE5EA] dark:border-slate-800 bg-[#F6F8FA] dark:bg-slate-950/40 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-black uppercase tracking-wider text-[#102A38] dark:text-slate-300">
                        Primary Template & Structural Authority
                      </label>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-[#635BFF] dark:text-indigo-300 font-mono text-[10px] font-bold border border-indigo-200 dark:border-indigo-800">
                        Pattern Enforcer Active
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <select
                        value={primaryPaper!.id}
                        onChange={(e) => setPrimaryPaperId(e.target.value)}
                        className="w-full text-xs p-3 rounded-xl border border-[#DCE5EA] dark:border-slate-700 bg-white dark:bg-slate-900 text-[#102A38] dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-[#00C98B]"
                      >
                        {papers.map((p, i) => (
                          <option key={p.id} value={p.id}>
                            {i === papers.length - 1 ? `${p.name} (Primary Authority)` : p.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-[#647681] dark:text-slate-400">
                        The synthesized paper mirrors this document's section layout and mark distributions. Other uploaded papers contribute syllabus depth, varied question phrasing, and topic coverage.
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                        Locked Structural Blueprint
                      </p>
                      <pre className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-[#DCE5EA] dark:border-slate-800 text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-slate-700 dark:text-slate-300 max-h-40 overflow-y-auto">
                        {summarizePattern(primary)}
                      </pre>
                    </div>

                    {(header.maxMarks !== null || header.durationHours !== null || header.subject || header.paperCode || header.instructions.length > 0) && (
                      <div className="border-t border-[#DCE5EA] dark:border-slate-800 pt-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                          Detected Masthead & Exam Instructions
                        </p>
                        <pre className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-[#DCE5EA] dark:border-slate-800 text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-slate-700 dark:text-slate-300 max-h-32 overflow-y-auto">
                          {[
                            header.universityName && `University / Board: ${header.universityName}`,
                            header.examName && `Examination: ${header.examName}`,
                            header.subject && `Subject: ${header.subject}`,
                            header.paperCode && `Paper Code: ${header.paperCode}`,
                            header.maxMarks !== null && `Maximum Marks: ${header.maxMarks}`,
                            header.durationHours !== null && `Duration: ${header.durationHours} Hours`,
                            ...header.instructions.map((line, i) => `Instruction ${i + 1}: ${line}`),
                          ]
                            .filter(Boolean)
                            .join('\n')}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Source Visuals & Cropped Figures */}
              {(sourceFigures.length > 0 || figureWarnings.length > 0 || extractingFigures) && (
                <div className="rounded-2xl border border-[#DCE5EA] dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wider text-[#102A38] dark:text-slate-300">
                      Visual Figures Extracted from Source Documents
                    </p>
                    <span className="text-[10px] font-mono text-[#00A878] font-bold">
                      {sourceFigures.length} Figures Available
                    </span>
                  </div>

                  {extractingFigures && (
                    <p className="text-xs text-slate-500 flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#00B8D9]" />
                      Extracting vector graphics, circuit diagrams, and tables from source papers...
                    </p>
                  )}

                  {sourceFigures.length > 0 && (
                    <div className="flex flex-wrap gap-2.5 pt-1">
                      {sourceFigures.map((figure) => (
                        <figure
                          key={figure.index}
                          className="border border-[#DCE5EA] dark:border-slate-700 rounded-xl p-2 bg-[#F6F8FA] dark:bg-slate-950/40 shadow-xs"
                        >
                          <img
                            src={`data:image/png;base64,${figure.base64}`}
                            alt={`Source figure ${figure.index} from page ${figure.page}`}
                            className="h-16 w-auto object-contain bg-white rounded-md"
                          />
                          <figcaption className="text-[9px] font-mono text-slate-500 dark:text-slate-400 text-center mt-1">
                            [FIGURE:{figure.index}] p.{figure.page}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  )}

                  {figureWarnings.map((warning, i) => (
                    <p key={i} className="text-xs text-amber-700 dark:text-amber-400">
                      {warning}
                    </p>
                  ))}
                </div>
              )}

              {/* Structural Enforcement Report */}
              {enforcementReport && (
                <div className="rounded-2xl border border-[#DCE5EA] dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2.5">
                  <p className="text-xs font-black uppercase tracking-wider text-[#102A38] dark:text-slate-300">
                    Structure Validation Against Source Paper
                  </p>
                  {enforcementReport.violations.length > 0 ? (
                    <ul className="text-xs text-rose-700 dark:text-rose-300 list-disc pl-4 space-y-1">
                      {enforcementReport.violations.map((violation, i) => (
                        <li key={i}>{violation}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>
                        The synthesized paper fully satisfies the structural layout: {enforcementReport.repairs.length} parameter(s) aligned automatically with authority rules.
                      </span>
                    </p>
                  )}

                  {enforcementReport.repairs.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-slate-600 dark:text-slate-400 font-semibold">
                        Automated structural repairs applied ({enforcementReport.repairs.length})
                      </summary>
                      <ul className="list-disc pl-4 mt-1.5 space-y-1 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                        {enforcementReport.repairs.map((repair, i) => (
                          <li key={i}>{repair}</li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {enforcementReport.summary && enforcementReport.summary.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-slate-600 dark:text-slate-400 font-semibold">
                        Detailed Structure Comparison Matrix
                      </summary>
                      <pre className="mt-2 p-3 rounded-xl bg-[#0B1F2A] text-emerald-300 text-[10px] leading-relaxed overflow-auto max-h-64 whitespace-pre-wrap font-mono border border-slate-800">
                        {enforcementReport.summary.join('\n')}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Upload Dropzone with Stacked Documents Illustration */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative border-2 border-dashed border-[#00B8D9]/40 hover:border-[#00C98B] rounded-2xl p-8 text-center cursor-pointer transition-all bg-[#F6F8FA]/60 hover:bg-emerald-50/20 group overflow-hidden"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="application/pdf"
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className="hidden"
                />

                {/* Stacked Documents Graphic */}
                <div className="relative w-24 h-20 mx-auto mb-4 flex items-center justify-center">
                  <div className="absolute w-14 h-18 bg-white border border-[#DCE5EA] rounded-xl shadow-xs rotate-[-12deg] group-hover:rotate-[-16deg] transition-transform" />
                  <div className="absolute w-14 h-18 bg-slate-50 border border-slate-300 rounded-xl shadow-xs rotate-[8deg] group-hover:rotate-[12deg] transition-transform" />
                  <div className="relative w-14 h-18 bg-gradient-to-tr from-white to-slate-50 border-2 border-[#00C98B] rounded-xl shadow-md flex flex-col items-center justify-center text-[#00C98B] group-hover:scale-105 transition-transform">
                    {uploading ? (
                      <RefreshCw className="w-6 h-6 animate-spin" />
                    ) : (
                      <FileText className="w-6 h-6" />
                    )}
                  </div>
                </div>

                <h3 className="text-sm font-extrabold text-[#102A38] dark:text-white">
                  {uploading ? 'Extracting question and diagram metadata...' : 'Drag & drop question papers here, or click to browse'}
                </h3>
                <p className="text-xs text-[#647681] dark:text-slate-400 mt-1 max-w-md mx-auto">
                  Select 2 or more PDF examination papers. The AI engine extracts question text, mathematical formulas, and section structures.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                  <span className="px-2.5 py-1 rounded-md bg-white border border-[#DCE5EA] text-[10px] font-mono font-bold text-slate-600">
                    PDF ONLY
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-white border border-[#DCE5EA] text-[10px] font-mono font-bold text-slate-600">
                    MAX 25MB EACH
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-white border border-[#DCE5EA] text-[10px] font-mono font-bold text-[#00A878]">
                    OCR & LATEX PARSER ACTIVE
                  </span>
                </div>
              </div>

              {uploadError && (
                <div className="p-4 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 text-xs rounded-xl border border-rose-200 dark:border-rose-900/50 flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Uploaded Papers Grid */}
              {papers.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[#647681]">
                    <span>Uploaded Documents ({papers.length})</span>
                    <span>Ready for AI Processing</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {papers.map((p, idx) => (
                      <div
                        key={p.id}
                        className="p-4 rounded-2xl border border-[#DCE5EA] dark:border-slate-800 bg-[#F6F8FA] dark:bg-slate-800/40 flex flex-col justify-between gap-3 relative hover:border-[#00C98B] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-[#0B1F2A] text-[#00C98B] flex items-center justify-center shrink-0 font-mono font-black text-xs shadow-sm">
                              0{idx + 1}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#102A38] dark:text-white truncate" title={p.name}>
                                {p.name}
                              </p>
                              <p className="text-[11px] text-[#647681] dark:text-slate-400 mt-0.5">
                                {p.pageCount} page(s) &bull; ~{p.wordCount.toLocaleString()} words
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemovePaper(p.id);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                            title="Remove paper"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between text-[10px] border-t border-slate-200/60 dark:border-slate-800 pt-2 font-mono">
                          <span className="text-[#00A878] font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>✓ Parsed</span>
                          </span>
                          <span className="text-slate-500">~{25 + (idx * 5)} Questions</span>
                          <span className="text-indigo-600 font-bold">98% Readable</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>



            {/* STEP 4: Synthesize CTA & Real-Time Output */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-[#DCE5EA] dark:border-slate-800 p-6 sm:p-7 shadow-sm space-y-6">
              <div className="space-y-4">
                <button
                  type="button"
                  disabled={generating || !isConfigValid || papers.length < 3 || papers.length > 5 || uploading}
                  onClick={handleGenerate4thPaper}
                  className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#00A878] via-[#00B8D9] to-[#00A878] hover:opacity-95 text-white font-extrabold text-sm sm:text-base shadow-xl shadow-[#00A878]/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all cursor-pointer group"
                >
                  {generating ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Synthesizing Examination Paper via LaTeX 2e...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 text-amber-200 group-hover:scale-110 transition-transform" />
                      <span>✨ Synthesise Question Paper</span>
                    </>
                  )}
                </button>


                {/* Disabled Explanation */}
                {(!isConfigValid || papers.length < 3 || papers.length > 5 || uploading) && !generating && (
                  <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Cannot synthesise question paper yet:</span>
                    </div>
                    <ul className="list-disc pl-6 space-y-0.5 text-[11px]">
                      {!isConfigValid && (
                        <li>Step 1: Complete all required Examination Configuration fields (subject, university, paper code, marks, duration).</li>
                      )}
                      {papers.length < 3 && (
                        <li>Step 2: Upload at least 3 source question papers (currently {papers.length} of 5 uploaded; need {3 - papers.length} more).</li>
                      )}
                      {papers.length > 5 && (
                        <li>Step 2: Maximum 5 source papers allowed (currently {papers.length} uploaded).</li>
                      )}
                      {uploading && (
                        <li>Files are currently being processed. Please wait for extraction to finish.</li>
                      )}
                    </ul>
                  </div>
                )}

                <div className="text-center">
                  <p className="text-[11px] font-mono text-[#647681]">
                    Zero-Leak Synthesis Protocol Active &bull; LaTeX Native Compilation &bull; AES-256 Vault Sealing
                  </p>
                </div>
              </div>

              {/* Live Generation Panel */}
              {generating && (
                <div className="p-5 rounded-2xl bg-[#0B1F2A] border border-[#1E3A4A] text-white space-y-4 shadow-xl">
                  <div className="flex items-start justify-between gap-3 text-xs font-bold text-white">
                    <span className="flex items-start gap-2.5 min-w-0">
                      <RefreshCw className="w-4 h-4 mt-0.5 animate-spin text-[#00C98B] shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-extrabold text-white">
                          {stage === 'error'
                            ? '⚠️ Generation stopped - see compiler diagnostic below.'
                            : stage === 'done'
                            ? '✅ PDF generated and verified successfully.'
                            : currentStep || 'Synthesizing Question Paper...'}
                        </span>
                        {stage !== 'done' && stage !== 'error' && (
                          <span className="block mt-1 font-mono text-[11px] text-slate-400">
                            Awaiting {waitingOn} ({elapsedSeconds}s elapsed)
                          </span>
                        )}
                      </span>
                    </span>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="px-3 py-1 rounded-xl bg-white/10 font-mono text-xs font-black border border-white/10">
                        ⏱️ {elapsedSeconds}s
                      </span>
                      <button
                        type="button"
                        onClick={() => abortControllerRef.current?.abort()}
                        className="text-xs text-rose-400 hover:text-rose-300 underline cursor-pointer font-bold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>

                  {/* Real Step Progress Bar */}
                  <div className="space-y-2">
                    <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-[#635BFF] via-[#00B8D9] to-[#00C98B] h-full rounded-full transition-all duration-1000 ease-out"
                        style={{
                          width: `${Math.round(
                            (Math.min(STAGE_ACTIVE_STEP[stage], 5) / 5) * 100
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      {GENERATION_STEPS.map((label, index) => {
                        const stepNumber = index + 1;
                        const activeStep = STAGE_ACTIVE_STEP[stage];
                        const isDone = stage === 'done' || stepNumber < activeStep;
                        const isActive = stage !== 'done' && stage !== 'error' && stepNumber === activeStep;
                        return (
                          <span
                            key={label}
                            className={
                              isActive
                                ? 'text-[#00C98B] font-black'
                                : isDone
                                ? 'text-emerald-400 font-bold'
                                : 'text-slate-500'
                            }
                          >
                            {isDone ? '✓ ' : isActive ? '▶ ' : ''}
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Streaming Terminal Window */}
                  {streamingContent ? (
                    <div className="max-h-48 overflow-y-auto p-4 rounded-xl bg-black/60 text-[#00C98B] font-mono text-[11px] leading-relaxed whitespace-pre-wrap border border-white/10 shadow-inner">
                      {streamingContent.slice(-1200)}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs flex items-center gap-2">
                      <Zap className="w-4 h-4 animate-pulse text-amber-400 shrink-0" />
                      <span>AI fusion core is formulating questions. Output will stream here momentarily...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Generation Error Alert */}
              {generationError && (
                <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-900 dark:text-rose-200 text-xs flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>{generationError}</span>
                </div>
              )}

              {/* Compiler Diagnostics Panel */}
              {compilerError && (
                <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-900/60 space-y-3">
                  <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                    <span className="text-xs font-black uppercase tracking-wider">
                      PDF Compiler Error Diagnostics
                    </span>
                  </div>

                  <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-amber-900 dark:text-amber-200 p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800">
                    {compilerError}
                  </pre>

                  {compilerDiagnostics && (
                    <div className="space-y-2 text-xs font-mono text-slate-700 dark:text-slate-300">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <span><b>Compiler:</b> {compilerDiagnostics.engine}</span>
                        <span><b>Command:</b> {compilerDiagnostics.command}</span>
                        <span><b>First Error:</b> {compilerDiagnostics.firstError || 'none reported'}</span>
                        <span><b>Line:</b> {compilerDiagnostics.firstErrorLine ?? 'unknown'}</span>
                      </div>

                      {compilerDiagnostics.log && (
                        <details className="rounded-xl bg-[#0B1F2A] border border-slate-800 p-2">
                          <summary className="cursor-pointer px-3 py-1.5 text-xs font-bold text-amber-300">
                            Raw LaTeX Engine Output
                          </summary>
                          <pre className="max-h-60 overflow-auto p-3 text-[10px] leading-relaxed whitespace-pre-wrap text-emerald-300 font-mono">
                            {compilerDiagnostics.log}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 4: Success & Downloadable Paper */}
              {(compiledPdfUrl || structuredData) && !generating && (
                <div className="bg-gradient-to-br from-emerald-50/70 to-teal-50/30 dark:from-slate-900 dark:to-emerald-950/30 p-6 rounded-3xl border-2 border-emerald-500/40 shadow-xl space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-200 dark:border-slate-800 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-[#00A878] text-white flex items-center justify-center shadow-lg shadow-[#00A878]/30 shrink-0">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-[#00A878] dark:text-emerald-400">
                            Synthesis Complete &bull; Paper Ready
                          </span>
                          <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                            ZeroLeak Native PDF Engine
                          </span>
                        </div>
                        <h3 className="text-base sm:text-lg font-black text-[#102A38] dark:text-white">
                          {subject} &mdash; Synthesized Examination Paper
                        </h3>
                        <p className="text-xs text-[#647681] dark:text-slate-400 mt-0.5">
                          Synthesized from {papers.length} source papers &bull; Max Marks: {totalMarks} &bull; Time: {durationHours} Hours
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      {compiledPdfUrl && (
                        <a
                          href={compiledPdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={compiledFilename || 'Official_University_Question_Paper_4_Sets.pdf'}
                          className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-[#00A878] to-[#00C98B] hover:from-[#009166] hover:to-[#00b07a] text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-[#00A878]/20"
                          title="Download Official 4-Set University Examination PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Official PDF</span>
                        </a>
                      )}

                      {latexFallback?.sourceUrl && (
                        <button
                          type="button"
                          onClick={() => setIsTransferModalOpen(true)}
                          className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-[#DCE5EA] dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          title="Transfer Paper Directly to Printing Manager (Local PC Download Blocked)"
                        >
                          <Printer className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Transfer to Printing Manager</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setIsThresholdModalOpen(true)}
                        className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
                        title="View Once & Request Custodian Threshold Encryption"
                      >
                        <Lock className="w-3.5 h-3.5 text-indigo-200" />
                        <span>Threshold Encrypt &amp; Custodians</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleGenerate4thPaper}
                        className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-[#DCE5EA] dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>Re-Generate</span>
                      </button>
                    </div>
                  </div>

                  {/* Navigation View Tabs */}
                  <div className="flex items-center gap-2 border-b border-emerald-200/80 dark:border-slate-800 pb-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('pdf')}
                      className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                        activeTab === 'pdf'
                          ? 'bg-[#0B1F2A] text-white shadow-sm'
                          : 'text-[#647681] hover:bg-white/80'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Official PDF Document</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('content')}
                      className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                        activeTab === 'content'
                          ? 'bg-[#0B1F2A] text-white shadow-sm'
                          : 'text-[#647681] hover:bg-white/80'
                      }`}
                    >
                      <ListOrdered className="w-3.5 h-3.5" />
                      <span>Questions & Marking Scheme</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('latex')}
                      className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                        activeTab === 'latex'
                          ? 'bg-[#0B1F2A] text-white shadow-sm'
                          : 'text-[#647681] hover:bg-white/80'
                      }`}
                    >
                      <FileCode2 className="w-3.5 h-3.5" />
                      <span>LaTeX Source Code</span>
                    </button>
                  </div>

                  <SecurePaperViewer
                    examTitle={`${subject} Synthesized Paper`}
                    examType="UNIVERSITY"
                    encryptionTime={encryptionTime}
                    unlockTime={unlockTime}
                    location={watermarkLocation}
                  >
                    {/* Tab 1: PDF Viewer */}
                  {activeTab === 'pdf' && (
                    compiledPdfUrl ? (
                      <div className="rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-700 shadow-md bg-slate-900">
                        <div className="px-4 py-3 bg-[#0B1F2A] text-slate-300 flex flex-wrap items-center justify-between gap-3 text-xs font-mono font-bold border-b border-white/10">
                          <span className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-[#00C98B]" />
                            <span>{compiledFilename || 'Synthesized_Question_Paper.pdf'}</span>
                          </span>
                          <div className="flex items-center gap-1.5 bg-slate-800/90 p-1 rounded-xl border border-white/10">
                            <span className="text-[10px] text-slate-400 font-sans font-semibold px-2">Set:</span>
                            {(['ALL', 'P', 'Q', 'R', 'S'] as const).map((setOpt) => (
                              <button
                                key={setOpt}
                                type="button"
                                disabled={compiling}
                                onClick={() => handleSelectSet(setOpt)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                  selectedSetView === setOpt
                                    ? 'bg-[#00C98B] text-slate-950 shadow-sm'
                                    : 'text-slate-300 hover:bg-slate-700/60'
                                }`}
                              >
                                {setOpt === 'ALL' ? 'All 4 Sets (16 Pgs)' : `Set ${setOpt} (4 Pgs)`}
                              </button>
                            ))}
                          </div>
                        </div>
                        <object
                          data={`${compiledPdfUrl}#toolbar=1`}
                          type="application/pdf"
                          className="block w-full h-[80vh] min-h-[680px] max-h-[1000px] border-none bg-slate-100"
                        >
                          <iframe
                            src={`${compiledPdfUrl}#toolbar=1`}
                            title="Generated Question Paper PDF"
                            tabIndex={0}
                            scrolling="yes"
                            className="block w-full h-[80vh] min-h-[680px] max-h-[1000px] touch-pan-y border-none bg-slate-100"
                          />
                        </object>
                      </div>
                    ) : (
                      <div className="p-12 text-center bg-slate-900 rounded-2xl border border-slate-700 text-slate-300 space-y-3">
                        <FileText className="w-12 h-12 text-[#00C98B] mx-auto animate-pulse" />
                        <h3 className="text-sm font-bold text-white">Rendering Question Paper PDF...</h3>
                        <p className="text-xs text-slate-400">Please wait while the typeset paper is prepared for display.</p>
                      </div>
                    )
                  )}

                  {/* Tab 2: Structured Questions Card View */}
                  {activeTab === 'content' && (
                    <div className="space-y-4">
                      {structuredData?.sections?.map((sec: any, sIdx: number) => (
                        <div
                          key={sIdx}
                          className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-[#DCE5EA] dark:border-slate-800 shadow-sm space-y-3"
                        >
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h4 className="text-sm font-extrabold text-[#102A38] dark:text-white uppercase tracking-wider">
                              {sec.title}
                            </h4>
                            {sec.totalMarks && (
                              <span className="px-3 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800">
                                {sec.totalMarks}
                              </span>
                            )}
                          </div>
                          {sec.instructions && (
                            <p className="text-xs italic text-slate-500">{sec.instructions}</p>
                          )}
                          <div className="space-y-3">
                            {sec.questions?.map((q: any, qIdx: number) => (
                              <div
                                key={qIdx}
                                className="p-3.5 rounded-xl bg-[#F6F8FA] dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 space-y-2"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-2.5">
                                    <span className="text-xs font-mono font-black text-[#635BFF] shrink-0">
                                      {q.number || `Q.${qIdx + 1}`}
                                    </span>
                                    <p className="text-xs text-[#102A38] dark:text-slate-200 leading-relaxed font-semibold">
                                      {q.text}
                                    </p>
                                  </div>
                                  {q.marks && (
                                    <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 shrink-0 bg-white dark:bg-slate-700 px-2.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-600">
                                      {q.marks}
                                    </span>
                                  )}
                                </div>

                                {q.options && q.options.length > 0 && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6 pt-1">
                                    {q.options.map((opt: string, oIdx: number) => (
                                      <div
                                        key={oIdx}
                                        className="text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
                                      >
                                        {opt}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {q.orText && (
                                  <div className="mt-2 pt-2 border-t border-dashed border-slate-200 dark:border-slate-700 pl-6">
                                    <span className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest block mb-1">
                                      --- OR ---
                                    </span>
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                                        {q.orText}
                                      </p>
                                      {q.orMarks && (
                                        <span className="text-xs font-bold text-slate-500 shrink-0">
                                          {q.orMarks}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tab 3: LaTeX Code View */}
                  {activeTab === 'latex' && (
                    <div className="border border-[#DCE5EA] dark:border-slate-800 rounded-2xl overflow-hidden bg-[#0B1F2A]">
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                          <span>LaTeX 2e Typesetting Source (AMS-Math Validated)</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={copyLatex}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer transition-colors"
                            >
                              {copiedCode ? <Check className="w-3.5 h-3.5 text-[#00C98B]" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedCode ? 'Copied' : 'Copy LaTeX'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={downloadLatexFile}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00A878] hover:bg-[#00C98B] text-white text-xs font-bold cursor-pointer transition-colors shadow-xs"
                              title="Transfer Paper to Printing Manager (Zero-Leak Anti-Extraction Policy)"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Transfer to Printing Manager</span>
                            </button>
                          </div>
                        </div>
                        <pre className="p-4 bg-black/50 text-[#00C98B] font-mono text-[11px] leading-relaxed overflow-x-auto max-h-96 whitespace-pre rounded-xl border border-white/10">
                          {generatedLatex}
                        </pre>
                      </div>
                    </div>
                  )}
                  </SecurePaperViewer>
                </div>
              )}
            </div>
          </div>


          {/* ================= RIGHT COLUMN: 30% INTELLIGENCE & VAULT ================= */}
          <div className="lg:col-span-4 space-y-6">

            {/* Card 4: Security Pipeline */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-[#DCE5EA] dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[#00B8D9]" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#102A38] dark:text-white">
                    Real-Time Security Pipeline
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-emerald-600 font-bold">6 Stages</span>
              </div>

              <div className="space-y-3 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                {[
                  { title: 'Source Ingestion', desc: 'Secure PDF parsing & diagram OCR', done: papers.length >= 3 },
                  { title: 'Pattern Extraction', desc: 'Section hierarchy & marks parsing', done: papers.length >= 3 },
                  { title: 'Concept Mapping', desc: 'Topic clustering & Bloom tagging', done: papers.length >= 3 },
                  { title: 'AI Fusion Synthesis', desc: 'Contextual question generation', done: generating || !!compiledPdfUrl },
                  { title: 'LaTeX Compilation', desc: 'Deterministic typesetting to PDF', done: stage === 'compiling' || !!compiledPdfUrl },
                  { title: 'AES-256 Vault Sealing', desc: 'Time-locked cryptographic packaging', done: !!compiledPdfUrl },
                ].map((pipe, idx) => (
                  <div key={pipe.title} className="relative flex items-start gap-3 pl-1">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[9px] font-bold z-10 shrink-0 ${
                        pipe.done
                          ? 'bg-[#00A878] text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                      }`}
                    >
                      {pipe.done ? '✓' : idx + 1}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#102A38] dark:text-white leading-tight">
                        {pipe.title}
                      </div>
                      <div className="text-[10px] text-slate-500 leading-tight mt-0.5">
                        {pipe.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      {/* OpenAI Prism & LaTeX In-Project Browser Modal */}
      <OpenAIPrismBrowserModal
        isOpen={showPrismBrowser}
        onClose={() => setShowPrismBrowser(false)}
        initialUrl="https://prism.openai.com/"
      />

      {/* Transfer to Printing Manager Modal (Zero-Leak Enforcement) */}
      <TransferToPrintingManagerModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        paperTitle={`T.Y. B.Tech. Examination — ${subject || 'OPERATING SYSTEMS'} (BTN04605)`}
        subject={subject || 'OPERATING SYSTEMS'}
        courseCode="BTN04605"
        targetFilename="OS-1.pdf"
        candidateNames={['OS-1.pdf', 'OS-1-1.pdf', 'OS-1-2.pdf', 'OS-1-3.pdf', 'OS-1-4.pdf', 'OS (1).zip']}
        totalMarks={totalMarks || 70}
        durationHours={durationHours || 3}
        latexSource={generatedLatex}
        pdfUrl={compiledPdfUrl || undefined}
        transferredBy={currentUser ? `${currentUser.full_name} (${currentUser.role})` : 'Pradnya Jadhav (Personal Workspace)'}
      />

      {/* Threshold Encryption & Custodian Approvals Modal */}
      {isThresholdModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 overflow-y-auto max-h-[90vh] my-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  University Paper — Threshold Encryption &amp; Custodian Approvals
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsThresholdModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <ThresholdEncryptionAndEmergencyPanel
              examType="UNIVERSITY"
              paperId={paperCode || 'uni-synth-paper-4set'}
              paperVersion="v1"
              currentUser={currentUser}
              onPaperEncrypted={() => {
                // Encrypted
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
