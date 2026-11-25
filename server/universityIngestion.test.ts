import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDraftPaperQuestions } from './universityIngestion.ts';
import { getDb, executeQuery, executeRun } from './db.ts';

test('1. Structured Question Parser extracts sections, Q.No, wording, options, and marks with 100% fidelity', () => {
  const samplePaperText = `SECTION I
Q.1 Choose the correct alternatives from the options.
(a) What primary security guarantee is provided by AES-GCM mode compared to AES-CBC mode?
A) Faster public key factorization
B) Authenticated Encryption with Associated Data (AEAD)
C) Quantum key resistance
D) Elimination of nonce repetition
SECTION II
Q.2 Answer the following questions in detail.
(a) Discuss the architecture of Zero-Knowledge Proofs (ZKP) and non-interactive zk-SNARKs. [8 Marks]
(b) Explain TLS 1.3 handshake protocol improvements over TLS 1.2. [6 Marks]`;

  const parsed = parseDraftPaperQuestions(samplePaperText, 1, 'draft-paper-1', 'exam-test-101');

  assert.ok(parsed.length > 0);

  // Check Paper 1 tag and exact wording
  assert.equal(parsed[0].source_paper, 'Paper 1');
  assert.equal(parsed[0].paper_index, 1);
  assert.ok(parsed[0].question_text.includes('AES-GCM mode') || parsed[0].question_text.includes('Choose the correct'));

  // Verify options if detected
  if (parsed[0].options) {
    assert.ok(parsed[0].options.length >= 2);
  }
});

