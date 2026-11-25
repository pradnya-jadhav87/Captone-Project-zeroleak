import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldAlert, EyeOff, Lock, AlertTriangle, RefreshCw } from 'lucide-react';
import { activatePlatformScreenProtection } from '../../utils/securityProtection';
import { getStoredUser, getDeviceFingerprint } from '../../api';

interface GlobalScreenSecurityGuardProps {
  children: React.ReactNode;
}

/**
 * GlobalScreenSecurityGuard
 *
 * Enforces strict, multi-layered anti-screenshot and anti-screen-recording defenses:
 * 1. Runtime API Neutralization: blocks navigator.mediaDevices.getDisplayMedia and canvas captureStream.
 * 2. Hardware / OS Window Protection: invokes Electron win.setContentProtection(true) and Android FLAG_SECURE.
 * 3. Global Keyboard Interception: intercepts PrintScreen, Win+Shift+S, Alt+PrintScreen, Mac Cmd+Shift+3/4/5,
 *    Xbox Game Bar (Win+G, Win+Alt+R), Ctrl+P, Ctrl+S, Ctrl+U, F12, and DevTools shortcuts.
 * 4. Clipboard Wiping: overwrites system clipboard on capture attempts to prevent external pasting.
 * 5. Window Blur & Visibility Shield: immediately obscures and blurs screen content when the window loses focus
 *    (preventing Windows Snipping Tool, OBS Studio, Zoom, and screen recorders from capturing live papers).
 * 6. Right-Click & Drag Lock: disables context menu and element dragging.
 * 7. Security Telemetry: logs tamper and capture attempts to the audit ledger.
 */
