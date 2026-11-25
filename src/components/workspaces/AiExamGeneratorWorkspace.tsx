import React, { useState, useEffect, useRef } from 'react';
import {
  UserCheck,
  FileText,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Eye,
  Sliders,
  Check,
  X,
  Upload,
  BookOpen,
  Cpu,
  Clock,
  Award,
  Layers,
  ChevronDown,
  ChevronUp,
  Trash2,
  Copy,
  ExternalLink,
  ShieldCheck,
  Send,
  Download,
  AlertCircle,
  HelpCircle,
  GripVertical
} from 'lucide-react';
import { api } from '../../api';
import { User } from '../../types';
import {
  getSecurityWatermarkLocation,
  getImmediateSecurityWatermarkLocation,
  activatePlatformScreenProtection,
  type ClientSecurityLocation,
} from '../../utils/securityProtection';
import { SecurePaperViewer } from '../security/SecurePaperViewer';

interface AiExamGeneratorWorkspaceProps {
  currentUser: User | null;
  onRefresh?: () => void;
}

interface PrintingOperatorItem {
  id: string;
  username: string;
  name: string;
  email: string;
  role: string;
  centre_id: string;
  centre_name: string;
}

interface QuestionBlueprintItem {
  index: number;
  type: 'Long' | 'Short' | 'MCQ' | 'Math';
  difficulty: 'easy' | 'medium' | 'hard';
  instruction: string;
}

const PRESET_PROMPTS: Record<string, string> = {
  auto: "Analyze the uploaded question paper(s). Replicate its exact structure: preserve the exact section titles, question counts, internal choices (e.g. 'Attempt Any Four'), subpart labelling (a, b, c), and [Marks] brackets. Synthesize fresh, syllabus-compliant questions.",
  standard: "Create a University Standard Exam Paper:\n- SECTION I: Q.1 Multiple Choice Questions (14 marks, 1 mark each).\n- SECTION I: Q.2 Short Answer Questions (Attempt Any 4 out of 5, 4 marks each = 16M).\n- SECTION I: Q.3 Medium Answer Questions (Attempt Any 2 out of 3, 6 marks each = 12M).\n- SECTION II: Q.4 Long Analytical Questions (Attempt Any 4 out of 5, 4 marks each = 16M).\n- SECTION II: Q.5 Long Comprehensive Questions (Attempt Any 2 out of 3, 6 marks each = 12M).",
  midterm: "Create a Mid-Term Examination Paper (50 Marks, 2 Hours):\n- SECTION A: 5 Short Answer Questions (2 marks each = 10 Marks).\n- SECTION B: 4 Analytical Questions with internal choice (10 marks each = 40 Marks).\n- Focus on core theoretical concepts, definitions, and derivations.",
  engineering: "Create an Engineering / Technical Examination Paper (70 Marks):\n- Emphasize mathematical calculations, algorithm design, circuit diagrams, and derivation from first principles.\n- Include numerical parameters, boundary conditions, and step-by-step mark allocations in [Marks] brackets.\n- Pair subparts (a) and (b) for balanced evaluation.",
  case_study: "Create an Advanced Case Study & Application Paper:\n- SECTION I: Foundational Concepts (20 Marks).\n- SECTION II: Real-world Scenario & System Architecture Design (30 Marks).\n- SECTION III: Comprehensive Case Study with quantitative risk and mitigation analysis (20 Marks).",
  custom: "Design a customized university examination paper based strictly on the uploaded curriculum materials.",
};

const PROGRESS_STEPS = [
  { step: 1, title: 'Processing & Analyzing Files', desc: 'Validating documents & extracting multi-format text layers' },
  { step: 2, title: 'Blueprint & Pattern Analysis', desc: 'Extracting subject, sections, Q1 MCQ structure & marks brackets' },
  { step: 3, title: 'Generating Exam Questions', desc: 'Multi-pass academic synthesis with topic coverage & choices' },
  { step: 4, title: 'Creating Marking Scheme', desc: 'Step-by-step model solutions & official examiner mark rubrics' },
  { step: 5, title: 'Compiling PDFs (Tectonic)', desc: 'Compiling LaTeX into vectorized print-ready PDF documents' },
];