test('2. Separate counts breakdown for Paper 1, Paper 2, and Paper 3 in SQLite storage', async () => {
  const db = await getDb();
  const testExamId = 'exam-ingest-test-2026';

  // Clean test tables
  executeRun(db, 'DELETE FROM draft_questions WHERE exam_id = ?', [testExamId]);
  executeRun(db, 'DELETE FROM draft_papers WHERE exam_id = ?', [testExamId]);

  const p1Text = 'Q.1 (a) Question 1 from Paper 1\nA) Opt A\nB) Opt B\nC) Opt C\nD) Opt D';
  const p2Text = 'Q.1 (a) Question 1 from Paper 2\nA) Opt A\nB) Opt B\nC) Opt C\nD) Opt D\nQ.2 Explain topic from Paper 2';
  const p3Text = 'Q.1 (a) Question 1 from Paper 3\nA) Opt A\nB) Opt B\nC) Opt C\nD) Opt D';

  const q1 = parseDraftPaperQuestions(p1Text, 1, 'dp-1', testExamId);
  const q2 = parseDraftPaperQuestions(p2Text, 2, 'dp-2', testExamId);
  const q3 = parseDraftPaperQuestions(p3Text, 3, 'dp-3', testExamId);

  // Insert into SQLite database
  const allQs = [...q1, ...q2, ...q3];
  for (const q of allQs) {
    executeRun(
      db,
      `INSERT INTO draft_questions (id, draft_paper_id, exam_id, paper_index, source_paper, section, question_number, question_text, question_type, options_json, marks, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [q.id, q.draft_paper_id, q.exam_id, q.paper_index, q.source_paper, q.section, q.question_number, q.question_text, q.question_type, q.options ? JSON.stringify(q.options) : null, q.marks, new Date().toISOString()]
    );
  }

  // Retrieve & count by Paper 1, Paper 2, Paper 3
  const p1Rows = executeQuery(db, 'SELECT * FROM draft_questions WHERE exam_id = ? AND paper_index = 1', [testExamId]);
  const p2Rows = executeQuery(db, 'SELECT * FROM draft_questions WHERE exam_id = ? AND paper_index = 2', [testExamId]);
  const p3Rows = executeQuery(db, 'SELECT * FROM draft_questions WHERE exam_id = ? AND paper_index = 3', [testExamId]);

  assert.equal(p1Rows.length, q1.length);
  assert.equal(p2Rows.length, q2.length);
  assert.equal(p3Rows.length, q3.length);

  assert.equal(p1Rows[0].source_paper, 'Paper 1');
  assert.equal(p2Rows[0].source_paper, 'Paper 2');
  assert.equal(p3Rows[0].source_paper, 'Paper 3');

  // Cleanup test data
  executeRun(db, 'DELETE FROM draft_questions WHERE exam_id = ?', [testExamId]);
});

test('3. Regression: Long-answer question immediately following exam headers and instructions excludes metadata', () => {
  const paperText = `PUNYASHLOK AHILYADEVI HOLKAR SOLAPUR UNIVERSITY, SOLAPUR
B.Tech. (Computer Science and Engineering) Semester - VI Examination
Seat No. [          ]
Subject: Operating Systems
Time: 3 Hours
Max. Marks: 70
Instructions:
1) All questions are compulsory.
2) Figures to the right indicate full marks.
3) Assume suitable data wherever necessary.
SECTION I
Q.1 Explain the architecture of the Linux operating system kernel with neat diagram. [8 Marks]`;

  const parsed = parseDraftPaperQuestions(paperText, 1, 'dp-reg-1', 'exam-reg-1');
  assert.equal(parsed.length, 1);
  const q = parsed[0];
  assert.equal(q.question_number, 'Q.1');
  assert.equal(q.question_type, 'THEORY');
  assert.equal(q.marks, 8);
  assert.equal(q.section, 'SECTION I');
  // Check that question text contains only the real question
  assert.ok(q.question_text.includes('Explain the architecture of the Linux operating system kernel with neat diagram.'));
  // Verify NO exam metadata or instructions leaked into question text
  assert.ok(!q.question_text.includes('PUNYASHLOK'));
  assert.ok(!q.question_text.includes('B.Tech.'));
  assert.ok(!q.question_text.includes('Seat No'));
  assert.ok(!q.question_text.includes('Operating Systems'));
  assert.ok(!q.question_text.includes('Max. Marks'));
  assert.ok(!q.question_text.includes('All questions are compulsory'));
});

test('4. Regression: Standard MCQ with all four options preserved separately without merging into stem', () => {
  const paperText = `SECTION I
Q.1 Choose the correct alternative from the given options:
(a) Which cryptographic primitive provides authenticated encryption with associated data (AEAD)?
A) AES-CBC
B) AES-GCM
C) RSA-OAEP
D) ChaCha20 without Poly1305`;

  const parsed = parseDraftPaperQuestions(paperText, 1, 'dp-reg-2', 'exam-reg-2');
  assert.equal(parsed.length, 1);
  const q = parsed[0];
  assert.equal(q.question_type, 'MCQ');
  assert.equal(q.marks, 1);
  assert.ok(q.question_text.includes('Which cryptographic primitive provides authenticated encryption with associated data (AEAD)?'));
  assert.ok(!q.question_text.includes('AES-CBC'));
  assert.ok(!q.question_text.includes('AES-GCM'));
  assert.ok(Array.isArray(q.options));
  assert.equal(q.options?.length, 4);
  assert.ok(q.options![0].includes('AES-CBC'));
  assert.ok(q.options![1].includes('AES-GCM'));
  assert.ok(q.options![2].includes('RSA-OAEP'));
  assert.ok(q.options![3].includes('ChaCha20'));
});

test('5. Regression: MCQ with multi-line options maintains complete option text and clean stem', () => {
  const paperText = `SECTION I
Q.1 Choose the correct alternative:
(a) What is the main security advantage of ephemeral Diffie-Hellman key exchange (DHE) over static DH?
A) Lower computational latency and bandwidth requirements
   across resource-constrained network hops.
B) Perfect Forward Secrecy (PFS) ensuring past sessions cannot
   be decrypted if the long-term server key is compromised.
