# ZeroLeak: Complete Technology Stack & Architectural Evaluation

> **Audit Date:** October 2026 | **Version:** 2.4.0 Production Build  
> **Status:** 100% verified against package manifests, build scripts, and runtime binaries.

---

## 1. Technology Summary Table

| Category | Technology | Verified Version | Project Responsibility | Relevant Files |
|---|---|---|---|---|
| **Languages** | TypeScript | `~5.8.2` | Strong type enforcement across backend APIs and React frontend | `tsconfig.json`, `server.ts`, `src/` |
| | Python | `3.10+` | Deep learning computer vision, document layout extraction, Tectonic compilation | `security_monitor.py`, `server/aiExamGenerator.py`, `server/pdf_extractor.py` |
| | Rust (Compiled Binary) | `0.15.0` (Tectonic) | High-speed standalone LaTeX compilation into vectorized PDFs | `bin/tectonic.exe` |
| **Frontend UI** | React | `^19.0.1` | Component lifecycle, interactive workspaces, virtual DOM | `package.json`, `src/App.tsx`, `src/components/` |
| | Tailwind CSS | `^4.1.14` | Zero-runtime atomic styling, dark/light theme, responsive layout | `package.json`, `src/index.css` |
| | Lucide React | `^0.546.0` | Accessible iconography for security indicators and navigation | `src/components/Sidebar.tsx`, `Header.tsx` |
| | Recharts | `^3.10.1` | Real-time security telemetry, threat analytics, proctor graphs | `src/components/dashboard/`, `AuditorWorkspace.tsx` |
| | KaTeX | `^0.18.7` | Fast mathematical notation rendering in browser ($E = mc^2$) | `src/components/common/LaTeXText.tsx` |
| **Backend & APIs** | Node.js / Express | `^4.21.2` | RESTful routing, cryptographic auth middleware, file streaming | `server.ts`, `server/db.ts` |
| | FastAPI / Uvicorn | `^0.100.0` | High-throughput asynchronous WebSocket pipeline for video frames | `security_monitor.py` |
| | Tsx | `^4.21.0` | Direct runtime TypeScript execution without compilation overhead | `package.json` (`npm run dev`) |
| **Databases** | SQLite (`sql.js`) | `^1.14.2` | Zero-configuration local transactional database with disk sync | `server/db.ts`, `zeroleak_data.sqlite` |
| | PostgreSQL (`pg`) | `^8.23.0` | Production enterprise relational storage with connection pooling | `database/schema.sql`, `server/db.ts` |
| | MongoDB (`mongoose`)| `^9.11.1` | Document-oriented schema models for flexible audit records | `server/db.ts`, `server/models/` |
| **AI / ML & Vision**| Ultralytics YOLOv8 | `^8.0.0` | Deep learning object detection (`yolov8n.pt`, `yolov8s.pt`) | `security_monitor.py` |
| | PyMuPDF (`fitz`) | `^1.24.0` | PDF page rendering, text extraction, visual bounding box slicing | `server/pdf_extractor.py`, `server/aiExamGenerator.py` |
| | OpenCV (`cv2`) | `^4.8.0` | Video frame decoding, contrast adjustment, bounding box rendering | `security_monitor.py`, `server/competitiveVisualExtractor.py` |
| | RapidOCR / Tesseract | `^1.4.0` / `^7.0.0` | Optical Character Recognition on scanned examination papers | `eng.traineddata`, `server/pdf_extractor.py` |
| | Unified AI Router | Custom Engine | Multi-provider failover (Ollama, Groq, Gemini, NVIDIA NIM, Cerebras) | `server/aiProviders.ts`, `server/ai.ts` |
| **Cryptography** | AES-256-GCM | Node `crypto` | Authenticated symmetric encryption of examination paper payloads | `server/crypto.ts` |
| | RSA-2048 OAEP | Node `crypto` | Asymmetric key wrapping of ephemeral AES-256 keys | `server/crypto.ts`, `.zeroleak-server-key.pem` |
| | Shamir's Secret Sharing | Custom $GF(2^8)$ | $(2, 3)$ threshold polynomial key splitting across 3 custodians | `server/thresholdKeyService.ts` |
| | WebCrypto (ECDSA P-256)| Browser API | Zero-trust hardware device signature challenge-response | `src/utils/authFlow.ts`, `server/deviceBinding.ts` |
| **Desktop Shell** | Electron | `^44.4.5` | Native desktop wrapper with hardware window protection | `electron/main.cjs`, `electron/preload.cjs` |
| **Document Compiler**| Tectonic | Standalone binary | Self-contained, zero-dependency LaTeX-to-PDF compilation | `bin/tectonic.exe` |