export const AiExamGeneratorWorkspace: React.FC<AiExamGeneratorWorkspaceProps> = ({
  currentUser,
  onRefresh,
}) => {
  // Mode selection
  const [mode, setMode] = useState<'university' | 'exam'>('university');

  // Input states
  const [files, setFiles] = useState<File[]>([]);
  const [manualText, setManualText] = useState<string>('');
  const [title, setTitle] = useState<string>('University Examination Paper');
  const [watermark, setWatermark] = useState<string>('CONFIDENTIAL ZEROLEAK');
  const [univPreset, setUnivPreset] = useState<string>('auto');
  const [univPrompt, setUnivPrompt] = useState<string>(PRESET_PROMPTS.auto);

  // Competitive exam options
  const [qcount, setQcount] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');

  // Advanced customization
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [enablePerQuestionTopic, setEnablePerQuestionTopic] = useState(false);
  const [enablePerQuestionDiff, setEnablePerQuestionDiff] = useState(false);
  const [enablePerQuestionType, setEnablePerQuestionType] = useState(false);
  const [blueprint, setBlueprint] = useState<QuestionBlueprintItem[]>([]);

  // Generation execution & progress
  const [generating, setGenerating] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState<number>(0);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [progressLabel, setProgressLabel] = useState<string>('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Results & Documents viewer
  const [isCompleted, setIsCompleted] = useState(false);
  const [activeDocumentTab, setActiveDocumentTab] = useState<'questions' | 'answers'>('questions');
  const [resultMeta, setResultMeta] = useState<any>(null);
  const [sendingToPrinter, setSendingToPrinter] = useState(false);
  const [printerDispatchedInfo, setPrinterDispatchedInfo] = useState<any>(null);
  const [printingOperators, setPrintingOperators] = useState<PrintingOperatorItem[]>([]);
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>('');

  // Fetch registered printing operators
  useEffect(() => {
    let mounted = true;
    api.getPrintingOperators()
      .then(res => {
        if (mounted && res && res.operators && res.operators.length > 0) {
          setPrintingOperators(res.operators);
          setSelectedOperatorId(res.operators[0].id);
        }
      })
      .catch(err => {
        console.warn('Failed to load printing operators:', err);
      });
    return () => { mounted = false; };
  }, []);

  // LaTeX preview modal
  const [showLatexModal, setShowLatexModal] = useState(false);
  const [latexSource, setLatexSource] = useState<string>('');
  const [copiedLatex, setCopiedLatex] = useState(false);

  // Location watermark
  const [watermarkLocation, setWatermarkLocation] = useState<ClientSecurityLocation>(() =>
    getImmediateSecurityWatermarkLocation()
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);

  // Security screen protection
  useEffect(() => {
    activatePlatformScreenProtection();
    getSecurityWatermarkLocation().then(loc => setWatermarkLocation(loc));
  }, []);

  // Sync blueprint length with qcount
  useEffect(() => {
    const types: Array<'Long' | 'Short' | 'MCQ' | 'Math'> = ['Long', 'Short', 'MCQ', 'Math'];
    const newBp: QuestionBlueprintItem[] = [];
    for (let i = 0; i < qcount; i++) {
      const existing = blueprint[i];
      newBp.push({
        index: i + 1,
        type: existing ? existing.type : types[i % types.length],
        difficulty: existing ? existing.difficulty : difficulty,
        instruction: existing ? existing.instruction : '',
      });
    }
    setBlueprint(newBp);
  }, [qcount, difficulty]);

  // Handle Preset change
  const handlePresetChange = (preset: string) => {
    setUnivPreset(preset);
    setUnivPrompt(PRESET_PROMPTS[preset] || '');
  };

  // Drag and drop handlers
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (newFiles: File[]) => {
    const validExtensions = ['.txt', '.pdf', '.docx', '.pptx', '.rtf'];
    const filtered = newFiles.filter(f => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      return validExtensions.includes(ext);
    });

    if (filtered.length === 0) {
      alert('Supported formats: .pdf, .docx, .pptx, .rtf, .txt');
      return;
    }

    setFiles(prev => {
      const combined = [...prev, ...filtered];
      // Auto-extract title if title is default
      if (title === 'University Examination Paper' && filtered[0]) {
        const cleanName = filtered[0].name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setTitle(cleanName.replace(/\b\w/g, l => l.toUpperCase()));
      }
      return combined.slice(0, 30);
    });
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Launch Generation
  const handleStartGeneration = async () => {
    if (files.length === 0 && !manualText.trim()) {
      alert('Please upload at least one study material/past paper or enter manual syllabus text.');
      return;
    }

    setGenerating(true);
    setIsCompleted(false);
    setGenerationError(null);
    setProgressPct(5);
    setCurrentStep(1);
    setProgressLabel('Uploading study material & launching pipeline...');
    setPrinterDispatchedInfo(null);
    setElapsedSeconds(0);

    // Timer interval
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    try {
      const formData = new FormData();
      files.forEach(f => {
        formData.append('file[]', f);
      });
      formData.append('mode', mode);
      formData.append('title', title.trim() || 'University Examination Paper');
      formData.append('watermark', watermark.trim());
      formData.append('univ_preset', univPreset);
      formData.append('univ_prompt', univPrompt);
      formData.append('manual_text', manualText);
      formData.append('qcount', String(qcount));
      formData.append('difficulty', difficulty);
      formData.append('blueprint', JSON.stringify(blueprint));

      const res = await api.uploadAiExam(formData);
      if (!res || !res.success || !res.job) {
        throw new Error(res?.error || 'Failed to initialize exam generation job');
      }

      setActiveJobId(res.job);
      startPollingStatus(res.job);
    } catch (err: any) {
      setGenerating(false);
      setGenerationError(err.message || 'Error starting generation');
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  };

  // Poll generation status
  const startPollingStatus = (jobId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const status = await api.getAiExamStatus(jobId);
        if (!status) return;

        setProgressPct(status.pct || 10);
        setCurrentStep(status.step || 1);
        setProgressLabel(status.label || 'Processing...');

        if (status.status === 'done') {
          clearInterval(pollIntervalRef.current);
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          setGenerating(false);
          setIsCompleted(true);
          setResultMeta(status);
          onRefresh?.();
        } else if (status.status === 'failed') {
          clearInterval(pollIntervalRef.current);
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          setGenerating(false);
          setGenerationError(status.error || status.label || 'Exam generation failed');
        } else if (status.status === 'canceled') {
          clearInterval(pollIntervalRef.current);
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          setGenerating(false);
          setGenerationError('Generation was canceled.');
        }
      } catch (err: any) {
        console.warn('Status poll warning:', err);
      }
    }, 1500);
  };

  // Cancel Generation
  const handleCancel = async () => {
    if (!activeJobId) return;
    try {
      await api.cancelAiExam(activeJobId);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      setGenerating(false);
      setGenerationError('Generation canceled by user.');
    } catch (err: any) {
      console.error('Cancel error:', err);
    }
  };

  // Send to Printing Operator
  const handleSendToPrintingOperator = async () => {
    if (!activeJobId) return;
    setSendingToPrinter(true);
    try {
      const chosenOp = printingOperators.find(op => op.id === selectedOperatorId) || printingOperators[0];
      const res = await api.sendAiExamToPrinter(activeJobId, title, chosenOp ? {
        operatorId: chosenOp.id,
        operatorName: chosenOp.name,
        operatorEmail: chosenOp.email,
        centreId: chosenOp.centre_id,
        centreName: chosenOp.centre_name,
      } : undefined);

      if (res && res.success) {
        setPrinterDispatchedInfo(res);
        // Persist into localStorage so CentreOperatorWorkspace sees it immediately in browser
        if (res.transferredJob) {
          try {
            const existingStr = localStorage.getItem('zeroleak_transferred_printing_jobs');
            let list = existingStr ? JSON.parse(existingStr) : [];
            if (!Array.isArray(list)) list = [];
            list = list.filter((j: any) => j.paperId !== activeJobId && j.id !== res.transferredJob.id);
            list.unshift(res.transferredJob);
            localStorage.setItem('zeroleak_transferred_printing_jobs', JSON.stringify(list));
          } catch (storageErr) {
            console.warn('Failed to persist to localStorage:', storageErr);
          }
        }
      } else {
        alert((res as any)?.error || 'Failed to dispatch to Printing Operator');
      }
    } catch (err: any) {
      alert(err.message || 'Error dispatching to Printing Operator');
    } finally {
      setSendingToPrinter(false);
    }
  };

  // View LaTeX Source Code
  const handleViewLatex = async (which: 'questions_tex' | 'answers_tex') => {
    if (!activeJobId) return;
    try {
      const url = api.getAiExamDownloadUrl(activeJobId, which);
      const res = await fetch(url);
      const text = await res.text();
      setLatexSource(text);
      setShowLatexModal(true);
      setCopiedLatex(false);
    } catch (err) {
      alert('Error fetching LaTeX source');
    }
  };

  const handleCopyLatex = () => {
    navigator.clipboard.writeText(latexSource);
    setCopiedLatex(true);
    setTimeout(() => setCopiedLatex(false), 2000);
  };

  // Clear inputs
  const handleClearAll = () => {
    setFiles([]);
    setManualText('');
    setTitle('University Examination Paper');
    setUnivPreset('auto');
    setUnivPrompt(PRESET_PROMPTS.auto);
    setIsCompleted(false);
    setResultMeta(null);
    setPrinterDispatchedInfo(null);
    setGenerationError(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Mode Switcher */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                AI EXAM GENERATOR 2.0
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-mono font-medium">
                Tectonic LaTeX Engine
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              University Examination &amp; Mock Paper Synthesis
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-2xl">
              Upload past question papers or study material to automatically generate LaTeX-formatted examination papers and step-by-step marking schemes.
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80 shrink-0">
            <button
              type="button"
              onClick={() => setMode('university')}
              className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                mode === 'university'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🏛️</span>
              <span>University / Board Paper</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('exam')}
              className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                mode === 'exam'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🎯</span>
              <span>Competitive Blueprint</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Files, Right Paper Options */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Study Material & File Upload (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-4 h-4 text-emerald-600" />
                <span>Upload Study Materials / Past Papers</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-400">Up to 30 files</span>
            </div>

            {/* Drag & Drop Zone */}
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50/60 hover:bg-emerald-50/20 rounded-xl p-6 text-center cursor-pointer transition-all space-y-2"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.pptx,.rtf,.txt"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-2xs">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">
                  Drag &amp; drop past papers or notes here
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  or <span className="text-emerald-700 font-semibold underline">browse from your computer</span>
                </p>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                Supports .pdf, .docx, .pptx, .rtf, .txt (max 35MB each)
              </p>
            </div>

            {/* Selected Files List */}
            {files.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span>Selected Documents ({files.length})</span>
                  <button
                    type="button"
                    onClick={() => setFiles([])}
                    className="text-red-500 hover:text-red-700 text-[11px] cursor-pointer"
                  >
                    Clear all
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {files.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/70 text-xs"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-medium text-slate-800 truncate" title={file.name}>
                          {file.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-slate-400">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            removeFile(idx);
                          }}
                          className="text-slate-400 hover:text-red-600 cursor-pointer p-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Manual Text Fallback */}
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">
                  Or paste syllabus / topics description:
                </label>
                <span className="text-[10px] font-mono text-slate-400">
                  {manualText.length} characters
                </span>
              </div>
              <textarea
                value={manualText}
                onChange={e => setManualText(e.target.value)}
                rows={4}
                placeholder="Type or paste syllabus topics, module objectives, or sample question styles here..."
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-sans resize-none"
              />
              <p className="text-[10px] text-slate-400 leading-tight">
                Treated equivalently to an uploaded text document during synthesis.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Paper Options & Synthesis Controls (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-600" />
              <span>Paper Options &amp; Blueprint Configuration</span>
            </h3>

            {/* Title / Subject */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Paper Title / Subject
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Operating Systems Final Examination"
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 font-medium text-slate-900"
              />
              <p className="text-[10px] text-slate-400">
                Printed prominently on the header block of both Questions and Solutions PDFs.
              </p>
            </div>

            {/* Security Watermark */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Security Watermark
                </label>
                <span className="text-[10px] text-slate-400">
                  Auto-bound with centre &amp; location
                </span>
              </div>
              <input
                type="text"
                value={watermark}
                onChange={e => setWatermark(e.target.value)}
                placeholder="e.g. CONFIDENTIAL ZEROLEAK"
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 font-mono text-slate-900"
              />
              {/* Quick Watermark Chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] text-slate-400 font-medium">Quick chips:</span>
                {['CONFIDENTIAL', 'UNIVERSITY EXAM', 'DRAFT', 'SAMPLE PAPER', `${watermarkLocation.city || 'ENCLAVE'} SECURE`].map(wm => (
                  <button
                    key={wm}
                    type="button"
                    onClick={() => setWatermark(wm)}
                    className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-mono cursor-pointer transition-colors"
                  >
                    {wm}
                  </button>
                ))}
              </div>
            </div>

            {/* University Mode Options */}
            {mode === 'university' && (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    Format Blueprint / Pattern
                  </label>
                  <select
                    value={univPreset}
                    onChange={e => handlePresetChange(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="auto">✨ Match Uploaded Question Paper Format (Clone Exact Pattern)</option>
                    <option value="standard">🏛️ University Standard (Part A: 14 MCQs + Part B: Descriptive with Choice)</option>
                    <option value="midterm">📝 Mid-Term Exam (5 Short [2M] + 4 Analytical [10M] = 50M)</option>
                    <option value="engineering">⚙️ Engineering / Technical (Derivations, Calculations, Subparts a/b)</option>
                    <option value="case_study">📚 3 Sections + Practical Case Study &amp; Design</option>
                    <option value="custom">✍️ Custom Structure / Free Prompt</option>
                  </select>
                </div>

                {/* Readymade Prompt / Blueprint Instructions */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      Readymade Prompt / Blueprint Instructions
                    </label>
                    <button
                      type="button"
                      onClick={() => setUnivPrompt(PRESET_PROMPTS[univPreset] || '')}
                      className="text-[11px] text-emerald-600 hover:text-emerald-800 font-semibold cursor-pointer"
                    >
                      Reset Prompt
                    </button>
                  </div>
                  <textarea
                    value={univPrompt}
                    onChange={e => setUnivPrompt(e.target.value)}
                    rows={4}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 font-sans leading-relaxed text-slate-800"
                  />
                  {/* Preset chips */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 font-medium">Quick Templates:</span>
                    {[
                      { id: 'auto', label: 'Auto-Clone Uploaded' },
                      { id: 'standard', label: 'Part A + B' },
                      { id: 'midterm', label: 'Midterm (50M)' },
                      { id: 'engineering', label: 'Engineering' },
                      { id: 'case_study', label: 'Case Study' },
                    ].map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handlePresetChange(t.id)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-medium cursor-pointer transition-colors ${
                          univPreset === t.id
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-[11px] text-emerald-900 flex items-start gap-2">
                  <span className="text-emerald-700 font-bold shrink-0">💡</span>
                  <span>
                    <strong>Multi-Paper Ingestion:</strong> If you upload multiple past papers or notes, the engine synthesizes them into <strong>1 unified university paper</strong> adhering strictly to the extracted blueprint without duplication.
                  </span>
                </div>
              </div>
            )}

            {/* Competitive Exam Mode Options */}
            {mode === 'exam' && (
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Number of Questions</label>
                    <select
                      value={qcount}
                      onChange={e => setQcount(parseInt(e.target.value, 10))}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-medium cursor-pointer"
                    >
                      {[10, 15, 20, 25, 30, 40, 50].map(cnt => (
                        <option key={cnt} value={cnt}>{cnt} Questions</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Overall Difficulty</label>
                    <div className="flex items-center gap-2 pt-1">
                      {(['easy', 'medium', 'hard'] as const).map(d => (
                        <label
                          key={d}
                          className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg border cursor-pointer capitalize transition-all ${
                            difficulty === d
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="diff"
                            checked={difficulty === d}
                            onChange={() => setDifficulty(d)}
                            className="hidden"
                          />
                          {d}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Advanced Per-Question Builder Accordion */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                className="w-full flex items-center justify-between text-xs font-bold text-slate-700 hover:text-slate-900 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-slate-500" />
                  <span>Advanced Per-Question Controls &amp; Overrides</span>
                </span>
                {isAdvancedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {isAdvancedOpen && (
                <div className="mt-3 space-y-3 pt-2">
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enablePerQuestionTopic}
                        onChange={e => setEnablePerQuestionTopic(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Custom instructions per question</span>
                    </label>
                    <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enablePerQuestionDiff}
                        onChange={e => setEnablePerQuestionDiff(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Individual question difficulty</span>
                    </label>
                    <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enablePerQuestionType}
                        onChange={e => setEnablePerQuestionType(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Individual question types</span>
                    </label>
                  </div>

                  {/* Blueprint cards list */}
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1 pt-1">
                    {blueprint.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-md bg-white border border-slate-200 font-bold flex items-center justify-center text-slate-800 text-[11px]">
                              Q{item.index}
                            </span>
                            <span className="font-semibold text-slate-800">
                              Question #{item.index}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {enablePerQuestionType && (
                              <select
                                value={item.type}
                                onChange={e => {
                                  const updated = [...blueprint];
                                  updated[idx].type = e.target.value as any;
                                  setBlueprint(updated);
                                }}
                                className="text-[11px] p-1 rounded-md border border-slate-200 bg-white font-medium"
                              >
                                <option value="Long">Long Answer</option>
                                <option value="Short">Short Answer</option>
                                <option value="MCQ">MCQ (Choice)</option>
                                <option value="Math">Math / Calc</option>
                              </select>
                            )}

                            {enablePerQuestionDiff && (
                              <select
                                value={item.difficulty}
                                onChange={e => {
                                  const updated = [...blueprint];
                                  updated[idx].difficulty = e.target.value as any;
                                  setBlueprint(updated);
                                }}
                                className="text-[11px] p-1 rounded-md border border-slate-200 bg-white font-medium capitalize"
                              >
                                <option value="easy">Easy</option>
                                <option value="medium">Medium</option>
                                <option value="hard">Hard</option>
                              </select>
                            )}
                          </div>
                        </div>

                        {enablePerQuestionTopic && (
                          <input
                            type="text"
                            placeholder="Specific sub-topic or constraint for this question..."
                            value={item.instruction}
                            onChange={e => {
                              const updated = [...blueprint];
                              updated[idx].instruction = e.target.value;
                              setBlueprint(updated);
                            }}
                            className="w-full text-[11px] p-1.5 rounded-md border border-slate-200 bg-white"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Launch Action Buttons */}
            <div className="flex items-center gap-3 pt-3">
              <button
                type="button"
                onClick={handleStartGeneration}
                disabled={generating}
                className="flex-1 py-3 px-5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-700/20 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Synthesizing Exam Papers...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Generate Examination PDFs</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleClearAll}
                disabled={generating}
                className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-all disabled:opacity-50"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Section (Visible when generating) */}
      {generating && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-md p-6 space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin" />
                <span>Generating Examination Papers...</span>
              </h3>
              <p className="text-xs text-slate-500">
                Estimated time: <span className="font-semibold text-slate-700">30-60 seconds</span> • Elapsed: <span className="font-mono font-bold text-emerald-700">{elapsedSeconds}s</span>
              </p>
            </div>

            <button
              type="button"
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>{progressLabel}</span>
            <span className="font-mono font-bold text-emerald-700">{progressPct}%</span>
          </div>

          {/* 5 Stages Tracker */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-2">
            {PROGRESS_STEPS.map(s => {
              const isPast = currentStep > s.step || progressPct === 100;
              const isCurrent = currentStep === s.step && progressPct < 100;
              return (
                <div
                  key={s.step}
                  className={`p-3 rounded-xl border text-xs space-y-1 transition-all ${
                    isPast
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                      : isCurrent
                      ? 'bg-blue-50/60 border-blue-300 text-blue-900 ring-2 ring-blue-500/20'
                      : 'bg-slate-50 border-slate-200/60 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[11px] font-mono">Stage {s.step}</span>
                    {isPast ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : isCurrent ? (
                      <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-300" />
                    )}
                  </div>
                  <div className="font-bold text-xs truncate" title={s.title}>
                    {s.title}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Error Message */}
      {generationError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-sm">Synthesis Error</h4>
            <p>{generationError}</p>
          </div>
        </div>
      )}

      {/* Results & Dual Documents Viewer */}
      {isCompleted && activeJobId && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-md p-6 space-y-5 animate-in fade-in">
          {/* Header Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <h3 className="text-base font-extrabold text-slate-900">
                  {resultMeta?.paper_title || title}
                </h3>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                Duration: {resultMeta?.duration || '3 Hours'} • Max Marks: {resultMeta?.max_marks || '70'} • Format: Standard University
              </p>
            </div>

            {/* Document Switcher Tabs & Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setActiveDocumentTab('questions')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeDocumentTab === 'questions'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📄 Question Paper PDF
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDocumentTab('answers')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeDocumentTab === 'answers'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📝 Model Solutions &amp; Mark Scheme
                </button>
              </div>

              {/* View LaTeX Source */}
              <button
                type="button"
                onClick={() => handleViewLatex(activeDocumentTab === 'questions' ? 'questions_tex' : 'answers_tex')}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <span>View LaTeX</span>
              </button>

              {/* Printing Operator Dropdown Selector & Dispatch Button */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <select
                    value={selectedOperatorId}
                    onChange={e => setSelectedOperatorId(e.target.value)}
                    disabled={sendingToPrinter}
                    className="appearance-none pl-7 pr-8 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-800 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 shadow-2xs transition-all cursor-pointer max-w-[220px] sm:max-w-[290px] truncate"
                    title="Select registered Printing Operator"
                  >
                    {printingOperators.length === 0 ? (
                      <option value="">Loading registered operators...</option>
                    ) : (
                      printingOperators.map(op => (
                        <option key={op.id} value={op.id}>
                          {op.name} ({op.centre_id})
                        </option>
                      ))
                    )}
                  </select>
                  <UserCheck className="w-3.5 h-3.5 text-teal-700 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                <button
                  type="button"
                  onClick={handleSendToPrintingOperator}
                  disabled={sendingToPrinter}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all disabled:opacity-50 shrink-0 ${
                    printerDispatchedInfo
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-teal-700 hover:bg-teal-800 text-white'
                  }`}
                  title="Send paper to selected certified Printing Operator"
                >
                  {sendingToPrinter ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Dispatching...</span>
                    </>
                  ) : printerDispatchedInfo ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />
                      <span>Dispatched</span>
                    </>
                  ) : (
                    <>
                      <Printer className="w-3.5 h-3.5" />
                      <span>Send to Printing Operator</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Top Dispatch Notification Banner */}
          {printerDispatchedInfo && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs space-y-1.5 animate-in fade-in">
              <div className="font-bold flex items-center justify-between text-emerald-900">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Question Paper Successfully Dispatched to Printing Operator!</span>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-200/70 text-emerald-900 font-mono text-[10px] font-bold">
                  ACTIVE IN OPERATOR LOGIN
                </span>
              </div>
              <div className="text-[11px] text-emerald-800 font-medium">
                Assigned Operator: <strong className="text-emerald-950">{printerDispatchedInfo.operator?.name || 'Manoj Kumar'}</strong> ({printerDispatchedInfo.operator?.centreName || printerDispatchedInfo.operator?.centreId || 'Centre 101'})
              </div>
              <div className="text-[11px] text-emerald-700 font-mono">
                Queue ID: <span className="font-bold">{printerDispatchedInfo.queue_id}</span> • Centre Code: <span className="font-bold">{printerDispatchedInfo.operator?.centreId || 'CTR-101'}</span> • Paper is now immediately visible in their Released Examinations &amp; Print Anywhere dashboard.
              </div>
            </div>
          )}

          {/* Secure PDF Viewer */}
          <div className="h-[750px] w-full rounded-xl overflow-hidden border border-slate-200 relative bg-slate-100">
            <SecurePaperViewer
              pdfUrl={api.getAiExamDownloadUrl(activeJobId, activeDocumentTab)}
              paperCode={`${title.substring(0, 12).toUpperCase()} - ${activeDocumentTab.toUpperCase()}`}
              subject={title}
              timeLimitMinutes={180}
            />
          </div>

          {/* Printing Operator Dispatch Section */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Printer className="w-4 h-4 text-teal-700" />
                  <span>Printing Operator Portal Dispatch &amp; Enclave Handover</span>
                </h4>
                <p className="text-[11px] text-slate-500">
                  🔒 Direct local download is restricted for security. Choose any registered Printing Operator from the dropdown to dispatch directly to their login.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <select
                    value={selectedOperatorId}
                    onChange={e => setSelectedOperatorId(e.target.value)}
                    disabled={sendingToPrinter}
                    className="appearance-none pl-7 pr-8 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-800 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 shadow-2xs transition-all cursor-pointer max-w-[260px] sm:max-w-[320px] truncate"
                    title="Select registered Printing Operator"
                  >
                    {printingOperators.length === 0 ? (
                      <option value="">Loading registered operators...</option>
                    ) : (
                      printingOperators.map(op => (
                        <option key={op.id} value={op.id}>
                          {op.name} — {op.centre_name || op.centre_id}
                        </option>
                      ))
                    )}
                  </select>
                  <UserCheck className="w-3.5 h-3.5 text-teal-700 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                <button
                  type="button"
                  onClick={handleSendToPrintingOperator}
                  disabled={sendingToPrinter}
                  className="px-4 py-2 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
                >
                  {sendingToPrinter ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Dispatching...</span>
                    </>
                  ) : (
                    <>
                      <Printer className="w-3.5 h-3.5" />
                      <span>Send to Printing Operator</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Dispatch Success Alert */}
            {printerDispatchedInfo && (
              <div className="p-3.5 rounded-lg bg-emerald-100/70 border border-emerald-300 text-emerald-950 text-xs space-y-1.5">
                <div className="font-bold flex items-center justify-between text-emerald-900">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span>Question Paper Successfully Dispatched to Printing Operator!</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-200 text-emerald-900 font-mono text-[10px] font-bold">
                    READY IN OPERATOR DASHBOARD
                  </span>
                </div>
                <div className="text-[11px] text-emerald-800">
                  Transferred to: <strong>{printerDispatchedInfo.operator?.name || 'Manoj Kumar'}</strong> ({printerDispatchedInfo.operator?.centreName || 'Apex Centre'}) • Email: <strong>{printerDispatchedInfo.operator?.email || 'operator@centre101.edu.in'}</strong>
                </div>
                <div className="text-[11px] text-emerald-800 font-mono">
                  Queue ID: {printerDispatchedInfo.queue_id} • Status: READY FOR PRINT • The operator can now log in, unlock, view and print this paper with dynamic watermark.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LaTeX Source Code Modal */}
      {showLatexModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setShowLatexModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>LaTeX Source Code (Tectonic Ready)</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLatex}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  {copiedLatex ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLatex ? 'Copied!' : 'Copy Code'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowLatexModal(false)}
                  className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center font-bold text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            <pre className="flex-1 overflow-auto bg-slate-900 text-emerald-400 p-4 rounded-xl text-xs font-mono leading-relaxed select-all">
              {latexSource}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
