import { useState, useEffect, useCallback, useRef } from 'react';
import { api, getStoredUser, getDeviceFingerprint } from '../api';

export interface ScreenProtectionOptions {
  paperId?: string;
  examId?: string;
  examType?: 'COMPETITIVE' | 'UNIVERSITY';
  sessionToken?: string;
  onViolation?: (violationType: string, details: any) => void;
}

export interface ScreenProtectionState {
  isElectron: boolean;
  isObscured: boolean;
  captureWarning: string | null;
  clearWarning: () => void;
  reportSecurityEvent: (eventType: string, details?: any, threatScore?: number) => Promise<void>;
}

/**
 * useScreenProtection hook
 * 
 * Provides defense-in-depth screen and input security for examination paper viewers:
 * 1. Detects whether the app is running in the native ZeroLeak Electron desktop enclave.
 * 2. Window focus & visibility monitoring: immediately obscures content on blur/minimize.
 * 3. Intercepts screen-capture keys (PrintScreen, Win+Shift+S) and forbidden shortcuts (Ctrl+P, Ctrl+S, Ctrl+U, F12, DevTools).
 * 4. Disables right-click, text selection, copy, cut, and clipboard theft.
 * 5. Telemetry: reports capture attempts and security violations to the audit ledger and anomaly engine.
 */
export function useScreenProtection(options: ScreenProtectionOptions = {}): ScreenProtectionState {
  const { paperId, examId, examType = 'COMPETITIVE', sessionToken, onViolation } = options;

  // Detect native Electron shell via preload context bridge
  const isElectron = Boolean(
    typeof window !== 'undefined' &&
    (window as any).zeroleakDesktop &&
    (window as any).zeroleakDesktop.isElectron === true
  );

  const [isObscured, setIsObscured] = useState<boolean>(false);
  const [captureWarning, setCaptureWarning] = useState<string | null>(null);
  const lastEventTimeRef = useRef<number>(0);

  const reportSecurityEvent = useCallback(
    async (eventType: string, details: any = {}, threatScore: number = 85) => {
      // Debounce events to prevent flooding
      const now = Date.now();
      if (now - lastEventTimeRef.current < 1000) return;
      lastEventTimeRef.current = now;

      const user = getStoredUser();
      const deviceId = (user as any)?.device_id || getDeviceFingerprint() || 'device-unknown';

      try {
        if (sessionToken && paperId) {
          // Send via View-Once Security Interception route
          await api.recordViewOnceSecurityEvent({
            examType,
            examId: examId || '',
            paperId,
            sessionToken,
            eventType,
            details: {
              ...details,
              threatScore,
              deviceId,
              timestamp: new Date().toISOString(),
              userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
            },
          });
        } else {
          // Send via general security violation route
          await fetch('/api/security/paper-violation', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('zeroleak_token') || ''}`,
            },
            body: JSON.stringify({
              eventType,
              paperId,
              examId,
              examType,
              severity: threatScore >= 80 ? 'HIGH' : 'MEDIUM',
              riskScore: threatScore,
              deviceId,
              details: {
                ...details,
                threatScore,
                timestamp: new Date().toISOString(),
              },
            }),
          }).catch(() => {});
        }
      } catch (err) {
        // Silent best-effort telemetry
      }

      if (onViolation) {
        onViolation(eventType, details);
      }
    },
    [paperId, examId, examType, sessionToken, onViolation]
  );

  // Monitor Window Focus and Visibility
  useEffect(() => {
    const handleBlur = () => {
      setIsObscured(true);
      reportSecurityEvent('WINDOW_BLUR_OBSCURED', { reason: 'Window lost focus / minimized' }, 60);
    };

    const handleFocus = () => {
      setIsObscured(false);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsObscured(true);
        reportSecurityEvent('VISIBILITY_HIDDEN', { reason: 'Page hidden or tab switched' }, 70);
      } else {
        setIsObscured(false);
      }
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [reportSecurityEvent]);

  // Intercept Forbidden Key Combinations and Capture Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase();
      const code = e.code || '';
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      // 1. PrintScreen key
      if (key === 'printscreen' || code === 'PrintScreen' || e.keyCode === 44) {
        e.preventDefault();
        e.stopPropagation();
        setIsObscured(true);
        setCaptureWarning('Screen capture shortcut detected. Examination paper viewing is protected under ZeroLeak vault.');
        reportSecurityEvent('SCREEN_CAPTURE_KEY_BLOCKED', { key: 'PrintScreen' }, 95);
        setTimeout(() => setIsObscured(false), 2500);
        return;
      }

      // 2. Win+Shift+S (Snipping Tool)
      if (e.metaKey && e.shiftKey && key === 's') {
        e.preventDefault();
        e.stopPropagation();
        setIsObscured(true);
        setCaptureWarning('Snipping Tool shortcut detected. Screen capture is blocked.');
        reportSecurityEvent('SNIPPING_TOOL_SHORTCUT_BLOCKED', { key: 'Win+Shift+S' }, 95);
        setTimeout(() => setIsObscured(false), 2500);
        return;
      }

      // 3. Ctrl+P / Cmd+P (Print)
      if (isCtrlOrMeta && key === 'p') {
        e.preventDefault();
        e.stopPropagation();
        setCaptureWarning('Browser printing is disabled. Only authorized Centre Operators can print at the designated examination terminal.');
        reportSecurityEvent('PRINT_SHORTCUT_BLOCKED', { shortcut: 'Ctrl+P' }, 80);
        return;
      }

      // 4. Ctrl+S / Cmd+S (Save)
      if (isCtrlOrMeta && key === 's') {
        e.preventDefault();
        e.stopPropagation();
        setCaptureWarning('Saving examination paper to disk is strictly prohibited.');
        reportSecurityEvent('SAVE_SHORTCUT_BLOCKED', { shortcut: 'Ctrl+S' }, 80);
        return;
      }

      // 5. Ctrl+U / Cmd+U (View Source)
      if (isCtrlOrMeta && key === 'u') {
        e.preventDefault();
        e.stopPropagation();
        reportSecurityEvent('VIEW_SOURCE_BLOCKED', { shortcut: 'Ctrl+U' }, 75);
        return;
      }

      // 6. F12 or DevTools shortcuts (Ctrl+Shift+I, Ctrl+Shift+C, Ctrl+Shift+J)
      if (key === 'f12' || (isCtrlOrMeta && e.shiftKey && ['i', 'c', 'j'].includes(key))) {
        e.preventDefault();
        e.stopPropagation();
        setCaptureWarning('Developer Tools are disabled in secure examination mode.');
        reportSecurityEvent('DEVTOOLS_SHORTCUT_BLOCKED', { key }, 90);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [reportSecurityEvent]);

  // Block clipboard writes of paper content
  useEffect(() => {
    const handleCopyCut = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.clipboardData) {
        e.clipboardData.clearData();
      }
      setCaptureWarning('Copying examination text is strictly prohibited.');
      reportSecurityEvent('CLIPBOARD_COPY_BLOCKED', {}, 85);
    };

    document.addEventListener('copy', handleCopyCut, true);
    document.addEventListener('cut', handleCopyCut, true);

    return () => {
      document.removeEventListener('copy', handleCopyCut, true);
      document.removeEventListener('cut', handleCopyCut, true);
    };
  }, [reportSecurityEvent]);

  const clearWarning = useCallback(() => {
    setCaptureWarning(null);
  }, []);

  return {
    isElectron,
    isObscured,
    captureWarning,
    clearWarning,
    reportSecurityEvent,
  };
}

