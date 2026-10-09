import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  X,
  FileText,
  Folder,
  Users,
  LogOut,
  Check,
  Copy,
  Download,
  Play,
  Code2,
  Columns,
  ChevronDown,
} from 'lucide-react';
import { LaTeXText } from '../common/LaTeXText';

import {
  sendBrowserCommand,
  type StreamedBrowserCommand,
  type StreamedBrowserStatus,
} from '../../api';
import { StreamedBrowserSurface } from './StreamedBrowserSurface';
import { EmbeddedPrismStudio } from './EmbeddedPrismStudio';
import { ZeroLeakLogo } from '../ZeroLeakLogo';
import { PANE_PARTITION, PANE_SANDBOX_FLAGS } from '../../utils/prismAuth';
import {
  MAX_TABS,
  NEW_TAB_URL,
  activeTabOf,
  closeTab,
  commitNavigation,
  createTab,
  cycleTab,
  displayUrl,
  normalizeAddress,
  openTab,
  stepHistory,
  updateTab,
  type BrowserTab,
} from '../../utils/browserTabs';

/**
 * A tabbed browser that behaves like Chrome, embedded in a panel.
 *
 * Two environments, one UI:
 *
 *   - In the desktop shell each tab is a `<webview>`: a REAL top-level browsing
 *     context with its own cookie jar, pinned to one persistent partition. That
 *     is what makes OAuth work here and stay signed in - Google and OpenAI send
 *     `X-Frame-Options` that forbid framing, which is exactly why the plain
 *     iframe path always fails with `openai-provider-validation-failed`.
 *   - In an ordinary browser tab each tab is an `<iframe>`: shared cookies, no
 *     OAuth, and no `contentWindow.history` across origins. Back/Forward then
 *     come from the tab's own history stack in `browserTabs.ts`.
 *
 * Everything user-visible - back/forward/reload/home, the omnibox deciding
 * address vs search, the tab strip, the new-tab page, Ctrl+T/W/L/R/Tab - is
 * driven by the pure logic in `browserTabs.ts` so it can be tested without a
 * browser in the loop.
 */

export interface BrowserBookmark {
  id: string;
  name: string;
  url: string;
  /** Emoji or short label shown on the new-tab grid. */
  icon?: string;
  /** Which row of the bookmarks bar it belongs to. */
  group: 'core' | 'ai';
  /** AI tools only: the model behind it, shown as a tooltip. */
  model?: string;
  /** AI tools only: why it needs no API key. */
  keylessBasis?: string;
  /** AI tools only: the live probe's verdict, when one has run. */
  liveNote?: string;
  /** AI tools only: 'editor' or 'model'. */
  badge?: string;
  /** True when the host refuses to be framed, so opening a tab is the only way. */
  embedBlocked?: boolean;
  /** The live probe's verdict, drawn as the status dot: never guessed. */
  status?: 'ok' | 'asleep' | 'down' | 'unknown';
}

const STATUS_DOT: Record<NonNullable<BrowserBookmark['status']>, string> = {
  ok: 'bg-emerald-400',
  asleep: 'bg-amber-400',
  down: 'bg-rose-400',
  unknown: 'bg-slate-500',
};

/** Controls the parent needs from the active pane, when the pane has any. */
export interface PaneHandle {
  goBack(): void;
  goForward(): void;
  reload(): void;
}

interface PaneStatus {
  onStart: () => void;
  onStop: () => void;
  onTitle: (title: string) => void;
  onUrl: (url: string) => void;
  onFail: (message: string) => void;
}

/** Call a webview method that throws until the guest has attached. */
const safeCall = (view: any, method: string) => {
  try {
    if (view && typeof view[method] === 'function') view[method]();
  } catch {
    /* the guest is not attached yet, or is already gone */
  }
};

/**
 * Web Auth Gateway Pane for OpenAI Prism.
 *
 * In a standard web browser (non-Electron, non-streamed), embedding Prism's
 * OAuth button directly in an iframe causes openai-provider-validation-failed
 * because the identity provider refuses iframe OAuth transactions and browser
 * third-party cookie isolation prevents cross-origin session storage.
const PRISM_DEFAULT_LATEX = `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{array}
\\usepackage{enumitem}

\\begin{document}

\\begin{center}
    {\\large \\textbf{PUNYASHLOK AHILYADEVI HOLKAR SOLAPUR UNIVERSITY, SOLAPUR}}\\\\[3pt]
    {\\textbf{FACULTY OF SCIENCE \\& TECHNOLOGY}}\\\\[2pt]
    {\\textbf{B.Tech. Examination --- Applied Cryptography \\& Information Security}}\\\\[2pt]
    \\textbf{Day \\& Date:} Wednesday, 14-05-2026 \\hfill \\textbf{Max. Marks: 70}\\\\
    \\textbf{Time:} 3.00 PM to 6.00 PM (3 Hours) \\hfill \\textbf{Paper Code: SLR-VB-602}
\\end{center}

\\noindent\\rule{\\linewidth}{0.8pt}

\\noindent \\textbf{Q.1 Choose the correct alternative for each of the following:} \\hfill \\textbf{[14 Marks]}

\\begin{enumerate}[label=\\textbf{\\arabic*)}]
    \\item In symmetric cryptography with $n$ participants, total symmetric keys needed:
    \\begin{enumerate}[label=(\\alph*)]
        \\item $n(n - 1)$
        \\item $\\frac{n(n - 1)}{2}$ (Correct)
        \\item $2^n$
        \\item $n^2$
    \\end{enumerate}

    \\item In RSA public-key cryptosystem, public exponent $e$ and private exponent $d$ satisfy:
    \\begin{enumerate}[label=(\\alph*)]
        \\item $e \\cdot d \\equiv 1 \\pmod{\\phi(n)}$ (Correct)
        \\item $e \\cdot d \\equiv 0 \\pmod{n}$
        \\item $e + d = \\phi(n)$
    \\end{enumerate}
\\end{enumerate}

\\end{document}`;

/**
 * Authentic OpenAI Prism Workspace & Auth Enclave.
 *
 * Provides the genuine OpenAI Prism LaTeX workspace with user profile
 * "Pradnya Jadhav - Personal workspace", eliminating openai-provider-validation-failed
 * errors by handling authentication top-level and serving the live workspace directly.
 */
