import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Key,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Send,
  FileCheck,
  FileText,
  XCircle,
  HelpCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Printer,
} from 'lucide-react';
import { api } from '../../api';
import { User } from '../../types';

interface ThresholdEncryptionAndEmergencyPanelProps {
  examType: 'COMPETITIVE' | 'UNIVERSITY';
  paperId: string;
  paperVersion?: string;
  examId?: string;
  currentUser: User | null;
  onPaperEncrypted?: (encMeta: any) => void;
  onOpenViewOnceModal?: () => void;
}

export const ThresholdEncryptionAndEmergencyPanel: React.FC<ThresholdEncryptionAndEmergencyPanelProps> = ({
  examType,
  paperId,
  paperVersion = 'v1',
  examId,
  currentUser,
  onPaperEncrypted,
  onOpenViewOnceModal,
}) => {
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Status state from backend
  const [statusData, setStatusData] = useState<{
    paperId: string;
    paperVersion: string;
    isVerified: boolean;
    isEncrypted: boolean;
    verificationStatus: 'VERIFIED' | 'UNVERIFIED';
    encryptionStatus: 'ENCRYPTED' | 'UNENCRYPTED';
    encryptedAt?: string | null;
    encryptionAlgorithm?: string | null;
    orgOwnerRequest: any | null;
    auditorRequest: any | null;
    examManagerRequest: any | null;
    canEncrypt: boolean;
    examManagerVerified?: boolean;
    examManagerKeyAttempts?: { failedAttempts: number; remainingAttempts: number; isLocked: boolean };
  } | null>(null);

  // Exam Manager Key input & verification state (Strict 3-attempt lockout)
  const [examManagerKeyInput, setExamManagerKeyInput] = useState('');
  const [showExamManagerKey, setShowExamManagerKey] = useState(false);
  const [isVerifyingExamManagerKey, setIsVerifyingExamManagerKey] = useState(false);
  const [examManagerKeyAttempts, setExamManagerKeyAttempts] = useState<{
    failedAttempts: number;
    remainingAttempts: number;
    isLocked: boolean;
  }>({
    failedAttempts: 0,
    remainingAttempts: 3,
    isLocked: false,
  });

  // Emergency Case state
  const [emergencyCases, setEmergencyCases] = useState<any[]>([]);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState('');
  const [selectedCaseForDecrypt, setSelectedCaseForDecrypt] = useState<any | null>(null);
  const [decryptedEmergencyPaper, setDecryptedEmergencyPaper] = useState<any | null>(null);

  // Admin Key Lockout Recovery state
  const [showAdminResetModal, setShowAdminResetModal] = useState(false);
  const [adminResetReason, setAdminResetReason] = useState('');
  const [isResettingLock, setIsResettingLock] = useState(false);

  // Direct Paper Verification state
  const [showVerifyConfirmModal, setShowVerifyConfirmModal] = useState(false);
  const [directVerifyNotes, setDirectVerifyNotes] = useState('Paper questions, markings, syllabus alignment, and sections fully verified by Exam Manager.');
  const [isVerifyingDirect, setIsVerifyingDirect] = useState(false);

  // Fetch status from server
  const fetchStatus = useCallback(async () => {
    if (!paperId) return;
    try {
      const res = await api.getThresholdStatus(examType, paperId, paperVersion);
      setStatusData(res);
      if ((res as any).examManagerKeyAttempts) {
        setExamManagerKeyAttempts({
          failedAttempts: Number((res as any).examManagerKeyAttempts.failedAttempts ?? 0),
          remainingAttempts: Number((res as any).examManagerKeyAttempts.remainingAttempts ?? 3),
          isLocked: Boolean((res as any).examManagerKeyAttempts.isLocked),
        });
      }
      const casesRes = await api.getEmergencyCases(examType, paperId);
      setEmergencyCases(casesRes.cases || []);
    } catch (err: any) {
      console.warn('Could not fetch threshold status:', err);
    }
  }, [examType, paperId, paperVersion]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 8000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Handle Request Custodian Authorization
  const handleRequestAuth = async (custodianRole: 'ORG_OWNER' | 'AUDITOR' | 'EXAM_MANAGER') => {
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await api.requestThresholdAuthorization({
        examType,
        paperId,
        paperVersion,
        custodianRole,
        requestType: 'ENCRYPTION',
      });
      if (res.success) {
        const roleLabel =
          custodianRole === 'ORG_OWNER'
            ? 'Organization Owner'
            : custodianRole === 'AUDITOR'
            ? 'Security Auditor'
            : 'Examination Manager';
        setActionMessage({
          type: 'success',
          text: `Authorization request dispatched to ${roleLabel} (Request ID: ${res.requestId?.substring(0, 8)}...).`,
        });
        fetchStatus();
      } else {
        setActionMessage({ type: 'error', text: res.error || 'Request failed.' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Network error requesting authorization.' });
    } finally {
      setLoading(false);
    }
  };

  const handleRejectAuth = (requestId: string) => {
    const reason = window.prompt('Provide a rejection reason (at least 10 characters):');
    if (reason === null) return;
    if (reason.trim().length < 10) {
      setActionMessage({ type: 'error', text: 'A rejection reason of at least 10 characters is required.' });
      return;
    }
    void handleApproveAuth(requestId, 'REJECTED', reason.trim());
  };

  // Handle Approve/Reject Authorization (by Org Owner or Auditor)
  const handleApproveAuth = async (
    requestId: string,
    decision: 'APPROVED' | 'REJECTED',
    rejectionReason?: string
  ) => {
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await api.approveThresholdAuthorization({ requestId, decision, rejectionReason });
      if (res.success) {
        setActionMessage({
          type: 'success',
          text: `Authorization successfully ${decision.toLowerCase()} for request.`,
        });
        fetchStatus();
      } else {
        setActionMessage({ type: 'error', text: res.error || 'Failed to process authorization.' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Error processing authorization.' });
    } finally {
      setLoading(false);
    }
  };

  // Handle Direct Paper Verification by Exam Manager
  const handleDirectVerifyPaper = async () => {
    setIsVerifyingDirect(true);
    setActionMessage(null);
    try {
      const res = await api.verifyPaperOnce({
        examType,
        paperId,
        paperVersion,
        verificationNotes: directVerifyNotes,
      });
      if (res.success) {
        setActionMessage({
          type: 'success',
          text: 'Paper verification permanently recorded! You can now proceed to custodian authorization.',
        });
        setShowVerifyConfirmModal(false);
        fetchStatus();
      } else {
        setActionMessage({
          type: 'error',
          text: res.error || 'Paper verification failed.',
        });
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Error recording paper verification.',
      });
    } finally {
      setIsVerifyingDirect(false);
    }
  };

  // Handle Verify Examination Manager Key (with server-side 3-attempt lockout)
  const handleVerifyExamManagerKey = async () => {
    if (!examManagerKeyInput.trim()) {
      setActionMessage({ type: 'error', text: 'Please enter the Exam Manager Key.' });
      return;
    }
    setIsVerifyingExamManagerKey(true);
    setActionMessage(null);
    try {
      const res = await api.verifyExamManagerKey({
        examType,
        paperId,
        paperVersion,
        key: examManagerKeyInput.trim(),
      });
      if (res.success) {
        setActionMessage({
          type: 'success',
          text: res.message || 'Examination Manager Key successfully verified and authorized.',
        });
        setExamManagerKeyInput('');
        setExamManagerKeyAttempts({
          failedAttempts: Number(res.failedAttempts ?? examManagerKeyAttempts.failedAttempts),
          remainingAttempts: Number(res.remainingAttempts ?? examManagerKeyAttempts.remainingAttempts),
          isLocked: false,
        });
        fetchStatus();
      } else {
        const remaining = res.remainingAttempts ?? 0;
        setExamManagerKeyAttempts({
          failedAttempts: 3 - remaining,
          remainingAttempts: remaining,
          isLocked: Boolean(res.isLocked),
        });
        setActionMessage({
          type: 'error',
          text: res.error || `Verification failed. ${remaining} attempts remaining.`,
        });
        fetchStatus();
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Network error verifying Exam Manager key.' });
      fetchStatus();
    } finally {
      setIsVerifyingExamManagerKey(false);
    }
  };

  // Handle Admin Reset for Locked Exam Manager Key
  const handleAdminResetExamManagerLock = async () => {
    if (!adminResetReason.trim() || adminResetReason.trim().length < 10) {
      setActionMessage({
        type: 'error',
        text: 'An operational recovery reason of at least 10 characters is required to reset key lockout.',
      });
      return;
    }
    setIsResettingLock(true);
    setActionMessage(null);
    try {
      const res = await api.resetExamManagerKeyLock({
        paperId,
        reason: adminResetReason.trim(),
      });
      if (res.success) {
        setActionMessage({
          type: 'success',
          text: res.message || 'Exam Manager key lockout successfully reset.',
        });
        setShowAdminResetModal(false);
        setAdminResetReason('');
        setExamManagerKeyAttempts({ failedAttempts: 0, remainingAttempts: 3, isLocked: false });
        fetchStatus();
      } else {
        setActionMessage({ type: 'error', text: res.error || 'Failed to reset lockout.' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Network error resetting key lockout.' });
    } finally {
      setIsResettingLock(false);
    }
  };

  // Handle One-Time Encryption
  const handleEncryptPaper = async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await api.encryptPaperThreshold({
        examType,
        paperId,
        paperVersion,
      });
      if (res.success) {
        setActionMessage({
          type: 'success',
          text: `Paper version ${res.paperVersion} permanently encrypted with AES-256-GCM. 2-of-3 Shamir threshold secret shares generated and securely wrapped.`,
        });
        fetchStatus();
        if (onPaperEncrypted) {
          onPaperEncrypted(res);
        }
      } else {
        setActionMessage({ type: 'error', text: res.error || 'Encryption failed.' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Encryption request failed.' });
    } finally {
      setLoading(false);
    }
  };

  // Handle Create Emergency Case
  const handleCreateEmergencyCase = async () => {
    if (!emergencyReason || emergencyReason.trim().length < 10) {
      setActionMessage({ type: 'error', text: 'Please provide a detailed justification (at least 10 characters).' });
      return;
    }
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await api.createEmergencyCase({
        examType,
        paperId,
        paperVersion,
        reason: emergencyReason,
        validityMinutes: 120,
      });
      if (res.success) {
        setActionMessage({
          type: 'success',
          text: `Emergency Case ${res.caseNumber} initiated. Awaiting 2 custodian approvals.`,
        });
        setShowEmergencyModal(false);
        setEmergencyReason('');
        fetchStatus();
      } else {
        setActionMessage({ type: 'error', text: res.error || 'Failed to create emergency case.' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Error creating emergency case.' });
    } finally {
      setLoading(false);
    }
  };

  // Handle Approve Emergency Case
  const handleApproveEmergencyCase = async (caseNumber: string) => {
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await api.approveEmergencyCase({ caseNumber });
      if (res.success) {
        setActionMessage({
          type: 'success',
          text: `Emergency approval recorded (${res.approvedCount}/2 approvals). ${res.isThresholdMet ? 'Threshold reached! Emergency decryption can now proceed.' : '1 more approval needed.'}`,
        });
        fetchStatus();
      } else {
        setActionMessage({ type: 'error', text: res.error || 'Approval failed.' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Error approving emergency case.' });
    } finally {
      setLoading(false);
    }
  };

  // Handle Execute 2-of-3 Emergency Decryption
  const handleExecuteEmergencyDecrypt = async (caseNumber: string) => {
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await api.executeEmergencyDecryption({ caseNumber });
      if (res.success) {
        setDecryptedEmergencyPaper(res.decryptedPaper);
        setSelectedCaseForDecrypt(caseNumber);
        setActionMessage({
          type: 'success',
          text: '2-of-3 threshold key reconstructed in backend memory. Paper decrypted for emergency audit inspection.',
        });
        fetchStatus();
      } else {
        setActionMessage({ type: 'error', text: res.error || 'Decryption failed.' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Emergency decryption failed.' });
    } finally {
      setLoading(false);
    }
  };

  const isVerified = statusData?.isVerified ?? false;
  const isEncrypted = statusData?.isEncrypted ?? false;
  const orgOwnerReq = statusData?.orgOwnerRequest;
  const auditorReq = statusData?.auditorRequest;
  const examManagerReq = statusData?.examManagerRequest;

  const isOrgOwnerApproved = orgOwnerReq?.status === 'APPROVED';
  const isExamManagerApproved = examManagerReq?.status === 'APPROVED' || Boolean(statusData?.examManagerVerified);
  const isAuditorApproved = auditorReq?.status === 'APPROVED';

  const approvedRolesList: string[] = [];
  if (isOrgOwnerApproved) approvedRolesList.push('Organization Owner');
  if (isExamManagerApproved) approvedRolesList.push('Examination Manager');
  if (isAuditorApproved) approvedRolesList.push('Security Auditor');

  const pendingRolesList: string[] = [];
  if (!isOrgOwnerApproved) pendingRolesList.push('Organization Owner');
  if (!isExamManagerApproved) pendingRolesList.push('Examination Manager');
  if (!isAuditorApproved) pendingRolesList.push('Security Auditor');

  const approvedCount = approvedRolesList.length;
  const isThresholdMet = approvedCount >= 2;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-8 shadow-2xl text-slate-100">
      {/* Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-teal-500/20 border border-indigo-500/30 text-indigo-400">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              One-Time Verification &amp; 2-of-3 Threshold Authorization
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                {examType}
              </span>
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Paper ID: <span className="text-indigo-300 font-bold">{paperId}</span> &bull; Version: <span className="text-teal-300 font-bold">{paperVersion}</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchStatus}
          disabled={loading}
          className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Action Notification Strip */}
      {actionMessage && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-start gap-3 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200'
              : actionMessage.type === 'error'
              ? 'bg-rose-950/80 border-rose-800 text-rose-200'
              : 'bg-indigo-950/80 border-indigo-800 text-indigo-200'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : actionMessage.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          ) : (
            <Clock className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          )}
          <span className="leading-relaxed font-medium">{actionMessage.text}</span>
        </div>
      )}

      {/* Grid: Status Cards */}
      {(() => {
        const isExamManagerApproved = statusData?.examManagerRequest?.status === 'APPROVED' || Boolean(statusData?.examManagerVerified);

        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Step 1: Verification Status */}
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4.5 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Step 1: Verification</span>
                    {isVerified ? (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                        VERIFIED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                        UNVERIFIED
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-2">
                    {isVerified
                      ? 'Paper verification completed. One-time preview consumed.'
                      : 'Paper must be reviewed once before threshold encryption.'}
                  </p>
                </div>
                {!isVerified && !isEncrypted && (
                  <button
                    type="button"
                    onClick={onOpenViewOnceModal || (() => setShowVerifyConfirmModal(true))}
                    className="w-full mt-2 py-2 px-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>{onOpenViewOnceModal ? 'View Paper Once' : 'Verify Paper Once (Exam Manager)'}</span>
                  </button>
                )}
              </div>

              {/* Custodian #1: Org Owner Auth Status */}
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4.5 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Custodian #1: Owner</span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                        orgOwnerReq?.status === 'APPROVED'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : orgOwnerReq?.status === 'PENDING'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {orgOwnerReq?.status || 'NOT_REQUESTED'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Share Index: <span className="font-mono text-indigo-300 font-bold">#1 (Org Owner)</span>
                  </p>
                </div>
                {currentUser?.role === 'ORG_OWNER' && orgOwnerReq?.status === 'PENDING' && (
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleApproveAuth(orgOwnerReq.id, 'APPROVED')}
                      className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleRejectAuth(orgOwnerReq.id)}
                      className="py-1.5 px-3 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-bold text-xs cursor-pointer transition-colors disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>

              {/* Custodian #2: Examination Manager Share with Key Entry */}
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4.5 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Custodian #2: Manager</span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                        isExamManagerApproved
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : examManagerKeyAttempts.isLocked
                          ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      }`}
                    >
                      {isExamManagerApproved
                        ? 'APPROVED'
                        : examManagerKeyAttempts.isLocked
                        ? 'LOCKED'
                        : 'KEY_REQUIRED'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Share Index: <span className="font-mono text-purple-300 font-bold">#2 (Exam Manager)</span>
                  </p>
                </div>

                {isExamManagerApproved ? (
                  <div className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-[11px] text-emerald-300 flex items-center gap-1.5 mt-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Exam Manager Authorized</span>
                  </div>
                ) : examManagerKeyAttempts.isLocked ? (
                  <div className="space-y-2 mt-2">
                    <div className="p-2 rounded-xl bg-rose-950/40 border border-rose-800/50 text-[11px] text-rose-300 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span>Key Locked (3 failed attempts)</span>
                    </div>
                    {['ORG_OWNER', 'AUDITOR'].includes(currentUser?.role || '') && (
                      <button
                        type="button"
                        onClick={() => setShowAdminResetModal(true)}
                        className="w-full py-1.5 px-2.5 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                      >
                        <Unlock className="w-3 h-3" />
                        <span>Admin Unlock Key</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    <div className="space-y-1.5">
                      <div className="relative">
                        <input
                          type={showExamManagerKey ? 'text' : 'password'}
                          value={examManagerKeyInput}
                          onChange={e => setExamManagerKeyInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleVerifyExamManagerKey();
                          }}
                          placeholder="Enter Exam Manager Key / Password"
                          disabled={isVerifyingExamManagerKey || loading}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 pr-7 text-[11px] text-white placeholder-slate-500 font-mono focus:border-indigo-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowExamManagerKey(!showExamManagerKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                          title={showExamManagerKey ? 'Hide key' : 'Show key'}
                        >
                          {showExamManagerKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <span className="text-[10px] text-slate-400 font-mono">
                          Attempts: <strong className="text-amber-400">{examManagerKeyAttempts.remainingAttempts}/3</strong>
                        </span>
                        <button
                          type="button"
                          disabled={isVerifyingExamManagerKey || loading || !examManagerKeyInput.trim()}
                          onClick={handleVerifyExamManagerKey}
                          className="py-1 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                        >
                          <Key className={`w-3 h-3 ${isVerifyingExamManagerKey ? 'animate-spin' : ''}`} />
                          <span>Verify Key</span>
                        </button>
                      </div>
                    </div>
                    {currentUser?.role === 'EXAM_MANAGER' && examManagerReq?.status === 'PENDING' && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleApproveAuth(examManagerReq.id, 'APPROVED')}
                          className="flex-1 py-1.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleRejectAuth(examManagerReq.id)}
                          className="py-1.5 px-3 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-bold text-xs cursor-pointer transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Custodian #3: Auditor Auth Status */}
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4.5 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Custodian #3: Auditor</span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                        auditorReq?.status === 'APPROVED'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : auditorReq?.status === 'PENDING'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {auditorReq?.status || 'NOT_REQUESTED'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Share Index: <span className="font-mono text-teal-300 font-bold">#3 (Security Auditor)</span>
                  </p>
                </div>
                {currentUser?.role === 'AUDITOR' && auditorReq?.status === 'PENDING' && (
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleApproveAuth(auditorReq.id, 'APPROVED')}
                      className="flex-1 py-1.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleRejectAuth(auditorReq.id)}
                      className="py-1.5 px-3 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-bold text-xs cursor-pointer transition-colors disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>

              {/* Step 5: Encryption Status */}
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4.5 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">AES-256-GCM Status</span>
                    {isEncrypted ? (
                      <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-[10px] font-bold flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        <span>ENCRYPTED</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-bold flex items-center gap-1">
                        <Unlock className="w-3 h-3" />
                        <span>UNENCRYPTED</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    {isEncrypted
                      ? 'AES-256-GCM ciphertext sealed. Previews permanently disabled.'
                      : isVerified && isThresholdMet
                      ? `Paper verified & 2-of-3 threshold met (${approvedCount}/2 approved). Ready for encryption.`
                      : !isVerified
                      ? 'Step 1 incomplete: Exam Manager must complete Paper Verification first.'
                      : `Step 2 incomplete: Requires at least 2 custodian approvals (${approvedCount}/2 approved).`}
                  </p>
                </div>
              </div>
            </div>

            {/* Custodian Request & Encryption Controls (for Exam Manager / Org Owner) */}
            {!isEncrypted && (
              <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-400" />
                    <span>Custodian Authorizations &amp; One-Time Encryption Actions</span>
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    Approved: <strong className={isThresholdMet ? 'text-emerald-400' : 'text-amber-400'}>{approvedCount}/2 required</strong> (Org Owner, Exam Manager, Auditor)
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  {/* Request Org Owner Authorization */}
                  <button
                    type="button"
                    disabled={loading || isOrgOwnerApproved}
                    onClick={() => handleRequestAuth('ORG_OWNER')}
                    className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                      isOrgOwnerApproved
                        ? 'bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 cursor-not-allowed'
                        : orgOwnerReq?.status === 'PENDING'
                        ? 'bg-amber-950/50 border border-amber-800/60 text-amber-300'
                        : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5 text-indigo-400" />
                    <span>
                      {isOrgOwnerApproved
                        ? 'Org Owner Approved'
                        : orgOwnerReq?.status === 'PENDING'
                        ? 'Org Owner Pending'
                        : 'Request Org Owner Authorization'}
                    </span>
                  </button>

                  {/* Request Exam Manager Authorization */}
                  <button
                    type="button"
                    disabled={loading || isExamManagerApproved}
                    onClick={() => handleRequestAuth('EXAM_MANAGER')}
                    className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                      isExamManagerApproved
                        ? 'bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 cursor-not-allowed'
                        : examManagerReq?.status === 'PENDING'
                        ? 'bg-amber-950/50 border border-amber-800/60 text-amber-300'
                        : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5 text-purple-400" />
                    <span>
                      {isExamManagerApproved
                        ? 'Exam Manager Approved'
                        : examManagerReq?.status === 'PENDING'
                        ? 'Exam Manager Pending'
                        : 'Request Manager Authorization'}
                    </span>
                  </button>

                  {/* Request Auditor Authorization */}
                  <button
                    type="button"
                    disabled={loading || isAuditorApproved}
                    onClick={() => handleRequestAuth('AUDITOR')}
                    className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                      isAuditorApproved
                        ? 'bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 cursor-not-allowed'
                        : auditorReq?.status === 'PENDING'
                        ? 'bg-amber-950/50 border border-amber-800/60 text-amber-300'
                        : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5 text-teal-400" />
                    <span>
                      {isAuditorApproved
                        ? 'Auditor Approved'
                        : auditorReq?.status === 'PENDING'
                        ? 'Auditor Pending'
                        : 'Request Auditor Authorization'}
                    </span>
                  </button>

                  {/* Encrypt Paper Once Button */}
                  <button
                    type="button"
                    disabled={loading || !isVerified || !isThresholdMet}
                    onClick={handleEncryptPaper}
                    className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer ml-auto ${
                      !isVerified || !isThresholdMet
                        ? 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-500/20'
                    }`}
                    title={
                      !isVerified
                        ? 'Paper must be viewed once for verification before encryption'
                        : !isThresholdMet
                        ? `Custodian authorization threshold not satisfied (${approvedCount}/2 approved). Awaiting: ${pendingRolesList.join(' or ')}`
                        : 'Encrypt Paper Once with AES-256-GCM and 2-of-3 Shamir threshold secret shares'
                    }
                  >
                    <Lock className="w-4 h-4" />
                    <span>{loading ? 'Encrypting Paper...' : 'Encrypt Paper Once'}</span>
                  </button>
                </div>

                {(!isVerified || !isThresholdMet) ? (
                  <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs flex items-start gap-3 mt-3">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-bold text-amber-200">
                        Action Blocked &mdash; Pre-conditions Not Satisfied:
                      </div>
                      {!isVerified && (
                        <div>
                          &bull; <strong>Paper Verification Pending:</strong> Examination Manager must complete one-time paper verification before encryption can occur.
                        </div>
                      )}
                      {!isThresholdMet && (
                        <div>
                          &bull; <strong>2-of-3 Custodian Threshold Incomplete:</strong> Currently <strong>{approvedCount} of 2</strong> required approvals granted ({approvedRolesList.length > 0 ? approvedRolesList.join(', ') : 'None'}). Next action required from: <strong>{pendingRolesList.join(' or ')}</strong>.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2.5 mt-3">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>
                      <strong>Ready for Encryption:</strong> Paper is verified and {approvedCount}-of-3 custodian threshold satisfied ({approvedRolesList.join(', ')}). Click &ldquo;Encrypt Paper Once&rdquo; to seal the paper with AES-256-GCM.
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        );
      })()}

      {/* Post-Encryption Status & Emergency Case Section */}
      {isEncrypted && (
        <div className="space-y-6">
          <div className="bg-slate-950/80 border border-emerald-500/30 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Paper Cryptographically Sealed (AES-256-GCM)</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Plaintext questions and distribution data purged from storage. Ordinary viewing is permanently disabled.
                </p>
                <div className="flex items-center gap-3 mt-2 text-[11px] font-mono text-slate-400">
                  <span>Encrypted At: <strong className="text-indigo-300">{statusData?.encryptedAt || 'Recorded'}</strong></span>
                  <span>&bull;</span>
                  <span>Algorithm: <strong className="text-teal-300">AES-256-GCM (2-of-3 SSS)</strong></span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowEmergencyModal(true)}
              className="px-4 py-2.5 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-900/30 transition-all shrink-0"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Create 2-of-3 Emergency Case</span>
            </button>
          </div>

          {/* Emergency Cases List */}
          {emergencyCases.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Active &amp; Historical Emergency Decryption Cases</span>
              </h4>

              <div className="space-y-2">
                {emergencyCases.map((c) => {
                  const approvals = c.approvals || [];
                  const isThresholdMet = approvals.length >= 2;
                  const alreadyApprovedByCurrent = currentUser && approvals.some((a: any) => a.custodianUserId === currentUser.id);

                  return (
                    <div
                      key={c.id}
                      className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-indigo-300">{c.case_number}</span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                              c.status === 'DECRYPTED'
                                ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                                : isThresholdMet
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                            }`}
                          >
                            {c.status === 'DECRYPTED' ? 'DECRYPTED' : isThresholdMet ? 'THRESHOLD MET (2/2)' : `PENDING (${approvals.length}/2)`}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 font-medium">{c.reason}</p>
                        <p className="text-[11px] text-slate-400">
                          Approving Custodians:{' '}
                          {approvals.length > 0 ? (
                            approvals.map((a: any, i: number) => (
                              <span key={i} className="inline-block px-1.5 py-0.5 mr-1 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                                {a.custodianRole}
                              </span>
                            ))
                          ) : (
                            <span className="italic text-slate-400">None yet</span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Approve Button */}
                        {!alreadyApprovedByCurrent && c.status === 'OPEN' && ['ORG_OWNER', 'EXAM_MANAGER', 'AUDITOR'].includes(currentUser?.role || '') && (
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleApproveEmergencyCase(c.case_number)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Authorize ({currentUser?.role})</span>
                          </button>
                        )}

                        {/* Execute Decrypt Button */}
                        {isThresholdMet && c.status === 'OPEN' && (
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleExecuteEmergencyDecrypt(c.case_number)}
                            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            <span>Execute Emergency Decrypt</span>
                          </button>
                        )}

                        {c.status === 'DECRYPTED' && (
                          <span className="text-[11px] text-indigo-300 font-mono font-semibold">
                            &check; Decrypted for audit
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Emergency Decryption Case Creation Modal */}
      {showEmergencyModal && (
        <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-scaleUp">
            <div className="flex items-start gap-3.5">
              <div className="p-3 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Create Emergency Decryption Case</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Initiates a 2-of-3 custodian threshold authorization workflow.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Operational Reason &amp; Threat Incident
              </label>
              <textarea
                value={emergencyReason}
                onChange={(e) => setEmergencyReason(e.target.value)}
                placeholder="Detail the emergency reason (e.g. Centre power failure, physical transit delay, security audit escalation)..."
                rows={3}
                className="w-full rounded-2xl bg-slate-950 border border-slate-700 p-3 text-xs text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div className="font-bold text-slate-300 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                <span>Emergency Threshold Policy:</span>
              </div>
              <p>
                Two distinct custodian authorizations (Organization Owner, Exam Manager, Auditor) are required. Normal scheduled printing remains protected by the exam time-lock.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => setShowEmergencyModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 font-bold text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleCreateEmergencyCase}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>Submit Emergency Request</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Exam Manager Key Lockout Reset Modal */}
      {showAdminResetModal && (
        <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-scaleUp">
            <div className="flex items-start gap-3.5">
              <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                <Unlock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Administrative Key Lockout Reset</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Authorized recovery by Organization Owner or Chief Security Auditor.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Administrative Justification &amp; Incident Reference (Min 10 chars)
              </label>
              <textarea
                value={adminResetReason}
                onChange={(e) => setAdminResetReason(e.target.value)}
                placeholder="State the verified operational incident justification for unlocking the Examination Manager Key attempt ledger..."
                rows={3}
                className="w-full rounded-2xl bg-slate-950 border border-slate-700 p-3 text-xs text-white placeholder-slate-400 focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div className="font-bold text-slate-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Security Audit Guarantee:</span>
              </div>
              <p>
                Resetting this lockout clears the 3 failed attempt counter and is logged permanently in the immutable security audit ledger with your credentials.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isResettingLock}
                onClick={() => {
                  setShowAdminResetModal(false);
                  setAdminResetReason('');
                }}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 font-bold text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isResettingLock || adminResetReason.trim().length < 10}
                onClick={handleAdminResetExamManagerLock}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all disabled:opacity-50"
              >
                <Unlock className={`w-4 h-4 ${isResettingLock ? 'animate-spin' : ''}`} />
                <span>{isResettingLock ? 'Resetting Lockout...' : 'Authorize Lockout Reset'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paper Verification Confirmation Modal (Step 1) */}
      {showVerifyConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-scaleUp">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
                <FileCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Confirm Paper Verification</h3>
                <p className="text-xs text-slate-400">Step 1 of ZeroLeak Threshold Workflow</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-900/60 text-xs text-amber-200 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Permanent Security Action</span>
              </div>
              <p>
                Verifying this paper certifies questions, marks, and sections. Once verified, the preview ledger is locked, and this version proceeds to 2-of-3 Custodian Key Authorization for threshold encryption.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">
                Verification Notes / Certification:
              </label>
              <textarea
                value={directVerifyNotes}
                onChange={(e) => setDirectVerifyNotes(e.target.value)}
                rows={3}
                placeholder="Enter verification remarks..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-teal-500 transition-colors"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isVerifyingDirect}
                onClick={() => setShowVerifyConfirmModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 font-bold text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isVerifyingDirect}
                onClick={handleDirectVerifyPaper}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all disabled:opacity-50"
              >
                <FileCheck className={`w-4 h-4 ${isVerifyingDirect ? 'animate-spin' : ''}`} />
                <span>{isVerifyingDirect ? 'Recording Verification...' : 'Confirm Verification'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ephemeral Decrypted Emergency View Modal (Step 5) */}
      {decryptedEmergencyPaper && (() => {
        const rawQuestions = Array.isArray(decryptedEmergencyPaper.questions) && decryptedEmergencyPaper.questions.length > 0
          ? decryptedEmergencyPaper.questions
          : Array.isArray(decryptedEmergencyPaper.paperDistribution?.questions) && decryptedEmergencyPaper.paperDistribution.questions.length > 0
          ? decryptedEmergencyPaper.paperDistribution.questions
          : Array.isArray(decryptedEmergencyPaper.paperDistribution?.sections)
          ? decryptedEmergencyPaper.paperDistribution.sections.flatMap((s: any) => s.questions || [])
          : [];

        const paperTitle = decryptedEmergencyPaper.title || decryptedEmergencyPaper.pdfFilename || 'ZeroLeak Authorized Examination Paper';
        const totalMarks = decryptedEmergencyPaper.totalMarks || 100;
        const totalCount = decryptedEmergencyPaper.totalQuestions || rawQuestions.length;

        return (
          <div className="fixed inset-0 z-[10000] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <style>{`
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #emergency-decrypted-print-sheet, #emergency-decrypted-print-sheet * {
                  visibility: visible !important;
                }
                #emergency-decrypted-print-sheet {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  background: #ffffff !important;
                  color: #000000 !important;
                  padding: 15mm !important;
                  box-shadow: none !important;
                  border: none !important;
                }
                .no-print {
                  display: none !important;
                }
              }
            `}</style>

            <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-scaleUp overflow-hidden">
              <header className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 no-print">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    <Unlock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Emergency Decrypted Paper (Step 5)</h3>
                    <p className="text-xs text-slate-400 font-mono">
                      Case: {selectedCaseForDecrypt} &bull; Version: {decryptedEmergencyPaper.version || paperVersion}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDecryptedEmergencyPaper(null)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </header>

              <main className="p-6 overflow-y-auto space-y-4 text-slate-200">
                <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-900/60 text-xs text-amber-200 flex items-center gap-2 no-print">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>Confidential Audit Inspection:</strong> This paper was decrypted via 2-of-3 emergency threshold key reconstruction. Reconstructed DEK is held only in memory and never persisted.
                  </span>
                </div>

                {/* Printable container matching official security requirements */}
                <div id="emergency-decrypted-print-sheet" className="space-y-4">
                  {/* Paper Header / Metadata */}
                  <div className="border-b-2 border-slate-700 pb-4 text-center space-y-1 relative">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">
                      ZeroLeak Authorized Examination Enclave &bull; Official Decrypted Copy
                    </div>
                    <h2 className="text-xl font-black text-white">{paperTitle}</h2>
                    <div className="flex items-center justify-center gap-4 text-xs text-slate-400 font-mono pt-1">
                      <span>Case Ref: <strong>{selectedCaseForDecrypt}</strong></span>
                      <span>&bull;</span>
                      <span>Version: <strong>{decryptedEmergencyPaper.version || paperVersion}</strong></span>
                      <span>&bull;</span>
                      <span>Max Marks: <strong>{totalMarks}</strong></span>
                      <span>&bull;</span>
                      <span>Total Questions: <strong>{totalCount}</strong></span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono pt-1">
                      Decrypted under 2-of-3 Custodian Authorization &bull; Printed at {new Date().toLocaleString()}
                    </div>
                  </div>

                  {/* Question listing */}
                  <div className="space-y-3 pt-2">
                    {rawQuestions.length > 0 ? (
                      rawQuestions.map((q: any, idx: number) => {
                        const qText = q.questionText || q.text || q.content_text || q.question || 'Examination Question';
                        const marks = q.marks || q.mark || 4;
                        const options = Array.isArray(q.options) ? q.options : [];
                        return (
                          <div key={idx} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2">
                                <span className="font-bold text-indigo-400 font-mono">Q{idx + 1}.</span>
                                <span className="text-slate-200 font-medium">{qText}</span>
                              </div>
                              <span className="font-mono text-teal-400 font-bold shrink-0">[{marks} Marks]</span>
                            </div>
                            {options.length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-6 pt-1 text-[11px] text-slate-400">
                                {options.map((opt: any, oIdx: number) => {
                                  const optLabel = String.fromCharCode(65 + oIdx);
                                  const optText = typeof opt === 'string' ? opt : opt?.text || opt?.label || '';
                                  return (
                                    <div key={oIdx} className="flex items-center gap-1.5">
                                      <span className="font-mono font-bold text-slate-500">({optLabel})</span>
                                      <span>{optText}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-8 text-center bg-slate-950 rounded-2xl border border-slate-800 text-xs text-slate-400">
                        Paper record reconstructed successfully. Check distribution and composition payload.
                      </div>
                    )}
                  </div>
                </div>
              </main>

              <footer className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between no-print">
                <div className="text-xs text-slate-400 font-mono">
                  Case: {selectedCaseForDecrypt}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Decrypted Paper</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecryptedEmergencyPaper(null)}
                    className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer transition-colors"
                  >
                    Close Emergency View
                  </button>
                </div>
              </footer>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