---

## 2. In-Depth Architectural Evaluation per Technology

### 2.1 TypeScript (`~5.8.2`)
1. **What it is:** A strongly typed superset of JavaScript that compiles to clean JavaScript.
2. **Where it is used:** Every frontend component (`src/`), backend server script (`server.ts`, `server/*.ts`), and automated test suite.
3. **Why it was selected:** ZeroLeak handles strict cryptographic keys, binary buffers, multi-role user objects, and mathematical shares where a runtime `undefined` error during paper decryption or printing can abort an exam. TypeScript catches type and nullability bugs at compile time.
4. **Internal Working:** Analyzes the Abstract Syntax Tree (AST), performs static structural typing (duck typing), strips types during build with Vite/esbuild, and outputs optimized JavaScript.
5. **Alternatives:** Plain JavaScript, Flow, JSDoc with TypeScript checking.
6. **Why alternatives are unsuitable:** Plain JavaScript lacks build-time type verification, making it unacceptable for high-security cryptographic key management.

### 2.2 React (`^19.0.1`)
1. **What it is:** The premier component-based declarative UI library developed by Meta.
2. **Where it is used:** Complete frontend presentation layer (`src/App.tsx`, `src/components/workspaces/`).
3. **Why it was selected:** Declarative UI state synchronizes seamlessly with real-time SSE streams, time-lock countdowns, and WebSocket proctor alerts. React 19's optimized rendering and hooks prevent UI blocking during large paper renders.
4. **Internal Working:** Maintains a Virtual DOM in memory, calculates minimal diffs using its fiber reconciliation algorithm, and batches DOM mutations efficiently.
5. **Alternatives:** Vue.js, Angular, Svelte, Solid.js.
6. **Why alternatives are unsuitable:** Angular is excessively heavyweight; Vue and Svelte have smaller ecosystems for specialized scientific tools like KaTeX and Recharts.

### 2.3 Express (`^4.21.2`)
1. **What it is:** The standard, battle-tested minimalist web server framework for Node.js.
2. **Where it is used:** Backend application server (`server.ts`) hosting all 280+ API endpoints.
3. **Why it was selected:** Unmatched flexibility for composing cryptographic middleware (`authenticateToken`, `requireRole`, `requireAuthorizedDevice`), streaming raw PDF binaries, and handling multipart file uploads (`multer`).
4. **Internal Working:** Operates on Node's native HTTP module using an event-driven middleware pipeline. Each HTTP request passes through an onion-style series of handler functions.
5. **Alternatives:** NestJS, Fastify, Koa.
6. **Why alternatives are unsuitable:** NestJS adds heavy boilerplate and excessive abstraction layers that complicate custom binary crypto streams and WebAssembly SQLite integration.

### 2.4 SQLite via `sql.js` (`^1.14.2`) & PostgreSQL (`^8.23.0`)
1. **What it is:** A hybrid database setup: `sql.js` (WebAssembly-compiled SQLite) as the zero-dependency local engine, paired with PostgreSQL 14+ for enterprise clustering.
2. **Where it is used:** `server/db.ts` and `database/schema.sql`.
3. **Why it was selected:** Guarantees that ZeroLeak runs immediately on any examiner or evaluator machine without requiring a pre-installed, pre-configured database server, while providing an automatic upgrade path to PostgreSQL.
4. **Internal Working:** `sql.js` compiles the C SQLite library into WebAssembly. It reads `zeroleak_data.sqlite` into memory, executes ACID-compliant SQL queries at memory speed, and serializes updates back to disk on mutations.
5. **Alternatives:** Pure MongoDB, Pure PostgreSQL, MySQL.
6. **Why alternatives are unsuitable:** Requiring PostgreSQL or MySQL as a hard dependency breaks instant offline execution on isolated air-gapped exam terminals.

