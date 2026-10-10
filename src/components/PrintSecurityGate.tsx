import React, { useState } from 'react';
import { api } from '../api';
import { PrintSecurityCheck } from '../types';
import {
  ShieldAlert,
  KeyRound,
  Lock,
  CheckCircle2,
  AlertTriangle,
  X,
  Printer,
  Loader2,
} from 'lucide-react';

interface PrintSecurityGateProps {
  examId: string;
  examName: string;
  copies: number;
  onClose: () => void;
  /** Fired only after the server actually minted the copies. */
  onReleased: (message: string) => void;
}

/**
 * The security gate in front of the "printing point option".
 *
 * Opening a printer is not authorisation to print an examination paper, so this
 * modal re-authenticates the operator before arming and immediately spending a
 * single-use release. The server-issued code is passed directly to the print
 * endpoint rather than being entered by the operator.
 */
export const PrintSecurityGate: React.FC<PrintSecurityGateProps> = ({
  examId,
  examName,
  copies,
  onClose,
  onReleased,
}) => {
  const [password, setPassword] = useState('');
  const [checks, setChecks] = useState<PrintSecurityCheck[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readChecks = (err: any): PrintSecurityCheck[] => {
    const fromDetails = err?.details?.securityChecks;
    if (Array.isArray(fromDetails)) return fromDetails as PrintSecurityCheck[];
    if (Array.isArray(err?.details?.details?.securityChecks)) return err.details.details.securityChecks;
    return [];
  };

  const handleArm = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.armPrintRelease({
        exam_id: examId,
        copies_count: copies,
        password,
      });
      setChecks(result.securityChecks || []);
      setPassword('');
      const printResult = await api.printAuthorizedCopy(
        examId,
        result.paperVersionId,
        copies,
        result.securityToken,
        result.code
      );
      const first = printResult.copies[0]?.copyId;
      const last = printResult.copies[printResult.copies.length - 1]?.copyId;
      onReleased(
        first && last
          ? `${printResult.message} Serialized ${first}${first === last ? '' : ` to ${last}`}.`
          : printResult.message
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not authorize the print release.');
      const fromServer = readChecks(err);
      if (fromServer.length) setChecks(fromServer);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Print security gate
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {examName} • {copies} serialized copy({copies === 1 ? '' : 'ies'})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Security checklist, straight from the server's evaluation */}
          {checks.length > 0 && (
            <div className="space-y-2">
              {checks.map(check => (
                <div
                  key={check.id}
                  className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-[11px] ${
                    check.status === 'PASS'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200'
                      : check.status === 'WARN'
                        ? 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200'
                        : 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200'
                  }`}
                >
                  {check.status === 'PASS' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <div className="font-bold">{check.label}</div>
                    <div className="opacity-90">{check.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleArm} className="space-y-3">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Releasing copies requires your own account password. The server checks the print controls and
              authorizes this examination, copy count, and workstation.
            </p>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
              Operator password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                autoFocus
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="Your ZeroLeak account password"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !password}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold shadow-md transition-colors"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
              <span>{busy ? 'Authorizing & printing...' : 'Re-authenticate & Print'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