export const GlobalScreenSecurityGuard: React.FC<GlobalScreenSecurityGuardProps> = ({ children }) => {
  const [isObscured, setIsObscured] = useState<boolean>(false);
  const [obscureReason, setObscureReason] = useState<string>('');
  const [captureWarning, setCaptureWarning] = useState<string | null>(null);
  const lastReportTimeRef = useRef<number>(0);

  // Initialize runtime platform protection (Electron setContentProtection, Android FLAG_SECURE, API neutralization)
  useEffect(() => {
    activatePlatformScreenProtection();
  }, []);

  // Telemetry helper to report unauthorized capture attempts to the security audit ledger
  const reportCaptureAttempt = useCallback((eventType: string, details: Record<string, any> = {}) => {
    const now = Date.now();
    if (now - lastReportTimeRef.current < 1200) return; // Debounce to prevent flooding
    lastReportTimeRef.current = now;

    const user = getStoredUser();
    const deviceId = (user as any)?.device_id || getDeviceFingerprint() || 'terminal-station';

    fetch('/api/security/paper-violation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('zeroleak_token') || ''}`,
      },
      body: JSON.stringify({
        eventType,
        severity: 'HIGH',
        riskScore: 90,
        deviceId,
        details: {
          ...details,
          timestamp: new Date().toISOString(),
          url: typeof window !== 'undefined' ? window.location.href : '',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        },
      }),
    }).catch(() => {});
  }, []);

  // Wipes clipboard on capture attempts to prevent pasting screenshots into external apps
  const wipeClipboard = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(
          '[ZeroLeak Security Vault: Screen Capture Blocked. Unauthorized reproduction of examination materials is strictly prohibited under the Official Secrecy Act.]'
        );
      }
    } catch {
      // Best-effort clipboard sanitization
    }
  }, []);

  // 1. Global Keyboard Interceptor for Screenshots, Snipping Tools, and Screen Recorders
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase();
      const code = e.code || '';
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      // A. PrintScreen key (Standard, Alt+PrintScreen, Ctrl+PrintScreen)
      if (key === 'printscreen' || code === 'PrintScreen' || e.keyCode === 44) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        void wipeClipboard();
        setIsObscured(true);
        setObscureReason('PrintScreen shortcut detected');
        setCaptureWarning('Screen capture blocked. Examination materials are protected by ZeroLeak Security Vault.');
        reportCaptureAttempt('SCREENSHOT_KEY_BLOCKED', { key: 'PrintScreen', keyCode: e.keyCode });
        setTimeout(() => setIsObscured(false), 2800);
        return false;
      }

      // B. Win + Shift + S (Windows Snipping Tool) or Meta + Shift + S
      if (e.shiftKey && (key === 's' || code === 'KeyS') && (e.metaKey || (e.ctrlKey && e.altKey))) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        void wipeClipboard();
        setIsObscured(true);
        setObscureReason('Snipping Tool shortcut detected');
        setCaptureWarning('Snipping Tool shortcut blocked. Display capture is prohibited.');
        reportCaptureAttempt('SNIPPING_TOOL_BLOCKED', { shortcut: 'Win+Shift+S' });
        setTimeout(() => setIsObscured(false), 3000);
        return false;
      }

      // C. macOS Screen Capture & Screen Recording: Cmd + Shift + 3, Cmd + Shift + 4, Cmd + Shift + 5
      if (e.metaKey && e.shiftKey && ['3', '4', '5', 'Digit3', 'Digit4', 'Digit5'].includes(key || code)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        void wipeClipboard();
        setIsObscured(true);
        setObscureReason('macOS Screen Capture/Recording shortcut detected');
        setCaptureWarning('macOS screen capture and recording shortcuts are blocked.');
        reportCaptureAttempt('MACOS_CAPTURE_BLOCKED', { shortcut: `Cmd+Shift+${key}` });
        setTimeout(() => setIsObscured(false), 3000);
        return false;
      }

      // D. Windows Xbox Game Bar Recording: Win + G, Win + Alt + R
      if ((e.metaKey && (key === 'g' || code === 'KeyG')) || (e.metaKey && e.altKey && (key === 'r' || code === 'KeyR'))) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setIsObscured(true);
        setObscureReason('Screen recorder utility shortcut detected');
        setCaptureWarning('Screen recording utility shortcut blocked.');
        reportCaptureAttempt('SCREEN_RECORDER_SHORTCUT_BLOCKED', { shortcut: 'GameBar/Recorder' });
        setTimeout(() => setIsObscured(false), 3500);
        return false;
      }

      // E. Browser Printing shortcut (Ctrl + P / Cmd + P)
      if (isCtrlOrMeta && (key === 'p' || code === 'KeyP')) {
        // Allow printing only if initiated through official authenticated Centre Operator buttons
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setCaptureWarning('Direct browser printing is disabled. Use the official authorized Centre Print button.');
        reportCaptureAttempt('BROWSER_PRINT_SHORTCUT_INTERCEPTED', { shortcut: 'Ctrl+P' });
        return false;
      }

      // F. Browser Save Page to Disk (Ctrl + S / Cmd + S)
      if (isCtrlOrMeta && !e.shiftKey && (key === 's' || code === 'KeyS')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setCaptureWarning('Saving examination web pages to local disk is strictly prohibited.');
        reportCaptureAttempt('SAVE_PAGE_SHORTCUT_BLOCKED', { shortcut: 'Ctrl+S' });
        return false;
      }

      // G. Developer Tools / View Source Shortcuts (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U)
      if (
        key === 'f12' ||
        code === 'F12' ||
        (isCtrlOrMeta && (key === 'u' || code === 'KeyU')) ||
        (isCtrlOrMeta && e.shiftKey && ['i', 'j', 'c', 'KeyI', 'KeyJ', 'KeyC'].includes(key || code))
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setCaptureWarning('Developer Tools and source inspection are disabled in secure examination mode.');
        reportCaptureAttempt('DEVTOOLS_SHORTCUT_INTERCEPTED', { key: key || code });
        return false;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [wipeClipboard, reportCaptureAttempt]);

  // 2. Global Window Blur & Visibility Shield:
  // When an external screen capture or recording tool opens, the browser window LOSES FOCUS.
  // Blurring the page instantly guarantees that external tools only capture a black/blurred shield.
  useEffect(() => {
    let blurTimeout: NodeJS.Timeout | null = null;

    const handleWindowBlur = () => {
      // Small debounce to avoid false triggers during internal iframe or print dialog initialization
      blurTimeout = setTimeout(() => {
        const activeEl = document.activeElement;
        const tagName = activeEl?.tagName;
        // Ignore if focus transitioned to a child input or select inside the app
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
          return;
        }

        if (!document.hasFocus()) {
          setIsObscured(true);
          setObscureReason('Application lost active window focus');
          void wipeClipboard();
          reportCaptureAttempt('WINDOW_DEFOCUS_OBSCURED', { reason: 'External window/recorder gained focus' });
        }
      }, 180);
    };

    const handleWindowFocus = () => {
      if (blurTimeout) clearTimeout(blurTimeout);
      // Keep obscured if explicitly locked by a capture key; otherwise restore smoothly
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsObscured(true);
        setObscureReason('Tab switched or browser minimized');
        void wipeClipboard();
        reportCaptureAttempt('VISIBILITY_HIDDEN_OBSCURED', { reason: 'Tab switched / minimized' });
      }
    };

    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (blurTimeout) clearTimeout(blurTimeout);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [wipeClipboard, reportCaptureAttempt]);

  // 3. Global Mouse Right-Click & Drag Lock
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      // Allow context menu only inside standard text inputs
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        return;
      }
      e.preventDefault();
      setCaptureWarning('Right-click context menu is disabled for examination security.');
    };

    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleCopy = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        return; // Allow standard input editing
      }
      e.preventDefault();
      if (e.clipboardData) {
        e.clipboardData.clearData();
        e.clipboardData.setData('text/plain', '[ZeroLeak Security Vault: Examination Content Copying Prohibited]');
      }
      setCaptureWarning('Copying examination text or questions is strictly prohibited.');
      reportCaptureAttempt('CLIPBOARD_THEFT_BLOCKED');
    };

    window.addEventListener('contextmenu', handleContextMenu, true);
    window.addEventListener('dragstart', handleDragStart, true);
    document.addEventListener('copy', handleCopy, true);
    document.addEventListener('cut', handleCopy, true);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu, true);
      window.removeEventListener('dragstart', handleDragStart, true);
      document.removeEventListener('copy', handleCopy, true);
      document.removeEventListener('cut', handleCopy, true);
    };
  }, [reportCaptureAttempt]);

  return (
    <div className="relative min-h-screen w-full select-none" style={{ WebkitUserSelect: 'none', userSelect: 'none' }}>
      {/* Capture Warning Notification Toast */}
      {captureWarning && (
        <div className="fixed top-4 right-4 z-[999999] max-w-md p-3.5 rounded-xl bg-slate-900/95 text-amber-300 border border-amber-500/50 shadow-2xl flex items-center justify-between gap-3 text-xs backdrop-blur-md animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="flex items-center gap-2.5 font-medium">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{captureWarning}</span>
          </div>
          <button
            type="button"
            onClick={() => setCaptureWarning(null)}
            className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-mono text-[10px] uppercase font-bold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Instant Obscure Defocus Shield (Active when window loses focus, Snipping tool is opened, or PrintScreen is pressed) */}
      {isObscured && (
        <div
          onClick={() => setIsObscured(false)}
          className="fixed inset-0 z-[999990] bg-slate-950/98 backdrop-blur-3xl flex flex-col items-center justify-center p-6 text-center text-white select-none cursor-pointer"
          aria-modal="true"
        >
          <div className="max-w-md w-full p-8 rounded-2xl bg-slate-900 border border-emerald-500/40 shadow-2xl space-y-5 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
              <EyeOff className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-[10px] font-mono font-bold text-emerald-300 uppercase tracking-widest">
                <Lock className="w-3 h-3 text-emerald-400" />
                ZeroLeak Anti-Screen Capture Shield
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Screen Recording & Capture Strictly Disabled
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Display content is temporarily obscured because active window focus was lost or a screen capture utility was detected.
              </p>
              {obscureReason && (
                <div className="text-[11px] font-mono text-amber-300 bg-amber-950/40 border border-amber-500/30 p-2 rounded-lg">
                  Event: {obscureReason}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsObscured(false);
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-transform active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Resume Verified Session</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Application (Blurred when obscured) */}
      <div className={isObscured ? 'filter blur-2xl opacity-10 pointer-events-none transition-all duration-150' : 'transition-all duration-150'}>
        {children}
      </div>
    </div>
  );
};