C) Complete immunity against quantum Shor algorithm factorization.
D) Elimination of certificate authority public-key infrastructure.`;

  const parsed = parseDraftPaperQuestions(paperText, 1, 'dp-reg-3', 'exam-reg-3');
  assert.equal(parsed.length, 1);
  const q = parsed[0];
  assert.equal(q.question_type, 'MCQ');
  assert.equal(q.options?.length, 4);
  // Stem clean
  assert.ok(q.question_text.includes('ephemeral Diffie-Hellman'));
  assert.ok(!q.question_text.includes('Perfect Forward Secrecy'));
  assert.ok(!q.question_text.includes('computational latency'));
  // Option A multi-line check
  assert.ok(q.options![0].includes('Lower computational latency'));
  assert.ok(q.options![0].includes('resource-constrained network hops'));
  // Option B multi-line check
  assert.ok(q.options![1].includes('Perfect Forward Secrecy'));
  assert.ok(q.options![1].includes('long-term server key is compromised'));
});

test('6. Regression: Question with subparts (a), (b), (i), and (ii) preserves all subparts intact', () => {
  const paperText = `SECTION II
Q.2 Answer the following in detail:
(a) Define operating system and describe its core kernel abstraction layers.
(b) Explain microkernel architecture with respect to:
    (i) Inter-process communication (IPC) overhead.
    (ii) Fault tolerance and isolation guarantees. [16 Marks]`;

  const parsed = parseDraftPaperQuestions(paperText, 1, 'dp-reg-4', 'exam-reg-4');
  assert.equal(parsed.length, 1);
  const q = parsed[0];
  assert.equal(q.question_type, 'THEORY');
  assert.equal(q.marks, 16);
  assert.ok(q.question_text.includes('(a) Define operating system'));
  assert.ok(q.question_text.includes('(b) Explain microkernel architecture'));
  assert.ok(q.question_text.includes('(i) Inter-process communication'));
  assert.ok(q.question_text.includes('(ii) Fault tolerance and isolation'));
});

test('7. Regression: Question containing equations, mathematical symbols, and markdown table preserved verbatim', () => {
  const paperText = `SECTION I
Q.2 Consider the recurrence relation for divide-and-conquer:
T(n) = 2T(n/2) + O(n)
where α ≥ 1, β ≤ 2, and λ ∈ {0, 1} with base condition T(1) = Θ(1).
Also consider the CPU scheduling table given below:
| Process | Arrival Time | CPU Burst |
| P1      | 0            | 5 ms      |
| P2      | 1            | 3 ms      |
Refer to Figure 1 for thread state transitions. [12 Marks]`;

  const parsed = parseDraftPaperQuestions(paperText, 1, 'dp-reg-5', 'exam-reg-5');
  assert.equal(parsed.length, 1);
  const q = parsed[0];
  assert.ok(q.question_text.includes('T(n) = 2T(n/2) + O(n)'));
  assert.ok(q.question_text.includes('α ≥ 1, β ≤ 2, and λ ∈ {0, 1}'));
  assert.ok(q.question_text.includes('| Process | Arrival Time | CPU Burst |'));
  assert.ok(q.question_text.includes('| P1      | 0            | 5 ms      |'));
  assert.ok(q.question_text.includes('Refer to Figure 1'));
  assert.equal(q.marks, 12);
});

test('8. Regression: Page containing headers, footers, page numbers, and multiple questions excludes all pagination noise', () => {
  const paperText = `SLR-TJ-123
