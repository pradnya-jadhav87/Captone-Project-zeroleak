import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Layers,
  Search,
  FileText,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Edit3,
  X,
  Check,
  XCircle,
  HelpCircle,
  Sparkles,
  Camera,
  Image as ImageIcon,
  CheckCheck,
} from 'lucide-react';
import { SubjectRule } from './CompetitiveBlueprintForm';
import { api } from '../../api';

export interface ExtractedQuestionItem {
  id: string;
  exam_id: string;
  subject: string;
  subject_id?: string;
  question_number?: string;
  question_type: string;
  question_text: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  options?: Array<{ label: string; text: string }>;
  correct_option?: string;
  subQuestions?: string[];
  marks: number;
  negative_marks: number;
  source_pdf?: string;
  source_page?: number;
  source_question_number?: string;
  hasDiagram?: boolean;
  has_diagram?: boolean;
  verification_status: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED' | string;
}

interface QuestionPoolProps {
  examId: string;
  subjects: SubjectRule[];
  onBack?: () => void;
  onProceed?: () => void;
}

export const CompetitiveQuestionPool: React.FC<QuestionPoolProps> = ({
  examId,
  subjects,
  onBack,
  onProceed,
}) => {
  const [questions, setQuestions] = useState<ExtractedQuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNVERIFIED' | 'VERIFIED' | 'REJECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingQuestion, setEditingQuestion] = useState<ExtractedQuestionItem | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);

  // Edit form state
  const [editText, setEditText] = useState('');
  const [editOptA, setEditOptA] = useState('');
  const [editOptB, setEditOptB] = useState('');
  const [editOptC, setEditOptC] = useState('');
  const [editOptD, setEditOptD] = useState('');
  const [editMarks, setEditMarks] = useState<number>(4);
  const [editNegMarks, setEditNegMarks] = useState<number>(1);
  const [editType, setEditType] = useState('MCQ');

  // Load questions from backend PostgreSQL
  const loadPoolData = async () => {
    setLoading(true);
    try {
      const resp = await api.competitive.getQuestionPools(examId);
      if (resp && resp.success) {
        setQuestions(resp.questions || []);
      }
    } catch (err) {
      console.error('Failed to load question pools:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (examId) {
      loadPoolData();
    }
  }, [examId]);

  // Handle single question status update
  const handleUpdateStatus = async (questionId: string, status: 'VERIFIED' | 'REJECTED' | 'UNVERIFIED') => {
    setActionLoadingId(questionId);
    try {
      const resp = await api.competitive.updateQuestionStatus(questionId, status);
      if (resp && resp.success) {
        setQuestions(prev =>
          prev.map(q => (q.id === questionId ? { ...q, verification_status: status } : q))
        );
      }
    } catch (err: any) {
      alert(`Failed to update question status: ${err.message || err}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Batch verify questions for subject or exam
  const handleBatchVerify = async (subjectId?: string) => {
    setBatchLoading(true);
    try {
      const resp = await api.competitive.batchVerifyQuestions(examId, subjectId, 'VERIFIED');
      if (resp && resp.success) {
        await loadPoolData();
      }
    } catch (err: any) {
      alert(`Batch verification error: ${err.message || err}`);
    } finally {
      setBatchLoading(false);
    }
  };

  // Open edit modal
  const handleOpenEdit = (q: ExtractedQuestionItem) => {
    setEditingQuestion(q);
    setEditText(q.question_text || '');

    const opts = q.options || [];
    let a = q.option_a || '';
    let b = q.option_b || '';
    let c = q.option_c || '';
    let d = q.option_d || '';

    if (!a && opts.length > 0) a = opts.find(o => o.label.toUpperCase() === 'A')?.text || opts[0]?.text || '';
    if (!b && opts.length > 1) b = opts.find(o => o.label.toUpperCase() === 'B')?.text || opts[1]?.text || '';
    if (!c && opts.length > 2) c = opts.find(o => o.label.toUpperCase() === 'C')?.text || opts[2]?.text || '';
    if (!d && opts.length > 3) d = opts.find(o => o.label.toUpperCase() === 'D')?.text || opts[3]?.text || '';

    setEditOptA(a);
    setEditOptB(b);
    setEditOptC(c);
    setEditOptD(d);
    setEditMarks(Number(q.marks) || 4);
    setEditNegMarks(Number(q.negative_marks) || 1);
    setEditType(q.question_type || 'MCQ');
  };

  // Save edit form
  const handleSaveEdit = async () => {
    if (!editingQuestion) return;
    setActionLoadingId(editingQuestion.id);

    try {
      const resp = await api.competitive.updateQuestion(editingQuestion.id, {
        question_text: editText,
        option_a: editOptA,
        option_b: editOptB,
        option_c: editOptC,
        option_d: editOptD,
        marks: editMarks,
        negative_marks: editNegMarks,
        question_type: editType,
      });

      if (resp && resp.success) {
        const newOpts = [
          { label: 'A', text: editOptA },
          { label: 'B', text: editOptB },
          { label: 'C', text: editOptC },
          { label: 'D', text: editOptD },
        ].filter(o => Boolean(o.text));

        setQuestions(prev =>
          prev.map(q =>
            q.id === editingQuestion.id
              ? {
                  ...q,
                  question_text: editText,
                  option_a: editOptA,
                  option_b: editOptB,
                  option_c: editOptC,
                  option_d: editOptD,
                  options: newOpts,
                  marks: editMarks,
                  negative_marks: editNegMarks,
                  question_type: editType,
                }
              : q
          )
        );
        setEditingQuestion(null);
      }
    } catch (err: any) {
      alert(`Failed to save question edit: ${err.message || err}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Group questions by subject
  const questionsBySubject: Record<string, ExtractedQuestionItem[]> = {};
  subjects.forEach(s => {
    questionsBySubject[s.subjectName.toLowerCase()] = [];
  });

  questions.forEach(q => {
    const norm = (q.subject || '').trim().toLowerCase();
    if (!questionsBySubject[norm]) questionsBySubject[norm] = [];
    questionsBySubject[norm].push(q);
  });

  // Filtered list
  const filteredQuestions = questions.filter(q => {
    const matchesSubject =
      selectedSubjectFilter === 'ALL' ||
      (q.subject || '').toLowerCase() === selectedSubjectFilter.toLowerCase();

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'VERIFIED' && q.verification_status === 'VERIFIED') ||
      (statusFilter === 'REJECTED' && q.verification_status === 'REJECTED') ||
      (statusFilter === 'UNVERIFIED' && (q.verification_status === 'UNVERIFIED' || !q.verification_status));

    const matchesSearch =
      !searchQuery.trim() ||
      q.question_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (q.source_pdf || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (q.question_number || '').includes(searchQuery);

    return matchesSubject && matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6 competitive-workflow-form">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            Audit & Provenance Verification Enclave
          </span>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mt-1">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Question Extraction & Verification Workflow</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Only <strong>VERIFIED</strong> questions are eligible for final paper generation. Review extracted LaTeX formulas, scientific notation, and diagrams before approving questions for selection.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <button
            type="button"
            onClick={loadPoolData}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Pools</span>
          </button>

          <button
            type="button"
            onClick={() => handleBatchVerify(selectedSubjectFilter === 'ALL' ? undefined : subjects.find(s => s.subjectName.toLowerCase() === selectedSubjectFilter.toLowerCase())?.id)}
            disabled={batchLoading || questions.length === 0}
            className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
          >
            <CheckCheck className={`w-3.5 h-3.5 ${batchLoading ? 'animate-spin' : ''}`} />
            <span>{selectedSubjectFilter === 'ALL' ? 'Verify All Questions' : `Verify All in ${selectedSubjectFilter}`}</span>
          </button>
        </div>
      </div>

      {/* Subject-Wise Live Verification Quota Cards (Prompt Requirement 8) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {subjects.map(s => {
          const norm = s.subjectName.toLowerCase();
          const inPool = questionsBySubject[norm] || [];
          const extractedCount = inPool.length;
          const verifiedCount = inPool.filter(q => q.verification_status === 'VERIFIED').length;
          const requiredCount = Number(s.numberOfQuestions) || 0;
          const isReady = verifiedCount >= requiredCount && requiredCount > 0;

          return (
            <div
              key={s.id}
              onClick={() => setSelectedSubjectFilter(s.subjectName)}
              className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                selectedSubjectFilter.toLowerCase() === norm
                  ? 'border-slate-900 bg-slate-50 ring-2 ring-slate-900/10'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-slate-900 uppercase tracking-wider truncate">
                  {s.subjectName}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    isReady
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  {isReady ? 'READY' : 'INCOMPLETE'}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between items-baseline">
                  <span>Required (Blueprint):</span>
                  <strong className="font-mono text-slate-900">{requiredCount}</strong>
                </div>
                <div className="flex justify-between items-baseline">
                  <span>Extracted:</span>
                  <span className="font-mono font-bold text-slate-800">{extractedCount}</span>
                </div>
                <div className="flex justify-between items-baseline border-t border-slate-100 pt-1">
                  <span className="font-bold text-slate-800">Verified:</span>
                  <strong className={`font-mono text-sm ${isReady ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {verifiedCount}
                  </strong>
                </div>
                <div className="flex justify-between items-baseline pt-0.5 text-[11px]">
                  <span>Ready for Gen:</span>
                  <span className={`font-bold ${isReady ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {isReady ? 'YES' : `NO (${requiredCount - verifiedCount} needed)`}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Subject Pills */}
          <button
            type="button"
            onClick={() => setSelectedSubjectFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer ${
              selectedSubjectFilter === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            All Subjects ({questions.length})
          </button>
          {subjects.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedSubjectFilter(s.subjectName)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer ${
                selectedSubjectFilter.toLowerCase() === s.subjectName.toLowerCase()
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              {s.subjectName} ({(questionsBySubject[s.subjectName.toLowerCase()] || []).length})
            </button>
          ))}
        </div>

        {/* Status Filters & Search */}
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200">
            {(['ALL', 'VERIFIED', 'UNVERIFIED', 'REJECTED'] as const).map(st => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search question text or PDF..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-hidden focus:bg-white"
            />
          </div>
        </div>
      </div>

      {/* Extracted Questions List */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-500 space-y-2 bg-white rounded-2xl border border-slate-200">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-600" />
          <p>Loading questions from PostgreSQL database...</p>
        </div>
      ) : filteredQuestions.length === 0 ? (
        <div className="p-12 rounded-2xl border border-dashed border-slate-300 text-center space-y-2 bg-white">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800">
            No Questions Match Selected Filter
          </h4>
          <p className="text-xs text-slate-500">
            {questions.length === 0
              ? 'No questions extracted yet. Please upload PDF question papers in Step 3.'
              : 'Try clearing the search query or switching subject and status filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredQuestions.map((q, idx) => {
            const isVerified = q.verification_status === 'VERIFIED';
            const isRejected = q.verification_status === 'REJECTED';
            const isUnverified = !isVerified && !isRejected;

            const opts = q.options || [];
            const hasDiagram = q.hasDiagram || q.has_diagram || /\b(fig(?:ure)?\.?|diagram|circuit|graph|plot|chart)\b/i.test(q.question_text);

            return (
              <div
                key={q.id || idx}
                className={`p-5 rounded-2xl bg-white border shadow-xs space-y-3 transition-all ${
                  isVerified
                    ? 'border-emerald-200/90 ring-1 ring-emerald-500/10'
                    : isRejected
                    ? 'border-rose-200 bg-rose-50/20'
                    : 'border-slate-200'
                }`}
              >
                {/* Question Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200 text-xs">
                      {q.question_number ? `Q.${q.question_number}` : `Question #${idx + 1}`}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-lg font-bold bg-slate-100 text-slate-800 text-[11px]">
                      {q.subject}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      {q.question_type}
                    </span>

                    {hasDiagram && (
                      <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
                        <Camera className="w-3 h-3" />
                        <span>Diagram Reference</span>
                      </span>
                    )}

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        isVerified
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : isRejected
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {q.verification_status || 'UNVERIFIED'}
                    </span>
                  </div>

                  {/* Provenance & Marks Badge */}
                  <div className="flex items-center gap-3 text-xs">
                    <span className="px-2.5 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-600 font-mono text-[11px]">
                      Source: <strong className="text-slate-800">{q.source_pdf || 'Uploaded PDF'}</strong>
                      {q.source_page ? ` • P.${q.source_page}` : ''}
                      {q.source_question_number ? ` • Q#${q.source_question_number}` : ''}
                    </span>

                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 font-bold text-emerald-800 text-[11px]">
                      +{q.marks || 4}M {q.negative_marks ? `/-${q.negative_marks}M` : ''}
                    </span>
                  </div>
                </div>

                {/* Question Text (LaTeX & Scientific Formats Preserved) */}
                <div className="text-xs text-slate-900 font-medium leading-relaxed whitespace-pre-wrap font-sans">
                  {q.question_text}
                </div>

                {/* MCQ Options A, B, C, D */}
                {opts.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {opts.map((opt, oIdx) => (
                      <div
                        key={oIdx}
                        className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-start gap-2.5"
                      >
                        <span className="w-5 h-5 rounded-full bg-slate-200 font-bold font-mono text-[10px] flex items-center justify-center shrink-0 text-slate-800">
                          {opt.label}
                        </span>
                        <span className="text-slate-800 leading-snug">{opt.text}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Interactive Action Buttons [ Verify ] [ Reject ] [ Edit ] (Requirement 8) */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(q.id, 'VERIFIED')}
                      disabled={actionLoadingId === q.id || isVerified}
                      className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                        isVerified
                          ? 'bg-emerald-100 text-emerald-800 cursor-default'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isVerified ? 'Verified' : 'Verify'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(q.id, 'REJECTED')}
                      disabled={actionLoadingId === q.id || isRejected}
                      className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                        isRejected
                          ? 'bg-rose-100 text-rose-800 cursor-default'
                          : 'bg-white hover:bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{isRejected ? 'Rejected' : 'Reject'}</span>
                    </button>

                    {isRejected && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(q.id, 'UNVERIFIED')}
                        className="px-2.5 py-1.5 rounded-xl text-slate-600 hover:bg-slate-100 font-medium cursor-pointer"
                      >
                        Reset to Review
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(q)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Question</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inline Edit Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-slate-700" />
                <span>Edit Question: {editingQuestion.question_number ? `Q.${editingQuestion.question_number}` : editingQuestion.id}</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-slate-700 font-bold">Question Text</label>
                <textarea
                  rows={4}
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-300 text-slate-900 font-sans focus:ring-2 focus:ring-slate-400 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-slate-700 font-bold">Option A</label>
                  <input
                    type="text"
                    value={editOptA}
                    onChange={e => setEditOptA(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-700 font-bold">Option B</label>
                  <input
                    type="text"
                    value={editOptB}
                    onChange={e => setEditOptB(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-700 font-bold">Option C</label>
                  <input
                    type="text"
                    value={editOptC}
                    onChange={e => setEditOptC(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-700 font-bold">Option D</label>
                  <input
                    type="text"
                    value={editOptD}
                    onChange={e => setEditOptD(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-slate-700 font-bold">Marks</label>
                  <input
                    type="number"
                    step={0.5}
                    value={editMarks}
                    onChange={e => setEditMarks(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-700 font-bold">Negative Marks</label>
                  <input
                    type="number"
                    step={0.25}
                    value={editNegMarks}
                    onChange={e => setEditNegMarks(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-700 font-bold">Type</label>
                  <select
                    value={editType}
                    onChange={e => setEditType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="MCQ">MCQ</option>
                    <option value="Descriptive">Descriptive</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={actionLoadingId === editingQuestion.id}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-bold cursor-pointer shadow-xs"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      {(onBack || onProceed) && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs flex items-center gap-2 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Question Pools</span>
            </button>
          ) : <div />}

          {onProceed && (
            <button
              type="button"
              onClick={onProceed}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer"
            >
              <span>Proceed to Step 5: Validate Blueprint</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