### 2.5 Ultralytics YOLOv8 Nano (`security_monitor.py`)
1. **What it is:** State-of-the-art deep learning real-time convolutional object detection network.
2. **Where it is used:** `security_monitor.py` for candidate webcam and examination room video surveillance.
3. **Why it was selected:** YOLOv8 Nano (`yolov8n.pt`, 6.5 MB) provides ultra-fast inference (~15–30 ms per frame on standard laptop CPUs without dedicated GPUs) while maintaining high precision on target classes (person, cell phone).
4. **Internal Working:** Passes video frames through a convolutional CSPDarknet backbone with Path Aggregation Network (PAN) neck and anchor-free detection heads, outputting class probabilities and bounding box coordinates in a single forward pass.
5. **Alternatives:** YOLOv5, Faster R-CNN, SSD MobileNet, MediaPipe.
6. **Why alternatives are unsuitable:** Faster R-CNN is too slow for real-time CPU streams; MediaPipe lacks general object classes like cell phones; YOLOv5 has lower accuracy per parameter compared to YOLOv8.

### 2.6 Tectonic Standalone LaTeX Engine (`bin/tectonic.exe`)
1. **What it is:** A modernized, self-contained TeX/LaTeX engine written in Rust that compiles `.tex` files into PDF without external dependencies.
2. **Where it is used:** `server/aiExamBridge.ts`, `server/aiExamGenerator.py`.
3. **Why it was selected:** Traditional TeXLive distributions require 4GB–7GB of disk space and complex package managers. Tectonic is a single 40MB executable that compiles beautiful academic papers with mathematical equations in under a second.
4. **Internal Working:** Combines XeTeX, fontconfig, and harfbuzz into a single binary. It parses LaTeX macros, processes cross-references in a single pass, embeds vector fonts, and outputs PDF/A compliant documents.
5. **Alternatives:** TeXLive, MiKTeX, pdflatex, Typst.
6. **Why alternatives are unsuitable:** TeXLive and MiKTeX are too massive to bundle inside an application. Typst uses a non-LaTeX syntax that breaks university question paper templates.

### 2.7 AES-256-GCM & RSA-2048 OAEP (`server/crypto.ts`)
1. **What it is:** National Institute of Standards and Technology (NIST) approved cryptographic algorithms for envelope encryption.
2. **Where it is used:** `server/crypto.ts` for sealing examination papers at rest and in transit.
3. **Why it was selected:** AES-256 in Galois/Counter Mode provides both confidentiality (encryption) and authenticity (128-bit authentication tag) in a single hardware-accelerated pass. RSA-2048 with Optimal Asymmetric Encryption Padding (OAEP) securely encapsulates the AES key.
4. **Internal Working:**
   - Plaintext is XORed with the keystream generated from AES encrypting an incrementing counter initialized by a random 96-bit IV.
   - An authentication tag is calculated over the ciphertext using universal hash arithmetic over $GF(2^{128})$ (GHASH).
   - Any tampering with ciphertext or IV causes authentication tag verification to fail immediately.
5. **Alternatives:** AES-CBC with HMAC-SHA256, ChaCha20-Poly1305.
6. **Why alternatives are unsuitable:** AES-CBC is vulnerable to padding oracle attacks; AES-GCM is globally recognized as the FIPS 140-2 gold standard.

### 2.8 Unified Multi-Provider AI Routing Engine (`server/aiProviders.ts`)
1. **What it is:** A cascading, resilient multi-model routing layer supporting both local offline LLMs and free cloud APIs.
2. **Where it is used:** `server/aiProviders.ts`, `server/ai.ts`.
3. **Why it was selected:** Completely eliminates single-provider downtime, rate limits, and vendor lock-in. If cloud APIs are blocked or offline, it falls back to local Ollama on CPU.
4. **Internal Working:** Defines a priority chain: `ollama` -> `nvidia` -> `agentrouter` -> `groq` -> `gemini` -> `cerebras` -> `mistral` -> `openrouter` -> `github`. If a provider returns 429 (rate limit) or 5xx, the router catches the error, records the attempt in telemetry, and delegates to the next model in microseconds.
5. **Alternatives:** LangChain alone, raw OpenAI client alone.
6. **Why alternatives are unsuitable:** Relying on a single API crashes when quotas expire.

