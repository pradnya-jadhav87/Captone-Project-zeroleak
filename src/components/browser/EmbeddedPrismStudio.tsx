import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  Play,
  Download,
  Copy,
  Check,
  RotateCcw,
  BookOpen,
  FileText,
  Code2,
  Columns,
  Eye,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileDown,
  Printer,
  ChevronDown,
  Cpu,
  Layers,
  Wand2,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { api, ollamaChatStream } from '../../api';
import { LaTeXText } from '../common/LaTeXText';

const DRAFT_STORAGE_KEY = 'zeroleak_prism_latex_draft';

const SOLAPUR_STANDARD_TEMPLATE = `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{tikz}
\\usepackage{array}
\\usepackage{enumitem}

\\begin{document}

% =========================================================================
% PUNYASHLOK AHILYADEVI HOLKAR SOLAPUR UNIVERSITY, SOLAPUR
% =========================================================================
\\begin{center}
    {\\large \\textbf{PUNYASHLOK AHILYADEVI HOLKAR SOLAPUR UNIVERSITY, SOLAPUR}}\\\\[3pt]
    {\\textbf{FACULTY OF SCIENCE \\& TECHNOLOGY}}\\\\[2pt]
    {\\textbf{B.Tech. / S.E. (Computer Science and Engineering) (Part-I) (CBCS) Examination}}\\\\[2pt]
    {\\textbf{APPLIED CRYPTOGRAPHY \\& INFORMATION SECURITY}}\\\\[2pt]
    \\textbf{Day \\& Date:} Wednesday, 14-05-2026 \\hfill \\textbf{Max. Marks: 70}\\\\
    \\textbf{Time:} 3.00 PM to 6.00 PM (3 Hours) \\hfill \\textbf{Paper Code: SLR-VB-602}\\\\
    \\textbf{Q.P. Set Code:} \\textbf{P}
\\end{center}

\\noindent\\rule{\\linewidth}{0.8pt}

\\noindent \\textbf{Instructions:}\\\\
1) All questions are compulsory.\\\\
2) Figures to the right indicate full marks.\\\\
3) Q. No. 1 is compulsory. It should be solved in the first 30 minutes in Answer Book Page No. 3. Each question carries one mark.\\\\
4) Answer MCQ/Objective type questions on Page No. 3 only. Don't forget to mention Q.P. Set (P/Q/R/S) on top of the page.\\\\
5) Draw neat diagrams and flowcharts wherever necessary.

\\noindent\\rule{\\linewidth}{0.8pt}

% =========================================================================
% Q.1: COMPULSORY 14 MCQs (14 x 1 = 14 Marks)
% =========================================================================
\\noindent \\textbf{Q.1 Choose the correct alternative for each of the following:} \\hfill \\textbf{[14 Marks]}

\\begin{enumerate}[label=\\textbf{\\arabic*)}]
    \\item In symmetric cryptography, if $n$ participants want to communicate securely via pair-wise shared secret keys, the total number of symmetric keys required is:
    \\begin{enumerate}[label=(\\alph*)]
        \\item $n(n - 1)$
        \\item $\\frac{n(n - 1)}{2}$
        \\item $2^n$
        \\item $n^2$
    \\end{enumerate}

    \\item Which block cipher mode of operation converts a block cipher into a stream cipher without requiring padding?
    \\begin{enumerate}[label=(\\alph*)]
        \\item Electronic Codebook (ECB)
        \\item Cipher Block Chaining (CBC)
        \\item Cipher Feedback Mode (CFB)
        \\item Output Feedback (OFB) / Counter (CTR)
    \\end{enumerate}

    \\item The Avalanche Effect in cryptographic substitution-permutation networks ensures that:
    \\begin{enumerate}[label=(\\alph*)]
        \\item Changing one bit of plaintext or key changes at least 50\\% of ciphertext bits
        \\item The ciphertext length equals the key length
        \\item Decryption executes in constant polynomial time
        \\item Keys cannot be brute-forced even with quantum circuits
    \\end{enumerate}

    \\item In RSA public-key cryptosystem, the public exponent $e$ and private exponent $d$ satisfy:
    \\begin{enumerate}[label=(\\alph*)]
        \\item $e \\cdot d \\equiv 1 \\pmod{\\phi(n)}$
        \\item $e \\cdot d \\equiv 0 \\pmod{n}$
        \\item $e + d = \\phi(n)$
        \\item $e^d \\equiv 1 \\pmod{n}$
    \\end{enumerate}

    \\item In Diffie-Hellman Key Exchange over prime field $\\mathbb{F}_p$, security directly relies upon the hardness of:
    \\begin{enumerate}[label=(\\alph*)]
        \\item Integer Factorization Problem (IFP)
        \\item Discrete Logarithm Problem (DLP)
        \\item Elliptic Curve Isogeny Computation
        \\item Shortest Vector Problem (SVP) in lattices
    \\end{enumerate}

    \\item In Shamir's $(k, n)$ threshold secret sharing scheme, the threshold polynomial $f(x)$ has degree:
    \\begin{enumerate}[label=(\\alph*)]
        \\item $k$
        \\item $k - 1$
        \\item $n - 1$
        \\item $n - k$
    \\end{enumerate}

    \\item SHA-256 cryptographic hash function maps arbitrary input messages to a message digest of length:
    \\begin{enumerate}[label=(\\alph*)]
        \\item 128 bits
        \\item 160 bits
        \\item 256 bits
        \\item 512 bits
    \\end{enumerate}

    \\item In the Advanced Encryption Standard (AES), the byte substitution step (SubBytes) uses an S-Box constructed over:
    \\begin{enumerate}[label=(\\alph*)]
        \\item Galois Field $GF(2^8)$
        \\item Ring $\\mathbb{Z}_{256}$
        \\item Elliptic Curve Group $E(\\mathbb{F}_{2^{256}})$
        \\item Modular Arithmetic Group $\\mathbb{Z}_p^*$
    \\end{enumerate}

    \\item Which zero-knowledge proof system enables proving statement validity without revealing any witness information?
    \\begin{enumerate}[label=(\\alph*)]
        \\item Schnorr Protocol
        \\item Diffie-Hellman Protocol
        \\item ElGamal Signature
        \\item RSA Blind Signature
    \\end{enumerate}

    \\item A Birthday Attack on an $m$-bit cryptographic hash function requires approximately how many evaluations to find a collision?
    \\begin{enumerate}[label=(\\alph*)]
        \\item $2^m$
        \\item $2^{m/2}$
        \\item $2^{m/4}$
        \\item $m^2$
    \\end{enumerate}

    \\item Which protocol provides authenticated end-to-end security at the Transport Layer of the OSI stack?
    \\begin{enumerate}[label=(\\alph*)]
        \\item IPsec ESP
        \\item TLS 1.3
        \\item WPA3
        \\item SSH-2
    \\end{enumerate}

    \\item In Digital Signature Standard (DSS / ECDSA), nonces ($k$) must be kept strictly secret and never reused because:
    \\begin{enumerate}[label=(\\alph*)]
        \\item Reusing nonce $k$ immediately exposes the signer's private key
        \\item It produces duplicate public keys
        \\item Hash collision occurs instantly
        \\item Verification polynomial degree increases
    \\end{enumerate}

    \\item In authenticated encryption algorithms such as AES-GCM, integrity is guaranteed using:
    \\begin{enumerate}[label=(\\alph*)]
        \\item GMAC Galois Message Authentication Code
        \\item HMAC-MD5
        \\item Merkle-Damgard Extension
        \\item Feistel permutation tag
    \\end{enumerate}

    \\item A timing attack on cryptographic comparison operations is mitigated by:
    \\begin{enumerate}[label=(\\alph*)]
        \\item Constant-time comparison algorithms
        \\item Increasing clock frequency
        \\item Random byte stuffing at network layer
        \\item Multi-threaded pipeline execution
    \\end{enumerate}
\\end{enumerate}

\\vspace{10pt}
\\noindent\\rule{\\linewidth}{0.5pt}

% =========================================================================
% SECTION - I (28 Marks)
% =========================================================================
\\begin{center}
    {\\large \\textbf{SECTION - I}}
\\end{center}

\\noindent \\textbf{Q.2 Attempt any three of the following:} \\hfill \\textbf{[12 Marks]}
\\begin{enumerate}[label=\\textbf{\\alph*)}]
    \\item Explain the Feistel Cipher structure with an illustrative block diagram. How do round keys ensure confusion and diffusion?
    \\item Explain AES-256 key schedule expansion algorithm and describe the byte substitution, ShiftRows, and MixColumns transformations.
    \\item Describe the mathematical steps of RSA algorithm: Key generation, Encryption, and Decryption with a numerical example using $p = 11, q = 13, e = 7$.
    \\item Compare symmetric-key ciphers and asymmetric-key ciphers with respect to computational complexity, key distribution, and security primitives.
\\end{enumerate}

\\vspace{8pt}
\\noindent \\textbf{Q.3 Algorithmic \\& Mathematical Derivation:} \\hfill \\textbf{[08 Marks]}\\\\
Explain Diffie-Hellman Key Exchange Protocol. Show how Alice and Bob agree upon a common shared key $K$ over an insecure channel. Explain the Man-in-the-Middle (MitM) vulnerability and how digital signatures prevent it.

\\vspace{8pt}
\\noindent \\textbf{Q.4 Descriptive Question with Internal Choice:} \\hfill \\textbf{[08 Marks]}\\\\
Explain Shamir's $(3, 5)$ Threshold Secret Sharing Scheme. Derive Lagrange's interpolation polynomial used by authorized quorum holders to reconstruct secret $S$ from any 3 arbitrary shares.
\\\\[4pt]
\\begin{center}
\\textbf{--- OR ---}
\\end{center}
Explain the design and operation of SHA-3 (Keccak) cryptographic sponge construction. Detail the absorbing phase, squeezing phase, and state permutation matrix $A[5][5][w]$.

\\vspace{10pt}
\\noindent\\rule{\\linewidth}{0.5pt}

% =========================================================================
% SECTION - II (28 Marks)
% =========================================================================
\\begin{center}
    {\\large \\textbf{SECTION - II}}
\\end{center}

\\noindent \\textbf{Q.5 Attempt any three of the following:} \\hfill \\textbf{[12 Marks]}
\\begin{enumerate}[label=\\textbf{\\alph*)}]
    \\item Explain Elliptic Curve Cryptography (ECC) point addition and point doubling on Weierstrass form $y^2 = x^3 + ax + b \\pmod{p}$.
    \\item Describe the Handshake Protocol and Record Protocol of Transport Layer Security (TLS 1.3) with key exchange message flow.
    \\item Explain the format of X.509 Public Key Certificate and describe Certificate Revocation Lists (CRLs) and OCSP stapling.
    \\item Discuss Zero-Knowledge Succinct Non-Interactive Arguments of Knowledge (zk-SNARKs) and their applications in confidential examinations.
\\end{enumerate}

\\vspace{8pt}
\\noindent \\textbf{Q.6 Descriptive Question with Internal Choice:} \\hfill \\textbf{[08 Marks]}\\\\
Explain the architecture of IPsec protocol suite. Compare Authentication Header (AH) and Encapsulating Security Payload (ESP) in Transport Mode vs. Tunnel Mode with header packet layouts.
\\\\[4pt]
\\begin{center}
\\textbf{--- OR ---}
\\end{center}
Explain SQL Injection, Cross-Site Scripting (XSS), and Cross-Site Request Forgery (CSRF) vulnerabilities. Provide secure coding practices, parameterized queries, and defensive CSP headers.

\\vspace{8pt}
\\noindent \\textbf{Q.7 Comprehensive Analysis Question:} \\hfill \\textbf{[08 Marks]}\\\\
Design an end-to-end Zero-Knowledge Examination Distribution Protocol. Explain how examination papers can be encrypted, time-locked using threshold secret sharing, and decrypted only at the designated exam start time without single-point compromise.

\\end{document}
`;

