import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import {
  renderExactUniversityPaperPdf,
  validateUniversityTemplateStructure,
  extractTableFromQuestionText,
  UniversityPaperTemplateInput,
} from './universityPaperTemplate.ts';

// Test Data populated with the exact text and table from the uploaded reference model examination
const sampleTemplateData: UniversityPaperTemplateInput = {
  paperCode: 'MODEL–OS–2026',
  setLetter: 'P',
  examTitle: 'T.Y. (B.Tech.) (Sem.–II) MODEL EXAMINATION: 2026',
  branchName: 'ELECTRONICS ENGINEERING',
  subjectName: 'Operating Systems (BTN04605)',
  dayDate: '_______________________',
  timeRange: '10:00 AM to 01:00 PM',
  maxMarksTotal: 70,
  maxMarksTheory: 56,
  instructionsPart1: [
    '1) Q. No. 1 is compulsory and shall be answered in the first 30 minutes. Each question carries one mark.',
    '2) Mention the question-paper set (P/Q/R/S) clearly on the answer book.',
    '3) Figures to the right indicate full marks.',
    '4) Assume suitable data wherever necessary and state the assumptions clearly.',
  ],
  instructionsPart2: [
    '1) All questions are compulsory, subject to the internal choice stated.',
    '2) Figures to the right indicate full marks.',
    '3) Assume suitable data wherever necessary and state it clearly.',
  ],
  mcqs: [
    {
      questionText: 'The primary responsibility of the operating-system kernel is to _______.',
      options: ['a) compile application programs', 'b) manage hardware resources and provide core services', 'c) design database schemas', 'd) translate high-level languages'],
    },
    {
      questionText: 'Which item is normally not stored in a Process Control Block (PCB)?',
      options: ['a) program counter', 'b) CPU-register values', 'c) process state', 'd) source code of the program'],
    },
    {
      questionText: 'Which CPU-scheduling algorithm is inherently preemptive?',
      options: ['a) FCFS', 'b) non-preemptive SJF', 'c) Round Robin', 'd) non-preemptive priority'],
    },
    {
      questionText: 'When a process executes wait(S) on a zero-valued counting semaphore, it normally _______.',
      options: ['a) enters the blocked state', 'b) terminates immediately', 'c) releases the CPU permanently', 'd) increments the semaphore'],
    },
    {
      questionText: 'The requirement that at most one process executes its critical section at a time is called _______.',
      options: ['a) bounded waiting', 'b) progress', 'c) mutual exclusion', 'd) context switching'],
    },
    {
      questionText: 'Which is not one of Coffman’s necessary conditions for deadlock?',
      options: ['a) mutual exclusion', 'b) hold and wait', 'c) circular wait', 'd) time sharing'],
    },
    {
      questionText: 'In paging, a logical address space is divided into fixed-size blocks called _______.',
      options: ['a) frames', 'b) pages', 'c) segments', 'd) clusters'],
    },
    {
      questionText: 'A Translation Lookaside Buffer (TLB) is used to cache _______.',
      options: ['a) recent page-table entries', 'b) disk blocks', 'c) process source code', 'd) file names'],
    },
    {
      questionText: 'A page fault occurs when _______.',
      options: ['a) the CPU divides by zero', 'b) a referenced page is not in physical memory', 'c) the disk is full', 'd) a process finishes'],
    },
    {
      questionText: 'Belady’s anomaly may occur with which page-replacement algorithm?',
      options: ['a) Optimal', 'b) LRU', 'c) FIFO', 'd) Clock only'],
    },
    {
      questionText: 'Excessive paging activity that leaves little time for useful execution is called _______.',
      options: ['a) spooling', 'b) thrashing', 'c) starvation', 'd) fragmentation'],
    },
    {
      questionText: 'Which file-allocation method uses a separate index block containing pointers to file blocks?',
      options: ['a) contiguous allocation', 'b) linked allocation', 'c) indexed allocation', 'd) sequential allocation'],
    },
    {
      questionText: 'Disk seek time is the time required to _______.',
      options: ['a) transfer a sector to memory', 'b) move the disk arm to the required track', 'c) rotate the required sector under the head', 'd) format a disk'],
    },
    {
      questionText: 'A protection domain specifies _______.',
      options: ['a) a set of objects and permitted access rights', 'b) only the current user name', 'c) the order of ready processes', 'd) the page size'],
    },
  ],
  section1Q2: [
    { questionText: 'Explain any four services provided by an operating system. Give one suitable system call for each service.' },
    { questionText: 'Draw and explain the five-state process model. State the purpose of a PCB.' },
    { questionText: 'Compare user-level and kernel-level threads. State any two advantages of multithreading.' },
    { questionText: 'State the three requirements of a correct critical-section solution. Explain how a mutex lock provides mutual exclusion.' },
    { questionText: 'Distinguish between long-term, short-term and medium-term schedulers.' },
  ],
  section1Q3: [
    {
      questionText: 'Four processes arrive as shown below. Using Round Robin scheduling with time quantum 3 ms, draw the Gantt chart and calculate the average waiting time and average turnaround time.',
      table: {
        headers: ['Process', 'Arrival time (ms)', 'CPU burst (ms)'],
        rows: [
          ['P1', '0', '8'],
          ['P2', '1', '4'],
          ['P3', '2', '9'],
          ['P4', '3', '5'],
        ],
      },
    },
    { questionText: 'Write a semaphore-based solution for the bounded-buffer (producer–consumer) problem. Explain the roles of mutex, empty and full.' },
    { questionText: 'Compare shared memory and message passing as inter-process communication mechanisms, with one application of each.' },
  ],
  section2Q4: [
    { questionText: 'State the four necessary conditions for deadlock. Explain any one deadlock-prevention technique.' },
    { questionText: 'Explain address translation in paging with the help of a page table and a TLB.' },
    { questionText: 'List the steps performed by the operating system while servicing a page fault.' },
    { questionText: 'For the page-reference string 1, 2, 3, 4, 2, 1, 5, 2, 4, 5 and three frames, find the number of page faults using FIFO and LRU.' },
    { questionText: 'Explain contiguous, linked and indexed file-allocation methods. State one advantage and one limitation of each.' },
  ],
  section2Q5: [
    { questionText: 'Explain the Banker’s safety algorithm. What is a safe state, and how does it differ from a deadlocked state?' },
    { questionText: 'Define thrashing. Explain the working-set and page-fault-frequency approaches used to control it.' },
    { questionText: 'A disk has cylinders numbered 0–199. The request queue is 98, 183, 37, 122, 14, 124, 65, 67 and the head starts at cylinder 53. Calculate total head movement using FCFS and SSTF scheduling.' },
  ],
};