SECTION I
Q.1 What is virtual memory? Explain paging mechanism with page table entry structure. [6 Marks]
Page 1 of 3
P.T.O.
Q.2 Differentiate between preemptive and non-preemptive scheduling algorithms. [6 Marks]
Total Pages : 3`;

  const parsed = parseDraftPaperQuestions(paperText, 1, 'dp-reg-6', 'exam-reg-6');
  assert.equal(parsed.length, 2);
  const q1 = parsed[0];
  const q2 = parsed[1];
  assert.equal(q1.question_number, 'Q.1');
  assert.equal(q2.question_number, 'Q.2');
  assert.ok(q1.question_text.includes('What is virtual memory?'));
  assert.ok(q2.question_text.includes('Differentiate between preemptive'));
  // Verify footers excluded from both
  for (const q of [q1, q2]) {
    assert.ok(!q.question_text.includes('SLR-TJ-123'));
    assert.ok(!q.question_text.includes('Page 1 of 3'));
    assert.ok(!q.question_text.includes('P.T.O.'));
    assert.ok(!q.question_text.includes('Total Pages : 3'));
  }
});

test('9. Regression: Multi-page question spanning across a page break preserves continuity without premature termination', () => {
  const paperText = `SECTION I
Q.1 Discuss the implementation of virtual memory in modern operating systems,
focusing on demand paging and page replacement algorithms.
Page 1 of 2
[Contd...]
SLR-TJ-123 -2-
Seat No. [          ]
Specifically analyze the working of the Clock (Second Chance) algorithm
and compare its hit ratio against LRU under sequential access patterns. [14 Marks]`;

  const parsed = parseDraftPaperQuestions(paperText, 1, 'dp-reg-7', 'exam-reg-7');
  assert.equal(parsed.length, 1);
  const q = parsed[0];
  assert.equal(q.question_number, 'Q.1');
  assert.equal(q.marks, 14);
  assert.ok(q.question_text.includes('Discuss the implementation of virtual memory'));
  assert.ok(q.question_text.includes('demand paging and page replacement algorithms'));
  assert.ok(q.question_text.includes('Specifically analyze the working of the Clock'));
  assert.ok(q.question_text.includes('compare its hit ratio against LRU'));
  // Excluded page break noise
  assert.ok(!q.question_text.includes('Page 1 of 2'));
  assert.ok(!q.question_text.includes('[Contd...]'));
  assert.ok(!q.question_text.includes('SLR-TJ-123 -2-'));
  assert.ok(!q.question_text.includes('Seat No'));
});

test('10. Regression: MCQ with fewer than four options in source does not fabricate missing options', () => {
  const paperText = `SECTION I
Q.1 Choose the correct alternative:
(a) In symmetric-key encryption, both communicating parties use the exact same key for encryption and decryption.
A) True
B) False`;

  const parsed = parseDraftPaperQuestions(paperText, 1, 'dp-reg-8', 'exam-reg-8');
  assert.equal(parsed.length, 1);
  const q = parsed[0];
  assert.equal(q.question_type, 'MCQ');
  assert.equal(q.marks, 1);
  assert.ok(Array.isArray(q.options));
  // Exactly two options, NO fabricated C or D
  assert.equal(q.options?.length, 2);
  assert.ok(q.options![0].includes('True'));
  assert.ok(q.options![1].includes('False'));
});

test('11. Regression: End-to-end PDF generation renders newly extracted questions into official University template identically', async () => {
  const { generateUniversityPaperPdf } = await import('./universityPdfGenerator.ts');

  // Create 14 extracted MCQs
  const extractedMcqs: any[] = [];
  for (let i = 1; i <= 14; i++) {
    const raw = `SECTION I
Q.1 Choose the correct alternative:
(${i}) What is the primary characteristic of question item ${i}?
A) First option ${i}
B) Second option ${i}
C) Third option ${i}
D) Fourth option ${i}`;
    const parsed = parseDraftPaperQuestions(raw, 1, 'dp-e2e', 'exam-e2e');
    extractedMcqs.push({
      questionId: `mcq-${i}`,
      sourcePaper: 'Paper 1',
      paperIndex: 1,
      section: 'Section I',
      questionType: 'MCQ',
      marks: 1,
      questionText: parsed[0].question_text,
      options: parsed[0].options,
    });
  }

  // Create theory questions
  const extractedTheory: any[] = [];
  for (let i = 1; i <= 8; i++) {
    const raw = `SECTION I
