import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  ShieldAlert,
  Camera,
  AlertTriangle,
  CheckCircle2,
  Printer,
  Lock,
  RefreshCw,
  Eye,
  EyeOff,
  User,
  Smartphone,
  Users,
  X,
  Clock,
  Key,
} from 'lucide-react';
import { api } from '../../api';

interface ProctoredPrintingWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  printRequest: {
    id: string;
    requestNumber: string;
    examName: string;
    paperId: string;
    paperVersion?: string;
    centreNumber: string;
    printerId: string;
    printerName?: string;
    requestedCopies: number;
    approvedCopies?: number;
    scheduledUnlockTime: string;
    scheduledDate: string;
    isTimeUnlocked?: boolean;
    remainingSeconds?: number;
    status: string;
  } | null;
  currentUser: {
    id: string;
    fullName?: string;
    role?: string;
    centre_id?: string;
  };
  onPrintSuccess?: (result: any) => void;
}

export const ProctoredPrintingWorkspaceModal: React.FC<ProctoredPrintingWorkspaceModalProps> = ({
  isOpen,
  onClose,
  printRequest,
  currentUser,
  onPrintSuccess,
}) => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [printResult, setPrintResult] = useState<any>(null);

  // Remaining time countdown
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [isUnlocked, setIsUnlocked] = useState(false);

  // Admin recovery modal state
  const [showAdminResetModal, setShowAdminResetModal] = useState(false);
  const [adminResetReason, setAdminResetReason] = useState('');
  const [resettingLock, setResettingLock] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Calculate session ID based on request
  const sessionId = printRequest ? `proctor_session_${printRequest.id}` : '';

  // Initialize countdown
  useEffect(() => {
    if (!printRequest) return;
    try {
      const unlockTarget = new Date(`${printRequest.scheduledDate}T${printRequest.scheduledUnlockTime}:00`);
      const now = new Date();
      const diff = Math.floor((unlockTarget.getTime() - now.getTime()) / 1000);
      if (diff <= 0) {
        setSecondsRemaining(0);
        setIsUnlocked(true);
      } else {
        setSecondsRemaining(diff);
        setIsUnlocked(false);
      }
    } catch {
      setIsUnlocked(true);
    }
  }, [printRequest]);

  // Tick countdown timer
  useEffect(() => {
    if (isUnlocked || secondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsUnlocked(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isUnlocked, secondsRemaining]);

  // Load or create proctor session
  const fetchSession = async () => {
    if (!sessionId) return;
    try {
      const res = await api.getProctoredPrintSession(sessionId);
      if (res && res.session) {
        setSession(res.session);
      }
    } catch (err: any) {
      console.error('Error fetching proctor session:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && sessionId) {
      setLoading(true);
      fetchSession();
      startCamera();
    } else {
      stopCamera();
      setPrintResult(null);
      setStatusMessage(null);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, sessionId]);

  const startCamera = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } });
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setCameraActive(true);
      }
    } catch (err) {
      console.warn('Camera feed unavailable, falling back to simulated hardware surveillance stream:', err);
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  // Report a proctor incident (simulated or detected)
  const triggerIncident = async (incidentType: 'PHONE_DETECTED' | 'MULTIPLE_PERSONS' | 'SCREEN_CAPTURE' | 'UNAUTHORIZED_DEVICE') => {
    if (!sessionId) return;
    try {
      const res = await api.reportProctorIncident({
        sessionId,
        incidentType,
        confidence: 0.96,
        printRequestId: printRequest?.id,
      });

      setSession({
        warningCount: res.warningCount,
        isLocked: res.isLocked,
        requiresAcknowledgement: res.actionRequired === 'STRONG_WARNING_ACK_REQUIRED',
        lockReason: res.isLocked ? res.message : undefined,
      });
      setWarningMessage(res.message);
      if (res.actionRequired === 'IMMEDIATE_LOCKOUT' || res.isLocked) {
        setStatusMessage({
          type: 'error',
          text: 'CRITICAL SECURITY BREACH: Third warning threshold reached. Printing workstation has been locked.',
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to record proctor incident.' });
    }
  };

  // Operator acknowledges warning #2
  const handleAcknowledgeWarning = async () => {
    if (!sessionId) return;
    try {
      const res = await api.ackProctorWarning(sessionId);
      if (res.success) {
        setWarningMessage(null);
        await fetchSession();
        setStatusMessage({ type: 'info', text: 'Warning acknowledged. Workstation surveillance active.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to acknowledge warning.' });
    }
  };

  // Admin resets lockout
  const handleAdminResetLock = async () => {
    if (!sessionId || !adminResetReason.trim()) return;
    setResettingLock(true);
    try {
      const res = await api.adminResetProctorLock({
        sessionId,
        reason: adminResetReason,
      });
      if (res.success) {
        setShowAdminResetModal(false);
        setAdminResetReason('');
        await fetchSession();
        setStatusMessage({ type: 'success', text: 'Lockout successfully cleared by authorized administrator.' });
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Admin reset failed.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Admin reset error.' });
    } finally {
      setResettingLock(false);
    }
  };

  // Release the print job
  const handleExecuteRelease = async () => {
    if (!printRequest) return;
    setReleasing(true);
    setStatusMessage(null);
    try {
      const res = await api.releasePrintAnywhereJob(printRequest.id);
      if (res.success) {
        setPrintResult(res);
        setStatusMessage({
          type: 'success',
          text: `Paper printed successfully! Stamped ${res.watermarks?.length || printRequest.requestedCopies} copies with unique traceable anti-leak watermarks.`,
        });
        if (onPrintSuccess) onPrintSuccess(res);
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Print release denied. Verify time lock and security conditions.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to release physical print job.',
      });
    } finally {
      setReleasing(false);
    }
  };

  if (!isOpen || !printRequest) return null;

  const warningCount = session?.warningCount ?? 0;
  const isLocked = session?.isLocked ?? false;
  const ackRequired = session?.requiresAcknowledgement ?? false;

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-[#DCE4E8] overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Top Header */}
        <div className="px-6 py-4 bg-[#0F2231] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#1B3547] rounded-lg border border-[#2B4B61]">
              <Shield className="w-5 h-5 text-[#00D09C]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold tracking-wider text-[#00D09C] uppercase">
                  ZEROLEAK ENCLAVE
                </span>
                <span className="text-[10px] bg-[#1E3E54] text-gray-300 px-2 py-0.5 rounded-full font-mono">
                  {printRequest.requestNumber}
                </span>
              </div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Proctored Print Execution Chamber
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status / Warning Banner */}
        {statusMessage && (
          <div
            className={`px-6 py-3 text-xs flex items-center gap-2 border-b ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : statusMessage.type === 'error'
                ? 'bg-rose-50 text-rose-800 border-rose-200 font-semibold'
                : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}
          >
            {statusMessage.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Main Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Top Info Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-[#F8FAFB] border border-[#E1E8EC] rounded-xl">
              <span className="text-[10px] font-mono text-[#61747E] uppercase block">Examination Paper</span>
              <span className="text-xs font-bold text-[#102A38] truncate block" title={printRequest.examName}>
                {printRequest.examName}
              </span>
              <span className="text-[10px] font-mono text-[#008A63]">Paper ID: {printRequest.paperId}</span>
            </div>

            <div className="p-3 bg-[#F8FAFB] border border-[#E1E8EC] rounded-xl">
              <span className="text-[10px] font-mono text-[#61747E] uppercase block">Authorized Centre</span>
              <span className="text-xs font-bold text-[#102A38]">{printRequest.centreNumber}</span>
              <span className="text-[10px] font-mono text-[#61747E]">Verified Operator Station</span>
            </div>

            <div className="p-3 bg-[#F8FAFB] border border-[#E1E8EC] rounded-xl">
              <span className="text-[10px] font-mono text-[#61747E] uppercase block">Approved Printer</span>
              <span className="text-xs font-bold text-[#102A38] truncate block">
                {printRequest.printerName || printRequest.printerId}
              </span>
              <span className="text-[10px] font-mono text-[#2672B8] font-semibold">
                Allocation: {printRequest.approvedCopies || printRequest.requestedCopies} Copies
              </span>
            </div>

            <div className="p-3 bg-[#F8FAFB] border border-[#E1E8EC] rounded-xl">
              <span className="text-[10px] font-mono text-[#61747E] uppercase block">Scheduled Unlock</span>
              <span className="text-xs font-bold text-[#102A38]">
                {printRequest.scheduledUnlockTime} ({printRequest.scheduledDate})
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3 text-[#E06D53]" />
                <span className={`text-[11px] font-mono font-bold ${isUnlocked ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {isUnlocked ? 'TIME UNLOCKED' : `LOCKED: ${formatCountdown(secondsRemaining)}`}
                </span>
              </div>
            </div>
          </div>

          {/* Surveillance & Lockout Warning System */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Video Feed & Camera Proctor */}
            <div className="bg-[#0B1721] rounded-2xl p-4 border border-[#1E3345] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[#00D09C]" />
                  <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                    Surveillance Feed
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">
                    AI PROCTORING ACTIVE
                  </span>
                </div>
              </div>

              {/* Feed Display */}
              <div className="relative aspect-video bg-[#050D13] rounded-xl overflow-hidden flex items-center justify-center border border-[#172B3A]">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
                />
                {!cameraActive && (
                  <div className="flex flex-col items-center justify-center text-center p-4">
                    <Shield className="w-10 h-10 text-[#00D09C] mb-2 opacity-80" />
                    <span className="text-xs font-mono text-gray-300 font-bold">
                      Certified Workstation Camera
                    </span>
                    <span className="text-[10px] font-mono text-gray-500 mt-1">
                      Continuous Anti-Leak Perimeter Monitoring
                    </span>
                  </div>
                )}

                {/* Stamped Watermark on Camera Feed */}
                <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur-xs rounded text-[9px] font-mono text-white/80">
                  {currentUser.centre_id || printRequest.centreNumber} • {currentUser.id} • {new Date().toLocaleTimeString()}
                </div>

                {isLocked && (
                  <div className="absolute inset-0 bg-rose-950/80 backdrop-blur-xs flex flex-col items-center justify-center text-center p-4">
                    <ShieldAlert className="w-12 h-12 text-rose-400 mb-2 animate-bounce" />
                    <span className="text-sm font-bold text-white uppercase tracking-wide">
                      WORKSTATION LOCKED OUT
                    </span>
                    <span className="text-xs text-rose-200 mt-1 max-w-xs">
                      Persistent proctoring anomalies detected (3/3 warnings). Printing disabled.
                    </span>
                  </div>
                )}
              </div>

              {/* Simulation triggers for testing/demonstration */}
              <div className="mt-3 pt-3 border-t border-[#172B3A]">
                <span className="text-[10px] font-mono text-gray-400 block mb-1.5 uppercase">
                  Simulate Proctor Threat Detection:
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={isLocked}
                    onClick={() => triggerIncident('PHONE_DETECTED')}
                    className="text-[10px] font-mono px-2 py-1 bg-[#1A2E3D] hover:bg-[#254257] disabled:opacity-50 text-gray-200 rounded border border-[#2B4B61] flex items-center gap-1"
                  >
                    <Smartphone className="w-3 h-3 text-amber-400" />
                    Phone Detected
                  </button>
                  <button
                    disabled={isLocked}
                    onClick={() => triggerIncident('MULTIPLE_PERSONS')}
                    className="text-[10px] font-mono px-2 py-1 bg-[#1A2E3D] hover:bg-[#254257] disabled:opacity-50 text-gray-200 rounded border border-[#2B4B61] flex items-center gap-1"
                  >
                    <Users className="w-3 h-3 text-rose-400" />
                    Second Person
                  </button>
                  <button
                    disabled={isLocked}
                    onClick={() => triggerIncident('SCREEN_CAPTURE')}
                    className="text-[10px] font-mono px-2 py-1 bg-[#1A2E3D] hover:bg-[#254257] disabled:opacity-50 text-gray-200 rounded border border-[#2B4B61] flex items-center gap-1"
                  >
                    <EyeOff className="w-3 h-3 text-purple-400" />
                    Screen Capture
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Security Warning Tracker & Lockout Status */}
            <div className="flex flex-col justify-between space-y-4">
              {/* Warning Level Gauge */}
              <div className="p-4 bg-[#F8FAFB] border border-[#E1E8EC] rounded-2xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-[#E06D53]" />
                    <span className="text-xs font-mono font-bold text-[#102A38] uppercase">
                      Security Warning Gauge
                    </span>
                  </div>
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                      warningCount === 0
                        ? 'bg-emerald-100 text-emerald-700'
                        : warningCount === 1
                        ? 'bg-amber-100 text-amber-800'
                        : warningCount === 2
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {warningCount} / 3 WARNINGS
                  </span>
                </div>

                {/* Progress Indicators */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div
                    className={`p-2 rounded-lg text-center border text-[11px] font-mono font-bold ${
                      warningCount >= 1
                        ? 'bg-amber-100 border-amber-300 text-amber-900'
                        : 'bg-white border-gray-200 text-gray-400'
                    }`}
                  >
                    Warning 1: Advisory
                  </div>
                  <div
                    className={`p-2 rounded-lg text-center border text-[11px] font-mono font-bold ${
                      warningCount >= 2
                        ? 'bg-orange-100 border-orange-300 text-orange-900'
                        : 'bg-white border-gray-200 text-gray-400'
                    }`}
                  >
                    Warning 2: Ack Required
                  </div>
                  <div
                    className={`p-2 rounded-lg text-center border text-[11px] font-mono font-bold ${
                      warningCount >= 3
                        ? 'bg-rose-100 border-rose-300 text-rose-900'
                        : 'bg-white border-gray-200 text-gray-400'
                    }`}
                  >
                    Warning 3: Lockout
                  </div>
                </div>

                {/* Warning 2 Acknowledgment Box */}
                {ackRequired && !isLocked && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                      <span className="text-xs font-semibold text-amber-900">
                        Second warning issued! Explicit operator acknowledgment required before proceeding.
                      </span>
                    </div>
                    <button
                      onClick={handleAcknowledgeWarning}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shrink-0 transition-colors"
                    >
                      Acknowledge Warning #2
                    </button>
                  </div>
                )}

                {/* Warning 3 Lockout Box */}
                {isLocked && (
                  <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl mb-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                      <span className="text-xs font-bold text-rose-900">
                        Workstation Locked: 3 violations recorded.
                      </span>
                    </div>
                    <p className="text-[11px] text-rose-800">
                      Reason: {session?.lockReason || 'Maximum security warning limit exceeded.'}
                    </p>
                    <button
                      onClick={() => setShowAdminResetModal(true)}
                      className="w-full mt-2 px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Key className="w-3.5 h-3.5" />
                      Administrator Security Unlock
                    </button>
                  </div>
                )}
              </div>

              {/* Watermark Forensics Notice */}
              <div className="p-4 bg-[#EDF6FA] border border-[#C5DFEB] rounded-2xl text-[#102A38] space-y-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#2672B8]" />
                  <span className="text-xs font-mono font-bold uppercase">
                    Forensic Anti-Leak Protection
                  </span>
                </div>
                <p className="text-xs text-[#334E68] leading-relaxed">
                  Every printed page contains unique high-density micro-watermarks embedding Centre{' '}
                  <span className="font-mono font-bold">{printRequest.centreNumber}</span>, Printer{' '}
                  <span className="font-mono font-bold">{printRequest.printerName || printRequest.printerId}</span>, Operator{' '}
                  <span className="font-mono font-bold">{currentUser.fullName || currentUser.id}</span>, and incremental copy identifiers.
                </p>
              </div>
            </div>
          </div>

          {/* Print Result Display */}
          {printResult && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span className="text-sm font-bold text-emerald-900">
                    Physical Print Output Confirmed
                  </span>
                </div>
                <span className="text-xs font-mono text-emerald-800">
                  Status: COMPLETED
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono text-emerald-900">
                <div>
                  <span className="text-gray-500 block">Total Stamped:</span>
                  <span className="font-bold">{printResult.watermarks?.length || printRequest.requestedCopies} Copies</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Printer Released:</span>
                  <span className="font-bold">{printResult.request?.printerName || printRequest.printerId}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Audit Hash:</span>
                  <span className="font-bold truncate block">{printResult.request?.txHash || 'SHA256-LEDGER-SEALED'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Released At:</span>
                  <span className="font-bold">{new Date().toLocaleTimeString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="px-6 py-4 bg-[#F8FAFB] border-t border-[#DCE4E8] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                !isUnlocked
                  ? 'bg-amber-500'
                  : isLocked
                  ? 'bg-rose-500'
                  : 'bg-emerald-500 animate-pulse'
              }`}
            />
            <span className="text-xs font-mono text-[#61747E]">
              {!isUnlocked
                ? 'Time Lock Active: Print button unlocks at scheduled exam time.'
                : isLocked
                ? 'Workstation locked. Admin resolution required.'
                : ackRequired
                ? 'Acknowledge warning 2 to unlock print.'
                : 'All security conditions verified. Ready for physical paper generation.'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-[#CBD5E1] text-[#334E68] hover:bg-white rounded-xl text-xs font-semibold transition-colors"
            >
              {printResult ? 'Close Enclave' : 'Cancel'}
            </button>

            {!printResult && (
              <button
                disabled={!isUnlocked || isLocked || ackRequired || releasing}
                onClick={handleExecuteRelease}
                className="px-5 py-2.5 bg-[#00A878] hover:bg-[#008A63] disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition-all"
              >
                {releasing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Watermarking & Releasing...
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4" />
                    Authorize & Print ({printRequest.requestedCopies} Copies)
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Admin Unlock Modal */}
      {showAdminResetModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-gray-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-100 rounded-lg">
                <Key className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Administrator Security Unlock</h3>
                <p className="text-xs text-gray-500">Provide audited justification to restore printing station.</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                Audited Unlock Justification Reason:
              </label>
              <textarea
                rows={3}
                value={adminResetReason}
                onChange={(e) => setAdminResetReason(e.target.value)}
                placeholder="e.g., Verified false positive: Operator repositioned camera after inspection..."
                className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAdminResetModal(false)}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                disabled={!adminResetReason.trim() || resettingLock}
                onClick={handleAdminResetLock}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
              >
                {resettingLock && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Confirm Admin Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