test('1. Structure and Marks Validation rejects invalid configurations', () => {
  // Valid input passes with exactly 70 marks
  const validReport = validateUniversityTemplateStructure(sampleTemplateData);
  assert.equal(validReport.isValid, true);
  assert.equal(validReport.calculatedTotalMarks, 70);
  assert.equal(validReport.errors.length, 0);

  // Incomplete MCQs fail
  const badMcqs = { ...sampleTemplateData, mcqs: sampleTemplateData.mcqs.slice(0, 10) };
  const invalidMcqReport = validateUniversityTemplateStructure(badMcqs);
  assert.equal(invalidMcqReport.isValid, false);
  assert.match(invalidMcqReport.errors[0], /Expected exactly 14 MCQs/);

  // Incomplete Q2 fails
  const badQ2 = { ...sampleTemplateData, section1Q2: sampleTemplateData.section1Q2.slice(0, 2) };
  const invalidQ2Report = validateUniversityTemplateStructure(badQ2);
  assert.equal(invalidQ2Report.isValid, false);
});

test('2. Table Extractor parses Process Scheduling tables from text', () => {
  const textWithTable = `Four processes arrive as shown below. Using Round Robin scheduling with time quantum 3 ms, draw the Gantt chart.
Process Arrival time (ms) CPU burst (ms)
P1 0 8
P2 1 4
P3 2 9
P4 3 5`;

  const extracted = extractTableFromQuestionText(textWithTable);
  assert.ok(extracted.table);
  assert.equal(extracted.table.headers.length, 3);
  assert.equal(extracted.table.rows.length, 4);
  assert.deepEqual(extracted.table.rows[0], ['P1', '0', '8']);
  assert.ok(extracted.cleanText.includes('Four processes arrive'));
  assert.ok(!extracted.cleanText.includes('P1 0 8'));
});

