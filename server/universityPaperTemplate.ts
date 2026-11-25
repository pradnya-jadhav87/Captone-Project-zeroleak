import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export interface UniversityPaperTableData {
  headers: string[];
  rows: string[][];
  colWidths?: number[];
}

export interface UniversityTemplateQuestion {
  id?: string;
  subLabel?: string; // 'a', 'b', 'c', 'd', 'e'
  questionText: string;
  marks?: number;
  options?: string[]; // 4 options for MCQs
  table?: UniversityPaperTableData;
  diagramUrl?: string;
}

export interface UniversityPaperTemplateInput {
  paperCode?: string; // e.g. 'MODEL–OS–2026' or 'BTN04605'
  setLetter: string; // 'P', 'Q', 'R', 'S'
  examTitle?: string; // 'T.Y. (B.Tech.) (Sem.–II) MODEL EXAMINATION: 2026'
  branchName?: string; // 'ELECTRONICS ENGINEERING'
  subjectName?: string; // 'Operating Systems (BTN04605)'
  dayDate?: string; // e.g. 'Monday, 19/10/2026' or blank line
  timeRange?: string; // '10:00 AM to 01:00 PM'
  maxMarksTotal?: number; // 70
  maxMarksTheory?: number; // 56
  instructionsPart1?: string[];
  instructionsPart2?: string[];
  mcqs: UniversityTemplateQuestion[]; // Exactly 14 MCQs (questions 1-14)
  section1Q2: UniversityTemplateQuestion[]; // 5 subquestions (a-e), attempt any 4 (16 marks)
  section1Q3: UniversityTemplateQuestion[]; // 3 subquestions (a-c), attempt any 2 (12 marks)
  section2Q4: UniversityTemplateQuestion[]; // 5 subquestions (a-e), attempt any 4 (16 marks)
  section2Q5: UniversityTemplateQuestion[]; // 3 subquestions (a-c), attempt any 2 (12 marks)
  totalSetsToRender?: number; // If 1, renders 4 pages; if 4, renders P, Q, R, S (16 pages)
}

/**
 * Extracts embedded tabular data (like process burst schedules, truth tables, page references)
 * from question text to render as a crisp bordered table.
 */
export function extractTableFromQuestionText(rawText: string): {
  cleanText: string;
  table?: UniversityPaperTableData;
} {
  if (!rawText) return { cleanText: '' };

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // 1. Check for markdown pipe table
  const pipeLines = lines.filter(l => l.startsWith('|') && l.endsWith('|'));
  if (pipeLines.length >= 2) {
    const headerLine = pipeLines[0];
    const dataLines = pipeLines.slice(1).filter(l => !/^[\|\-\s:]+$/.test(l));
    const headers = headerLine.split('|').map(c => c.trim()).filter(Boolean);
    const rows = dataLines.map(l => l.split('|').map(c => c.trim()).filter(Boolean));
    const nonTableLines = lines.filter(l => !l.startsWith('|'));
    return {
      cleanText: nonTableLines.join(' ').trim(),
      table: { headers, rows },
    };
  }

  // 2. Check for Process / Arrival time / Burst table pattern
  const tableStartIndex = lines.findIndex(l => /Process.*Arrival.*Burst/i.test(l) || /Job.*Arrival.*CPU/i.test(l) || /Frame.*Page/i.test(l));
  if (tableStartIndex !== -1) {
    const headerLine = lines[tableStartIndex];
    const headers = headerLine.includes('\t')
      ? headerLine.split('\t').map(c => c.trim()).filter(Boolean)
      : ['Process', 'Arrival time (ms)', 'CPU burst (ms)'];

    const rows: string[][] = [];
    const remainingLines: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (i < tableStartIndex) {
        remainingLines.push(lines[i]);
      } else if (i > tableStartIndex) {
        const l = lines[i];
        const match = l.match(/^(P\d+|[A-Z]\d*|\d+)\s+(\d+)\s+(\d+)/i);
        if (match) {
          rows.push([match[1], match[2], match[3]]);
        } else {
          remainingLines.push(l);
        }
      }
    }

    if (rows.length > 0) {
      return {
        cleanText: remainingLines.join(' ').trim(),
        table: { headers, rows },
      };
    }
  }

  return { cleanText: rawText };
}

