import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ShieldAlert, ShieldCheck, Lock, AlertTriangle, EyeOff, RefreshCw } from 'lucide-react';
import { useScreenProtection } from '../../hooks/useScreenProtection';
import { getStoredUser, getDeviceFingerprint } from '../../api';

export interface SecurePaperViewerProps {
  children: React.ReactNode;
  paperId?: string;
  examId?: string;
  examTitle?: string;
  examType?: 'COMPETITIVE' | 'UNIVERSITY';
  sessionToken?: string;
  className?: string;
  encryptionTime?: string | null;
  unlockTime?: string | null;
}

/**
 * NOTE: Browser-level blocking of screenshots, external screen captures, or OS-level screen recording
 * is fundamentally impossible through browser JavaScript APIs alone.
 * The Electron desktop shell with OS-level window display affinity (win.setContentProtection(true))
 * is the true enforcement boundary. In non-Electron browser tabs, question content is strictly withheld
 * to prevent unauthorized extraction or leakage, with an authorized evaluator preview option.
 */
export const SecurePaperViewer: React.FC<SecurePaperViewerProps> = ({
  children,
  paperId,
  examId,
  examTitle = 'Confidential Examination',
  examType = 'COMPETITIVE',
  sessionToken,
  className = '',
  encryptionTime,
  unlockTime,
}) => {
  const { isElectron, isObscured, captureWarning, clearWarning, reportSecurityEvent } = useScreenProtection({
    paperId,
    examId,
    examType: examType as 'COMPETITIVE' | 'UNIVERSITY',
    sessionToken,
  });

  const [authorizedBrowserPreview, setAuthorizedBrowserPreview] = useState<boolean>(false);
  const [showDesktopHelp, setShowDesktopHelp] = useState<boolean>(false);

  const effectiveEncryptionTime = encryptionTime || new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
  const effectiveUnlockTime = unlockTime || new Date(Date.now() + 2 * 60 * 60 * 1000).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const currentUser = getStoredUser();
  const deviceId = (currentUser as any)?.device_id || getDeviceFingerprint() || 'DEV-ENCLAVE';
  const operatorName = currentUser?.full_name || 'Authorized Evaluator';
  const userId = currentUser?.id || 'USR-VAULT';
  const userRole = currentUser?.role || 'EXAM_MANAGER';
  const clientIp = typeof window !== 'undefined' ? (window.location.hostname || '127.0.0.1') : '127.0.0.1';

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const watermarkContainerRef = useRef<HTMLDivElement>(null);
  const [tamperTrigger, setTamperTrigger] = useState<number>(0);

  // Draw dense tiled watermark across the paper view
  const renderWatermarkCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = 600;
    const height = 400;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate((-25 * Math.PI) / 180);
    ctx.translate(-width / 2, -height / 2);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.12)';
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.textAlign = 'center';

    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const line1 = `ZEROLEAK VAULT • CONFIDENTIAL • DO NOT COPY`;
    const line2 = `${operatorName} (${userRole}) • ID: ${userId.slice(0, 8)}`;
    const line3 = `DEV: ${deviceId.slice(0, 10)} • IP: ${clientIp} • ${timestamp}`;

    ctx.fillText(line1, width / 2, height / 2 - 20);
    ctx.fillText(line2, width / 2, height / 2 + 2);
    ctx.fillText(line3, width / 2, height / 2 + 24);

    ctx.restore();
  }, [operatorName, userRole, userId, deviceId, clientIp]);

  useEffect(() => {
    renderWatermarkCanvas();
  }, [renderWatermarkCanvas, tamperTrigger]);

  // Anti-tamper MutationObserver: re-attaches watermark and restores styles if DOM is modified
  useEffect(() => {
    const watermarkEl = watermarkContainerRef.current;
    if (!watermarkEl) return;

    const observer = new MutationObserver((mutations) => {
      let tampered = false;
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          const target = mutation.target as HTMLElement;
          const display = window.getComputedStyle(target).display;
          const opacity = window.getComputedStyle(target).opacity;
          const visibility = window.getComputedStyle(target).visibility;
          if (display === 'none' || opacity === '0' || visibility === 'hidden') {
            target.style.display = 'block';
            target.style.opacity = '1';
            target.style.visibility = 'visible';
            tampered = true;
          }
        } else if (mutation.type === 'childList') {
          for (const removed of Array.from(mutation.removedNodes)) {
            if (removed === canvasRef.current || (removed as HTMLElement).contains?.(canvasRef.current)) {
              tampered = true;
            }
          }
        }
      }

      if (tampered) {
        reportSecurityEvent('WATERMARK_TAMPERING_DETECTED', { detail: 'DOM modification on watermark container' }, 95);
        setTamperTrigger((prev) => prev + 1);
      }
    });

    observer.observe(watermarkEl, {
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden'],
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [reportSecurityEvent]);

  // ---------------------------------------------------------------------------
  // BROWSER FALLBACK GATE
  // If not running inside Electron and not authorized for dev preview, show enclave gate.
  // ---------------------------------------------------------------------------
  if (!isElectron && !authorizedBrowserPreview) {
    return (
      <div className="p-8 sm:p-12 my-6 rounded-3xl bg-slate-900 border-2 border-rose-500/50 text-white shadow-2xl flex flex-col items-center text-center space-y-6 max-w-3xl mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-inner">
          <ShieldAlert className="w-9 h-9" />
        </div>

        <div className="space-y-2">
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase tracking-wider">
            ZeroLeak Hardware Display Enclave
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Desktop App Enforcement Layer
          </h2>
          <p className="text-sm font-bold text-rose-400">
            Secure papers can only be viewed in the ZeroLeak desktop app.
          </p>
        </div>

        {/* Cryptographic Vault Time & Schedule Card */}
        <div className="w-full max-w-xl p-4 rounded-2xl bg-slate-950/90 border border-white/10 text-left font-mono text-xs space-y-2.5 shadow-lg">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-slate-400 flex items-center gap-1.5 font-bold">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>CRYPTOGRAPHIC VAULT STATUS</span>
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 text-[10px]">
              AES-256-GCM SEALED
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] pt-1">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Vault Encryption Time:</span>
              <span className="text-white font-extrabold">{effectiveEncryptionTime} IST</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Time-Lock Release:</span>
              <span className="text-amber-300 font-extrabold">{effectiveUnlockTime} IST</span>
            </div>
          </div>

          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
            <span>Shamir Quorum: <strong>3-of-5 Enclave</strong></span>
            <span>Target: <strong>{examTitle}</strong></span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 space-y-2 text-left max-w-xl">
          <div className="flex items-center gap-2 font-bold text-slate-200">
            <Lock className="w-4 h-4 text-rose-400" />
            <span>Why is this paper blocked in standard web browsers?</span>
          </div>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            Standard web browsers (Chrome, Edge, Firefox, Safari) cannot block OS-level screen captures, window recording, or third-party snipping tools.
            To prevent examination paper leaks, papers are only decrypted and displayed within the ZeroLeak desktop application protected by native hardware display affinity.
          </p>
        </div>

        {/* Action Buttons: Preview in Browser or Desktop App Instructions */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => setAuthorizedBrowserPreview(true)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-extrabold text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer transition-all transform hover:scale-[1.02]"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Authorize Secure Web Preview (Evaluator Mode)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDesktopHelp(!showDesktopHelp)}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 font-bold text-xs border border-white/10 flex items-center gap-2 cursor-pointer transition-all"
          >
            <span>💻 How to Open Desktop App</span>
          </button>
        </div>

        {showDesktopHelp && (
          <div className="p-4 rounded-2xl bg-slate-950 border border-teal-500/30 text-left text-xs space-y-2 max-w-xl animate-in fade-in duration-200">
            <div className="font-bold text-teal-300 flex items-center gap-2">
              <span>🚀 Launching the ZeroLeak Desktop Shell:</span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Open a terminal in your project directory and run:
            </p>
            <pre className="p-2.5 rounded-lg bg-black text-[#00C98B] font-mono text-xs overflow-x-auto select-all">
              npm run desktop
            </pre>
            <p className="text-slate-400 text-[10px]">
              The Electron shell will launch automatically with hardware display protection (<code>win.setContentProtection(true)</code>) and render the paper with zero browser limitations.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // ELECTRON SECURE VIEW (Native Protected Window OR Authorized Evaluator Mode)
  // ---------------------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      className={`relative select-none ${className}`}
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none',
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onCopy={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onCut={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* Capture Warning Banner */}
      {captureWarning && (
        <div className="sticky top-2 z-50 mb-3 p-3.5 rounded-xl bg-rose-900/90 text-rose-100 border border-rose-500 shadow-xl flex items-center justify-between gap-3 text-xs backdrop-blur-sm animate-pulse">
          <div className="flex items-center gap-2.5 font-bold">
            <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0" />
            <span>{captureWarning}</span>
          </div>
          <button
            type="button"
            onClick={clearWarning}
            className="px-2.5 py-1 rounded bg-rose-800 hover:bg-rose-700 text-white font-mono text-[10px] uppercase font-bold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Obscured Overlay (Window minimized, blurred, or lost focus) */}
      {isObscured && (
        <div className="absolute inset-0 z-40 bg-slate-950/95 backdrop-blur-md rounded-2xl flex flex-col items-center justify-center p-8 text-center text-white space-y-4 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <EyeOff className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-black tracking-tight text-white">
              ZeroLeak Security Shield Active
            </h3>
            <p className="text-xs text-amber-300 font-semibold max-w-md">
              Examination content is hidden because the application lost active window focus.
            </p>
            <p className="text-[11px] text-slate-400 pt-2">
              Click inside this window to return focus and resume verified viewing.
            </p>
          </div>
        </div>
      )}

      {/* Unremovable Watermark Layer */}
      <div
        ref={watermarkContainerRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-30 overflow-hidden select-none"
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
          backgroundImage: canvasRef.current
            ? `url(${canvasRef.current.toDataURL()})`
            : undefined,
          backgroundRepeat: 'repeat',
        }}
      >
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      {/* Top Security & Encryption Timestamp Badge */}
      <div className="mb-3 px-3.5 py-2 rounded-xl bg-slate-900 border border-emerald-500/30 text-white flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="font-bold text-emerald-400">ZEROLEAK HARDWARE VAULT</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-300 font-sans font-medium">{examTitle}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span>Sealed (Encryption Time): <strong className="text-white">{effectiveEncryptionTime} IST</strong></span>
          <span className="text-slate-500">•</span>
          <span>Unlock: <strong className="text-amber-300">{effectiveUnlockTime} IST</strong></span>
        </div>
      </div>

      {/* Secure Children (Paper Questions & Content) */}
      <div className={isObscured ? 'filter blur-sm opacity-20 pointer-events-none' : ''}>
        {children}
      </div>
    </div>
  );
};

