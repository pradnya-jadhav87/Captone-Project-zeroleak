import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  FileCheck,
  Layers,
  Sparkles,
  Lock,
  Unlock,
  Printer,
  Eye,
  Languages,
  UserCheck,
  Check,
  X,
  ChevronRight,
} from 'lucide-react';
import { SubjectRule } from './CompetitiveBlueprintForm';
import { api } from '../../api';
import { CompetitivePrintExaminationPaper } from './CompetitivePrintExaminationPaper';

interface SubjectValidationResult {
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
}

interface BlueprintValidationProps {
  examId: string;
  subjects: SubjectRule[];
  onBack?: () => void;
  onProceed?: () => void;
  onPaperGenerated?: (paper: any) => void;
}

export const CompetitiveBlueprintValidation: React.FC<BlueprintValidationProps> = ({
  examId,
  subjects,
  onBack,
  onProceed,
  onPaperGenerated,
}) => {
  const [loading, setLoading] = useState(true);
  const [allValid, setAllValid] = useState(false);
  const [subjectResults, setSubjectResults] = useState<SubjectValidationResult[]>([]);
  const [overallMessage, setOverallMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // 3-Paper Combinations State
  const [generatedPapers, setGeneratedPapers] = useState<any[]>([]);
  const [selectedPaperNumber, setSelectedPaperNumber] = useState<number>(1);
  const [activePaper, setActivePaper] = useState<any | null>(null);
  const [completingPaper, setCompletingPaper] = useState(false);
  const [showProvenanceDrawer, setShowProvenanceDrawer] = useState(false);

  // Translator Assignment State
  const [translators, setTranslators] = useState<any[]>([]);
  const [selectedTranslatorId, setSelectedTranslatorId] = useState<string>('');
  const [assigningSubjectId, setAssigningSubjectId] = useState<string | null>(null);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);

  // Review Translated Questions Modal State
  const [reviewModalSubject, setReviewModalSubject] = useState<SubjectRule | null>(null);
  const [reviewTranslations, setReviewTranslations] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [verifyingTrId, setVerifyingTrId] = useState<string | null>(null);

  // Load authorized translators
  const loadTranslators = async () => {
    try {
      const resp = await api.competitive.getTranslators();
      if (resp && resp.success && resp.translators) {
        setTranslators(resp.translators);
        if (resp.translators.length > 0 && !selectedTranslatorId) {
          setSelectedTranslatorId(resp.translators[0].id);
        }
      }
    } catch (err) {
      console.warn('Notice loading translators:', err);
    }
  };

  // Load existing generated 3 papers if any
  const loadExistingPapers = async () => {
    try {
      const resp = await api.competitive.getGeneratedPaperSet(examId);
      if (resp && resp.success && Array.isArray(resp.papers) && resp.papers.length > 0) {
        setGeneratedPapers(resp.papers);
        const p1 = resp.papers.find(p => p.paperNumber === 1) || resp.papers[0];
        setActivePaper(p1);
        setSelectedPaperNumber(p1.paperNumber || 1);
      }
    } catch (err) {
      console.warn('Notice loading existing papers:', err);
    }
  };

  // Run validation via backend PostgreSQL API
  const runValidation = async () => {
    setLoading(true);
    setGenerationError(null);
    try {
      const resp = await api.competitive.validateBlueprint(examId, { subjects });
      if (resp && resp.success) {
        setAllValid(resp.valid);
        setSubjectResults(resp.subjectResults || []);
        setOverallMessage(resp.overallMessage || '');
      }
    } catch (err: any) {
      console.error('Validation API error:', err);
      setAllValid(false);
      setOverallMessage(err.message || 'Validation request failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTranslators();
    loadExistingPapers();
  }, [examId]);

  useEffect(() => {
    if (examId && subjects.length > 0) {
      runValidation();
    } else {
      setLoading(false);
    }
  }, [examId, subjects]);

  // Handle Assign Translator to Subject Pool
  const handleAssignTranslator = async (subject: SubjectRule) => {
    if (!selectedTranslatorId) {
      alert('Please select an authorized Linguistic Translator from your organization.');
      return;
    }
    setAssigningSubjectId(subject.id);
    setAssignmentMessage(null);
    try {
      const resp = await api.competitive.assignTranslation({
        exam_id: examId,
        subject_id: subject.id,
        subject_name: subject.subjectName,
        language: subject.translationLanguage || 'Hindi',
        translator_id: selectedTranslatorId,
      });

      if (resp && resp.success) {
        setAssignmentMessage(resp.message || 'Question pool successfully assigned to translator.');
        await runValidation();
        setTimeout(() => setAssignmentMessage(null), 4000);
      }
    } catch (err: any) {
      alert(`Assignment failed: ${err.message || err}`);
    } finally {
      setAssigningSubjectId(null);
    }
  };

  // Open Review Translated Questions Modal
  const handleOpenReviewModal = async (subject: SubjectRule) => {
    setReviewModalSubject(subject);
    setLoadingReviews(true);
    try {
      const resp = await api.competitive.getSubjectTranslations(examId, subject.id);
      if (resp && resp.success) {
        setReviewTranslations(resp.translations || []);
      }
    } catch (err: any) {
      console.error('Failed to load translations:', err);
    } finally {
      setLoadingReviews(false);
    }
  };

  // Approve or Reject translation
  const handleVerifyTranslation = async (transId: string, status: 'VERIFIED' | 'REJECTED') => {
    setVerifyingTrId(transId);
    try {
      const resp = await api.competitive.verifyTranslation(transId, status);
      if (resp && resp.success) {
        setReviewTranslations(prev =>
          prev.map(t => (t.id === transId ? { ...t, verification_status: status } : t))
        );
        await runValidation();
      }
    } catch (err: any) {
      alert(`Verification failed: ${err.message || err}`);
    } finally {
      setVerifyingTrId(null);
    }
  };

  // Generate 3 Unique Disjoint Paper Combinations
  const handleGenerate3Papers = async () => {
    setIsGenerating(true);
    setGenerationError(null);

    try {
      const resp = await api.competitive.generateFinalPaper(examId, { subjects });
      if (resp && resp.success && Array.isArray(resp.papers) && resp.papers.length > 0) {
        setGeneratedPapers(resp.papers);
        const p1 = resp.papers[0];
        setActivePaper(p1);
        setSelectedPaperNumber(1);
        if (onPaperGenerated) onPaperGenerated(p1);
      } else if (resp && resp.success && resp.paper) {
        setGeneratedPapers([resp.paper]);
        setActivePaper(resp.paper);
        setSelectedPaperNumber(1);
        if (onPaperGenerated) onPaperGenerated(resp.paper);
      } else {
        throw new Error((resp as any)?.error || 'Failed to synthesize papers.');
      }
    } catch (err: any) {
      setGenerationError(err.message || 'Generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Switch Paper tab (1, 2, 3)
  const handleSelectPaperTab = async (paperNum: number) => {
    setSelectedPaperNumber(paperNum);
    const found = generatedPapers.find(p => p.paperNumber === paperNum);
    if (!found) return;

    if (found.status === 'LOCKED') {
      // Fetch from backend to ensure lock status is fresh
      try {
        await api.competitive.getGeneratedPaper(found.id);
        setActivePaper(found);
      } catch (err: any) {
        alert(err.message || `Paper ${paperNum} is LOCKED.`);
      }
    } else {
      setActivePaper(found);
    }
  };

  // Complete active paper to unlock the next paper in sequence
  const handleCompleteActivePaper = async () => {
    if (!activePaper) return;
    if (!window.confirm(`Are you sure you want to finalize and COMPLETE Paper ${selectedPaperNumber}? This will unlock Paper ${selectedPaperNumber + 1}.`)) {
      return;
    }

    setCompletingPaper(true);
    try {
      const resp = await api.competitive.completeGeneratedPaper(activePaper.id);
      if (resp && resp.success) {
        await loadExistingPapers();
        alert(resp.message);
      }
    } catch (err: any) {
      alert(`Failed to complete paper: ${err.message || err}`);
    } finally {
      setCompletingPaper(false);
    }
  };

  const failedSubjects = subjectResults.filter(s => !s.passed);
  const translationSubjects = subjects.filter(s => s.translationRequired);

  return (
    <div className="space-y-6 competitive-workflow-form">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            Automated Quota & Feasibility Verification
          </span>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mt-1">
            <FileCheck className="w-5 h-5 text-slate-900" />
            <span>Step 4: Blueprint Validation & 3 Unique Paper Combinations</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Strict verification ensures verified pools contain sufficient genuine questions (3× quota) and verified regional translations before synthesis of 3 unique disjoint papers (Paper 1, Paper 2, Paper 3).
          </p>
        </div>

        <button
          type="button"
          onClick={runValidation}
          disabled={loading || isGenerating}
          className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto border border-slate-200"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Re-validate Quotas</span>
        </button>
      </div>

      {assignmentMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-950 font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{assignmentMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TRANSLATION ASSIGNMENT & REVIEW WORKFLOW (Requirements 2, 3, 4, 5)          */}
      {/* ========================================================================= */}
      {translationSubjects.length > 0 && (
        <div className="p-6 rounded-2xl bg-white border border-purple-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
                <Languages className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Translation Assignment & Regional Question Review</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                    TRANSLATION REQUIRED = YES
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Only authorized Linguistic Translators from your organization may be assigned. Exam Managers review and approve question translations before synthesis.
                </p>
              </div>
            </div>

            {/* Translator Selector */}
            <div className="flex items-center gap-2 text-xs">
              <label className="font-bold text-slate-700 whitespace-nowrap">Authorized Translator:</label>
              <select
                value={selectedTranslatorId}
                onChange={e => setSelectedTranslatorId(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-purple-50/50 border border-purple-300 text-slate-800 font-bold focus:outline-hidden cursor-pointer"
              >
                {translators.length === 0 ? (
                  <option value="">No authorized translators found</option>
                ) : (
                  translators.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.full_name || t.username} ({t.email})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Subject Translation Rows */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {translationSubjects.map(sub => {
              const res = subjectResults.find(r => r.subjectId === sub.id || r.subject === sub.subjectName);
              const isAssigning = assigningSubjectId === sub.id;

              return (
                <div
                  key={sub.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">{sub.subjectName}</h4>
                      <p className="text-[11px] text-purple-700 font-bold mt-0.5">
                        Target Language: {sub.translationLanguage || 'Hindi'}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                        Verified Translations: <strong>{res?.translatedAvailable || 0} / {res?.translatedRequired || (Number(sub.numberOfQuestions) * 3)}</strong>
                        {res?.translationDeficit ? <span className="text-rose-600 font-bold ml-1.5">(Deficit: {res.translationDeficit})</span> : null}
                      </p>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        (res?.translatedAvailable || 0) >= (res?.translatedRequired || 1)
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {(res?.translatedAvailable || 0) >= (res?.translatedRequired || 1) ? 'Quota Met' : 'Translation Pending'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => handleAssignTranslator(sub)}
                      disabled={isAssigning || translators.length === 0}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      <UserCheck className={`w-3.5 h-3.5 ${isAssigning ? 'animate-spin' : ''}`} />
                      <span>{isAssigning ? 'Assigning...' : 'Assign Questions'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenReviewModal(sub)}
                      className="py-1.5 px-3 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Translated Questions</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Validation Status Verdict Box */}
      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500 space-y-2 bg-white rounded-2xl border border-slate-200">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-600" />
          <p>Auditing verified question pools in PostgreSQL against 3-paper and translation quotas...</p>
        </div>
      ) : allValid ? (
        <div className="p-5 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-xs text-emerald-950 space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>READY FOR 3 UNIQUE PAPER COMBINATION SYNTHESIS</span>
          </div>
          <p className="text-slate-700 pl-7 leading-relaxed">
            All <strong>{subjects.length} configured subjects</strong> satisfy or exceed the 3-Paper quota (3 × questions per paper) with fully verified genuine source questions and regional translations. Paper 1, Paper 2, and Paper 3 will be synthesized with strictly disjoint questions.
          </p>
        </div>
      ) : (
        <div className="p-5 rounded-2xl bg-rose-50 border-2 border-rose-300 text-xs text-rose-950 space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm text-rose-900">
            <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>INSUFFICIENT QUESTIONS — 3-PAPER SYNTHESIS BLOCKED</span>
          </div>
          <p className="text-slate-700 pl-7 leading-relaxed">
            The following subject{failedSubjects.length > 1 ? 's do' : ' does'} not contain enough verified questions or verified translations to synthesize 3 disjoint paper combinations:
          </p>
          <ul className="list-disc list-inside pl-9 space-y-1 font-bold text-rose-800">
            {failedSubjects.map((s, idx) => (
              <li key={idx}>
                {s.subject}: {s.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Subject-Wise Validation Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            3-Paper Subject Quota Audit Table
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">
            Source of Truth: PostgreSQL
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4 text-center">Questions / Paper</th>
                <th className="py-3 px-4 text-center">3-Paper Quota (3N)</th>
                <th className="py-3 px-4 text-center">Verified in Pool</th>
                <th className="py-3 px-4 text-center">Translation Quota</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4">Advisory & Audit Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subjectResults.map((res, idx) => {
                const subRule = subjects.find(s => s.id === res.subjectId || s.subjectName === res.subject);
                const perPaper = Number(subRule?.numberOfQuestions) || Math.floor(res.required / 3);

                return (
                  <tr
                    key={idx}
                    className={`hover:bg-slate-50/50 ${
                      !res.passed ? 'bg-rose-50/30' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {res.subject}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                      {perPaper}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                      {res.required}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold">
                      <span className={res.available >= res.required ? 'text-emerald-700' : 'text-rose-700'}>
                        {res.available}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-[11px]">
                      {res.translationRequired ? (
                        <span className={(res.translatedAvailable || 0) >= (res.translatedRequired || 1) ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                          {res.translatedAvailable || 0} / {res.translatedRequired} ({res.translationLanguage})
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Not Required</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {res.passed ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>OK</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 inline-flex items-center gap-1">
                          <XCircle className="w-3 h-3 text-rose-600" />
                          <span>INSUFFICIENT</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-[11px] leading-relaxed">
                      {res.message}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generation Error Display */}
      {generationError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{generationError}</span>
        </div>
      )}

      {/* Generation Button & Actions */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-slate-900">Synthesize 3 Unique Paper Combinations</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Produces Paper 1, Paper 2, and Paper 3 with disjoint questions per subject ($A \cap B = \emptyset, A \cap C = \emptyset, B \cap C = \emptyset$). Sequential access enforced via backend locking.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerate3Papers}
          disabled={!allValid || isGenerating}
          className={`px-6 py-3 rounded-xl font-bold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer ${
            allValid && !isGenerating
              ? 'bg-slate-900 hover:bg-black text-white'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
          <span>{isGenerating ? 'Synthesizing 3 Disjoint Paper Sets...' : 'Generate 3 Unique Paper Combinations'}</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 3 UNIQUE PAPER COMBINATIONS TAB BAR & SEQUENTIAL LOCK VIEW                 */}
      {/* ========================================================================= */}
      {generatedPapers.length > 0 && (
        <div className="space-y-6 pt-4">
          {/* Paper Selector Tabs */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Select Generated Paper Set:
              </span>
            </div>

            <div className="flex items-center gap-2">
              {[1, 2, 3].map(pNum => {
                const paperObj = generatedPapers.find(p => p.paperNumber === pNum);
                const isSelected = selectedPaperNumber === pNum;
                const isLocked = paperObj?.status === 'LOCKED';
                const isCompleted = paperObj?.status === 'COMPLETED';

                return (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => handleSelectPaperTab(pNum)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : isLocked
                        ? 'bg-slate-100 text-slate-400 border-slate-200'
                        : isCompleted
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {isLocked ? (
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                    ) : isCompleted ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5 text-emerald-500" />
                    )}
                    <span>Paper {pNum}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded uppercase ${
                        isLocked
                          ? 'bg-slate-200 text-slate-600'
                          : isCompleted
                          ? 'bg-emerald-200 text-emerald-900'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {paperObj?.status || (pNum === 1 ? 'AVAILABLE' : 'LOCKED')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Paper Status & Complete Action */}
          {activePaper && (
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>{activePaper.title || `Paper ${selectedPaperNumber}`}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-800">
                      STATUS: {activePaper.status}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    SHA-256 Fingerprint: {activePaper.paperFingerprint}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowProvenanceDrawer(!showProvenanceDrawer)}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
                >
                  <FileCheck className="w-4 h-4" />
                  <span>{showProvenanceDrawer ? 'Hide Traceability' : 'Audit Traceability'}</span>
                </button>

                {activePaper.status !== 'COMPLETED' && selectedPaperNumber < 3 && (
                  <button
                    type="button"
                    onClick={handleCompleteActivePaper}
                    disabled={completingPaper}
                    className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    title={`Finalize Paper ${selectedPaperNumber} to unlock Paper ${selectedPaperNumber + 1}`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Complete & Unlock Paper {selectedPaperNumber + 1}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Source Provenance Drawer */}
          {showProvenanceDrawer && activePaper && (
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-3">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider">
                Paper {selectedPaperNumber} Provenance & Disjoint Source Traceability
              </h4>
              <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">Exam Question #</th>
                      <th className="py-2.5 px-3">Subject</th>
                      <th className="py-2.5 px-3">Source PDF Paper</th>
                      <th className="py-2.5 px-3">Source Page</th>
                      <th className="py-2.5 px-3">Source Question #</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {(activePaper.sourceProvenance || []).map((prov: any, pIdx: number) => (
                      <tr key={pIdx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-bold text-slate-900">{prov.questionNumber}</td>
                        <td className="py-2 px-3 text-slate-700 font-sans font-medium">{prov.subject}</td>
                        <td className="py-2 px-3 text-slate-800">{prov.sourcePdf || 'Uploaded PDF'}</td>
                        <td className="py-2 px-3 text-slate-600">{prov.sourcePage || 1}</td>
                        <td className="py-2 px-3 text-slate-600">{prov.sourceQuestionNumber || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Printable Formal Exam Paper Surface */}
          {activePaper && (
            <CompetitivePrintExaminationPaper
              paper={activePaper}
              blueprint={activePaper.blueprint || { subjects }}
            />
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* REVIEW TRANSLATIONS MODAL (Requirement 5)                                 */}
      {/* ========================================================================= */}
      {reviewModalSubject && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-300">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Languages className="w-4 h-4 text-purple-700" />
                  <span>Review Translated Questions — {reviewModalSubject.subjectName} ({reviewModalSubject.translationLanguage || 'Regional'})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Side-by-side verification of source English vs translated regional questions and options.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewModalSubject(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
              {loadingReviews ? (
                <div className="p-8 text-center text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-purple-600 mb-2" />
                  <p>Loading database translations for review...</p>
                </div>
              ) : reviewTranslations.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  No translation records found for this subject. Please assign questions to an authorized translator.
                </div>
              ) : (
                reviewTranslations.map((t, idx) => {
                  const isVerifying = verifyingTrId === t.id;
                  const isVerified = t.verification_status === 'VERIFIED';
                  const isRejected = t.verification_status === 'REJECTED';

                  return (
                    <div
                      key={t.id}
                      className={`p-4 rounded-xl border space-y-3 ${
                        isVerified
                          ? 'border-emerald-300 bg-emerald-50/30'
                          : isRejected
                          ? 'border-rose-300 bg-rose-50/30'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-slate-900">Question #{idx + 1}</span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              isVerified
                                ? 'bg-emerald-100 text-emerald-800'
                                : isRejected
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {t.verification_status || 'PENDING'}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleVerifyTranslation(t.id, 'VERIFIED')}
                            disabled={isVerifying || isVerified}
                            className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>Approve</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleVerifyTranslation(t.id, 'REJECTED')}
                            disabled={isVerifying || isRejected}
                            className="px-2.5 py-1 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                            <span>Reject</span>
                          </button>
                        </div>
                      </div>

                      {/* Side by side comparison */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                          <span className="text-[10px] font-bold uppercase text-slate-500 block">English Source</span>
                          <p className="text-slate-800 font-medium">{t.original_text}</p>
                          <div className="text-[11px] text-slate-600 space-y-0.5 pt-1">
                            {t.orig_opt_a && <div><strong>(A)</strong> {t.orig_opt_a}</div>}
                            {t.orig_opt_b && <div><strong>(B)</strong> {t.orig_opt_b}</div>}
                            {t.orig_opt_c && <div><strong>(C)</strong> {t.orig_opt_c}</div>}
                            {t.orig_opt_d && <div><strong>(D)</strong> {t.orig_opt_d}</div>}
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-purple-50/50 border border-purple-200 space-y-1">
                          <span className="text-[10px] font-bold uppercase text-purple-700 block">
                            {t.language} Translation
                          </span>
                          <p className="text-slate-900 font-medium">
                            {t.translated_question_text || t.translated_text || '[No translation authored yet]'}
                          </p>
                          <div className="text-[11px] text-slate-700 space-y-0.5 pt-1">
                            {t.translated_option_a && <div><strong>(A)</strong> {t.translated_option_a}</div>}
                            {t.translated_option_b && <div><strong>(B)</strong> {t.translated_option_b}</div>}
                            {t.translated_option_c && <div><strong>(C)</strong> {t.translated_option_c}</div>}
                            {t.translated_option_d && <div><strong>(D)</strong> {t.translated_option_d}</div>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setReviewModalSubject(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs cursor-pointer hover:bg-black"
              >
                Close Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      {onBack && generatedPapers.length === 0 && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs flex items-center gap-2 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Question Verification</span>
          </button>
        </div>
      )}
    </div>
  );
};