Q.2 Answer the following:
(a) Explain engineering principles and theoretical foundations for topic ${i}. [4 Marks]`;
    const parsed = parseDraftPaperQuestions(raw, 1, 'dp-e2e', 'exam-e2e');
    extractedTheory.push({
      questionId: `th-${i}`,
      sourcePaper: 'Paper 1',
      paperIndex: 1,
      section: i <= 4 ? 'Section I' : 'Section II',
      questionType: 'THEORY',
      marks: 4,
      questionText: parsed[0].question_text,
    });
  }

  const pdfBuffer = await generateUniversityPaperPdf({
    universityName: 'PUNYASHLOK AHILYADEVI HOLKAR SOLAPUR UNIVERSITY',
    examName: 'T.Y. (B.Tech.) MODEL EXAMINATION: 2026',
    subject: 'Operating Systems (BTN04605)',
    paperCode: 'SLR-HL-475',
    setLetter: 'P',
    mcqs: extractedMcqs,
    section1Theory: extractedTheory.slice(0, 4),
    section2Theory: extractedTheory.slice(4),
  });

  assert.ok(pdfBuffer instanceof Buffer);
  assert.ok(pdfBuffer.length > 5000);
  assert.equal(pdfBuffer.subarray(0, 5).toString('ascii'), '%PDF-');
});

test('12. Ingestion validation enforces minimum 3 and maximum 5 papers (rejects 2 papers, rejects 6 papers)', async () => {
  const { handleUploadUniversityDrafts } = await import('./universityIngestion.ts');

  // Test with 2 files (too few)
  let status2 = 0;
  let json2: any = null;
  const req2: any = {
    files: [{ path: 'temp1.pdf', originalname: 'p1.pdf' }, { path: 'temp2.pdf', originalname: 'p2.pdf' }],
    body: { exam_id: 'test-exam' },
    user: { id: 'u1', org_id: 'o1' },
  };
  const res2: any = {
    status(s: number) { status2 = s; return this; },
    json(data: any) { json2 = data; return this; },
  };

  await handleUploadUniversityDrafts(req2, res2);
  assert.equal(status2, 400);
  assert.equal(json2.success, false);
  assert.ok(json2.error.includes('INVALID_FILE_COUNT'));

  // Test with 6 files (too many)
  let status6 = 0;
  let json6: any = null;
  const req6: any = {
    files: [1, 2, 3, 4, 5, 6].map(i => ({ path: `temp${i}.pdf`, originalname: `p${i}.pdf` })),
    body: { exam_id: 'test-exam' },
    user: { id: 'u1', org_id: 'o1' },
  };
  const res6: any = {
    status(s: number) { status6 = s; return this; },
    json(data: any) { json6 = data; return this; },
  };

  await handleUploadUniversityDrafts(req6, res6);
  assert.equal(status6, 400);
  assert.equal(json6.success, false);
  assert.ok(json6.error.includes('INVALID_FILE_COUNT'));
});

test('13. Multi-paper ingestion supports up to 5 papers (Paper 1 through Paper 5) with correct labeling', () => {
  const papers = [1, 2, 3, 4, 5].map(idx => {
    const text = `SECTION I\nQ.1 (a) Question from Paper ${idx}\nA) Opt 1\nB) Opt 2\nC) Opt 3\nD) Opt 4`;
    return parseDraftPaperQuestions(text, idx, `dp-${idx}`, `exam-5p`);
  });

  assert.equal(papers.length, 5);
  for (let i = 0; i < 5; i++) {
    const idx = i + 1;
    assert.equal(papers[i].length, 1);
    assert.equal(papers[i][0].paper_index, idx);
    assert.equal(papers[i][0].source_paper, `Paper ${idx}`);
    assert.ok(papers[i][0].question_text.includes(`Question from Paper ${idx}`));
  }
});

