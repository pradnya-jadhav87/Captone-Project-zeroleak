import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  ShieldAlert,
  Flame,
  CheckCircle2,
  Lock,
  RotateCcw,
  Layers,
  FileText,
  Search,
  Filter,
  ArrowRight,
  ArrowLeft,
  Key,
  Printer,
  Ban,
  Check,
  Info,
} from 'lucide-react';
import { api } from '../../api';
import { User, Examination } from '../../types';

interface PaperLeakResponseWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: Examination | any;
  currentUser: User | null;
  onRegenerationSuccess?: (replacementPaper: any) => void;
}

type WizardStep =
  | 'IDENTIFY_EXAM'
  | 'REGISTER_INCIDENT'
  | 'QUARANTINE_REVIEW'
  | 'EXCLUSION_MANIFEST'
  | 'REGENERATE_PAPER'
  | 'VALIDATION_COMPARISON'
  | 'APPROVE_ENCRYPT';

export const PaperLeakResponseWizardModal: React.FC<PaperLeakResponseWizardModalProps> = ({
  isOpen,
  onClose,
  exam,
  currentUser,
  onRegenerationSuccess,
}) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>('IDENTIFY_EXAM');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Step 1: Examination details
  const [selectedVersion, setSelectedVersion] = useState<string>(exam?.version_code || 'v1');

  // Step 2: Leak Incident Form
  const [incidentTitle, setIncidentTitle] = useState(`Suspected Question Paper Leak - ${exam?.name || exam?.title || 'Exam'}`);
  const [incidentDescription, setIncidentDescription] = useState('Report of unauthorized physical or electronic distribution of paper questions prior to examination unlock.');
  const [leakSeverity, setLeakSeverity] = useState<'MEDIUM' | 'HIGH' | 'CRITICAL'>('HIGH');
  const [isConfirmedLeak, setIsConfirmedLeak] = useState(false);
  const [reportSource, setReportSource] = useState('EXAMINATION_MANAGER_OBSERVATION');
  const [leakedQuestionNumbers, setLeakedQuestionNumbers] = useState('Q.2, Q.3, Q.7');
  const [watermarkReference, setWatermarkReference] = useState('');
  const [regenerationReason, setRegenerationReason] = useState('Urgent paper invalidation and clean replacement compilation due to security breach.');

  // Stored Backend Incident & State
  const [incidentRecord, setIncidentRecord] = useState<any | null>(null);
  const [quarantines, setQuarantines] = useState<any[]>([]);
  const [exclusionManifest, setExclusionManifest] = useState<any | null>(null);

  // Step 3: Quarantine additions
  const [newQuarScope, setNewQuarScope] = useState<'INDIVIDUAL_QUESTION' | 'QUESTION_POOL' | 'SOURCE_DRAFT'>('INDIVIDUAL_QUESTION');
  const [newQuarTargetId, setNewQuarTargetId] = useState('');
  const [newQuarReason, setNewQuarReason] = useState('');
  const [newQuarAllowlist, setNewQuarAllowlist] = useState('');

  // Step 5: Regeneration
  const [eligibleScanData, setEligibleScanData] = useState<any | null>(null);
  const [replacementPaper, setReplacementPaper] = useState<any | null>(null);
  const [validationReport, setValidationReport] = useState<any | null>(null);
  const [approvalReason, setApprovalReason] = useState('Replacement paper approved after strict quarantine and deterministic validation.');

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep('IDENTIFY_EXAM');
      setErrorMessage(null);
      setSuccessMessage(null);
      setIncidentRecord(null);
      setReplacementPaper(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handler: Register Incident & Enforce Immediate Containment
  const handleRegisterIncident = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const qNums = leakedQuestionNumbers
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const knownQs = qNums.map((num, i) => ({
        questionId: `Q-LEAK-${num.replace(/[^A-Za-z0-9]/g, '') || (i + 1)}`,
        questionNumber: num,
        text: `Compromised examination item reported as ${num}`,
        marks: 4,
      }));

      const res = await api.reportPaperLeak({
        examId: exam.id,
        examType: exam.exam_type === 'COMPETITIVE' ? 'COMPETITIVE' : 'UNIVERSITY',
        paperId: exam.id,
        paperVersion: selectedVersion,
        title: incidentTitle,
        description: incidentDescription,
        severity: leakSeverity,
        isConfirmed: isConfirmedLeak,
        discoveryTimestamp: new Date().toISOString(),
        reportSource,
        knownLeakedQuestions: knownQs,
        watermarkReference: watermarkReference || undefined,
        regenerationReason,
      });

      if (res.success && res.incident) {
        setIncidentRecord(res.incident);
        setExclusionManifest(res.manifest);
        // Load quarantines
        const details = await api.getPaperLeakIncident(res.incident.id);
        setQuarantines(details.quarantines || []);
        setSuccessMessage(`Paper contained successfully. Incident ID: ${res.incident.id}`);
        setCurrentStep('QUARANTINE_REVIEW');
      } else {
        setErrorMessage(res.error || 'Failed to report paper leak.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error executing incident containment.');
    } finally {
      setLoading(false);
    }
  };

  // Handler: Add Quarantine Item
  const handleAddQuarantine = async () => {
    if (!incidentRecord || !newQuarTargetId || !newQuarReason) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const allowlistArr = newQuarAllowlist
        ? newQuarAllowlist.split(',').map(s => s.trim()).filter(Boolean)
        : undefined;

      const res = await api.quarantineTarget({
        incidentId: incidentRecord.id,
        quarantineScope: newQuarScope,
        targetId: newQuarTargetId,
        targetName: `${newQuarScope}: ${newQuarTargetId}`,
        quarantineReason: newQuarReason,
        reviewStatus: newQuarScope === 'SOURCE_DRAFT' && allowlistArr ? 'PARTIALLY_CLEARED' : 'QUARANTINED',
        approvedAllowlist: allowlistArr,
      });

      if (res.success) {
        const details = await api.getPaperLeakIncident(incidentRecord.id);
        setQuarantines(details.quarantines || []);
        setExclusionManifest(details.manifest);
        setNewQuarTargetId('');
        setNewQuarReason('');
        setNewQuarAllowlist('');
      } else {
        setErrorMessage(res.error || 'Failed to apply quarantine.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error applying quarantine.');
    } finally {
      setLoading(false);
    }
  };

  // Handler: Approve Exclusion Manifest
  const handleApproveManifest = async () => {
    if (!exclusionManifest) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.approveExclusionManifest(exclusionManifest.id);
      if (res.success && res.manifest) {
        setExclusionManifest(res.manifest);
        // Automatically scan eligible questions for next step
        const scan = await api.scanEligibleQuestions({ incidentId: incidentRecord.id });
        setEligibleScanData(scan);
        setCurrentStep('REGENERATE_PAPER');
      } else {
        setErrorMessage(res.error || 'Failed to approve manifest.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error approving manifest.');
    } finally {
      setLoading(false);
    }
  };

  // Handler: Generate Replacement Paper
  const handleGenerateReplacement = async () => {
    if (!incidentRecord) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.generateEmergencyReplacementPaper({
        incidentId: incidentRecord.id,
      });

      if (res.success && res.replacementPaper) {
        setReplacementPaper(res.replacementPaper);
        setValidationReport(res.validationReport);
        setCurrentStep('VALIDATION_COMPARISON');
      } else {
        setErrorMessage(res.error || 'Replacement generation failed.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error during replacement paper compilation.');
    } finally {
      setLoading(false);
    }
  };

  // Handler: Approve & Cryptographically Encrypt Replacement
  const handleApproveAndEncrypt = async () => {
    if (!replacementPaper) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.approveAndEncryptReplacementPaper({
        replacementPaperId: replacementPaper.id,
        approvalReason,
      });

      if (res.success && res.replacementPaper) {
        setReplacementPaper(res.replacementPaper);
        setSuccessMessage('Replacement Paper Approved, Cryptographically Encrypted (AES-256-GCM), and Enqueued for Print Anywhere dispatch.');
        if (onRegenerationSuccess) {
          onRegenerationSuccess(res.replacementPaper);
        }
      } else {
        setErrorMessage(res.error || 'Approval failed.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error during cryptographic encryption and approval.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-rose-200 w-full max-w-4xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-linear-to-r from-rose-950 via-rose-900 to-slate-900 text-white flex items-center justify-between border-b border-rose-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30">
              <Flame className="w-5 h-5 text-rose-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg leading-tight">ZeroLeak Paper Leak Response & Emergency Regeneration</h3>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-rose-500/30 text-rose-200 border border-rose-400/30">
                  CRITICAL WORKFLOW
                </span>
              </div>
              <p className="text-xs text-rose-200/80">
                Deterministic quarantine, permanent question exclusion manifest & replacement compilation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-rose-300 hover:text-white hover:bg-rose-800/40 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Steps Progress Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 overflow-x-auto">
          <div className="flex items-center justify-between min-w-[650px] text-xs font-medium text-slate-500">
            {[
              { id: 'IDENTIFY_EXAM', label: '1. Identify Exam' },
              { id: 'REGISTER_INCIDENT', label: '2. Containment Incident' },
              { id: 'QUARANTINE_REVIEW', label: '3. Quarantine Review' },
              { id: 'EXCLUSION_MANIFEST', label: '4. Exclusion Manifest' },
              { id: 'REGENERATE_PAPER', label: '5. Regenerate Paper' },
              { id: 'VALIDATION_COMPARISON', label: '6. Validation & Summary' },
              { id: 'APPROVE_ENCRYPT', label: '7. Approve & Encrypt' },
            ].map(step => {
              const isCurrent = currentStep === step.id;
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md ${
                    isCurrent
                      ? 'bg-rose-100 text-rose-900 font-bold border border-rose-300'
                      : 'text-slate-600'
                  }`}
                >
                  <span>{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Security Action Blocked / Error</p>
                <p className="text-xs mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Workflow Status Updated</p>
                <p className="text-xs mt-0.5">{successMessage}</p>
              </div>
            </div>
          )}

          {/* STEP 1: IDENTIFY THE AFFECTED EXAMINATION */}
          {currentStep === 'IDENTIFY_EXAM' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <h4 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  Examination Metadata & Scheduled Paper Version
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block">Exam Name:</span>
                    <span className="font-bold text-slate-800">{exam?.name || exam?.title || 'University Exam'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Subject / Code:</span>
                    <span className="font-semibold text-slate-800">{exam?.subject || 'Operating Systems'} ({exam?.course_code || exam?.code || 'BTN04605'})</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Category:</span>
                    <span className="font-semibold text-slate-800">{exam?.exam_type || 'UNIVERSITY'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Scheduled Date & Time:</span>
                    <span className="font-medium text-slate-700">{exam?.exam_date || 'Today'} at {exam?.exam_time || '10:00 AM'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Authorized Centre:</span>
                    <span className="font-medium text-slate-700">{exam?.centre_code || 'CTR-101'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Approved Copy Quota:</span>
                    <span className="font-medium text-slate-700">{exam?.max_copies || 100} copies</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Affected Paper Version to Invalidate
                </label>
                <select
                  value={selectedVersion}
                  onChange={e => setSelectedVersion(e.target.value)}
                  className="w-full text-sm rounded-lg border-slate-300 shadow-xs focus:border-rose-500 focus:ring-rose-500"
                >
                  <option value={exam?.version_code || 'v1'}>{exam?.version_code || 'v1'} (Current Master Version)</option>
                  <option value="v1">v1 (Initial Compilation)</option>
                  <option value="SET-A-FINAL">SET-A-FINAL</option>
                  <option value="SET-B-FINAL">SET-B-FINAL</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Selecting this version will immediately suspend it from normal printing and decryption upon incident registration.
                </p>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentStep('REGISTER_INCIDENT')}
                  className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-semibold hover:bg-rose-700 flex items-center gap-2"
                >
                  Proceed to Register Leak Incident
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: REGISTER LEAK INCIDENT & CONTAINMENT */}
          {currentStep === 'REGISTER_INCIDENT' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900">
                <strong>Immediate Containment Notice:</strong> Submitting this report will immediately mark paper {selectedVersion} as COMPROMISED, suspend all queued print jobs in destination centres, and revoke temporary viewing privileges.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Incident Title</label>
                  <input
                    type="text"
                    value={incidentTitle}
                    onChange={e => setIncidentTitle(e.target.value)}
                    className="w-full text-xs rounded-lg border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Severity & Confidence</label>
                  <div className="flex gap-2">
                    <select
                      value={leakSeverity}
                      onChange={e => setLeakSeverity(e.target.value as any)}
                      className="w-1/2 text-xs rounded-lg border-slate-300"
                    >
                      <option value="MEDIUM">Medium Severity</option>
                      <option value="HIGH">High Severity</option>
                      <option value="CRITICAL">Critical Severity</option>
                    </select>
                    <label className="w-1/2 flex items-center gap-2 text-xs text-slate-700 border border-slate-200 rounded-lg px-2 bg-slate-50">
                      <input
                        type="checkbox"
                        checked={isConfirmedLeak}
                        onChange={e => setIsConfirmedLeak(e.target.checked)}
                      />
                      <span>Confirmed Leak</span>
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description & Evidence Details</label>
                <textarea
                  rows={2}
                  value={incidentDescription}
                  onChange={e => setIncidentDescription(e.target.value)}
                  className="w-full text-xs rounded-lg border-slate-300"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Known Leaked Questions (comma separated)</label>
                  <input
                    type="text"
                    placeholder="e.g. Q.2, Q.4(b), Q.7"
                    value={leakedQuestionNumbers}
                    onChange={e => setLeakedQuestionNumbers(e.target.value)}
                    className="w-full text-xs rounded-lg border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Watermark / Copy ID (if spotted)</label>
                  <input
                    type="text"
                    placeholder="e.g. CPY-CTR101-PRN01-0004-9AF2"
                    value={watermarkReference}
                    onChange={e => setWatermarkReference(e.target.value)}
                    className="w-full text-xs rounded-lg border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Emergency Regeneration</label>
                <input
                  type="text"
                  value={regenerationReason}
                  onChange={e => setRegenerationReason(e.target.value)}
                  className="w-full text-xs rounded-lg border-slate-300"
                />
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentStep('IDENTIFY_EXAM')}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleRegisterIncident}
                  className="px-5 py-2 bg-rose-600 text-white rounded-lg text-sm font-semibold hover:bg-rose-700 flex items-center gap-2"
                >
                  {loading ? 'Applying Containment...' : 'Register Incident & Contain Paper'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: QUESTION QUARANTINE REVIEW */}
          {currentStep === 'QUARANTINE_REVIEW' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-800">Question Quarantine Registry (Incident: {incidentRecord?.id})</h4>
                  <p className="text-xs text-slate-500">Quarantine specific questions, entire question pools, or entire source drafts.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep('EXCLUSION_MANIFEST')}
                  className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 flex items-center gap-1.5"
                >
                  Proceed to Manifest Review <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Add Quarantine Box */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                <span className="font-semibold text-slate-800 block">Add Containment Scope</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-slate-500 block mb-1">Scope Level</label>
                    <select
                      value={newQuarScope}
                      onChange={e => setNewQuarScope(e.target.value as any)}
                      className="w-full text-xs rounded-lg border-slate-300"
                    >
                      <option value="INDIVIDUAL_QUESTION">Individual Question</option>
                      <option value="QUESTION_POOL">Entire Question Pool</option>
                      <option value="SOURCE_DRAFT">Entire Source Draft</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1">Target ID / Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Q-104, POOL-MATH, or DRAFT-UNI-01"
                      value={newQuarTargetId}
                      onChange={e => setNewQuarTargetId(e.target.value)}
                      className="w-full text-xs rounded-lg border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1">Quarantine Reason</label>
                    <input
                      type="text"
                      placeholder="Compromise reason"
                      value={newQuarReason}
                      onChange={e => setNewQuarReason(e.target.value)}
                      className="w-full text-xs rounded-lg border-slate-300"
                    />
                  </div>
                </div>

                {newQuarScope === 'SOURCE_DRAFT' && (
                  <div>
                    <label className="text-slate-500 block mb-1">Approved Question Allowlist (Optional partial clearance, e.g. Q-1, Q-3, Q-5)</label>
                    <input
                      type="text"
                      placeholder="Leave blank to quarantine entire draft. Enter question IDs to partially clear."
                      value={newQuarAllowlist}
                      onChange={e => setNewQuarAllowlist(e.target.value)}
                      className="w-full text-xs rounded-lg border-slate-300"
                    />
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={loading || !newQuarTargetId || !newQuarReason}
                    onClick={handleAddQuarantine}
                    className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700"
                  >
                    + Enforce Quarantine
                  </button>
                </div>
              </div>

              {/* Quarantined List Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left divide-y divide-slate-200">
                  <thead className="bg-slate-100 font-semibold text-slate-700">
                    <tr>
                      <th className="p-2.5">Scope</th>
                      <th className="p-2.5">Target</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Reason</th>
                      <th className="p-2.5">Quarantined By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {quarantines.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-400">
                          No quarantine records active.
                        </td>
                      </tr>
                    ) : (
                      quarantines.map((q: any) => (
                        <tr key={q.id}>
                          <td className="p-2.5 font-mono">{q.quarantine_scope || q.quarantineScope}</td>
                          <td className="p-2.5 font-bold text-slate-800">{q.target_id || q.targetId}</td>
                          <td className="p-2.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                              {q.review_status || q.reviewStatus}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-600">{q.quarantine_reason || q.quarantineReason}</td>
                          <td className="p-2.5 text-slate-500">{q.quarantined_by_name || q.quarantinedByName || 'Manager'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 4: QUESTION EXCLUSION MANIFEST */}
          {currentStep === 'EXCLUSION_MANIFEST' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-indigo-600" />
                    <h4 className="font-bold text-sm text-slate-800">
                      Permanent Question Exclusion Manifest (Rev #{exclusionManifest?.revision || 1})
                    </h4>
                  </div>
                  <span className={`px-2.5 py-0.5 text-xs font-bold rounded-md ${
                    exclusionManifest?.approvalStatus === 'APPROVED'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}>
                    {exclusionManifest?.approvalStatus || 'DRAFT'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">Manifest ID:</span>
                    <span className="font-mono text-slate-700">{exclusionManifest?.id || 'EXCL-MAN-PENDING'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Leaked Question IDs:</span>
                    <span className="font-bold text-rose-700">
                      {Array.isArray(exclusionManifest?.leakedQuestionIds)
                        ? exclusionManifest.leakedQuestionIds.length
                        : 0} excluded
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Quarantined Drafts:</span>
                    <span className="font-bold text-rose-700">
                      {Array.isArray(exclusionManifest?.quarantinedDraftIds)
                        ? exclusionManifest.quarantinedDraftIds.length
                        : 0} drafts
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Similarity Gate:</span>
                    <span className="font-semibold text-slate-700">&ge; 75% Jaccard Overlap</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentStep('QUARANTINE_REVIEW')}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50"
                >
                  <ArrowLeft className="w-4 h-4 inline mr-1" /> Adjust Quarantine
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleApproveManifest}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 flex items-center gap-2"
                >
                  {loading ? 'Approving Manifest...' : 'Approve Manifest & Scan Clean Drafts'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: REGENERATE PAPER FROM CLEAN POOL */}
          {currentStep === 'REGENERATE_PAPER' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 space-y-2">
                <h4 className="font-bold text-sm text-indigo-950 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  Eligible Clean Question Pool Analysis
                </h4>
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-indigo-700 block">Eligible Clean Questions:</span>
                    <span className="text-xl font-bold text-emerald-700">
                      {eligibleScanData?.breakdown?.eligibleCount || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-indigo-700 block">Excluded Questions:</span>
                    <span className="text-xl font-bold text-rose-700">
                      {eligibleScanData?.breakdown?.excludedCount || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-indigo-700 block">Minimum Required:</span>
                    <span className="text-xl font-bold text-indigo-900">
                      {exam.exam_type === 'COMPETITIVE' ? '50 Qs (100 Marks)' : '25 Qs (70 Marks)'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 border border-slate-200 rounded-xl space-y-2 text-xs">
                <p className="font-semibold text-slate-800">Generation Algorithm Protocol:</p>
                <ul className="list-disc list-inside text-slate-600 space-y-1">
                  <li>Deterministic candidate selection enforcing Exclusion Manifest Rev #{exclusionManifest?.revision}.</li>
                  <li>Preserves official Solapur University 70-mark exact section pattern / Competitive 100-mark blueprint.</li>
                  <li>Every selected question is stamped with unique source draft provenance and text fingerprint.</li>
                  <li>Zero reuse of quarantined or excluded question IDs.</li>
                </ul>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentStep('EXCLUSION_MANIFEST')}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50"
                >
                  <ArrowLeft className="w-4 h-4 inline mr-1" /> Back
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleGenerateReplacement}
                  className="px-5 py-2 bg-rose-600 text-white rounded-lg text-sm font-semibold hover:bg-rose-700 flex items-center gap-2"
                >
                  {loading ? 'Compiling Replacement Paper...' : 'Compile Emergency Replacement Paper'}
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: VALIDATION REPORT & COMPARISON SUMMARY */}
          {currentStep === 'VALIDATION_COMPARISON' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-emerald-950 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    Deterministic Validation Status: {validationReport?.isValid ? 'PASSED' : 'FAILED'}
                  </h4>
                  <p className="text-xs text-emerald-700">
                    Replacement Version Code: <strong>{replacementPaper?.replacementVersionCode}</strong>
                  </p>
                </div>
                <span className="px-3 py-1 bg-emerald-600 text-white font-bold rounded-lg text-xs">
                  {replacementPaper?.totalMarks || 70} MARKS VERIFIED
                </span>
              </div>

              {/* Comparison Summary Box */}
              <div className="p-4 border border-slate-200 rounded-xl space-y-3 text-xs bg-slate-50">
                <h5 className="font-bold text-slate-800">Original vs Replacement Paper Comparison</h5>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-slate-500 block">Original Version:</span>
                    <span className="font-mono text-slate-700">{incidentRecord?.paperVersion || 'v1'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Replacement Version:</span>
                    <span className="font-mono font-bold text-emerald-800">{replacementPaper?.replacementVersionCode}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Compromised Questions Excluded:</span>
                    <span className="font-bold text-rose-700">{eligibleScanData?.breakdown?.excludedCount || 0}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Clean Questions Selected:</span>
                    <span className="font-bold text-emerald-700">{replacementPaper?.selectedQuestions?.length || 25}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentStep('REGENERATE_PAPER')}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50"
                >
                  <ArrowLeft className="w-4 h-4 inline mr-1" /> Recompile
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep('APPROVE_ENCRYPT')}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 flex items-center gap-2"
                >
                  Proceed to Approval & Encryption
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 7: APPROVE & CRYPTOGRAPHICALLY ENCRYPT */}
          {currentStep === 'APPROVE_ENCRYPT' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <Key className="w-4 h-4 text-amber-600" />
                  Authorization & Cryptographic Key Re-Sealing (AES-256-GCM)
                </h4>
                <p className="text-xs text-slate-600">
                  Separation of duties enforced. Approving this replacement will generate an authenticated AES-256-GCM envelope, update master examination versions, and route the replacement paper into the Print Anywhere dispatch registry.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Approval Justification</label>
                  <input
                    type="text"
                    value={approvalReason}
                    onChange={e => setApprovalReason(e.target.value)}
                    className="w-full text-xs rounded-lg border-slate-300"
                  />
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentStep('VALIDATION_COMPARISON')}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50"
                >
                  <ArrowLeft className="w-4 h-4 inline mr-1" /> Back
                </button>
                <button
                  type="button"
                  disabled={loading || replacementPaper?.status === 'ENCRYPTED'}
                  onClick={handleApproveAndEncrypt}
                  className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 flex items-center gap-2 shadow-md"
                >
                  <Lock className="w-4 h-4" />
                  {loading
                    ? 'Encrypting Envelope...'
                    : replacementPaper?.status === 'ENCRYPTED'
                    ? 'Replacement Paper Sealed'
                    : 'Approve & Encrypt Replacement'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