const TEMPLATES: Record<string, { name: string; latex: string }> = {
  solapur_standard: {
    name: '🎓 Solapur University 70M Standard (Sections I & II + 14 MCQs)',
    latex: SOLAPUR_STANDARD_TEMPLATE,
  },
  competitive_mcq: {
    name: '⚡ Competitive MCQ Assessment (40 Questions with Answer Keys)',
    latex: `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{amsmath,amssymb}
\\usepackage{enumitem}

\\begin{document}
\\begin{center}
    {\\large \\textbf{ZEROLEAK SECURE COMPETITIVE ENTRANCE ASSESSMENT}}\\\\[3pt]
    {\\textbf{COMPUTER SCIENCE \\& INFORMATION SYSTEMS}}\\\\[2pt]
    \\textbf{Total Questions: 50} \\hfill \\textbf{Time Allowed: 120 Minutes} \\hfill \\textbf{Max. Marks: 100}
\\end{center}
\\noindent\\rule{\\linewidth}{0.8pt}

\\noindent \\textbf{Instructions:} Each question carries 2 marks. For each wrong answer, 0.5 marks will be deducted.

\\section*{Section A: Algorithms \\& Data Structures}
\\begin{enumerate}[label=\\textbf{\\arabic*)}]
    \\item What is the worst-case time complexity of searching for an element in an AVL tree containing $n$ elements?
    \\begin{enumerate}[label=(\\alph*)]
        \\item $O(1)$
        \\item $O(\\log n)$
        \\item $O(n)$
        \\item $O(n \\log n)$
    \\end{enumerate}
    \\item Which algorithm computes single-source shortest paths on graphs with arbitrary edge weights (including negative edges)?
    \\begin{enumerate}[label=(\\alph*)]
        \\item Dijkstra's Algorithm
        \\item Bellman-Ford Algorithm
        \\item Floyd-Warshall Algorithm
        \\item Kruskal's Algorithm
    \\end{enumerate}
\\end{enumerate}
\\end{document}`,
  },
  tikz_diagram: {
    name: '📊 TikZ Graphics & System Architecture Diagram',
    latex: `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{tikz}
\\usetikzlibrary{shapes.geometric, arrows, positioning}

\\begin{document}
\\begin{center}
    {\\large \\textbf{ZEROLEAK HARDWARE-ENCLAVE WORKFLOW DIAGRAM}}
\\end{center}

\\begin{center}
\\begin{tikzpicture}[
    node distance=1.8cm,
    block/.style={rectangle, draw=blue!70, fill=blue!10, rounded corners, text width=3.5cm, text centered, minimum height=1.2cm},
    arrow/.style={thick, ->, >=stealth}
]
    \\node (src) [block] {Source Question Papers};
    \\node (ai) [block, below of=src] {Multi-Paper AI Synthesizer};
    \\node (shamir) [block, below of=ai] {Shamir 3-of-5 Secret Sharing};
    \\node (vault) [block, below of=shamir] {Encrypted Offline Enclave};

    \\draw [arrow] (src) -- (ai);
    \\draw [arrow] (ai) -- (shamir);
    \\draw [arrow] (shamir) -- (vault);
\\end{tikzpicture}
\\end{center}
\\end{document}`,
  },
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const EmbeddedPrismStudio: React.FC = () => {
  const [latexCode, setLatexCode] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved && saved.trim().length > 50) return saved;
    }
    return SOLAPUR_STANDARD_TEMPLATE;
  });

  const [viewMode, setViewMode] = useState<'split' | 'editor' | 'preview' | 'assistant'>('split');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [compileNotice, setCompileNotice] = useState<string | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);

  // AI Copilot state
  const [chatMessages, setChatMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        '👋 Welcome to the **ZeroLeak AI Studio**! I can help you generate examination questions, synthesize Solapur University 14 MCQs, format LaTeX equations, or structure Section I & II theory questions. What would you like to build?',
    },
  ]);
  const [promptInput, setPromptInput] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Autosave to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, latexCode);
    } catch {}
  }, [latexCode]);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isGenerating]);

  // Copy code to clipboard
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(latexCode);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  // Download .tex file
  const handleDownloadTex = () => {
    const blob = new Blob([latexCode], { type: 'text/x-tex;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Solapur_University_Exam_Paper.tex';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Compile to PDF via api.compileValidatedLatex
  const handleCompilePdf = async () => {
    setIsCompiling(true);
    setCompileNotice('Compiling paper to PDF with Solapur University formatting...');
    setCompileError(null);

    try {
      const res = await api.compileValidatedLatex({
        latex: latexCode,
        subject: 'APPLIED CRYPTOGRAPHY & INFORMATION SECURITY',
        universityName: 'PUNYASHLOK AHILYADEVI HOLKAR SOLAPUR UNIVERSITY, SOLAPUR',
        paperCode: 'SLR-VB-602',
        totalMarks: 70,
        durationHours: 3,
        setLetter: 'P',
        preferEngine: 'auto',
      });

      if (res.success && res.pdfUrl) {
        setCompileNotice('✓ Official PDF compiled successfully! Starting download...');
        const a = document.createElement('a');
        a.href = res.pdfUrl;
        a.download = res.filename || 'Exam_Paper_Solapur_University.pdf';
        a.target = '_blank';
        a.click();
        setTimeout(() => setCompileNotice(null), 4000);
      } else {
        throw new Error('Compiler finished without valid PDF URL');
      }
    } catch (err: any) {
      console.warn('Backend compiler notice:', err);
      // Fallback: browser print preview / PDF export
      setCompileNotice('Triggering in-browser PDF generation preview...');
      setTimeout(() => {
        window.print();
        setCompileNotice(null);
      }, 500);
    } finally {
      setIsCompiling(false);
    }
  };

  // Apply to Active Paper Synthesizer
  const handleApplyToSynthesizer = () => {
    try {
      localStorage.setItem('zeroleak_active_paper_latex', latexCode);
      window.dispatchEvent(
        new CustomEvent('zeroleak:paper-latex-updated', {
          detail: { latex: latexCode },
        })
      );
      setCompileNotice('✓ Successfully synced paper to Multi-Paper Synthesizer Workspace!');
      setTimeout(() => setCompileNotice(null), 3500);
    } catch (err: any) {
      setCompileError('Failed to sync: ' + err.message);
    }
  };

  // Insert LaTeX snippet
  const insertSnippet = (snippet: string) => {
    if (!editorRef.current) {
      setLatexCode(prev => prev + '\n' + snippet);
      return;
    }
    const start = editorRef.current.selectionStart;
    const end = editorRef.current.selectionEnd;
    const current = latexCode;
    const updated = current.substring(0, start) + snippet + current.substring(end);
    setLatexCode(updated);
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.focus();
        editorRef.current.setSelectionRange(start + snippet.length, start + snippet.length);
      }
    }, 50);
  };

  // Send AI Prompt
  const handleSendPrompt = async (promptTextOverride?: string) => {
    const promptToSend = (promptTextOverride || promptInput).trim();
    if (!promptToSend || isGenerating) return;

    setPromptInput('');
    const newMessages: Message[] = [...chatMessages, { role: 'user', content: promptToSend }];
    setChatMessages(newMessages);
    setIsGenerating(true);

    const controller = new AbortController();
    setAbortController(controller);

    let assistantReply = '';
    const updatedWithPlaceholder: Message[] = [...newMessages, { role: 'assistant', content: '' }];
    setChatMessages(updatedWithPlaceholder);

    try {
      await ollamaChatStream(
        {
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          plainText: true,
        },
        delta => {
          assistantReply += delta;
          setChatMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: assistantReply };
            return copy;
          });
        },
        controller.signal
      );
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.warn('Ollama stream fallback to local generator:', err);

      // Robust fallback response tailored to request
      let fallbackText = '';
      if (/mcq/i.test(promptToSend)) {
        fallbackText = `Here is a set of Solapur University MCQs (Q.1 Pattern):

\`\`\`latex
\\item In a zero-knowledge protocol, the property ensuring the verifier learns nothing except assertion truth is:
\\begin{enumerate}[label=(\\alph*)]
    \\item Soundness
    \\item Completeness
    \\item Zero-Knowledge
    \\item Non-repudiation
\\end{enumerate}
\`\`\`

You can use the **Insert into Editor** button below to paste this into your paper!`;
      } else if (/tikz|diagram|graph/i.test(promptToSend)) {
        fallbackText = `Here is a TikZ diagram for the exam paper:

\`\`\`latex
\\begin{center}
\\begin{tikzpicture}[scale=0.9, auto, swap]
    \\node[circle, draw=emerald!70, fill=emerald!10, thick] (a) at (0, 0) {Alice};
    \\node[circle, draw=blue!70, fill=blue!10, thick] (b) at (5, 0) {Bob};
    \\draw[->, thick] (a) to[bend left=20] node[above] {$g^a \\pmod p$} (b);
    \\draw[->, thick] (b) to[bend left=20] node[below] {$g^b \\pmod p$} (a);
\\end{tikzpicture}
\\end{center}
\`\`\``;
      } else {
        fallbackText = `Here is the requested LaTeX section for your examination paper:

\`\`\`latex
\\noindent \\textbf{Q.2 Attempt any three of the following:} \\hfill \\textbf{[12 Marks]}
\\begin{enumerate}[label=\\textbf{\\alph*)}]
    \\item Explain the mathematical principles of Zero-Knowledge Proofs and contrast Interactive vs. Non-Interactive proofs.
    \\item Derive the time-lock puzzle encryption equations using sequential squaring over RSA composite moduli.
    \\item Discuss threshold signature schemes (BLS / Schnorr) for multi-party decentralized examination authorization.
    \\item Detail the security bounds of AES-256 against quantum Grover search attacks.
\\end{enumerate}
\`\`\``;
      }

      setChatMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: fallbackText };
        return copy;
      });
    } finally {
      setIsGenerating(false);
      setAbortController(null);
    }
  };

  // Extract LaTeX snippet from AI message
  const extractLatexFromMessage = (content: string): string => {
    const match = /```(?:latex|tex)?\s*([\s\S]*?)```/i.exec(content);
    if (match && match[1]) return match[1].trim();
    return content.trim();
  };

  // Calculate stats
  const lineCount = latexCode.split('\n').length;
  const charCount = latexCode.length;
  const estimatedMcqs = (latexCode.match(/\\item/g) || []).length;

  return (
    <div className="w-full h-full flex flex-col bg-[#F8FAFC] text-slate-800 select-text overflow-hidden font-sans">
      {/* Informative Status Banner for Official Prism vs In-Project Studio */}
      <div className="bg-slate-900 border-b border-slate-800 px-3 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-2.5 text-xs text-slate-300 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong className="text-white">ZeroLeak AI & LaTeX Studio:</strong> In-project examination synthesis & typesetting active without external login.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Official OpenAI Prism requires a direct browser tab:
          </span>
          <a
            href="https://prism.openai.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-lg flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            title="Open official OpenAI Prism in a new browser tab (supported sign-in flow)"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Official OpenAI Prism ↗</span>
          </a>
        </div>
      </div>

      {/* ================= TOP STUDIO CONTROLS BAR ================= */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shadow-2xs shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight">
                ZeroLeak AI & LaTeX Studio
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Embedded Web Engine</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-500 hidden sm:block">
              ZeroLeak AI Question Synthesizer • Solapur University 70M Pattern • 14 MCQs • Sections I & II
            </p>
          </div>
        </div>

        {/* View Switchers */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'split' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Columns className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden md:inline">Split View</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('editor')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'editor' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Code2 className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden md:inline">LaTeX Editor</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('preview')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'preview' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5 text-purple-600" />
            <span className="hidden md:inline">Paper Preview</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('assistant')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'assistant' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden md:inline">ZeroLeak AI Copilot</span>
          </button>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handleCompilePdf}
            disabled={isCompiling}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
            title="Compile paper and download PDF"
          >
            {isCompiling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>Compile PDF</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadTex}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-300 font-semibold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            title="Download .tex source file"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden sm:inline">.tex</span>
          </button>

          <button
            type="button"
            onClick={handleCopyCode}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-300 font-semibold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            title="Copy LaTeX code to clipboard"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-600" />}
            <span className="hidden sm:inline">{isCopied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={handleApplyToSynthesizer}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            title="Apply directly to Multi-Paper Synthesizer Workspace"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden lg:inline">Apply to Synthesizer</span>
          </button>

          <a
            href="https://prism.openai.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all border border-slate-200"
            title="Open official OpenAI Prism in external tab"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden xl:inline">OpenAI Prism Web</span>
          </a>
        </div>
      </div>

      {/* Floating Notices */}
      {compileNotice && (
        <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between gap-2 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{compileNotice}</span>
          </div>
          <button type="button" onClick={() => setCompileNotice(null)} className="hover:opacity-75">
            ✕
          </button>
        </div>
      )}
      {compileError && (
        <div className="bg-rose-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between gap-2 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{compileError}</span>
          </div>
          <button type="button" onClick={() => setCompileError(null)} className="hover:opacity-75">
            ✕
          </button>
        </div>
      )}

      {/* ================= MAIN WORKSPACE AREA ================= */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* ================= LEFT / SIDEBAR: AI COPILOT ================= */}
        {(viewMode === 'assistant' || viewMode === 'split') && (
          <div
            className={`border-r border-slate-200 bg-white flex flex-col shrink-0 transition-all ${
              viewMode === 'assistant' ? 'w-full md:max-w-2xl mx-auto border-r-0' : 'w-full md:w-80 lg:w-96'
            }`}
          >
            {/* AI Assistant Header */}
            <div className="p-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">ZeroLeak AI Copilot</h3>
                  <p className="text-[10px] text-slate-500">Autonomous Question & LaTeX Synthesizer</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setChatMessages([
                    {
                      role: 'assistant',
                      content: 'Chat refreshed. Ask me to generate any questions, proofs, or diagrams!',
                    },
                  ])
                }
                title="Clear Chat History"
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Prompt Chips */}
            <div className="p-2 border-b border-slate-200 bg-slate-50/40 flex items-center gap-1.5 overflow-x-auto text-[11px] no-scrollbar">
              <button
                type="button"
                onClick={() =>
                  handleSendPrompt(
                    'Generate 14 Solapur University MCQs for Q.1 with 4 options each, covering Operating Systems and Cryptography in LaTeX format.'
                  )
                }
                className="px-2.5 py-1 rounded-full bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shrink-0 font-medium transition-colors"
              >
                🎓 14 MCQs
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSendPrompt(
                    'Generate SECTION - I for Applied Cryptography: Q.2 (Attempt 3 of 4, 12 Marks) and Q.3 (8 Marks derivation) in LaTeX.'
                  )
                }
                className="px-2.5 py-1 rounded-full bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shrink-0 font-medium transition-colors"
              >
                📝 Section I Theory
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSendPrompt(
                    'Generate SECTION - II: Q.5 (12 Marks), Q.6 (8 Marks with OR choice), and Q.7 (8 Marks) in LaTeX.'
                  )
                }
                className="px-2.5 py-1 rounded-full bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shrink-0 font-medium transition-colors"
              >
                📐 Section II Theory
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSendPrompt('Generate a TikZ diagram for Diffie-Hellman key exchange or network flow in LaTeX.')
                }
                className="px-2.5 py-1 rounded-full bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shrink-0 font-medium transition-colors"
              >
                📊 TikZ Diagram
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSendPrompt('Format and fix any LaTeX syntax errors or math delimiters in standard Solapur format.')
                }
                className="px-2.5 py-1 rounded-full bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shrink-0 font-medium transition-colors"
              >
                ✨ Fix LaTeX
              </button>
            </div>

            {/* Chat Message Scroll */}
            <div ref={chatScrollRef} className="flex-1 p-3 overflow-y-auto space-y-3 text-xs bg-slate-50/20">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} space-y-1.5`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl p-3 ${
                      msg.role === 'user'
                        ? 'bg-slate-900 text-white rounded-br-xs'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-xs shadow-2xs'
                    }`}
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>

                    {/* Action buttons on assistant message if it contains LaTeX */}
                    {msg.role === 'assistant' && msg.content.includes('\\') && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const code = extractLatexFromMessage(msg.content);
                            insertSnippet('\n' + code);
                          }}
                          className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <FileText className="w-3 h-3" />
                          <span>Insert into Editor</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const code = extractLatexFromMessage(msg.content);
                            setLatexCode(code);
                          }}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Replace All</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isGenerating && (
                <div className="flex items-center gap-2 text-slate-500 text-xs py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  <span>Synthesizing examination questions...</span>
                </div>
              )}
            </div>

            {/* Prompt Input Box */}
            <div className="p-3 border-t border-slate-200 bg-white">
              <form
                onSubmit={e => {
                  e.preventDefault();
                  void handleSendPrompt();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={promptInput}
                  onChange={e => setPromptInput(e.target.value)}
                  placeholder="Ask AI: 'Generate 14 MCQs on Database Systems'..."
                  disabled={isGenerating}
                  className="flex-1 bg-slate-50 border border-slate-300 focus:border-emerald-500 focus:bg-white rounded-xl px-3 py-2 text-xs text-slate-900 outline-none transition-all disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!promptInput.trim() || isGenerating}
                  className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold transition-all shadow-xs cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ================= CENTER: LATEX CODE EDITOR ================= */}
        {(viewMode === 'editor' || viewMode === 'split') && (
          <div className="flex-1 flex flex-col bg-white border-r border-slate-200 min-w-0">
            {/* Editor Toolbar & Snippets */}
            <div className="p-2 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Template Selector */}
                <select
                  aria-label="Preset Examination Templates"
                  onChange={e => {
                    const selected = TEMPLATES[e.target.value];
                    if (selected && window.confirm('Load template? Your current edits will be replaced.')) {
                      setLatexCode(selected.latex);
                    }
                  }}
                  className="bg-white border border-slate-300 text-slate-800 text-[11px] font-semibold rounded-lg px-2 py-1 outline-none cursor-pointer"
                >
                  <option value="">Preset Templates...</option>
                  <option value="solapur_standard">🎓 Solapur University 70M Pattern (Sets P, Q, R, S)</option>
                  <option value="competitive_mcq">⚡ Competitive MCQ Assessment (4 Options)</option>
                  <option value="tikz_diagram">📊 TikZ System Architecture Diagram</option>
                </select>

                <div className="h-4 w-px bg-slate-300 mx-1 hidden sm:block" />

                {/* Quick LaTeX Snippets */}
                <button
                  type="button"
                  onClick={() => insertSnippet('\\section{SECTION - }')}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[11px] font-mono text-slate-700 transition-colors"
                >
                  \\section
                </button>
                <button
                  type="button"
                  onClick={() => insertSnippet('\\textbf{}')}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[11px] font-mono text-slate-700 transition-colors"
                >
                  \\textbf
                </button>
                <button
                  type="button"
                  onClick={() => insertSnippet('\\frac{a}{b}')}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[11px] font-mono text-slate-700 transition-colors"
                >
                  \\frac
                </button>
                <button
                  type="button"
                  onClick={() =>
                    insertSnippet(
                      '\\begin{enumerate}[label=(\\alph*)]\n    \\item \n    \\item \n\\end{enumerate}'
                    )
                  }
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[11px] font-mono text-slate-700 transition-colors hidden md:inline-block"
                >
                  \\enumerate
                </button>
                <button
                  type="button"
                  onClick={() =>
                    insertSnippet(
                      '\\begin{table}[h]\n\\centering\n\\begin{tabular}{|c|c|}\n\\hline\nParam & Value \\\\\n\\hline\n\\end{tabular}\n\\end{table}'
                    )
                  }
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[11px] font-mono text-slate-700 transition-colors hidden md:inline-block"
                >
                  \\table
                </button>
              </div>

              {/* Status pill */}
              <div className="text-[11px] font-mono text-slate-500 flex items-center gap-3">
                <span>{lineCount} lines</span>
                <span>{charCount} chars</span>
                <span>~{estimatedMcqs} items</span>
              </div>
            </div>

            {/* Code Textarea */}
            <div className="flex-1 relative overflow-hidden flex">
              <textarea
                ref={editorRef}
                value={latexCode}
                onChange={e => setLatexCode(e.target.value)}
                placeholder="Write or paste your LaTeX examination paper here..."
                spellCheck={false}
                className="w-full h-full p-4 font-mono text-xs sm:text-[13px] leading-relaxed text-slate-900 bg-white resize-none outline-none overflow-y-auto selection:bg-emerald-100 selection:text-emerald-900 border-none"
              />
            </div>
          </div>
        )}

        {/* ================= RIGHT: LIVE FORMATTED PAPER PREVIEW ================= */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className="flex-1 flex flex-col bg-slate-50/50 min-w-0 overflow-hidden">
            {/* Preview Toolbar */}
            <div className="p-2.5 border-b border-slate-200 bg-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-800">Live Paper Typesetting Preview</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print View</span>
                </button>
              </div>
            </div>

            {/* Rendered Solapur University Examination Paper Page */}
            <div className="flex-1 p-3 sm:p-6 overflow-y-auto bg-slate-100/70 flex justify-center">
              <div className="w-full max-w-3xl bg-white rounded-xl shadow-md border border-slate-200/80 p-6 sm:p-10 space-y-5 text-slate-900 font-serif leading-relaxed min-h-[800px]">
                {/* Official University Header */}
                <div className="text-center space-y-1.5 border-b-2 border-slate-900 pb-4">
                  <h1 className="text-base sm:text-lg font-black tracking-wide uppercase">
                    PUNYASHLOK AHILYADEVI HOLKAR SOLAPUR UNIVERSITY, SOLAPUR
                  </h1>
                  <h2 className="text-xs sm:text-sm font-bold tracking-tight">
                    FACULTY OF SCIENCE & TECHNOLOGY — EXAMINATION 2026
                  </h2>
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-700">
                    B.Tech. / S.E. (Computer Science and Engineering)
                  </h3>
                  <div className="text-xs font-bold pt-1 text-slate-800 flex justify-between items-center border-t border-slate-300 mt-2">
                    <span>Day & Date: Wednesday, 14-05-2026</span>
                    <span>Max. Marks: 70</span>
                  </div>
                  <div className="text-xs font-bold flex justify-between items-center">
                    <span>Time: 3.00 PM to 6.00 PM (3 Hours)</span>
                    <span>Paper Code: SLR-VB-602 | Set P</span>
                  </div>
                </div>

                {/* Instructions */}
                <div className="text-[11px] sm:text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1 font-sans">
                  <div className="font-bold text-slate-900">General Instructions:</div>
                  <div>1) All questions are compulsory.</div>
                  <div>2) Figures to the right indicate full marks.</div>
                  <div>3) Q. No. 1 is compulsory. Solved in first 30 minutes in Answer Book Page No. 3.</div>
                  <div>4) Answer MCQ/Objective questions on Page No. 3 only. Mention Q.P. Set on top.</div>
                </div>

                {/* Formatted Content with KaTeX */}
                <div className="pt-2 text-xs sm:text-sm space-y-4 font-serif">
                  {latexCode
                    .split('\n\n')
                    .filter(block => !block.trim().startsWith('\\documentclass') && !block.trim().startsWith('\\usepackage') && !block.trim().startsWith('%'))
                    .map((block, i) => {
                      // Check for Section titles
                      if (block.includes('\\section') || block.includes('SECTION -')) {
                        return (
                          <div key={i} className="text-center py-2 font-black text-sm uppercase tracking-wider border-b border-slate-200">
                            <LaTeXText text={block.replace(/\\(?:section|begin|end)\{.*?\}/g, '').trim()} />
                          </div>
                        );
                      }

                      // Check for Question Q.1 / Q.2 / Q.3 headers
                      if (/Q\.\s*\d+/i.test(block)) {
                        return (
                          <div key={i} className="font-bold text-slate-900 pt-2 flex justify-between items-start">
                            <LaTeXText text={block.replace(/\\begin\{.*?\}/g, '').replace(/\\end\{.*?\}/g, '')} />
                          </div>
                        );
                      }

                      // General LaTeX paragraphs / equations
                      return (
                        <div key={i} className="leading-relaxed">
                          <LaTeXText text={block.replace(/\\(?:begin|end)\{.*?\}/g, '')} />
                        </div>
                      );
                    })}
                </div>

                <div className="text-center pt-8 border-t border-slate-200 text-xs font-mono text-slate-400">
                  *** END OF QUESTION PAPER — ZEROLEAK SECURE ENCLAVE ***
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

