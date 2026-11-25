import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  KeyRound,
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  PlusCircle,
  Copy,
  Check,
  ArrowRight,
  UserMinus,
  Lock,
  Unlock,
  AlertCircle,
  Eye,
  EyeOff,
  UserPlus,
} from 'lucide-react';
import { api } from '../../api';
import { User, UserRole, ManagedUserRecord, PasswordResetRequestRecord } from '../../types';

interface HierarchicalAccessManagementPanelProps {
  currentUser: User;
  onRefresh?: () => void;
}

export const HierarchicalAccessManagementPanel: React.FC<HierarchicalAccessManagementPanelProps> = ({
  currentUser,
  onRefresh,
}) => {
  const canManage = currentUser.role === 'ORG_OWNER' || currentUser.role === 'EXAM_MANAGER';
  const isOwner = currentUser.role === 'ORG_OWNER';

  const [activeTab, setActiveTab] = useState<'users' | 'grant' | 'resets' | 'self_reset' | 'reassign'>(
    canManage ? 'users' : 'self_reset'
  );
  const [managedUsers, setManagedUsers] = useState<ManagedUserRecord[]>([]);
  const [resetRequests, setResetRequests] = useState<PasswordResetRequestRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Grant Form State
  const [grantForm, setGrantForm] = useState({
    fullName: '',
    email: '',
    username: '',
    role: currentUser.role === 'ORG_OWNER' ? 'EXAM_MANAGER' : 'TRANSLATOR',
    initialPassword: '',
    centreId: '',
    scope: '',
  });
  const [grantSubmitting, setGrantSubmitting] = useState(false);

  // Revoke Modal State
  const [revokeTarget, setRevokeTarget] = useState<ManagedUserRecord | null>(null);
  const [revokeAction, setRevokeAction] = useState<'SUSPEND' | 'REVOKE'>('SUSPEND');
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeSubmitting, setRevokeSubmitting] = useState(false);

  // Password Reset Review Modal State
  const [reviewTarget, setReviewTarget] = useState<PasswordResetRequestRecord | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [reviewReason, setReviewReason] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [issuedResetToken, setIssuedResetToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  // Self Request Reset State
  const [selfResetReason, setSelfResetReason] = useState('');
  const [selfResetSubmitting, setSelfResetSubmitting] = useState(false);

  // Execute Reset with Token State
  const [tokenForm, setTokenForm] = useState({
    token: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [tokenSubmitting, setTokenSubmitting] = useState(false);

  // Reassign Subordinates State (Owner Only)
  const [reassignForm, setReassignForm] = useState({
    previousManagerId: '',
    newManagerId: '',
  });
  const [reassignSubmitting, setReassignSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      if (canManage) {
        const [usersRes, resetsRes] = await Promise.all([
          api.listManagedUsers().catch(() => ({ managedUsers: [] })),
          api.listPendingPasswordResetRequests().catch(() => ({ requests: [] })),
        ]);
        setManagedUsers(usersRes.managedUsers || []);
        setResetRequests(resetsRes.requests || []);
      }
    } catch (err: any) {
      console.error('Failed to load access data:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to load access management data.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser.id, currentUser.role]);

  // Grant Handler
  const handleGrantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGrantSubmitting(true);
    setStatusMessage(null);
    try {
      const res = await api.grantSubordinateAccess(grantForm);
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `Successfully authorized ${grantForm.fullName} as ${grantForm.role}.`,
        });
        setGrantForm({
          fullName: '',
          email: '',
          username: '',
          role: currentUser.role === 'ORG_OWNER' ? 'EXAM_MANAGER' : 'TRANSLATOR',
          initialPassword: '',
          centreId: '',
          scope: '',
        });
        setActiveTab('users');
        await loadData();
        onRefresh?.();
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Failed to grant subordinate access.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error granting access.' });
    } finally {
      setGrantSubmitting(false);
    }
  };

  // Revoke / Suspend Handler
  const handleRevokeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeTarget) return;
    setRevokeSubmitting(true);
    setStatusMessage(null);
    try {
      const res = await api.revokeOrSuspendUserAccess({
        targetUserId: revokeTarget.id,
        action: revokeAction,
        reason: revokeReason,
      });
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: res.message || `Access ${revokeAction.toLowerCase()}ed successfully.`,
        });
        setRevokeTarget(null);
        setRevokeReason('');
        await loadData();
        onRefresh?.();
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Failed to revoke/suspend access.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error revoking access.' });
    } finally {
      setRevokeSubmitting(false);
    }
  };

  // Password Reset Review Handler
  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTarget) return;
    setReviewSubmitting(true);
    setStatusMessage(null);
    try {
      const res = await api.reviewPasswordResetRequest({
        requestId: reviewTarget.id,
        decision: reviewDecision,
        reason: reviewReason,
      });
      if (res.success) {
        if (reviewDecision === 'APPROVE' && res.resetToken) {
          setIssuedResetToken(res.resetToken);
          setStatusMessage({
            type: 'success',
            text: `Password reset approved. Copy the single-use token below and deliver it securely to ${reviewTarget.userName}.`,
          });
        } else {
          setStatusMessage({
            type: 'success',
            text: `Password reset request rejected.`,
          });
          setReviewTarget(null);
        }
        await loadData();
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Failed to review request.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error reviewing reset request.' });
    } finally {
      setReviewSubmitting(false);
    }
  };

  // Self Password Reset Request
  const handleSelfRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setSelfResetSubmitting(true);
    setStatusMessage(null);
    try {
      const res = await api.requestPasswordReset({ reason: selfResetReason });
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: 'Password reset request submitted to your authorizing manager. You will receive a notification once reviewed.',
        });
        setSelfResetReason('');
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Failed to submit reset request.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error requesting reset.' });
    } finally {
      setSelfResetSubmitting(false);
    }
  };

  // Execute Password Reset with Token
  const handleExecuteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenForm.newPassword !== tokenForm.confirmPassword) {
      setStatusMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }
    if (tokenForm.newPassword.length < 8) {
      setStatusMessage({ type: 'error', text: 'Password must be at least 8 characters long.' });
      return;
    }
    setTokenSubmitting(true);
    setStatusMessage(null);
    try {
      const res = await api.executePasswordReset({
        token: tokenForm.token,
        newPassword: tokenForm.newPassword,
      });
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: 'Password updated successfully! You can now sign in with your new password.',
        });
        setTokenForm({ token: '', newPassword: '', confirmPassword: '' });
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Failed to execute password reset.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error executing password reset.' });
    } finally {
      setTokenSubmitting(false);
    }
  };

  // Reassign Subordinates
  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReassignSubmitting(true);
    setStatusMessage(null);
    try {
      const res = await api.reassignSubordinates(reassignForm);
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `Successfully reassigned ${res.reassignedCount || 0} subordinates to the new Examination Manager.`,
        });
        setReassignForm({ previousManagerId: '', newManagerId: '' });
        await loadData();
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Failed to reassign subordinates.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error reassigning subordinates.' });
    } finally {
      setReassignSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & FIVE-ROLE HIERARCHY SUMMARY */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-semibold uppercase tracking-wider mb-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>ZeroLeak Cryptographic Access Control</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              Hierarchical Role Authorization & Access Management
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Enforcing the strict 5-role authority hierarchy with zero plaintext passwords, live RBAC revocation, and manager-approved credential reset.
            </p>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="self-start md:self-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh State</span>
          </button>
        </div>

        {/* Visual Hierarchy Diagram */}
        <div className="mt-5 pt-1">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
            Five-Role Authority Model & Permission Tree
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* Level 1 */}
            <div className={`p-4 rounded-2xl border ${currentUser.role === 'ORG_OWNER' ? 'bg-indigo-950/60 border-indigo-500 shadow-md ring-1 ring-indigo-500' : 'bg-slate-850 border-slate-800'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">Level 1 Apex</span>
                {currentUser.role === 'ORG_OWNER' && <span className="text-[10px] text-emerald-400 font-bold">Your Role</span>}
              </div>
              <div className="font-bold text-slate-100 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Organization Owner / Registrar</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Supreme authority. Authorizes, suspends, and revokes Examination Managers & Auditors. Reassigns orphaned staff.
              </p>
            </div>

            {/* Level 2 */}
            <div className={`p-4 rounded-2xl border ${currentUser.role === 'EXAM_MANAGER' || currentUser.role === 'AUDITOR' ? 'bg-sky-950/60 border-sky-500 shadow-md ring-1 ring-sky-500' : 'bg-slate-850 border-slate-800'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-500/20 text-sky-300">Level 2 Operational</span>
                {(currentUser.role === 'EXAM_MANAGER' || currentUser.role === 'AUDITOR') && <span className="text-[10px] text-emerald-400 font-bold">Your Role</span>}
              </div>
              <div className="font-bold text-slate-100 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Examination Manager & Auditor</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                <strong className="text-slate-300">Manager:</strong> Authorizes Translators & Operators under them.<br />
                <strong className="text-slate-300">Auditor:</strong> Direct Owner subordinate; read/audit only, no granting.
              </p>
            </div>

            {/* Level 3 */}
            <div className={`p-4 rounded-2xl border ${currentUser.role === 'TRANSLATOR' || currentUser.role === 'CENTRE_OPERATOR' ? 'bg-amber-950/60 border-amber-500 shadow-md ring-1 ring-amber-500' : 'bg-slate-850 border-slate-800'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">Level 3 Execution</span>
                {(currentUser.role === 'TRANSLATOR' || currentUser.role === 'CENTRE_OPERATOR') && <span className="text-[10px] text-emerald-400 font-bold">Your Role</span>}
              </div>
              <div className="font-bold text-slate-100 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Linguistic Translator & Operator</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Assigned under Examination Manager. Strictly scoped to assigned tasks / centres. No user management privileges.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* STATUS NOTIFICATION BANNER */}
      {statusMessage && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-center gap-3 border shadow-sm ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 border-rose-200 dark:border-rose-800'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          )}
          <span className="font-medium">{statusMessage.text}</span>
        </div>
      )}

      {/* ISSUED RESET TOKEN BANNER (ON APPROVAL) */}
      {issuedResetToken && (
        <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-3">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-sm">
            <KeyRound className="w-4 h-4 text-amber-600" />
            <span>Single-Use Password Reset Token Generated</span>
          </div>
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            This token is valid for <strong>15 minutes</strong> and will be invalidated immediately once consumed. Deliver it to the user through a secure out-of-band channel. Passwords are never revealed to managers or stored in plaintext.
          </p>
          <div className="flex items-center gap-2">
            <code className="p-2.5 rounded-xl bg-slate-900 text-amber-300 font-mono text-xs flex-1 border border-slate-700 select-all overflow-x-auto">
              {issuedResetToken}
            </code>
            <button
              onClick={() => copyToClipboard(issuedResetToken)}
              className="px-3.5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
            >
              {tokenCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{tokenCopied ? 'Copied' : 'Copy Token'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. TAB CONTROLS */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {canManage && (
          <>
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'users'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Managed Subordinates ({managedUsers.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('grant')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'grant'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Grant Subordinate Access</span>
            </button>

            <button
              onClick={() => setActiveTab('resets')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 relative ${
                activeTab === 'resets'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>Reset Requests</span>
              {resetRequests.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
                  {resetRequests.length}
                </span>
              )}
            </button>
          </>
        )}

        <button
          onClick={() => setActiveTab('self_reset')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'self_reset'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Password Management & Self-Reset</span>
        </button>

        {isOwner && (
          <button
            onClick={() => setActiveTab('reassign')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'reassign'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reassign Orphaned Subordinates</span>
          </button>
        )}
      </div>

      {/* 3. TAB CONTENT */}

      {/* TAB 1: MANAGED USERS DIRECTORY */}
      {activeTab === 'users' && canManage && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {isOwner ? 'Organization Personnel Directory' : 'Assigned Subordinates (Linguistic Translators & Centre Operators)'}
            </h3>
            <span className="text-xs text-slate-500">
              Showing users directly authorized or assigned under your command
            </span>
          </div>

          {managedUsers.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-slate-500 text-xs">
              No subordinate users currently found in your organizational jurisdiction. Click "Grant Subordinate Access" to authorize new staff.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3.5">User & Email</th>
                    <th className="p-3.5">Role</th>
                    <th className="p-3.5">Account Status</th>
                    <th className="p-3.5">Authorized By</th>
                    <th className="p-3.5">Centre / Scope</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {managedUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-850/50 transition">
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 dark:text-slate-100">{user.fullName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{user.email}</div>
                      </td>
                      <td className="p-3.5">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {user.role}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${
                            user.status === 'ACTIVE'
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                              : user.status === 'SUSPENDED'
                              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                              : user.status === 'REVOKED'
                              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                              : 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                          }`}
                        >
                          {user.status}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                          {user.authorizedByName || user.authorizedBy || 'System Registrar'}
                        </div>
                        {user.authorizedAt && (
                          <div className="text-[10px] text-slate-400">{new Date(user.authorizedAt).toLocaleDateString()}</div>
                        )}
                      </td>
                      <td className="p-3.5">
                        <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                          {user.centreId || user.scope || '—'}
                        </span>
                      </td>
                      <td className="p-3.5 text-right space-x-2">
                        {user.status !== 'REVOKED' ? (
                          <button
                            onClick={() => {
                              setRevokeTarget(user);
                              setRevokeAction('SUSPEND');
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px] font-semibold transition"
                          >
                            Suspend / Revoke
                          </button>
                        ) : (
                          <span className="text-[10px] text-rose-500 font-bold uppercase">Revoked</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: GRANT SUBORDINATE ACCESS */}
      {activeTab === 'grant' && canManage && (
        <div className="max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Grant Subordinate Access
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {isOwner
                ? 'As Organization Owner, you are authorized to provision Examination Managers and Chief Vigilance & Security Auditors.'
                : 'As Examination Manager, you are authorized to provision Linguistic Translators and Centre Superintendent & Operators assigned under your command.'}
            </p>
          </div>

          <form onSubmit={handleGrantSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Ramesh Kumar"
                  value={grantForm.fullName}
                  onChange={(e) => setGrantForm({ ...grantForm, fullName: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Role to Grant</label>
                <select
                  value={grantForm.role}
                  onChange={(e) => setGrantForm({ ...grantForm, role: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                >
                  {isOwner ? (
                    <>
                      <option value="EXAM_MANAGER">Examination Manager</option>
                      <option value="AUDITOR">Chief Vigilance & Security Auditor</option>
                    </>
                  ) : (
                    <>
                      <option value="TRANSLATOR">Linguistic Translator</option>
                      <option value="CENTRE_OPERATOR">Centre Superintendent & Operator</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Official Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="name@nbte.edu.in"
                  value={grantForm.email}
                  onChange={(e) => setGrantForm({ ...grantForm, email: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Username</label>
                <input
                  type="text"
                  required
                  placeholder="ramesh_nbte"
                  value={grantForm.username}
                  onChange={(e) => setGrantForm({ ...grantForm, username: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {grantForm.role === 'CENTRE_OPERATOR' && (
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Authorized Centre Number / ID</label>
                <input
                  type="text"
                  placeholder="e.g. CENTRE-101"
                  value={grantForm.centreId}
                  onChange={(e) => setGrantForm({ ...grantForm, centreId: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>
            )}

            {grantForm.role === 'TRANSLATOR' && (
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Translation Language Scope</label>
                <input
                  type="text"
                  placeholder="e.g. Hindi, Tamil, Telugu"
                  value={grantForm.scope}
                  onChange={(e) => setGrantForm({ ...grantForm, scope: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            )}

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Initial Password (Optional)</label>
              <input
                type="password"
                placeholder="Leave blank for secure self-service password establishment"
                value={grantForm.initialPassword}
                onChange={(e) => setGrantForm({ ...grantForm, initialPassword: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                If provided, must be at least 8 characters. Credentials are hashed with bcrypt and never stored in plaintext.
              </span>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={grantSubmitting}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center gap-2"
              >
                {grantSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                <span>Authorize & Provision Subordinate</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: PASSWORD RESET REQUESTS (MANAGER REVIEW) */}
      {activeTab === 'resets' && canManage && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Pending Subordinate Password Reset Requests
            </h3>
            <span className="text-xs text-slate-500">
              Higher-authority approval generates a single-use time-limited cryptographic token. Passwords are never revealed.
            </span>
          </div>

          {resetRequests.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-slate-500 text-xs">
              No pending password reset requests awaiting your review.
            </div>
          ) : (
            <div className="space-y-3">
              {resetRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">{req.userName}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {req.userRole}
                      </span>
                      <span className="font-mono text-xs text-slate-400">({req.userEmail})</span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      <strong>Reason:</strong> "{req.requestReason}"
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Requested: {new Date(req.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setReviewTarget(req);
                        setReviewDecision('APPROVE');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Approve & Issue Token</span>
                    </button>
                    <button
                      onClick={() => {
                        setReviewTarget(req);
                        setReviewDecision('REJECT');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PASSWORD MANAGEMENT & SELF-RESET */}
      {activeTab === 'self_reset' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Section A: Request Reset From Higher Manager */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-indigo-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Request Password Reset from Authorizing Manager
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              ZeroLeak security policy requires subordinate password resets to be authorized by your higher-tier manager. Submit a justification below.
            </p>

            <form onSubmit={handleSelfRequestReset} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Reason / Security Justification
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Suspected credential disclosure, routine policy rotation, forgotten password."
                  value={selfResetReason}
                  onChange={(e) => setSelfResetReason(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={selfResetSubmitting}
                className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 text-white font-bold transition flex items-center justify-center gap-2"
              >
                {selfResetSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>Submit Request to Manager</span>
              </button>
            </form>
          </div>

          {/* Section B: Complete Reset with One-Time Token */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-emerald-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Execute Password Reset with One-Time Token
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Once your authorizing manager approves your request, enter the 15-minute single-use cryptographic token below to set your new password.
            </p>

            <form onSubmit={handleExecuteReset} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Single-Use Reset Token</label>
                <input
                  type="text"
                  required
                  placeholder="Paste 64-character token"
                  value={tokenForm.token}
                  onChange={(e) => setTokenForm({ ...tokenForm, token: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">New Password (min 8 chars)</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter new strong password"
                    value={tokenForm.newPassword}
                    onChange={(e) => setTokenForm({ ...tokenForm, newPassword: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Confirm New Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Confirm new password"
                  value={tokenForm.confirmPassword}
                  onChange={(e) => setTokenForm({ ...tokenForm, confirmPassword: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={tokenSubmitting}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center justify-center gap-2"
              >
                {tokenSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                <span>Update Password & Re-authenticate</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 5: REASSIGN SUBORDINATES (OWNER ONLY) */}
      {activeTab === 'reassign' && isOwner && (
        <div className="max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Reassign Subordinates of Departed Examination Manager
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              When an Examination Manager is revoked or suspended, their subordinate Linguistic Translators and Centre Operators are automatically suspended to prevent unauthorized operations. As Organization Owner, you can reassign them to an active manager to restore their operational status.
            </p>
          </div>

          <form onSubmit={handleReassignSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Previous / Revoked Examination Manager ID
              </label>
              <input
                type="text"
                required
                placeholder="User ID of departed manager"
                value={reassignForm.previousManagerId}
                onChange={(e) => setReassignForm({ ...reassignForm, previousManagerId: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                New Active Examination Manager ID
              </label>
              <input
                type="text"
                required
                placeholder="User ID of receiving active manager"
                value={reassignForm.newManagerId}
                onChange={(e) => setReassignForm({ ...reassignForm, newManagerId: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={reassignSubmitting}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center gap-2"
              >
                {reassignSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span>Reassign All Subordinates</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* REVOKE / SUSPEND MODAL */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Revoke / Suspend Subordinate Access
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              You are modifying access for <strong>{revokeTarget.fullName}</strong> ({revokeTarget.role}).
              Server-side RBAC validation will immediately terminate all active sessions for this account.
            </p>

            {revokeTarget.role === 'EXAM_MANAGER' && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs">
                <strong>Cascading Security Warning:</strong> Revoking an Examination Manager will automatically suspend access for all Translators and Operators assigned under them until reassigned by the Organization Owner.
              </div>
            )}

            <form onSubmit={handleRevokeSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Action</label>
                <select
                  value={revokeAction}
                  onChange={(e) => setRevokeAction(e.target.value as 'SUSPEND' | 'REVOKE')}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                >
                  <option value="SUSPEND">SUSPEND Access (Temporary Freeze)</option>
                  <option value="REVOKE">REVOKE Access (Permanent Revocation)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Reason for Revocation / Suspension (Audited)
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Enter detailed audit justification..."
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRevokeTarget(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={revokeSubmitting}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition flex items-center gap-1.5"
                >
                  {revokeSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
                  <span>Confirm {revokeAction}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PASSWORD RESET REVIEW MODAL */}
      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-indigo-600">
              <KeyRound className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Review Password Reset Request
              </h3>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <div><strong>Requester:</strong> {reviewTarget.userName} ({reviewTarget.userRole})</div>
              <div><strong>Email:</strong> {reviewTarget.userEmail}</div>
              <div><strong>Reason:</strong> "{reviewTarget.requestReason}"</div>
            </div>

            <form onSubmit={handleReviewSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Decision</label>
                <select
                  value={reviewDecision}
                  onChange={(e) => setReviewDecision(e.target.value as 'APPROVE' | 'REJECT')}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                >
                  <option value="APPROVE">APPROVE (Generate Single-Use 15-Minute Token)</option>
                  <option value="REJECT">REJECT Request</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Decision Note / Reason</label>
                <input
                  type="text"
                  placeholder="Optional review remarks"
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewTarget(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewSubmitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center gap-1.5"
                >
                  {reviewSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Submit Decision</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