/**
 * Validates the structure and marks of a university examination paper.
 */
export function validateUniversityTemplateStructure(input: UniversityPaperTemplateInput): {
  isValid: boolean;
  errors: string[];
  calculatedTotalMarks: number;
} {
  const errors: string[] = [];

  // 1. Validate MCQ Count
  if (input.mcqs.length !== 14) {
    errors.push(`Expected exactly 14 MCQs in Part 1, but received ${input.mcqs.length}.`);
  }

  // 2. Validate Section I Question Counts
  if (input.section1Q2.length < 4) {
    errors.push(`Section I Q.2 requires at least 4 questions (expected 5 with choice), got ${input.section1Q2.length}.`);
  }
  if (input.section1Q3.length < 2) {
    errors.push(`Section I Q.3 requires at least 2 questions (expected 3 with choice), got ${input.section1Q3.length}.`);
  }

  // 3. Validate Section II Question Counts
  if (input.section2Q4.length < 4) {
    errors.push(`Section II Q.4 requires at least 4 questions (expected 5 with choice), got ${input.section2Q4.length}.`);
  }
  if (input.section2Q5.length < 2) {
    errors.push(`Section II Q.5 requires at least 2 questions (expected 3 with choice), got ${input.section2Q5.length}.`);
  }

  // 4. Calculate Maximum Attainable Marks
  // Q.1: 14 MCQs * 1 mark = 14 marks
  // Q.2: Attempt any 4 * 4 marks = 16 marks
  // Q.3: Attempt any 2 * 6 marks = 12 marks
  // Q.4: Attempt any 4 * 4 marks = 16 marks
  // Q.5: Attempt any 2 * 6 marks = 12 marks
  // Total = 14 + 16 + 12 + 16 + 12 = 70 marks
  const mcqMarks = 14;
  const q2Marks = 16;
  const q3Marks = 12;
  const q4Marks = 16;
  const q5Marks = 12;
  const calculatedTotalMarks = mcqMarks + q2Marks + q3Marks + q4Marks + q5Marks;

  if (calculatedTotalMarks !== 70) {
    errors.push(`Calculated maximum attainable marks must equal 70, got ${calculatedTotalMarks}.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    calculatedTotalMarks,
  };
}

/**
 * High-fidelity University Paper Template PDF Renderer.
 * Accurately reproduces the exact layout, typography, borders, headers, and spacing of the uploaded official paper format.
 */
export function renderExactUniversityPaperPdf(input: UniversityPaperTemplateInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // Validate structure before generating PDF
      const validation = validateUniversityTemplateStructure(input);
      if (!validation.isValid) {
        return reject(new Error(`UNIVERSITY_TEMPLATE_VALIDATION_FAILED: ${validation.errors.join('; ')}`));
      }

      // Page dimensions: A4 is 595.28 x 841.89 points
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 25, left: 54, right: 54 },
        bufferPages: true,
        autoFirstPage: false,
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const paperCode = input.paperCode || 'MODEL–OS–2026';
      const examTitle = input.examTitle || 'T.Y. (B.Tech.) (Sem.–II) MODEL EXAMINATION: 2026';
      const branchName = input.branchName || 'ELECTRONICS ENGINEERING';
      const subjectName = input.subjectName || 'Operating Systems (BTN04605)';
      const dayDate = input.dayDate || '_______________________';
      const timeRange = input.timeRange || '10:00 AM to 01:00 PM';
      const setLetter = input.setLetter || 'P';

      const leftMargin = 54;
      const rightMargin = 541; // 595.28 - 54

      // Helpers
      const renderSeatNoBox = (y: number) => {
        doc.rect(leftMargin, y, 95, 30).lineWidth(0.8).strokeColor('#000000').stroke();
        doc.font('Times-Roman').fontSize(10).fillColor('#000000').text('Seat No.', leftMargin + 5, y + 8);
      };

      const renderSetBox = (y: number, letter: string) => {
        // Top line: Paper Code
        doc.font('Times-Roman').fontSize(10.5).fillColor('#000000').text(paperCode, leftMargin, y, {
          align: 'right',
          width: rightMargin - leftMargin,
        });

        // Set Letter Line
        const setLabelX = rightMargin - 42;
        doc.font('Times-Roman').fontSize(10.5).text('Set', setLabelX, y + 15);
        // Box around Set letter
        const boxX = rightMargin - 18;
        doc.rect(boxX, y + 11, 18, 18).lineWidth(0.8).strokeColor('#000000').stroke();
        doc.font('Times-Bold').fontSize(11).text(letter, boxX + 4, y + 14);
      };

      const renderRunningHeader = (letter: string) => {
        doc.font('Times-Roman').fontSize(10.5).fillColor('#000000').text(paperCode, leftMargin, 45, {
          align: 'right',
          width: rightMargin - leftMargin - 46,
        });
        doc.font('Times-Roman').fontSize(10.5).text('Set', rightMargin - 40, 45);
        doc.rect(rightMargin - 18, 41, 18, 18).lineWidth(0.8).strokeColor('#000000').stroke();
        doc.font('Times-Bold').fontSize(11).text(letter, rightMargin - 14, 44);
      };

      const renderTitleAndMetadata = (isPart1: boolean, letter: string) => {
        const topY = 45;
        renderSeatNoBox(topY);
        renderSetBox(topY, letter);

        // Center Title Block
        const titleY = topY + 36;
        doc.y = titleY;
        doc.font('Times-Bold').fontSize(10.5).text(examTitle, leftMargin, titleY, { align: 'center', width: rightMargin - leftMargin });
        doc.font('Times-Bold').fontSize(10).text(branchName, leftMargin, doc.y + 2, { align: 'center', width: rightMargin - leftMargin });
        doc.font('Times-Bold').fontSize(12.5).text(subjectName, leftMargin, doc.y + 2, { align: 'center', width: rightMargin - leftMargin });

        // Metadata: Day & Date / Max. Marks / Time
        const metaY = doc.y + 10;
        doc.font('Times-Roman').fontSize(10).text(`Day & Date: ${dayDate}`, leftMargin, metaY);
        doc.font('Times-Bold').fontSize(10).text(`Max. Marks: ${isPart1 ? 70 : 56}`, leftMargin, metaY, {
          align: 'right',
          width: rightMargin - leftMargin,
        });

        doc.font('Times-Roman').fontSize(10).text(`Time: ${timeRange}`, leftMargin, metaY + 14);

        // Instructions
        const instY = metaY + 30;
        doc.font('Times-Roman').fontSize(10).text('Instructions:', leftMargin, instY);

        if (isPart1) {
          const inst1 = input.instructionsPart1 || [
            '1) Q. No. 1 is compulsory and shall be answered in the first 30 minutes. Each question carries one mark.',
            '2) Mention the question-paper set (P/Q/R/S) clearly on the answer book.',
            '3) Figures to the right indicate full marks.',
            '4) Assume suitable data wherever necessary and state the assumptions clearly.',
          ];
          let curY = instY + 14;
          inst1.forEach(item => {
            doc.text(item, leftMargin, curY, { width: rightMargin - leftMargin });
            curY += 13.5;
          });
          doc.y = curY + 6;
        } else {
          const inst2 = input.instructionsPart2 || [
            '1) All questions are compulsory, subject to the internal choice stated.',
            '2) Figures to the right indicate full marks.',
            '3) Assume suitable data wherever necessary and state it clearly.',
          ];
          let curY = instY + 14;
          inst2.forEach(item => {
            doc.text(item, leftMargin, curY, { width: rightMargin - leftMargin });
            curY += 13.5;
          });
          doc.y = curY + 6;
        }
      };

      // Strip common prefixes like "a)", "A)", "(a)" to avoid duplication
      const cleanOptionText = (raw: string): string => {
        return (raw || '').replace(/^(\([a-dA-D1-4]\)|[a-dA-D1-4][\.\)]|\b[a-dA-D]\b)\s*/i, '').trim();
      };

      const renderMcqItem = (num: number, q: UniversityTemplateQuestion, startY: number): number => {
        doc.font('Times-Bold').fontSize(10).text(`${num})`, leftMargin, startY);

        const questionX = leftMargin + 24;
        doc.font('Times-Roman').fontSize(10).text(q.questionText, questionX, startY, {
          width: rightMargin - questionX,
          lineGap: 1.5,
        });

        const nextY = doc.y + 2;

        const options = (q.options || []).map(cleanOptionText).filter(Boolean);
        const optA = options[0];
        const optB = options[1];
        const optC = options[2];
        const optD = options[3];

        const col1X = questionX;
        const col2X = leftMargin + 250;
        const colWidth = rightMargin - col2X;

        // Render options cleanly without placeholder fallbacks
        if (optA || optB) {
          doc.font('Times-Roman').fontSize(9.5);
          let h1 = 0;
          let h2 = 0;
          if (optA) {
            doc.text(`a) ${optA}`, col1X, nextY, { width: 235 });
            h1 = doc.y - nextY;
          }
          if (optB) {
            doc.text(`b) ${optB}`, col2X, nextY, { width: colWidth });
            h2 = doc.y - nextY;
          }

          const row1Height = Math.max(14, h1, h2);
          const row2Y = nextY + row1Height;

          if (optC || optD) {
            let h3 = 0;
            let h4 = 0;
            if (optC) {
              doc.text(`c) ${optC}`, col1X, row2Y, { width: 235 });
              h3 = doc.y - row2Y;
            }
            if (optD) {
              doc.text(`d) ${optD}`, col2X, row2Y, { width: colWidth });
              h4 = doc.y - row2Y;
            }
            const row2Height = Math.max(14, h3, h4);
            return row2Y + row2Height + 9;
          }
          return row2Y + 9;
        }

        return nextY + 9;
      };

      const renderTheorySubquestion = (label: string, q: UniversityTemplateQuestion, startY: number): number => {
        doc.font('Times-Roman').fontSize(10).text(`${label})`, leftMargin, startY);

        const textX = leftMargin + 16;
        doc.font('Times-Roman').fontSize(10).text(q.questionText, textX, startY, {
          width: rightMargin - textX,
          lineGap: 1.5,
        });

        let curY = doc.y + 4;

        // Render Table if provided
        if (q.table && Array.isArray(q.table.headers) && q.table.headers.length > 0) {
          const tableX = leftMargin + 140;
          const headers = q.table.headers;
          const rows = q.table.rows || [];
          const colWidth = 85;
          const rowHeight = 17;
          const totalTableWidth = headers.length * colWidth;

          // Header Row
          doc.rect(tableX, curY, totalTableWidth, rowHeight).lineWidth(0.6).strokeColor('#000000').stroke();
          headers.forEach((h, i) => {
            const cellX = tableX + i * colWidth;
            doc.lineCap('butt').moveTo(cellX + colWidth, curY).lineTo(cellX + colWidth, curY + rowHeight).stroke();
            doc.font('Times-Roman').fontSize(9.5).text(h, cellX + 4, curY + 4, { width: colWidth - 8, align: 'center' });
          });
          curY += rowHeight;

          // Data Rows
          rows.forEach(row => {
            doc.rect(tableX, curY, totalTableWidth, rowHeight).lineWidth(0.6).strokeColor('#000000').stroke();
            row.forEach((cell, i) => {
              const cellX = tableX + i * colWidth;
              doc.lineCap('butt').moveTo(cellX + colWidth, curY).lineTo(cellX + colWidth, curY + rowHeight).stroke();
              doc.font('Times-Roman').fontSize(9.5).text(cell, cellX + 4, curY + 4, { width: colWidth - 8, align: 'center' });
            });
            curY += rowHeight;
          });
          curY += 6;
        }

        return curY + 4;
      };

      // Helper to generate distinct question ordering and option rotation per Set (P, Q, R, S)
      const getSetQuestions = (curLetter: string) => {
        if (curLetter === 'P') {
          return {
            mcqs: input.mcqs,
            section1Q2: input.section1Q2,
            section1Q3: input.section1Q3,
            section2Q4: input.section2Q4,
            section2Q5: input.section2Q5,
          };
        }

        const shift = curLetter === 'Q' ? 3 : curLetter === 'R' ? 7 : 10;
        const optRotate = curLetter === 'Q' ? 1 : curLetter === 'R' ? 2 : 3;

        const permutedMcqs = input.mcqs.map((_, idx) => {
          const srcIdx = (idx + shift) % input.mcqs.length;
          const orig = input.mcqs[srcIdx];
          const rawOpts = orig.options ? [...orig.options] : [];
          const rotatedOpts =
            rawOpts.length === 4
              ? [rawOpts[optRotate % 4], rawOpts[(optRotate + 1) % 4], rawOpts[(optRotate + 2) % 4], rawOpts[(optRotate + 3) % 4]]
              : rawOpts;
          return {
            ...orig,
            options: rotatedOpts,
          };
        });

        const permuteList = <T>(arr: T[], s: number): T[] => {
          if (!arr || arr.length === 0) return [];
          return arr.map((_, idx) => arr[(idx + s) % arr.length]);
        };

        return {
          mcqs: permutedMcqs,
          section1Q2: permuteList(input.section1Q2, curLetter === 'Q' ? 1 : curLetter === 'R' ? 2 : 3),
          section1Q3: permuteList(input.section1Q3, curLetter === 'Q' ? 1 : curLetter === 'R' ? 2 : 1),
          section2Q4: permuteList(input.section2Q4, curLetter === 'Q' ? 1 : curLetter === 'R' ? 2 : 3),
          section2Q5: permuteList(input.section2Q5, curLetter === 'Q' ? 1 : curLetter === 'R' ? 2 : 1),
        };
      };

      // Function to render a complete 4-page single set (e.g. Set P, Q, R, S)
      const renderSingleSet = (letter: string) => {
        const setQs = getSetQuestions(letter);

        // =====================================================================
        // PAGE 1: Part 1 - Header & MCQs 1 to 6
        // =====================================================================
        doc.addPage();
        renderTitleAndMetadata(true, letter);

        // Section Title: MCQ/Objective Type Questions
        doc.moveDown(0.2);
        doc.font('Times-Bold').fontSize(12.5).text('MCQ/Objective Type Questions', leftMargin, doc.y, {
          align: 'center',
          width: rightMargin - leftMargin,
        });

        // Duration & Marks row
        const durY = doc.y + 8;
        doc.font('Times-Roman').fontSize(10).text('Duration: 30 Minutes', leftMargin, durY);
        doc.font('Times-Roman').fontSize(10).text('Marks: 14', leftMargin, durY, {
          align: 'right',
          width: rightMargin - leftMargin,
        });

        // Q.1 Choose the correct alternative.  14
        const q1Y = durY + 15;
        doc.font('Times-Bold').fontSize(10.5).text('Q.1   Choose the correct alternative.', leftMargin, q1Y);
        doc.font('Times-Bold').fontSize(10.5).text('14', leftMargin, q1Y, {
          align: 'right',
          width: rightMargin - leftMargin,
        });

        let currentY = q1Y + 18;
        const page1Mcqs = setQs.mcqs.slice(0, 6);
        page1Mcqs.forEach((mcq, idx) => {
          currentY = renderMcqItem(idx + 1, mcq, currentY);
        });

        // =====================================================================
        // PAGE 2: Running Header & MCQs 7 to 14
        // =====================================================================
        doc.addPage();
        renderRunningHeader(letter);

        let p2Y = 85;
        const page2Mcqs = setQs.mcqs.slice(6, 14);
        page2Mcqs.forEach((mcq, idx) => {
          p2Y = renderMcqItem(idx + 7, mcq, p2Y);
        });

        // =====================================================================
        // PAGE 3: Part 2 - Theory Section–I (Q.2 & Q.3)
        // =====================================================================
        doc.addPage();
        renderTitleAndMetadata(false, letter);

        // Section–I Header
        doc.moveDown(0.2);
        doc.font('Times-Bold').fontSize(12.5).text('Section–I', leftMargin, doc.y, {
          align: 'center',
          width: rightMargin - leftMargin,
        });

        // Q.2 Attempt any four:    16
        const q2Y = doc.y + 10;
        doc.font('Times-Bold').fontSize(10.5).text('Q.2   Attempt any four:', leftMargin, q2Y);
        doc.font('Times-Bold').fontSize(10.5).text('16', leftMargin, q2Y, {
          align: 'right',
          width: rightMargin - leftMargin,
        });

        let sec1Y = q2Y + 16;
        setQs.section1Q2.slice(0, 5).forEach((q, idx) => {
          const label = String.fromCharCode(97 + idx); // 'a', 'b', 'c', 'd', 'e'
          sec1Y = renderTheorySubquestion(label, q, sec1Y);
        });

        // Q.3 Attempt any two:    12
        const q3Y = sec1Y + 4;
        doc.font('Times-Bold').fontSize(10.5).text('Q.3   Attempt any two:', leftMargin, q3Y);
        doc.font('Times-Bold').fontSize(10.5).text('12', leftMargin, q3Y, {
          align: 'right',
          width: rightMargin - leftMargin,
        });

        let q3CurY = q3Y + 16;
        setQs.section1Q3.slice(0, 3).forEach((q, idx) => {
          const label = String.fromCharCode(97 + idx); // 'a', 'b', 'c'
          q3CurY = renderTheorySubquestion(label, q, q3CurY);
        });

        // =====================================================================
        // PAGE 4: Section–II (Q.4 & Q.5)
        // =====================================================================
        doc.addPage();
        renderRunningHeader(letter);

        // Section–II Header
        doc.font('Times-Bold').fontSize(12.5).text('Section–II', leftMargin, 85, {
          align: 'center',
          width: rightMargin - leftMargin,
        });

        // Q.4 Attempt any four:    16
        const q4Y = 115;
        doc.font('Times-Bold').fontSize(10.5).text('Q.4   Attempt any four:', leftMargin, q4Y);
        doc.font('Times-Bold').fontSize(10.5).text('16', leftMargin, q4Y, {
          align: 'right',
          width: rightMargin - leftMargin,
        });

        let sec2Y = q4Y + 16;
        setQs.section2Q4.slice(0, 5).forEach((q, idx) => {
          const label = String.fromCharCode(97 + idx); // 'a', 'b', 'c', 'd', 'e'
          sec2Y = renderTheorySubquestion(label, q, sec2Y);
        });

        // Q.5 Attempt any two:    12
        const q5Y = sec2Y + 4;
        doc.font('Times-Bold').fontSize(10.5).text('Q.5   Attempt any two:', leftMargin, q5Y);
        doc.font('Times-Bold').fontSize(10.5).text('12', leftMargin, q5Y, {
          align: 'right',
          width: rightMargin - leftMargin,
        });

        let q5CurY = q5Y + 16;
        setQs.section2Q5.slice(0, 3).forEach((q, idx) => {
          const label = String.fromCharCode(97 + idx); // 'a', 'b', 'c'
          q5CurY = renderTheorySubquestion(label, q, q5CurY);
        });
      };

      // Render Single Set or all 4 Sets
      const sets = input.totalSetsToRender === 4 ? ['P', 'Q', 'R', 'S'] : [setLetter];
      for (const curSet of sets) {
        renderSingleSet(curSet);
      }

      // Finalize page numbering: Page X of Y centered at the bottom of every page
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc
          .font('Times-Roman')
          .fontSize(9.5)
          .fillColor('#000000')
          .text(`Page ${i + 1} of ${totalPages}`, leftMargin, 841.89 - 36, {
            align: 'center',
            width: rightMargin - leftMargin,
            lineBreak: false,
          });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