test('3. Exact Template PDF Generation produces authentic 4-page Set P and 16-page All Sets', async () => {
  // Render single Set P (4 pages)
  const setPPdfBuffer = await renderExactUniversityPaperPdf(sampleTemplateData);
  assert.ok(setPPdfBuffer);
  assert.equal(setPPdfBuffer.subarray(0, 4).toString(), '%PDF');

  // Verify Set P with pdf-parse
  const parsedP = await pdfParse(setPPdfBuffer);
  assert.equal(parsedP.numpages, 4, 'Set P must produce exactly 4 pages matching reference template');

  const textP = parsedP.text;
  // Page 1 Checks
  assert.ok(textP.includes('Seat No.'));
  assert.ok(textP.includes('MODEL–OS–2026'));
  assert.ok(textP.includes('Set'));
  assert.ok(textP.includes('P'));
  assert.ok(textP.includes('T.Y. (B.Tech.) (Sem.–II) MODEL EXAMINATION: 2026'));
  assert.ok(textP.includes('ELECTRONICS ENGINEERING'));
  assert.ok(textP.includes('Operating Systems (BTN04605)'));
  assert.ok(textP.includes('Max. Marks: 70'));
  assert.ok(textP.includes('Time: 10:00 AM to 01:00 PM'));
  assert.ok(textP.includes('MCQ/Objective Type Questions'));
  assert.ok(textP.includes('Duration: 30 Minutes'));
  assert.ok(textP.includes('Marks: 14'));
  assert.ok(textP.includes('Q.1   Choose the correct alternative.'));

  // Page 2 Running Header & Questions
  assert.ok(textP.includes('Page 2 of 4'));
  assert.ok(textP.includes('Belady’s anomaly may occur'));

  // Page 3 Section I & Table Checks
  assert.ok(textP.includes('Max. Marks: 56'));
  assert.ok(textP.includes('Section–I'));
  assert.ok(textP.includes('Q.2   Attempt any four:'));
  assert.ok(textP.includes('Q.3   Attempt any two:'));
  assert.ok(textP.includes('Arrival time (ms)'));
  assert.ok(textP.includes('CPU burst (ms)'));

  // Page 4 Section II Checks
  assert.ok(textP.includes('Section–II'));
  assert.ok(textP.includes('Q.4   Attempt any four:'));
  assert.ok(textP.includes('Q.5   Attempt any two:'));
  assert.ok(textP.includes('Banker’s safety algorithm'));
  assert.ok(textP.includes('Page 4 of 4'));

  // Save sample Set P for manual inspection
  const outDir = path.join(process.cwd(), 'public', 'compiled_papers');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const samplePath = path.join(outDir, 'Sample_Official_University_Model_Exam_Set_P.pdf');
  fs.writeFileSync(samplePath, setPPdfBuffer);
  assert.ok(fs.existsSync(samplePath));

  // Render all 4 sets (Set P, Q, R, S = 16 pages)
  const allSetsData: UniversityPaperTemplateInput = {
    ...sampleTemplateData,
    totalSetsToRender: 4,
  };
  const allSetsPdfBuffer = await renderExactUniversityPaperPdf(allSetsData);
  const parsedAll = await pdfParse(allSetsPdfBuffer);
  assert.equal(parsedAll.numpages, 16, 'All 4 sets must render exactly 16 pages matching 16-page uploaded reference PDF');

  const sampleAllPath = path.join(outDir, 'Sample_Official_University_Model_Exam_All_Sets.pdf');
  fs.writeFileSync(sampleAllPath, allSetsPdfBuffer);
  assert.ok(fs.existsSync(sampleAllPath));
});

