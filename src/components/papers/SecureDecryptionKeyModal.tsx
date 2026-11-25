import React, { useState, useEffect } from 'react';
import {
  Key,
  Lock,
  Unlock,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  X,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api } from '../../api';
import { User } from '../../types';

interface SecureDecryptionKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  examType: 'COMPETITIVE' | 'UNIVERSITY';
  paperId: string;
  paperVersion?: string;
  paperTitle: string;
  currentUser: User | null;
  onDecryptionSuccess: () => void;
}

export const SecureDecryptionKeyModal: React.FC<SecureDecryptionKeyModalProps> = ({
  isOpen,
  onClose,
  examType,
  paperId,
  paperVersion = 'v1',
  paperTitle,
  currentUser,
  onDecryptionSuccess,
}) => {
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState(3);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedAt, setLockedAt] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'success' | 'warn'; text: string } | null>(null);

  // Admin Recovery state
  const [showAdminResetModal, setShowAdminResetModal] = useState(false);
  const [adminReason, setAdminReason] = useState('');
  const [adminResetLoading, setAdminResetLoading] = useState(false);

  const isAuthorizedAdmin = ['ORG_OWNER', 'AUDITOR', 'EXAM_MANAGER'].includes(currentUser?.role || '');

  // Fetch initial attempt and lock status from server
  const fetchAttemptStatus = async () => {
    if (!paperId) return;
    try {
      const res = await api.getDecryptionAttempts(examType, paperId, paperVersion);
      setRemainingAttempts(res.remainingAttempts);
      setFailedAttempts(res.failedAttempts);
      setIsLocked(res.isLocked);
      setLockedAt(res.lockedAt);
      if (res.isLocked) {
        setStatusMessage({
          type: 'error',
          text: 'This paper version is permanently LOCKED. Maximum 3 incorrect attempts reached. Administrative recovery required.',
        });
      }
    } catch (err: any) {
      console.warn('Could not load decryption attempt status:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setKeyInput('');
      setStatusMessage(null);
      fetchAttemptStatus();
    }
  }, [isOpen, paperId, paperVersion, examType]);

  const handleSubmitKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) return;

    setLoading(true);
    setStatusMessage(null);

    try {
      const res = await api.verifyDecryptionKeyAttempt({
        examType,
        paperId,
        paperVersion,
        key: keyInput.trim(),
      });

      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: 'Cryptographic key verified successfully. Decrypting examination paper...',
        });
        setTimeout(() => {
          onDecryptionSuccess();
          onClose();
        }, 800);
      } else {
        setRemainingAttempts(res.remainingAttempts);
        setFailedAttempts(res.failedAttempts || 0);
        setIsLocked(res.isLocked);
        if (res.lockedAt) setLockedAt(res.lockedAt);

        setStatusMessage({
          type: res.isLocked ? 'error' : 'warn',
          text: res.message || `Incorrect key. Remaining attempts: ${res.remainingAttempts}`,
        });
      }
    } catch (err: any) {
      const remaining = err.remainingAttempts !== undefined ? err.remainingAttempts : remainingAttempts - 1;
      const locked = err.isLocked || remaining <= 0;
      setRemainingAttempts(Math.max(0, remaining));
      setIsLocked(locked);
      setStatusMessage({
        type: 'error',
        text: err.message || (locked ? 'Session locked: 3 attempts exceeded.' : `Incorrect key. Remaining attempts: ${remaining}`),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAdminReset = async () => {
    if (!adminReason || adminReason.trim().length < 10) {
      setStatusMessage({ type: 'error', text: 'Operational justification must be at least 10 characters.' });
      return;
    }

    setAdminResetLoading(true);
    try {
      const res = await api.adminResetDecryptionLock({
        examType,
        paperId,
        paperVersion,
        reason: adminReason.trim(),
      });

      if (res.success) {
        setIsLocked(false);
        setRemainingAttempts(3);
        setFailedAttempts(0);
        setShowAdminResetModal(false);
        setAdminReason('');
        setStatusMessage({
          type: 'success',
          text: res.message || 'Decryption lockout successfully reset by administrator.',
        });
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Failed to reset lockout.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error executing administrative reset.' });
    } finally {
      setAdminResetLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className={`p-4 text-white flex items-center justify-between ${isLocked ? 'bg-rose-900' : 'bg-slate-900'}`}>
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${isLocked ? 'bg-rose-800' : 'bg-indigo-600'}`}>
              {isLocked ? <Lock className="w-5 h-5 text-white" /> : <Key className="w-5 h-5 text-white" />}
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                {isLocked ? 'Decryption Locked (3 Attempts Exceeded)' : 'Enter Decryption Key'}
              </h3>
              <p className="text-[11px] text-slate-300 font-mono">
                {examType} • Version {paperVersion}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {/* Target Paper Info */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Target Examination Paper</span>
            <span className="font-semibold text-slate-800 line-clamp-1 mt-0.5">{paperTitle}</span>
          </div>

          {/* Attempts Indicator (Remaining 3, 2, 1, 0) */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-200">
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold text-amber-800 block tracking-wider">Strict Security Limit</span>
              <span className="text-xs font-bold text-amber-950">
                {isLocked ? '0 Attempts Remaining (Locked)' : `${remainingAttempts} of 3 Key Attempts Left`}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map(step => {
                const isUsed = step <= failedAttempts;
                return (
                  <div
                    key={step}
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                      isUsed
                        ? 'bg-rose-600 text-white'
                        : 'bg-emerald-500 text-white'
                    }`}
                  >
                    {isUsed ? '✕' : step}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status Alert Banner */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                statusMessage.type === 'error'
                  ? 'bg-rose-50 text-rose-900 border border-rose-200'
                  : statusMessage.type === 'warn'
                  ? 'bg-amber-50 text-amber-900 border border-amber-200'
                  : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              }`}
            >
              {statusMessage.type === 'error' ? (
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              ) : statusMessage.type === 'warn' ? (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <span className="flex-1 leading-relaxed font-medium">{statusMessage.text}</span>
            </div>
          )}

          {/* Key Entry Form */}
          {!isLocked ? (
            <form onSubmit={handleSubmitKey} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  Data-Encryption Key / Emergency Share / Passcode *
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={keyInput}
                    onChange={e => setKeyInput(e.target.value)}
                    placeholder="Enter 256-bit key or authorized passcode..."
                    required
                    className="w-full pl-3 pr-10 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">
                  Key validation occurs on the server. Exceeding 3 incorrect attempts will lock this session.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !keyInput.trim()}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50"
                >
                  {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Verify Key &amp; Decrypt</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4 pt-1">
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-center space-y-2">
                <Lock className="w-8 h-8 text-rose-600 mx-auto" />
                <h4 className="text-xs font-bold text-rose-900 uppercase tracking-wider">
                  Session Locked – Max Attempts Exceeded
                </h4>
                <p className="text-[11px] text-rose-700 leading-relaxed">
                  Decryption has been permanently halted for paper version <strong>{paperVersion}</strong>.
                  {lockedAt && ` Locked on ${new Date(lockedAt).toLocaleString()}.`}
                </p>
              </div>

              {/* Admin Recovery Trigger */}
              {isAuthorizedAdmin && (
                <div className="pt-2 border-t border-slate-200">
                  {!showAdminResetModal ? (
                    <button
                      type="button"
                      onClick={() => setShowAdminResetModal(true)}
                      className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Administrative Recovery Reset ({currentUser?.role})</span>
                    </button>
                  ) : (
                    <div className="space-y-3 p-3 rounded-xl bg-slate-50 border border-slate-300">
                      <span className="text-xs font-bold text-slate-800 block">
                        Record Audited Operational Justification
                      </span>
                      <textarea
                        value={adminReason}
                        onChange={e => setAdminReason(e.target.value)}
                        placeholder="Provide reason for resetting the decryption lockout (minimum 10 characters)..."
                        rows={2}
                        className="w-full p-2.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAdminResetModal(false)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleAdminReset}
                          disabled={adminResetLoading || adminReason.trim().length < 10}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {adminResetLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                          <span>Confirm Reset</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

