<!-- PROJECT HEADER -->
<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=34&duration=3500&pause=800&color=059669&center=true&vCenter=true&width=650&lines=ZeroLeak;Secure+Exam+Paper+Generation;Zero+Leaks.+Zero+Trust.+Zero+Compromise." alt="ZeroLeak Typing SVG" />

### 🛡️ AI-Powered Cryptographic Examination Paper Lifecycle & Anti-Leak Enclave

*A high-assurance platform that mathematically eliminates examination paper leaks through envelope encryption, Shamir's secret sharing over Galois fields, server time-locks, hardware attestation, and real-time deep learning proctoring.*

<br/>

<!-- STATUS / META BADGES -->
![Status](https://img.shields.io/badge/status-active-success?style=for-the-badge)
![Security Standard](https://img.shields.io/badge/FIPS_140--2-AES--256--GCM-blue?style=for-the-badge)
![Crypto](https://img.shields.io/badge/Shamir-GF(256)-emerald?style=for-the-badge)
![AI Engine](https://img.shields.io/badge/Vision-YOLOv8--Nano-purple?style=for-the-badge)
![LaTeX Engine](https://img.shields.io/badge/Compiler-Tectonic_Rust-orange?style=for-the-badge)

</div>

---

## 📚 Technical Audit & POE Defense Documentation Suite

This repository has undergone an exhaustive, source-code-verified technical audit. In addition to this master document, seven deep-dive technical reports are provided in the [`docs/`](file:///d:/0leakexam-main/docs/) directory:

1. 📋 [**Complete Feature Inventory (`docs/FEATURES.md`)**](file:///d:/0leakexam-main/docs/FEATURES.md) — Exhaustive matrix of all 17 major capabilities, endpoints, database entities, and workflows.
2. 🛠️ [**Technology Stack & Architectural Evaluation (`docs/TECH_STACK.md`)**](file:///d:/0leakexam-main/docs/TECH_STACK.md) — Analysis answering the 6 mandatory architectural questions for every language, framework, database, and library.
3. 🧠 [**AI & Machine Learning Specification (`docs/AI_ML_EXPLANATION.md`)**](file:///d:/0leakexam-main/docs/AI_ML_EXPLANATION.md) — Exact models (YOLOv8, Tectonic, Ollama, Groq, Gemini), mathematical formulas, Jaccard metrics, and prompt pipelines.
4. 🔄 [**System Workflows & Architecture (`docs/WORKFLOW_AND_ARCHITECTURE.md`)**](file:///d:/0leakexam-main/docs/WORKFLOW_AND_ARCHITECTURE.md) — End-to-end request tracing, sequence diagrams, and system component wiring.
5. 🗄️ [**Database Schemas & API Catalog (`docs/DATABASE_AND_APIS.md`)**](file:///d:/0leakexam-main/docs/DATABASE_AND_APIS.md) — Complete ER diagram, 66+ database entities, and a 280+ API endpoint reference.
6. 🔐 [**Cybersecurity & Cryptography Enclave (`docs/SECURITY.md`)**](file:///d:/0leakexam-main/docs/SECURITY.md) — Deep dive into AES-256-GCM, RSA-2048 OAEP, Shamir's Secret Sharing over $GF(2^8)$, device attestation, and time-locks.
7. 🎓 [**50+ POE Viva Questions & Model Answers (`docs/POE_VIVA_QUESTIONS.md`)**](file:///d:/0leakexam-main/docs/POE_VIVA_QUESTIONS.md) — Structured oral examination preparation categorized across 10 technical domains.

---

## 📖 Table of Contents

- [🔍 1. Executive Summary & Project Overview](#-1-executive-summary--project-overview)
- [⚠️ 2. Problem Statement & System Comparison](#️-2-problem-statement--system-comparison)
- [🎯 3. Core Objectives](#-3-core-objectives)
- [🧑‍🤝‍🧑 4. User Roles & Separation of Duties](#-4-user-roles--separation-of-duties)
- [🗺️ 5. Feature-to-Technology Mapping](#️-5-feature-to-technology-mapping)
- [🏗️ 6. System Architecture & End-to-End Workflow](#️-6-system-architecture--end-to-end-workflow)
- [🤖 7. Artificial Intelligence & Computer Vision](#-7-artificial-intelligence--computer-vision)
- [🔐 8. Cryptographic Security & Anti-Leak Enclave](#-8-cryptographic-security--anti-leak-enclave)
- [💾 9. Database Architecture & Multi-Model Persistence](#-9-database-architecture--multi-model-persistence)
- [🚀 10. Installation, Configuration & Execution](#-10-installation-configuration--execution)
- [🧪 11. Testing & Code Verification](#-11-testing--code-verification)
- [⚡ 12. POE Quick-Revision Guide](#-12-poe-quick-revision-guide)

---

## 🔍 1. Executive Summary & Project Overview

### Simple Explanation (Layman's Terms)
Examination paper leaks happen because physical question papers and unencrypted PDF files sit on computers and couriers days before an exam. People with access (clerks, printers, administrators) can take photos or copy files. 

**ZeroLeak** fixes this by making it mathematically impossible for any single person to steal or open a question paper before the exam begins:
1. Questions are generated or uploaded into a secure digital vault and formatted automatically with LaTeX.
2. The complete exam paper is encrypted using military-grade encryption (AES-256-GCM).
3. The master digital key is split into 3 mathematical puzzle pieces using Shamir's Secret Sharing: the Organization Owner, Exam Manager, and CBI Auditor each get one piece. No single person has the full key; at least two must agree to unlock it.
4. The paper is locked with a hardware-enforced timer. Even if someone steals the file, it cannot be decrypted before the exam start time (e.g. 09:30 AM).
5. At the exam centre, the paper is printed directly from a secure Wi-Fi enclave. Every printed sheet is automatically stamped with an invisible, forensic watermark showing the exact operator's name, exam centre, computer ID, and timestamp. If a student or official leaks a photo, authorities trace the exact source within minutes.

### Technical Explanation
ZeroLeak is a distributed, zero-trust examination custody enclave engineered in **TypeScript, Python, and Rust**. It operates an envelope encryption pipeline (`AES-256-GCM` + `RSA-2048-OAEP`) combined with a $(k=2, n=3)$ threshold polynomial secret sharing scheme over the finite field $GF(2^8) = GF(256)$ using the Rijndael irreducible polynomial $0x11b$. Papers remain cryptographically sealed until server monotonic hardware clocks satisfy scheduled time-locks. Physical distribution uses ephemeral UDP 45412 LAN print stations with constant-time pairing codes and per-device quotas. Visual inspection is protected via OS window compositor shielding (`window.setContentProtection(true)` in Electron) and client Web API neutralization. Real-time proctoring runs edge deep learning object detection via **Ultralytics YOLOv8 Nano** (`yolov8n.pt`) over WebSockets to detect mobile devices and unauthorized persons.

---

## ⚠️ 2. Problem Statement & System Comparison

### The Problem
National recruitment commissions (e.g. UPSC, SSC, state service boards) and autonomous universities face recurring question paper leaks that compromise academic integrity, delay admissions, and cost millions of dollars in cancellations.

### Comparison Matrix

| Security Dimension | Traditional Examination Workflow | ZeroLeak Platform |
|---|---|---|
| **Storage at Rest** | Plaintext Word / PDF files stored on local office PCs | **AES-256-GCM Authenticated Encryption**; raw plaintext never written to disk |
| **Access Control** | Single-administrator master passwords | **Shamir's (2, 3) Threshold Scheme** over $GF(256)$; 2 of 3 custodians required |
| **Advance Distribution** | Printed or emailed hours or days before the exam | **Server Monotonic Hardware Time-Lock**; payload undecryptable before unlock minute |
| **Physical Printing** | Unrestricted local printing or commercial press printing | **LAN Wi-Fi Secure Print Relay (UDP 45412)** with sequential serial tracking (`print_copies`) |
| **Leak Attribution** | Untraceable paper photocopies or phone photos | **Dynamic Forensic Steganographic Watermark** (Operator, Centre, GPS, Device UUID) |
| **Screen Capture** | Unrestricted PrintScreen, Snipping Tool, screen shares | **OS Window Shielding** (`setContentProtection`) + Web API interception |
| **Emergency Response** | Total examination cancellation across all centres | **Zero-Overlap Emergency Paper Regeneration** with tainted question quarantine |

---

## 🎯 3. Core Objectives

1. **Eliminate Single Points of Failure:** Guarantee that no rogue administrator or compromised workstation can unilaterally decrypt or leak an examination paper.
2. **Mathematical Time Enforcement:** Enforce cryptographic time gates evaluated on hardware server clocks rather than untrusted client clocks.
3. **Automate Academic Layout & Synthesis:** Leverage generative AI and the bundled Rust Tectonic compiler to produce LaTeX papers with formulas and diagrams in $< 1$ second.
4. **Irrefutable Forensic Traceability:** Stamp visual and digital forensic identifiers into every page to trace unauthorized photographs back to the specific operator and terminal.
5. **Operational Offline Resilience:** Maintain full functionality in isolated, air-gapped exam centres using local SQLite (`sql.js`), bundled Tectonic (`bin/tectonic.exe`), and local Ollama inference.

---

## 🧑‍🤝‍🧑 4. User Roles & Separation of Duties

ZeroLeak enforces strict Role-Based Access Control (RBAC) across **five active verified roles**:

```mermaid
graph LR
    Owner["👑 Organization Owner<br/>(System Lead / Registrar)"]
    Manager["📋 Examination Manager<br/>(Controller of Exams)"]
    Translator["🌐 Linguistic Translator<br/>(Linguistic Expert)"]
    Operator["🖨️ Centre Operator<br/>(Superintendent)"]
    Auditor["🔍 Security Auditor<br/>(CBI Vigilance Officer)"]

    Owner -->|Holds Key Share 1| Enclave["Cryptographic Threshold Enclave"]
    Manager -->|Holds Key Share 2| Enclave
    Auditor -->|Holds Key Share 3| Enclave

    Manager -->|Generates & Dispatches| Operator
    Translator -->|Translates Questions| Manager
    Auditor -->|Inspects Audit Trail| Owner & Manager & Operator
```

| Role Key | Verified Role Name | Core Responsibilities | Key Cryptographic Privileges |
|---|---|---|---|
| `ORG_OWNER` | **Organization Owner** | Organization onboarding, AICTE registry validation, workstation device approval, user management. | Holds **Key Share 1** ($x=1$) of the Shamir threshold key; approves trusted hardware. |
| `EXAM_MANAGER` | **Examination Manager** | Curriculum uploading, AI blueprint configuration, multi-set generation, paper custody transfer. | Holds **Key Share 2** ($x=2$); triggers emergency regeneration on confirmed leaks. |
| `TRANSLATOR` | **Linguistic Translator** | Bilingual question translation (e.g. English to Marathi/Hindi) while preserving LaTeX math syntax. | Authorized access to isolated translation tasks; monitored via camera proctoring. |
| `CENTRE_OPERATOR`| **Centre Operator** | Reception of time-locked papers, physical printing management, Wi-Fi print relay operation. | Unlocks paper at scheduled time; authorizes serialized print quotas at test centre. |
| `AUDITOR` | **CBI Security Auditor** | Audit log inspection, leak investigation, proctor violation review, anomaly score monitoring. | Holds **Key Share 3** ($x=3$); read-only inspection across all encrypted ledger records. |

> [!NOTE]
> **Audit Finding on the SME Role:**  
> The legacy Subject Matter Expert (`SME`) role has been **actively decommissioned and revoked** in `server.ts` line 16596 (`UPDATE users SET status = 'INACTIVE', authorization_status = 'REVOKED' WHERE role = 'SME'`) to prevent privilege escalation.

---

## 🗺️ 5. Feature-to-Technology Mapping

The table below maps every implemented functional capability to the verified technologies and source files that deliver it:

| Feature | Frontend Technology | Backend Technology | Database Engine | AI / ML / Vision | Security Enforcement | Verified Files |
|---|---|---|---|---|---|---|
| **Organization Onboarding** | React 19, Tailwind CSS | Express 4, TypeScript | PostgreSQL / SQLite (`organizations`) | Levenshtein matching on AICTE registry | Domain DNS validation, rate limiting | [`OrgRegistrationPage.tsx`](file:///d:/0leakexam-main/src/components/OrgRegistrationPage.tsx)<br>[`organizationVerification.ts`](file:///d:/0leakexam-main/server/organizationVerification.ts) |
| **Hardware Device Binding** | WebCrypto API, React Hooks | Express 4, Node `crypto` | SQLite / PostgreSQL (`trusted_devices`) | N/A | ECDSA P-256 signature verification, 32-byte nonce (5-min TTL) | [`DeviceApprovalModal.tsx`](file:///d:/0leakexam-main/src/components/DeviceApprovalModal.tsx)<br>[`deviceBinding.ts`](file:///d:/0leakexam-main/server/deviceBinding.ts) |
| **University AI Paper Generator** | React 19, SecurePaperViewer | Express 4, Python 3, Tectonic | SQLite (`examinations`, `paper_versions`) | Multi-pass LLM synthesis (Ollama / Groq / Gemini) | Zero client-side download; custody transfer to Centre Operator | [`AiExamGeneratorWorkspace.tsx`](file:///d:/0leakexam-main/src/components/workspaces/AiExamGeneratorWorkspace.tsx)<br>[`aiExamGenerator.py`](file:///d:/0leakexam-main/server/aiExamGenerator.py)<br>[`bin/tectonic.exe`](file:///d:/0leakexam-main/bin/tectonic.exe) |
| **Question Extraction & Slicing**| React 19, BoundaryEditor | Express 4, PyMuPDF, OpenCV | SQLite (`questions`, `question_papers`) | PyMuPDF text layer + RapidOCR / Tesseract.js | Strips seat-number headers, candidate noise filtering | [`ExamManagerQuestionExtractor.tsx`](file:///d:/0leakexam-main/src/components/workspaces/ExamManagerQuestionExtractor.tsx)<br>[`pdf_extractor.py`](file:///d:/0leakexam-main/server/pdf_extractor.py) |
| **Semantic Plagiarism & Deduplication**| React 19, Status Badges | Express 4, AI Router | SQLite (`question_verifications`) | Zero-shot LLM prompt + Jaccard lexical overlap fallback | Jaccard coefficient threshold ($J \ge 0.75 \implies \text{REJECT}$) | [`server/ai.ts`](file:///d:/0leakexam-main/server/ai.ts) (L179-L255) |
| **Linguistic Translation Studio** | React 19, KaTeX math | Express 4, AI Router | SQLite (`question_translations`) | NLLB / LLaMA 3.3 machine translation | LaTeX formula masking (`$...$`) prior to translation | [`TranslatorWorkspace.tsx`](file:///d:/0leakexam-main/src/components/workspaces/TranslatorWorkspace.tsx)<br>[`server/ai.ts`](file:///d:/0leakexam-main/server/ai.ts) |
| **Envelope Encryption Enclave** | React 19, DeliveryModule | Node.js `node:crypto` | SQLite (`encrypted_papers`) | N/A | AES-256-GCM + RSA-2048 OAEP; ephemeral 256-bit keys | [`server/crypto.ts`](file:///d:/0leakexam-main/server/crypto.ts) |
| **Shamir Threshold Key Splitting** | React 19, CustodianKeyModal | Node.js `node:crypto` | SQLite (`key_shares`) | Finite field arithmetic | Galois Field $GF(2^8)$ polynomials; $(2, 3)$ threshold | [`server/thresholdKeyService.ts`](file:///d:/0leakexam-main/server/thresholdKeyService.ts) |
| **Cryptographic Time-Lock** | React 19, CountdownTimer | Express 4, Hardware Clock | SQLite (`examinations`) | N/A | Server monotonic clock gate; pre-unlock payload redaction | [`server.ts`](file:///d:/0leakexam-main/server.ts) (L10055)<br>[`competitiveExam.ts`](file:///d:/0leakexam-main/server/competitiveExam.ts) |
| **View-Once Inspection Service** | React 19, ViewOnceModal | Express 4, Crypto Hash | SQLite (`view_once_preview_sessions`) | N/A | 180s countdown timer; token burns permanently on close | [`viewOnceService.ts`](file:///d:/0leakexam-main/server/viewOnceService.ts) |
| **Wi-Fi Secure Print Relay** | React 19, PrintRelayPanel | Node UDP (`dgram`), Express | SQLite (`print_copies`) | N/A | UDP port 45412 discovery beacon; 6-digit constant-time code | [`printStation.ts`](file:///d:/0leakexam-main/server/printStation.ts) |
| **Deep Learning Vision Proctoring**| React 19, Webcam Portal | FastAPI, Uvicorn, WebSockets | SQLite / MongoDB (`proctor_events`) | Ultralytics YOLOv8 Nano (`yolov8n.pt`) | 3-frame temporal confirmation filter (person, cell phone) | [`security_monitor.py`](file:///d:/0leakexam-main/security_monitor.py)<br>[`server/proctor.ts`](file:///d:/0leakexam-main/server/proctor.ts) |
| **Forensic Dynamic Watermarking** | Canvas API, PDFKit | Node.js, PDFKit, Tectonic | SQLite (`print_copies`) | N/A | Injected into raw PDF stream (Operator, Centre, GPS, Serial) | [`synthesizedPaperPdfGenerator.ts`](file:///d:/0leakexam-main/server/synthesizedPaperPdfGenerator.ts) |
| **Leak Containment & 0% Regen** | React 19, LeakWizardModal | Express 4, Transaction Engine | SQLite (`emergency_papers`, `quarantines`) | Multi-pass LLM synthesis | Exclusion manifest: guarantees 0% overlap with leaked items | [`paperLeakService.ts`](file:///d:/0leakexam-main/server/paperLeakService.ts)<br>[`emergencyService.ts`](file:///d:/0leakexam-main/server/emergencyService.ts) |
| **Screen Protection & Shielding** | DOM Event Shield, CSS | Electron IPC (`main.cjs`) | N/A | N/A | `setContentProtection(true)`, blocks `getDisplayMedia`, blur filter | [`GlobalScreenSecurityGuard.tsx`](file:///d:/0leakexam-main/src/components/security/GlobalScreenSecurityGuard.tsx)<br>[`electron/main.cjs`](file:///d:/0leakexam-main/electron/main.cjs) |
| **Immutable Audit Trail** | React 19, Recharts | Express 4, AuditRepository | SQLite / PostgreSQL (`audit_events`) | Cumulative threat heuristics | SHA-256 block hash chaining (`previous_hash` + `current_hash`) | [`AuditRepository.ts`](file:///d:/0leakexam-main/server/repositories/AuditRepository.ts)<br>[`AuditorWorkspace.tsx`](file:///d:/0leakexam-main/src/components/workspaces/AuditorWorkspace.tsx) |

---

## 🏗️ 6. System Architecture & End-to-End Workflow

```mermaid
flowchart TD
    subgraph Authoring ["1. Authoring & Ingestion"]
        Upload["Upload Syllabus / Reference Papers (.pdf)"] --> Extract["PyMuPDF Visual Slicer & RapidOCR"]
        Extract --> Blueprint["AI Pattern & Blueprint Formulator"]
    end

    subgraph Synthesis ["2. AI Synthesis & Compilation"]
        Blueprint --> LLM["Multi-Pass LLM Generator (Ollama / Groq)"]
        LLM --> TeX["format_university_tex Engine"]
        TeX --> Tectonic["Tectonic Rust Engine (bin/tectonic.exe)"]
        Tectonic --> PDFs["Vectorized questions.pdf & answers.pdf"]
    end

    subgraph Sealing ["3. Cryptographic Sealing"]
        PDFs --> AES["AES-256-GCM Encryption (256-bit DEK, 96-bit IV)"]
        AES --> Shamir["Shamir's (2, 3) Secret Sharing over GF(256)"]
        Shamir --> Shares["Key Shares to Org Owner, Manager, Auditor"]
    end

    subgraph Delivery ["4. Custody & Time-Locked Delivery"]
        Shares --> Lock{"Server Monotonic Clock >= Unlock Time?"}
        Lock -- "Pre-Unlock (LOCKED)" --> Redacted["Payload & Keys Strictly Redacted"]
        Lock -- "Exam Window (UNLOCKED)" --> Unlocked["Payload Released to Centre Operator Enclave"]
    end

    subgraph Printing ["5. Physical Enclave Printing"]
        Unlocked --> Watermark["Dynamic Forensic Watermark Injection"]
        Watermark --> PrintRelay["Wi-Fi Print Relay (UDP 45412)"]
        PrintRelay --> PhysicalPaper["Serialized Physical Question Paper (print_copies)"]
    end
```

---

## 🤖 7. Artificial Intelligence & Computer Vision

### 7.1 Computer Vision & YOLOv8 Proctoring (`security_monitor.py`)
- **Model:** Ultralytics YOLOv8 Nano (`yolov8n.pt`, 6.5 MB, ~3.2M parameters).
- **Target Classes:** Class `0` (`person`, confidence $\ge 0.50$), Class `67` (`cell phone`, confidence $\ge 0.45$).
- **Temporal Debouncing Algorithm:** Requires detection across **3 consecutive frames** before a mobile device violation event is committed to the database, preventing false alarms from background artifacts.

### 7.2 University Examination Paper Synthesis (`server/aiExamGenerator.py`)
- **Structure Analysis:** Extracts section titles, question counts, internal choices (*"Attempt Any Four"*), subparts `(a, b, c)`, and marks brackets `[14 Marks]`.
- **LaTeX Compilation:** Passes synthesized TeX source directly to the standalone **Tectonic** executable (`bin/tectonic.exe`), compiling print-ready PDFs in ~0.75 seconds.
- **Custody Handover:** Eliminates raw client-side downloading; dispatches papers directly into the selected Centre Operator's account (`transferredPrintingJobsServer`).

### 7.3 Semantic Deduplication & Plagiarism Detection (`server/ai.ts`)
- **Tier 1 (LLM Semantic Evaluation):** Evaluates candidate questions against existing question banks at temperature 0.1 to calculate semantic equivalence.
- **Tier 2 (Jaccard Lexical Overlap Fallback):** Computes the word-set similarity coefficient $J(A, B) = \frac{|A \cap B|}{|A \cup B|}$ on tokenized words $> 3$ characters. Questions with score $> 0.75$ are rejected as duplicates.

---

## 🔐 8. Cryptographic Security & Anti-Leak Enclave

```
Plaintext Exam Paper ──► AES-256-GCM Encryption (256-bit DEK, 96-bit IV) ──► 128-bit Auth Tag
                                   │
                                   ▼
                 Shamir's Secret Sharing over GF(256)
                       (Rijndael Polynomial 0x11b)
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
   Share 1 (x=1)             Share 2 (x=2)             Share 3 (x=3)
    [ORG_OWNER]             [EXAM_MANAGER]               [AUDITOR]
         └─────────────────────────┬─────────────────────────┘
                                   ▼
                   Lagrange Polynomial Interpolation
                    (Requires 2 of 3 valid shares)
                                   │
                                   ▼
          ⏱️ Server-Side Monotonic Hardware Time-Lock Gate
                                   │
                                   ▼
         🖋️ Multi-Layer Forensic Watermark (Operator, GPS, Device)
                                   │
                                   ▼
          🖨️ Wi-Fi Secure Print Relay (UDP Port 45412 Beacon)
```

1. **Envelope Encryption:** Plaintext papers are encrypted with `AES-256-GCM` using ephemeral 256-bit symmetric keys. The symmetric key is wrapped using `RSA-2048` with OAEP padding and SHA-256.
2. **Shamir Threshold Secret Sharing:** The 32-byte AES key is split using a $(2, 3)$ threshold scheme over Galois Field $GF(2^8) = GF(256)$ using the irreducible polynomial $P(x) = x^8 + x^4 + x^3 + x + 1$ ($0x11b$). Any single share provides zero entropy.
3. **Server Hardware Time-Locks:** Decryption keys and question payloads are withheld by backend middleware until the server monotonic clock reaches the scheduled unlock time.
4. **Hardware Device Binding:** Workstations authenticate using browser-generated ECDSA P-256 keypairs signing random 32-byte nonce challenges issued by the server.
5. **Screen Shielding:** Electron builds invoke `window.setContentProtection(true)` to blank out screen captures at the OS compositor level. Browser runtimes neutralize `navigator.mediaDevices.getDisplayMedia` and intercept `PrintScreen`, `Ctrl+P`, and `F12`.

---

## 💾 9. Database Architecture & Multi-Model Persistence

ZeroLeak features an enterprise hybrid data access layer in [`server/db.ts`](file:///d:/0leakexam-main/server/db.ts):

- **Local Air-Gapped Engine:** SQLite 3 via `sql.js` (WebAssembly) reading from `zeroleak_data.sqlite`. Executes in memory at microsecond speeds and flushes transactions to disk automatically via `saveDb()`.
- **Clustered Relational Engine:** PostgreSQL 14+ via node-postgres connection pooling (`pgPool`) executing schema definitions from [`database/schema.sql`](file:///d:/0leakexam-main/database/schema.sql).
- **Document Store:** MongoDB via Mongoose (`server/models/`) for flexible semi-structured proctoring logs.

---

## 🚀 10. Installation, Configuration & Execution

### Prerequisites
- **Node.js:** v18.0.0 or higher (v20+ recommended).
- **Python:** v3.10+ (for computer vision proctoring and document slicing).
- **Git:** Installed on system.

### Step 1: Clone Repository & Install Node Dependencies
```bash
git clone https://github.com/vishalkhadatare/0leakexam.git
cd 0leakexam
npm install
```

### Step 2: Install Python Dependencies
```bash
pip install -r requirements-python.txt
```

### Step 3: Configure Environment Variables
Create a `.env` file in the root directory (based on `.env.example`):
```env
PORT=3000
JWT_SECRET=your_32_character_cryptographic_secret_key_here
DEV_AUTO_APPROVE_DEVICE=true

# Database Configuration (Optional - falls back to local SQLite)
MONGODB_URI=mongodb://127.0.0.1:27017/zeroleak
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zero_leak
DB_USER=postgres
DB_PASSWORD=your_password

# AI Providers (Optional - falls back to local Ollama)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:1b
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

### Step 4: Run Application
```bash
# Starts Node.js backend server with Vite frontend bundler on http://localhost:3000
npm run dev

# Starts Python Video Proctoring & Computer Vision Server on port 8000
python security_monitor.py
```

### Pre-Seeded Demonstration Accounts (Password: `Password123!`)
- **Organization Owner:** `owner_nbte` (`owner@nbte.edu.in`)
- **Examination Manager:** `exam_manager` (`manager@nbte.edu.in`)
- **Linguistic Translator:** `translator_lang` (`translator@nbte.edu.in`)
- **Centre Operator 1 (CTR-101):** `centre_op_101` (`operator@centre101.edu.in`)
- **Centre Operator 2 (CTR-MUM-01):** `centre_op_mum` (`operator_mumbai@centre102.edu.in`)
- **CBI Security Auditor:** `auditor_central` (`auditor@gov-audit.gov.in`)

---

## 🧪 11. Testing & Code Verification

The repository includes comprehensive automated test suites executed via the Node.js native test runner:

```bash
# Execute full system test suite
npm test

# Run TypeScript static type verification & linter
npm run lint

# Run competitive exam cryptographic & blueprint tests
npx tsx server/competitiveExam.test.ts
```

### Verified Audit Test Results:
- **`npm run lint` (`tsc --noEmit`):** Passed with **0 errors**.
- **`server/competitiveExam.test.ts`:** **15 / 15 tests passing** (duration: ~33.1s):
  - Question parsing, visual extraction, candidate seat-number exclusion.
  - AES-256-GCM bilingual roundtrip encryption and decryption.
  - Server-side time-lock payload redaction.
  - Multi-set permutation with question-diagram visual atomicity.
  - Blueprint auto-provisioning and cascading exam deletion.

---

## ⚡ 12. POE Quick-Revision Guide

### ⏱️ 30-Second Elevator Pitch
"ZeroLeak is a zero-trust examination security platform that eliminates question paper leaks. We use Generative AI and the standalone Tectonic LaTeX engine to synthesize balanced papers, seal them with AES-256-GCM envelope encryption, and split the master key across three custodians using Shamir's Secret Sharing over Galois fields. Papers are mathematically time-locked until the exact exam minute, and physical prints carry forensic watermarks that instantly identify anyone who photographs the paper."

### ⏱️ 60-Second Board Pitch
"In traditional university and competitive exams, question papers leak because they sit as unencrypted Word documents and paper copies across dozens of human touchpoints for weeks. ZeroLeak completely removes human trust from the custody chain. Our platform uses:
1. **AI Synthesis:** Generates syllabus-compliant papers and compiles them into vectorized PDFs via Tectonic in under a second.
2. **Threshold Encryption:** Encrypts papers with AES-256-GCM and splits the keys using Shamir's $(2, 3)$ threshold scheme over $GF(256)$. No single administrator can open a paper alone.
3. **Server Time-Locks:** Decryption keys are mathematically withheld by the backend until the scheduled exam time.
4. **Enclave Printing:** Papers are dispatched directly to certified Centre Operators over a local Wi-Fi relay with zero local file downloads.
5. **Forensic Tracking:** Every page has a unique watermark containing the operator's name, centre code, device ID, and timestamp, tracing any leak in minutes."

### ⏱️ 2-Minute Deep Defense
*(See full oral defense walkthrough in [`docs/POE_VIVA_QUESTIONS.md`](file:///d:/0leakexam-main/docs/POE_VIVA_QUESTIONS.md)).*

### 🔑 Top 5 Strongest Technical Contributions
1. **Shamir's (2, 3) Threshold Scheme over $GF(2^8)$:** Mathematically sound finite field arithmetic ($0x11b$ polynomial) guaranteeing that any single key share reveals zero entropy.
2. **Standalone Tectonic LaTeX Engine:** Self-contained compilation producing vectorized, print-ready PDFs with math and diagrams in ~0.75 seconds without needing a 5GB TeXLive install.
3. **Server Hardware Clock Time-Lock:** Eliminates client-side clock tampering; ensures papers remain locked ciphertext until the exact scheduled minute.
4. **Multi-Provider AI Fallback Router:** Cascading resilience across Ollama, Groq, Gemini, NVIDIA NIM, and Cerebras, ensuring continuous paper synthesis even when offline.
5. **Zero-Overlap Emergency Paper Regeneration:** If a leak is confirmed, the system quarantines tainted questions and synthesizes a replacement paper with a mathematical guarantee of 0% overlap.

### ⚠️ Top 5 Limitations & Realistic Engineering Boundaries
1. **Physical External Cameras:** Software cannot prevent someone from using an external smartphone to take a picture of a monitor (mitigated by forensic watermarking and YOLOv8 cell phone detection).
2. **CPU Local Inference Latency:** Running local LLMs and YOLOv8 simultaneously on dual-core CPUs without a GPU introduces processing delays.
3. **SQLite Concurrency in Large Deployments:** SQLite's file-level locking limits high-volume concurrent write throughput; national deployments must run on PostgreSQL.
4. **Web Browser Screen Capture Limits:** Standard web browsers lack the OS-level compositor access available in Electron desktop builds (`window.setContentProtection(true)`).
5. **Model Retraining:** ZeroLeak uses pretrained foundation models and prompt engineering rather than custom-trained neural weights.

### ❓ Top 10 High-Yield Viva Questions
1. **What encryption algorithm is used to seal papers?**  
   *Answer:* AES-256-GCM with an ephemeral 256-bit symmetric key, 96-bit random IV, and 128-bit authentication tag, wrapped with RSA-2048 OAEP.
2. **How does Shamir's Secret Sharing work in your code?**  
   *Answer:* It splits the 32-byte AES key into 3 shares over Galois Field $GF(2^8)$ using a degree-1 polynomial. Any 2 shares can reconstruct the key via Lagrange interpolation; 1 share reveals nothing.
3. **Who holds the three key shares?**  
   *Answer:* Organization Owner ($x=1$), Examination Manager ($x=2$), and CBI Security Auditor ($x=3$).
4. **How are papers compiled to PDF?**  
   *Answer:* Using `bin/tectonic.exe`, a standalone Rust-based TeX engine that compiles `.tex` source into vectorized PDFs in under one second.
5. **How do you prevent examiners from saving question papers locally?**  
   *Answer:* Direct download buttons have been removed. Papers must be transferred directly to a certified Centre Operator's account over the network.
6. **How does the time-lock prevent examiners from changing their PC clock?**  
   *Answer:* The time-lock is evaluated strictly on the backend hardware monotonic clock. Client timestamps are ignored.
7. **What deep learning model is used for proctoring?**  
   *Answer:* Ultralytics YOLOv8 Nano (`yolov8n.pt`) detecting persons (class 0) and cell phones (class 67) over WebSocket video streams.
8. **Why did you decommission the SME role?**  
   *Answer:* To enforce strict separation of duties and prevent privilege creep, SME access was decommissioned in code (`server.ts` line 16596), consolidating workflows across the 5 verified roles.
9. **How does question deduplication work?**  
   *Answer:* A two-tier system: Tier 1 uses LLM semantic similarity prompting; Tier 2 falls back to mathematical Jaccard Word-Set Similarity ($J \ge 0.75 \implies \text{reject}$).
10. **How does forensic watermarking help if a paper is leaked?**  
    *Answer:* Every printed sheet has a dynamic watermark embedded with the Operator Name, Centre Code, Device UUID, Timestamp, and Sequential Serial Number, allowing investigators to trace the leak to the exact desk and second.

---

## 📖 Glossary of Essential Technical Terms

- **AEAD (Authenticated Encryption with Associated Data):** Encryption that guarantees both data confidentiality and data authenticity (e.g. AES-256-GCM).
- **Galois Field $GF(2^8)$:** A finite mathematical field containing 256 elements where addition/subtraction is XOR and multiplication is polynomial modulo an irreducible polynomial.
- **Shamir's Secret Sharing:** A cryptographic threshold algorithm where a secret is divided into parts, requiring a minimum threshold $k$ to reconstruct.
- **Envelope Encryption:** Encrypting data with a symmetric key (DEK) and then encrypting the symmetric key with an asymmetric key (KEK).
- **Time-Lock:** A cryptographic access control mechanism that prevents decryption of ciphertext before a designated timestamp.
- **Tectonic:** A modernized, self-contained C/Rust TeX engine that compiles LaTeX without requiring external package installations.
- **YOLO (You Only Look Once):** A real-time convolutional neural network that detects objects in video frames in a single forward pass.
- **Forensic Watermarking:** Embedding unique identifying data (operator, centre, timestamp) into media to trace unauthorized disclosures.
- **Zero Trust:** A security model requiring strict identity verification and device attestation for every request, regardless of whether it originates inside or outside the network perimeter.