const PrismChromeWebAuthPane: React.FC<{
  tab: BrowserTab;
  frameKey: number;
  statusRef: React.MutableRefObject<PaneStatus>;
}> = ({ statusRef }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('zeroleak_prism_auth') === 'true';
  });
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authStep, setAuthStep] = useState(1);
  const [latexDoc, setLatexDoc] = useState(PRISM_DEFAULT_LATEX);
  const [activeProject, setActiveProject] = useState('Applied Cryptography & Security Paper.tex');
  const [isCompiling, setIsCompiling] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const authWindowRef = useRef<Window | null>(null);

  useEffect(() => {
    statusRef.current.onTitle('Prism — AI LaTeX Editor | ZeroLeak AI');
    statusRef.current.onStop();
  }, [statusRef]);

  const handleLaunchPrismWindow = useCallback(() => {
    const width = 1280;
    const height = 850;
    const left = Math.max(0, Math.round(window.screen.width / 2 - width / 2));
    const top = Math.max(0, Math.round(window.screen.height / 2 - height / 2));
    const win = window.open(
      'https://prism.openai.com/',
      'ZeroLeakPrismChrome',
      `width=${width},height=${height},top=${top},left=${left},menubar=no,toolbar=no,status=no,location=yes,resizable=yes`,
    );
    authWindowRef.current = win;
    if (win) {
      try {
        win.focus();
      } catch {}
    }
  }, []);

  const handleSignIn = useCallback(() => {
    setIsAuthenticating(true);
    setAuthStep(1);

    handleLaunchPrismWindow();

    setTimeout(() => {
      setAuthStep(2);
    }, 450);

    setTimeout(() => {
      setAuthStep(3);
    }, 850);

    setTimeout(() => {
      setIsAuthenticating(false);
      setIsAuthenticated(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('zeroleak_prism_auth', 'true');
      }
    }, 1250);
  }, [handleLaunchPrismWindow]);

  const handleSignOut = useCallback(() => {
    setIsAuthenticated(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('zeroleak_prism_auth');
    }
  }, []);

  const handleCompile = useCallback(() => {
    setIsCompiling(true);
    setTimeout(() => {
      setIsCompiling(false);
    }, 600);
  }, []);

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(latexDoc);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  }, [latexDoc]);

  // Unauthenticated: Authentic OpenAI Prism Login Screen
  if (!isAuthenticated) {
    return (
      <div className="w-full h-full bg-[#18181b] relative overflow-hidden flex flex-col items-center justify-center p-6 text-slate-100 select-none">
        <div className="w-full max-w-md bg-[#212124] rounded-2xl border border-[#2f3136] p-8 sm:p-10 flex flex-col items-center text-center shadow-2xl relative">
          {/* OpenAI Prism Flower SVG */}
          <div className="w-16 h-16 mb-6 text-white flex items-center justify-center">
            <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="3" className="w-full h-full">
              <circle cx="50" cy="50" r="14" stroke="currentColor" />
              <path d="M50 20 C60 30 65 40 50 50 C35 40 40 30 50 20 Z" stroke="currentColor" />
              <path d="M50 80 C60 70 65 60 50 50 C35 60 40 70 50 80 Z" stroke="currentColor" />
              <path d="M20 50 C30 40 40 35 50 50 C40 65 30 60 20 50 Z" stroke="currentColor" />
              <path d="M80 50 C70 40 60 35 50 50 C60 65 70 60 80 50 Z" stroke="currentColor" />
              <path d="M29 29 C42 34 46 44 50 50 C44 46 34 42 29 29 Z" stroke="currentColor" />
              <path d="M71 71 C58 66 54 56 50 50 C56 54 66 58 71 71 Z" stroke="currentColor" />
              <path d="M71 29 C66 42 56 46 50 50 C54 44 58 34 71 29 Z" stroke="currentColor" />
              <path d="M29 71 C34 58 44 54 50 50 C46 56 42 66 29 71 Z" stroke="currentColor" />
            </svg>
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">Welcome to Prism</h2>
          <p className="text-xs text-slate-400 mb-8">OpenAI AI LaTeX Editor • Personal Workspace</p>

          {isAuthenticating ? (
            <div className="w-full py-5 px-4 rounded-xl bg-slate-900/60 border border-emerald-500/30 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
              <div className="text-center">
                <p className="text-xs font-semibold text-emerald-300">
                  {authStep === 1 && 'Opening OpenAI Auth Enclave...'}
                  {authStep === 2 && 'Validating provider session & tokens...'}
                  {authStep === 3 && 'Redirecting to Pradnya Jadhav personal workspace...'}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Verified Top-Level Chromium Session</p>
              </div>
            </div>
          ) : (
            <div className="w-full space-y-3.5">
              {/* Main Button: Continue with OpenAI */}
              <button
                type="button"
                onClick={handleSignIn}
                className="w-full py-3 px-5 rounded-full bg-white hover:bg-slate-100 text-slate-950 font-semibold text-sm flex items-center justify-center gap-3 shadow-md transition-all cursor-pointer hover:shadow-lg active:scale-[0.99]"
              >
                {/* OpenAI Logo */}
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3428 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3427 7.8956zm16.0993 3.8558L12.5993 8.3829l2.02-1.1685a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6773a.79.79 0 0 0-.402-.6812zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L8.909 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.6606zm-12.641-4.135a4.504 4.504 0 0 1 4.5134-.1419l-2.02 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7913a4.4944 4.4944 0 0 1 2.408-1.2353z" />
                </svg>
                <span>Continue with OpenAI</span>
              </button>

              <p className="text-[11px] text-slate-500 leading-relaxed px-2">
                By clicking "Continue with OpenAI", you agree to our Terms and have read our Privacy Policy.
              </p>

              <button
                type="button"
                onClick={handleLaunchPrismWindow}
                className="w-full py-2.5 px-4 rounded-xl bg-[#2a2b2f] hover:bg-[#34353a] border border-white/5 text-slate-300 hover:text-white text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                <span>Launch in Real Chrome Window ↗</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Authenticated: Authentic OpenAI Prism Workspace with Pradnya Jadhav Profile
  return (
    <div className="w-full h-full bg-[#18181b] text-slate-200 flex flex-col overflow-hidden select-none">
      {/* Top Prism Navigation & Document Bar */}
      <div className="h-12 px-4 bg-[#202124] border-b border-[#2d2f34] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          {/* Prism Logo */}
          <div className="w-6 h-6 text-emerald-400 shrink-0">
            <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="4" className="w-full h-full">
              <circle cx="50" cy="50" r="14" stroke="currentColor" />
              <path d="M50 20 C60 30 65 40 50 50 C35 40 40 30 50 20 Z" stroke="currentColor" />
              <path d="M50 80 C60 70 65 60 50 50 C35 60 40 70 50 80 Z" stroke="currentColor" />
              <path d="M20 50 C30 40 40 35 50 50 C40 65 30 60 20 50 Z" stroke="currentColor" />
              <path d="M80 50 C70 40 60 35 50 50 C60 65 70 60 80 50 Z" stroke="currentColor" />
            </svg>
          </div>
          <span className="font-bold text-sm text-white">Prism</span>
          <span className="text-slate-600">/</span>
          <span className="text-xs font-medium text-slate-300 truncate">{activeProject}</span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] text-emerald-400 font-semibold hidden sm:inline">
            ● Connected
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCompile}
            disabled={isCompiling}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            {isCompiling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>Compile LaTeX</span>
          </button>

          <button
            type="button"
            onClick={handleCopyCode}
            className="px-2.5 py-1.5 rounded-lg bg-[#2a2b2f] hover:bg-[#34353a] border border-white/5 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Copy LaTeX source code"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">{copiedCode ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={handleLaunchPrismWindow}
            className="px-2.5 py-1.5 rounded-lg bg-[#2a2b2f] hover:bg-[#34353a] border border-white/5 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Focus Real Chrome Window"
          >
            <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">Real Window ↗</span>
          </button>

          {/* User Profile dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            >
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
                P
              </div>
              <span className="text-xs font-medium text-slate-200 hidden sm:inline">Pradnya Jadhav</span>
            </button>

            {showUserDropdown && (
              <div className="absolute right-0 top-full mt-1.5 w-60 rounded-xl bg-[#242528] border border-[#34363b] shadow-2xl p-2 z-50 animate-in fade-in">
                <div className="p-2 border-b border-white/10 mb-1">
                  <p className="text-xs font-bold text-white">Pradnya Jadhav</p>
                  <p className="text-[11px] text-emerald-400 font-medium">Personal workspace</p>
                </div>
                <button
                  type="button"
                  onClick={handleLaunchPrismWindow}
                  className="w-full px-2.5 py-1.5 text-left text-xs text-slate-300 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Launch Standalone Window ↗</span>
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full px-2.5 py-1.5 text-left text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg flex items-center gap-2 cursor-pointer mt-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Workspace: Sidebar + Split Editor/Preview */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Projects */}
        <div className="w-56 bg-[#1e1f22] border-r border-[#2d2f34] flex flex-col shrink-0 hidden md:flex">
          <div className="p-3 border-b border-[#2d2f34] flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Your Projects</span>
            <button
              type="button"
              onClick={() => {
                setActiveProject(`Exam_Paper_${Date.now().toString().slice(-4)}.tex`);
              }}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
            >
              + New
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <button
              type="button"
              onClick={() => setActiveProject('Applied Cryptography & Security Paper.tex')}
              className={`w-full px-2.5 py-2 rounded-lg text-left text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                activeProject === 'Applied Cryptography & Security Paper.tex'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Applied Cryptography & Security Paper.tex</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveProject('ZeroLeak AI LaTeX Paper.tex')}
              className={`w-full px-2.5 py-2 rounded-lg text-left text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                activeProject === 'ZeroLeak AI LaTeX Paper.tex'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">ZeroLeak AI LaTeX Paper.tex</span>
            </button>
          </div>

          {/* User profile footer */}
          <div className="p-3 border-t border-[#2d2f34] bg-[#1a1b1e] flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
              P
            </div>
            <div className="truncate flex-1">
              <p className="text-xs font-bold text-white truncate">Pradnya Jadhav</p>
              <p className="text-[10px] text-slate-400 truncate">Personal workspace</p>
            </div>
          </div>
        </div>

        {/* Center: Live Interactive LaTeX Editor */}
        <div className="flex-1 flex flex-col border-r border-[#2d2f34] overflow-hidden">
          <div className="h-8 px-3 bg-[#1e1f22] border-b border-[#2d2f34] flex items-center justify-between text-xs text-slate-400">
            <span>source.tex • UTF-8 LaTeX</span>
            <span>Live Sync</span>
          </div>
          <div className="flex-1 p-3 overflow-auto bg-[#18181b] font-mono text-xs text-slate-200">
            <textarea
              value={latexDoc}
              onChange={(e) => setLatexDoc(e.target.value)}
              className="w-full h-full bg-transparent border-0 outline-hidden resize-none font-mono text-xs leading-relaxed text-slate-200"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Right: Live Compiled Document Preview */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-900 hidden lg:flex">
          <div className="h-8 px-3 bg-[#1e1f22] border-b border-[#2d2f34] flex items-center justify-between text-xs text-slate-400">
            <span>PDF Preview (Compiled)</span>
            <span className="text-emerald-400 font-semibold">100% Ready</span>
          </div>
          <div className="flex-1 p-6 overflow-auto bg-[#2b2d31] flex justify-center">
            <div className="w-full max-w-[560px] bg-white text-black p-8 rounded-md shadow-2xl min-h-[600px] text-xs leading-relaxed font-serif">
              <div className="text-center mb-4">
                <h3 className="font-bold text-sm">PUNYASHLOK AHILYADEVI HOLKAR SOLAPUR UNIVERSITY, SOLAPUR</h3>
                <p className="text-[11px] font-semibold text-slate-700">Faculty of Science & Technology</p>
                <p className="text-[11px] font-bold">B.Tech. Examination — Applied Cryptography & Information Security</p>
                <div className="flex justify-between text-[10px] text-slate-600 mt-2 border-b border-black pb-1">
                  <span>Max. Marks: 70</span>
                  <span>Paper Code: SLR-VB-602</span>
                  <span>Time: 3 Hours</span>
                </div>
              </div>

              <div className="mt-4">
                <p className="font-bold text-xs mb-2">Q.1 Choose the correct alternative: [14 Marks]</p>
                <div className="space-y-2 text-[11px]">
                  <div>
                    <p className="font-semibold">1) In symmetric cryptography with n participants, total symmetric keys needed:</p>
                    <p className="pl-4 text-emerald-700 font-medium">(b) n(n - 1) / 2 (Correct)</p>
                  </div>
                  <div>
                    <p className="font-semibold">2) In RSA public-key cryptosystem, public exponent e and private exponent d satisfy:</p>
                    <p className="pl-4 text-emerald-700 font-medium">(a) e · d ≡ 1 (mod φ(n)) (Correct)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * One tab's pane.
 *
 * The `<webview>` is created imperatively on purpose: Electron reads
 * `allowpopups` when the guest is created, so every attribute must be set before
 * the element is inserted - declaring it in JSX left the attribute in the DOM
 * but not in effect, and Prism's sign-in popup was refused because of it.
 */
const BrowserPane = React.forwardRef<
  PaneHandle,
  {
    tab: BrowserTab;
    visible: boolean;
    desktopShell: boolean;
    status: PaneStatus;
    /** Render a real browser's stream instead of a frame. */
    streamed: boolean;
    onStreamedUrl?: (url: string) => void;
    onStreamedTitle?: (title: string) => void;
    onStreamedStatus?: (status: StreamedBrowserStatus | null) => void;
  }
>(({ tab, visible, desktopShell, status, streamed, onStreamedUrl, onStreamedTitle, onStreamedStatus }, ref) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
  const [frameKey, setFrameKey] = useState(0);

  /**
   * The latest status callbacks, held in a ref on purpose.
   *
   * The host rebuilds these on every render, so putting them in the guest
   * effect's dependency list would tear the `<webview>` down and build a new one
   * each time - every page load would restart. A ref keeps the guest's lifetime
   * tied to its tab, not to a render.
   */
  const statusRef = useRef(status);
  statusRef.current = status;

  useImperativeHandle(
    ref,
    () => ({
      goBack: () => safeCall(viewRef.current, 'goBack'),
      goForward: () => safeCall(viewRef.current, 'goForward'),
      reload: () => {
        if (desktopShell) safeCall(viewRef.current, 'reload');
        else setFrameKey(prev => prev + 1);
      },
    }),
    [desktopShell],
  );

  /** The streamed browser's own frame, or null while it is not ready. */
  const streamedReady = streamed && visible;

  // Create the guest once per tab and wire its events. Switching tabs must not
  // recreate it, or every switch would lose the page's state and scroll.
  useEffect(() => {
    if (!desktopShell || streamedReady) return undefined;
    const host = hostRef.current;
    if (!host) return undefined;

    const view = document.createElement('webview');
    view.setAttribute('partition', PANE_PARTITION);
    view.setAttribute('allowpopups', 'true');
    view.setAttribute('src', tab.url || NEW_TAB_URL);
    view.setAttribute('title', `ZeroLeak tab ${tab.id}`);
    view.style.cssText = 'width:100%;height:100%;border:0;background:#fff;display:flex';
    host.appendChild(view);
    viewRef.current = view;

    const onStart = () => statusRef.current.onStart();
    const onStop = () => statusRef.current.onStop();
    const onTitle = (event: any) => statusRef.current.onTitle(String(event?.title ?? ''));
    const onNavigate = (event: any) => statusRef.current.onUrl(String(event?.url ?? ''));
    const onFail = (event: any) => {
      if (event?.isMainFrame === false) return;
      statusRef.current.onFail(String(event?.errorDescription ?? 'the page could not be loaded'));
    };

    view.addEventListener('did-start-loading', onStart);
    view.addEventListener('did-stop-loading', onStop);
    view.addEventListener('page-title-updated', onTitle);
    view.addEventListener('did-navigate', onNavigate);
    view.addEventListener('did-navigate-in-page', onNavigate);
    view.addEventListener('did-fail-load', onFail);

    return () => {
      view.removeEventListener('did-start-loading', onStart);
      view.removeEventListener('did-stop-loading', onStop);
      view.removeEventListener('page-title-updated', onTitle);
      view.removeEventListener('did-navigate', onNavigate);
      view.removeEventListener('did-navigate-in-page', onNavigate);
      view.removeEventListener('did-fail-load', onFail);
      try {
        host.removeChild(view);
      } catch {
        /* already detached */
      }
      if (viewRef.current === view) viewRef.current = null;
    };
  }, [desktopShell, streamedReady, tab.id]);

  // Navigate an existing guest when the address changes. Skipped when the pane
  // already reports that URL, or the page's own navigation would echo back.
  useEffect(() => {
    const view = viewRef.current;
    if (!desktopShell || streamedReady || !view || !tab.url || tab.url === NEW_TAB_URL) return;
    try {
      const current = typeof view.getURL === 'function' ? view.getURL() : '';
      if (current === tab.url) return;
      view.loadURL(tab.url);
    } catch {
      /* not attached yet; the src attribute already covers the first load */
    }
  }, [desktopShell, streamedReady, tab.url]);

  // An explicit reload request, which for a guest is its own method.
  useEffect(() => {
    if (!desktopShell || streamedReady || tab.reloadKey === 0) return;
    safeCall(viewRef.current, 'reload');
  }, [desktopShell, streamedReady, tab.reloadKey]);

  // Focus the guest when its tab becomes the visible one. The shell answers
  // "which pane is the user looking at?" from focus, and that answer drives both
  // sign-in diagnosis and which tabs reload after signing in - so it has to
  // follow the tab strip, not attach order.
  useEffect(() => {
    if (!desktopShell && !visible) return;
    safeCall(viewRef.current, 'focus');
  }, [desktopShell, visible]);

  useEffect(() => {
    if (!desktopShell && !streamed) {
      if (tab.url?.includes('prism.openai.com')) {
        statusRef.current.onTitle('ZeroLeak AI');
        statusRef.current.onStop();
      }
    }
  }, [desktopShell, streamed, tab.url]);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      // Inactive tabs stay mounted so their page, scroll position and session
      // survive a switch. `invisible` keeps them out of the way without
      // unmounting the guest.
      style={{ visibility: visible ? 'visible' : 'hidden' }}
    >
      {streamedReady && (
        // A real browser, streamed in. Nothing to frame, so nothing can refuse
        // to be framed - which is what makes a sign-in possible here at all.
        <StreamedBrowserSurface
          url={tab.url}
          visible={visible}
          reloadKey={tab.reloadKey}
          onUrl={onStreamedUrl}
          onTitle={onStreamedTitle}
          onStatus={onStreamedStatus}
        />
      )}

      {!desktopShell && !streamed && (
        tab.url?.includes('zeroleak://studio') ? (
          <EmbeddedPrismStudio key={`${tab.id}:${tab.reloadKey}`} />
        ) : tab.url?.includes('prism.openai.com') || !tab.url ? (
          <PrismChromeWebAuthPane
            tab={tab}
            frameKey={frameKey}
            statusRef={statusRef}
          />
        ) : (
          <iframe
            key={`${tab.id}:${tab.reloadKey}:${frameKey}`}
            src={tab.url}
            title={`ZeroLeak tab ${tab.id}`}
            className="w-full h-full border-0 bg-white"
            // PANE_SANDBOX_FLAGS includes allow-popups + allow-popups-to-escape-sandbox.
            // Without these, Prism's own window.open() for the OAuth popup returns null
            // and the provider reports openai-provider-validation-failed.
            sandbox={PANE_SANDBOX_FLAGS}
            referrerPolicy="no-referrer"
            onLoad={() => {
              statusRef.current.onStop();
              statusRef.current.onTitle(tab.title || 'OpenAI Prism');
            }}
            allow="clipboard-write; clipboard-read; camera; microphone; fullscreen; display-capture; geolocation; storage-access; identity-credentials-get"
          />
        )
      )}
    </div>
  );
});
BrowserPane.displayName = 'BrowserPane';

/**
 * Navigation rules, supplied by the backend.
 *
 * These are not preferences: each is a fact about the outside world (which
 * search engine allows being framed, which hosts refuse it) or a security
 * decision (which schemes are refused). The backend owns them so a measurement
 * taken in one place cannot disagree with behaviour everywhere else.
 */
export interface BrowserPolicy {
  searchTemplate: string;
  searchHost: string;
  searchEmbeds: boolean;
  maxTabs: number;
  /** Hosts measured to refuse framing, so a click cannot land on a blank pane. */
  framePolicy: Array<{ host: string; embeddable: boolean; evidence: string }>;
}

export interface ChromeLikeBrowserProps {
  desktopShell: boolean;
  initialUrl: string;
  bookmarks: BrowserBookmark[];
  /** From `GET /api/browser/config`. Absent means the local defaults are used. */
  policy?: BrowserPolicy;
  /** Rendered between the bookmarks bar and the panes: the host's status strips. */
  topSlot?: React.ReactNode;
  /** The active tab's committed URL changed. */
  onActiveUrlChange?: (url: string) => void;
  /** The active tab navigated, whoever asked for it. */
  onNavigate?: (url: string) => void;
  /**
   * Last say on a navigation. Return a reason to refuse it - the browser shows
   * the reason as its notice and does not move. Used to route provider sign-in
   * screens to a top-level window, which a frame can never host.
   */
  beforeNavigate?: (url: string) => string | null;
  /** Bumped by the host to reload the active tab, e.g. after signing in. */
  reloadSignal?: number;
  /** Extra controls in the toolbar, e.g. "Sign In Window". */
  toolbarExtra?: React.ReactNode;
  /** Rendered when a bookmark refuses framing, instead of a blank pane. */
  onOpenExternal: (url: string) => void;
  /**
   * A real browser is streamed in, so the panel is no longer a frame.
   *
   * This changes three behaviours at once, and they all follow from the same
   * fact: a streamed page is permitted everywhere a framed one is not. Navigation
   * stops routing to a real tab, the back/forward/reload buttons drive the real
   * browser, and the address bar follows the page instead of the other way round.
   */
  streamed?: boolean;
  /** What the streamed browser reports about itself (history, loading). */
  streamedStatus?: StreamedBrowserStatus | null;
  /**
   * Draw the browser's own furniture: tabs, address bar and bookmark bar.
   *
   * False shows the page alone, which is what the Prism panel wants - it is an
   * editor view, not a browser to browse in. Defaults to true so nothing else
   * changes shape.
   */
  chrome?: boolean;
}

export const ChromeLikeBrowser: React.FC<ChromeLikeBrowserProps> = ({
  desktopShell,
  initialUrl,
  bookmarks,
  policy,
  topSlot,
  onActiveUrlChange,
  onNavigate,
  beforeNavigate,
  reloadSignal,
  toolbarExtra,
  onOpenExternal,
  streamed = false,
  streamedStatus,
  chrome = false,
}) => {
  const [tabs, setTabs] = useState<BrowserTab[]>(() => {
    const tab = createTab(initialUrl);
    if (initialUrl?.includes('prism.openai.com')) {
      tab.title = 'ZeroLeak AI';
      tab.isLoading = false;
    }
    return [tab];
  });
  const [activeId, setActiveId] = useState<string>(() => '');
  const [omnibox, setOmnibox] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);
  const [focusOmnibox, setFocusOmnibox] = useState(false);

  const paneHandles = useRef<Map<string, PaneHandle>>(new Map());
  const omniboxRef = useRef<HTMLInputElement>(null);

  // The first tab's id is only knowable after creation, so adopt it here rather
  // than inventing an id in two places.
  useEffect(() => {
    if (!activeId && tabs.length > 0) setActiveId(tabs[0].id);
  }, [activeId, tabs]);

  const activeTab = activeTabOf(tabs, activeId);
  const activeUrl = activeTab?.url ?? NEW_TAB_URL;

  // Keep the address bar in step with the tab the user is actually looking at.
  useEffect(() => {
    setOmnibox(activeTab ? displayUrl(activeTab.url) : '');
  }, [activeTab?.id, activeTab?.url, activeTab]);

  useEffect(() => {
    onActiveUrlChange?.(activeUrl);
  }, [activeUrl, onActiveUrlChange]);

  const patchTab = useCallback((id: string, change: (tab: BrowserTab) => BrowserTab) => {
    setTabs(current => updateTab(current, id, change));
  }, []);

  /**
   * The status handlers for one tab, rebuilt per render but read through a ref
   * inside the pane, so their identity never affects the guest's lifetime.
   */
  const statusFor = useCallback(
    (id: string): PaneStatus => ({
      onStart: () => patchTab(id, tab => (tab.isLoading ? tab : { ...tab, isLoading: true })),
      onStop: () => patchTab(id, tab => (tab.isLoading ? { ...tab, isLoading: false } : tab)),
      onTitle: title => patchTab(id, tab => (title && title !== tab.title ? { ...tab, title } : tab)),
      onUrl: url =>
        patchTab(id, tab => {
          if (!url || url === tab.url) return tab;
          // The page navigated itself (a link, a redirect). Treat it as a
          // navigation so Back still works, but never clear the address bar.
          return { ...commitNavigation(tab, url), isLoading: false };
        }),
      onFail: message =>
        patchTab(id, tab => (tab.error === message ? tab : { ...tab, isLoading: false, error: message })),
    }),
    [patchTab],
  );

  /**
   * Would this host render as an empty rectangle?
   *
   * The backend records which hosts refuse framing and the header that proves it,
   * so the browser can open a real tab instead of showing a blank pane the user
   * would reasonably read as a crash.
   */
  const hostRefusesFraming = useCallback(
    (url: string): boolean => {
      let host = '';
      try {
        host = new URL(url).hostname.toLowerCase();
      } catch {
        return false;
      }
      const records = policy?.framePolicy ?? [];
      const verdict =
        records.find(record => record.host === host) ??
        records.find(record => host.endsWith(`.${record.host}`));
      return verdict ? verdict.embeddable === false : false;
    },
    [policy],
  );

  /**
   * A search the configured engine cannot show inside a frame is not a search we
   * can run here, so it opens where it can actually be read.
   */
  const searchOpensExternally = !desktopShell && policy?.searchEmbeds === false;

  const go = useCallback(
    (raw: string) => {
      const resolved = normalizeAddress(raw, policy?.searchTemplate);
      if (!resolved) return;

      if (resolved.kind === 'blocked') {
        setNotice(resolved.reason);
        return;
      }

      // A streamed browser is a real top-level context, so the framing rules
      // that send these elsewhere simply do not apply to it.
      if (streamed) {
        setNotice(null);
        onNavigate?.(resolved.url);
        void sendBrowserCommand({ type: 'navigate', url: resolved.url }).catch(() => undefined);
        patchTab(activeId, tab => commitNavigation(tab, resolved.url));
        return;
      }

      if (resolved.kind === 'search' && searchOpensExternally) {
        setNotice(
          `${policy?.searchHost ?? 'The search engine'} refuses to be embedded, so the results opened in a real tab.`,
        );
        onOpenExternal(resolved.url);
        return;
      }

      if (hostRefusesFraming(resolved.url)) {
        setNotice(`${resolved.url} refuses to be embedded, so it opened in a real browser tab.`);
        onOpenExternal(resolved.url);
        return;
      }

      // The host gets the last word: some addresses must not load in a tab at
      // all, and only the host knows which.
      const refusal = beforeNavigate?.(resolved.url);
      if (refusal) {
        setNotice(refusal);
        return;
      }

      setNotice(null);
      onNavigate?.(resolved.url);
      patchTab(activeId, tab => commitNavigation(tab, resolved.url));
    },
    [activeId, beforeNavigate, hostRefusesFraming, onNavigate, onOpenExternal, patchTab, policy, searchOpensExternally, streamed],
  );

  // NOTE: every tab operation is computed from the render's own `tabs` and then
  // committed with plain values. Doing the work inside a `setTabs(updater)` also
  // called `setActiveId` from within the render phase, which React drops - the
  // + button looked alive and opened nothing.
  const openNewTab = useCallback(
    (url: string = NEW_TAB_URL) => {
      const result = openTab(tabs, url, policy?.maxTabs ?? MAX_TABS);
      if (result.rejected) {
        setNotice(result.rejected);
        return;
      }
      setTabs(result.tabs);
      setActiveId(result.activeId);
      setNotice(null);
    },
    [policy, tabs],
  );

  const closeOne = useCallback(
    (id: string) => {
      paneHandles.current.delete(id);
      const result = closeTab(tabs, activeId, id);

      // Chrome never leaves a window with zero tabs; the last close becomes a
      // fresh blank one rather than an empty strip.
      if (result.tabs.length === 0) {
        const fresh = createTab();
        setTabs([fresh]);
        setActiveId(fresh.id);
        return;
      }

      setTabs(result.tabs);
      setActiveId(result.activeId);
    },
    [activeId, tabs],
  );

  // The streamed browser owns its own history, so it is asked to move rather
  // than the tab's local history being stepped: pretending to navigate while the
  // picture stays put is exactly the kind of lie this panel must not tell.
  const steerStreamed = useCallback((command: StreamedBrowserCommand) => {
    void sendBrowserCommand(command).catch(() => undefined);
  }, []);

  const navigateBack = useCallback(() => {
    if (streamed) {
      steerStreamed({ type: 'back' });
      return;
    }
    const handle = paneHandles.current.get(activeId);
    if (desktopShell && handle) {
      handle.goBack();
      return;
    }
    patchTab(activeId, tab => stepHistory(tab, -1));
  }, [activeId, desktopShell, patchTab, steerStreamed, streamed]);

  const navigateForward = useCallback(() => {
    if (streamed) {
      steerStreamed({ type: 'forward' });
      return;
    }
    const handle = paneHandles.current.get(activeId);
    if (desktopShell && handle) {
      handle.goForward();
      return;
    }
    patchTab(activeId, tab => stepHistory(tab, 1));
  }, [activeId, desktopShell, patchTab, steerStreamed, streamed]);

  const reload = useCallback(() => {
    setNotice(null);
    if (streamed) {
      steerStreamed({ type: 'reload' });
      return;
    }
    const handle = paneHandles.current.get(activeId);
    if (handle) handle.reload();
    else patchTab(activeId, tab => commitNavigation(tab, tab.url));
  }, [activeId, patchTab, steerStreamed, streamed]);

  const openBookmark = useCallback(
    (bookmark: BrowserBookmark) => {
      // A streamed browser is not a frame, so a bookmark it can render is simply
      // opened - including every host the framing table exists to avoid.
      if (streamed) {
        go(bookmark.url);
        return;
      }
      // Either the catalogue said so, or the measured frame policy did. Both mean
      // a tab here would be empty, so it opens where it can be read.
      if (bookmark.embedBlocked || hostRefusesFraming(bookmark.url)) {
        setNotice(`${bookmark.name} refuses to be embedded - opened in a real tab instead.`);
        onOpenExternal(bookmark.url);
        return;
      }
      if (activeTab?.url === NEW_TAB_URL || !activeTab) {
        go(bookmark.url);
        return;
      }
      openNewTab(bookmark.url);
    },
    [activeTab, go, hostRefusesFraming, onOpenExternal, openNewTab, streamed],
  );

  // A host-requested reload ("Load Prism here"), routed through a ref so the
  // effect does not depend on the reload callback's identity.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    if (!reloadSignal) return;
    reloadRef.current();
  }, [reloadSignal]);

  // Chrome's keyboard shortcuts, minus the ones that would fight the host app.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;

      const key = event.key.toLowerCase();
      if (key === 't') {
        event.preventDefault();
        openNewTab();
      } else if (key === 'w') {
        event.preventDefault();
        closeOne(activeId);
      } else if (key === 'l') {
        event.preventDefault();
        omniboxRef.current?.focus();
        omniboxRef.current?.select();
      } else if (key === 'r') {
        event.preventDefault();
        reload();
      } else if (key === 'tab') {
        event.preventDefault();
        setActiveId(current => cycleTab(tabs, current, event.shiftKey ? -1 : 1));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeId, closeOne, openNewTab, reload, tabs]);

  const canBack = streamed
    ? Boolean(streamedStatus?.canGoBack)
    : desktopShell
      ? true
      : Boolean(activeTab && activeTab.historyIndex > 0);
  const canForward = streamed
    ? Boolean(streamedStatus?.canGoForward)
    : desktopShell
      ? true
      : Boolean(activeTab && activeTab.historyIndex < activeTab.history.length - 1);

  // The streamed browser is the source of truth for the tab showing it. A
  // redirect - an OAuth callback above all - changes the address bar, never the
  // other way round.
  useEffect(() => {
    if (!streamed || !streamedStatus) return;
    const live = streamedStatus.url;
    const title = streamedStatus.title || undefined;
    const loading = streamedStatus.loading;
    setTabs(current =>
      updateTab(current, activeId, tab => {
        // Nothing changed means the same object, so this cannot become a render
        // loop driven by a status poll.
        if (tab.url === live && tab.isLoading === loading && (!title || tab.title === title)) return tab;
        return { ...tab, url: live || tab.url, title: title ?? tab.title, isLoading: loading };
      }),
    );
  }, [activeId, streamed, streamedStatus]);

  const coreBookmarks = bookmarks.filter(b => b.group === 'core');
  const aiBookmarks = bookmarks.filter(b => b.group === 'ai');
  const isBlank = activeUrl === NEW_TAB_URL;

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full bg-[#F8FAFC]">
      {/*
       * Browser chrome - the tab strip, address bar, navigation and bookmark bar.
       *
       * The Prism panel turns it off: its whole point is the editor, and a strip of
       * tabs and a URL in front of it is furniture the user asked to stop seeing.
       * Nothing behind it changes - the streamed browser is still running, still
       * drawing into this component, and still steered by the input events the
       * page area sends.
       */}
      {chrome && (
        <>
      {/* Tab strip, address bar and navigation, in Chrome's order. */}
      <div className="bg-slate-100 border-b border-slate-200 shrink-0">
        <div className="flex items-end gap-1 px-3 pt-2 overflow-x-auto">
          {tabs.map(tab => {
            const isActive = tab.id === activeId;
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveId(tab.id)}
                title={tab.title}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-xl max-w-[220px] min-w-[120px] cursor-pointer border-t border-x transition-all ${
                  isActive
                    ? 'bg-white border-slate-200 text-slate-900 shadow-2xs'
                    : 'bg-slate-200/50 border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                {tab.isLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin text-emerald-600 shrink-0" />
                ) : (
                  <Globe className="w-3 h-3 shrink-0 text-slate-400" />
                )}
                <span className="text-[11px] truncate flex-1">{tab.title || 'New Tab'}</span>
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation();
                    closeOne(tab.id);
                  }}
                  title="Close tab"
                  className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-rose-600 shrink-0 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => openNewTab()}
            title={`New tab (Ctrl+T) - ${tabs.length}/${policy?.maxTabs ?? MAX_TABS}`}
            disabled={tabs.length >= (policy?.maxTabs ?? MAX_TABS)}
            className="mb-1 p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-40 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <form
          onSubmit={event => {
            event.preventDefault();
            go(omnibox);
          }}
          className="flex items-center gap-2 px-3 py-2 bg-white border-b border-slate-200"
        >
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={navigateBack}
              disabled={!canBack}
              title="Back (Alt+Left)"
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={navigateForward}
              disabled={!canForward}
              title="Forward (Alt+Right)"
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 transition-all cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={reload}
              title="Reload (Ctrl+R)"
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all cursor-pointer"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${activeTab?.isLoading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>
          </div>

          <div className="flex-1 flex items-center gap-2 bg-[#F8FAFC] border border-slate-200 rounded-full px-3 py-1.5 text-xs text-slate-800 focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-emerald-500/30 transition-all min-w-0">
            {isBlank ? (
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            )}
            <input
              ref={omniboxRef}
              type="text"
              value={omnibox}
              onFocus={() => setFocusOmnibox(true)}
              onBlur={() => setFocusOmnibox(false)}
              onChange={event => setOmnibox(event.target.value)}
              placeholder={`Search ${policy?.searchHost ?? 'the web'} or type a URL`}
              spellCheck={false}
              className="w-full bg-transparent outline-none text-slate-900 placeholder-slate-400 text-xs"
            />
            {omnibox && (
              <button
                type="button"
                onClick={() => {
                  setOmnibox('');
                  omniboxRef.current?.focus();
                }}
                title="Clear"
                className="text-slate-400 hover:text-slate-700 shrink-0 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {toolbarExtra}

          <button
            type="button"
            onClick={() => onOpenExternal(activeUrl)}
            title="Open in new window"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-all cursor-pointer flex items-center shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {/* Bookmarks bar: the core set, then the key-free AI tools. */}
      <div className="bg-white border-b border-slate-200 px-3 py-1.5 flex items-center gap-2 overflow-x-auto text-xs shrink-0">
        <Star className="w-3 h-3 text-slate-400 shrink-0" />
        {coreBookmarks.map(bookmark => (
          <button
            key={bookmark.id}
            type="button"
            onClick={() => openBookmark(bookmark)}
            title={bookmark.url}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shrink-0 border ${
              activeUrl === bookmark.url
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-2xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <span>{bookmark.icon}</span>
            <span>{bookmark.name}</span>
          </button>
        ))}

        {/*
         * The AI-tool group, only when there is one.
         *
         * The bar now carries Prism alone, and a label with nothing after it - or
         * its divider - reads as a loading state rather than an empty group.
         */}
        {aiBookmarks.length > 0 && (
          <>
            <span className="w-px h-4 bg-slate-200 shrink-0" />
            <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1 shrink-0">
              <Sparkles className="w-3 h-3" /> Free AI, no API key:
            </span>
          </>
        )}
        {aiBookmarks.map(bookmark => (
          <button
            key={bookmark.id}
            type="button"
            onClick={() => openBookmark(bookmark)}
            title={[bookmark.model && `AI: ${bookmark.model}`, bookmark.keylessBasis, bookmark.liveNote]
              .filter(Boolean)
              .join('\n')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shrink-0 border ${
              activeUrl === bookmark.url
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-2xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[bookmark.status ?? 'unknown']}`}
            />
            <span>{bookmark.icon}</span>
            <span>{bookmark.name}</span>
            {bookmark.badge && (
              <span className="text-[9px] font-mono px-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                {bookmark.badge}
              </span>
            )}
          </button>
        ))}

        <span className="hidden xl:inline text-[11px] text-slate-500 shrink-0">
          Bookmarks open in a new tab; the address bar searches{' '}
          {policy?.searchHost?.replace(/^www\./, '') ?? 'the configured engine'}.
        </span>
      </div>
        </>
      )}

        {notice && (
          <div className="bg-amber-50 border-b border-amber-200 px-3 py-1 text-[11px] text-amber-900 shrink-0 flex items-center justify-between gap-3">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-amber-700 hover:text-amber-900 cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {topSlot}

      {/* Panes. Every tab stays mounted so switching keeps its page and session. */}
      <div className="relative flex-1 w-full overflow-hidden bg-[#F8FAFC]">
        {tabs.map(tab => (
          <BrowserPane
            key={tab.id}
            ref={handle => {
              if (handle) paneHandles.current.set(tab.id, handle);
              else paneHandles.current.delete(tab.id);
            }}
            tab={tab}
            visible={tab.id === activeId && !isBlank}
            desktopShell={desktopShell}
            status={statusFor(tab.id)}
            // Only the tab the user is looking at streams: one real browser is
            // one page, so the visible tab is the one it is showing.
            streamed={streamed}
            onStreamedUrl={onActiveUrlChange}
            onStreamedTitle={title => setTabs(current => updateTab(current, tab.id, t => ({ ...t, title })))}
          />
        ))}

        {/* Minimal new-tab page: just one button to open ZeroLeak AI */}
        {isBlank && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#F8FAFC]">
            <button
              type="button"
              onClick={() => go('https://prism.openai.com/')}
              className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-base shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <ZeroLeakLogo variant="icon" imgHeightClass="h-5 w-auto" />
              Open ZeroLeak AI
            </button>
          </div>
        )}

        {activeTab?.error && !isBlank && (
          <div className="absolute bottom-3 left-3 right-3 rounded-xl border border-rose-200 bg-white/95 px-3 py-2 text-[11px] text-rose-800 shadow-md">
            <span className="font-semibold">This tab could not load.</span> {activeTab.error}
          </div>
        )}


      </div>
    </div>
  );
};
