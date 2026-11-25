import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { getDb } from './db.ts';
import { createPrintAnywhereJob } from './printerService.ts';

const GENERATED_DIR = path.resolve(process.cwd(), 'generated');
const PRINTING_QUEUE_DIR = path.resolve(process.cwd(), 'printing_queue');
const QUEUE_JSON = path.join(PRINTING_QUEUE_DIR, 'queue.json');

fs.mkdirSync(GENERATED_DIR, { recursive: true });
fs.mkdirSync(PRINTING_QUEUE_DIR, { recursive: true });

// Multer storage for AI Exam Generator
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const jobId = req.body.job_id || `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    req.body.job_id = jobId;
    const jobUploadDir = path.join(GENERATED_DIR, jobId, 'uploads');
    fs.mkdirSync(jobUploadDir, { recursive: true });
    cb(null, jobUploadDir);
  },
  filename: (req, file, cb) => {
    // Preserve filename safely
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, cleanName);
  },
});

export const aiExamUploadMulter = multer({
  storage: uploadStorage,
  limits: {
    fileSize: 35 * 1024 * 1024, // 35 MB
    files: 30,
  },
});

// Active background processes
const activeProcesses: Record<string, any> = {};

/**
 * Handle AI Exam Generation Upload & Launch
 */
export async function handleAiExamUpload(req: Request, res: Response) {
  try {
    const jobId = req.body.job_id || `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const jobDir = path.join(GENERATED_DIR, jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    const files = req.files as Express.Multer.File[] || [];
    const filePaths = files.map(f => f.path);

    const config = {
      job_id: jobId,
      mode: req.body.mode || 'university',
      title: req.body.title || 'University Examination Paper',
      watermark: req.body.watermark || '',
      univ_preset: req.body.univ_preset || 'auto',
      univ_prompt: req.body.univ_prompt || '',
      manual_text: req.body.manual_text || '',
      qcount: req.body.qcount ? parseInt(req.body.qcount, 10) : 10,
      difficulty: req.body.difficulty || 'medium',
      blueprint: req.body.blueprint ? (typeof req.body.blueprint === 'string' ? JSON.parse(req.body.blueprint) : req.body.blueprint) : null,
      files: filePaths,
    };

    const configPath = path.join(jobDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // Initialize initial status
    const initialStatus = {
      pct: 5,
      step: 1,
      label: 'Initializing examination synthesis engine...',
      status: 'running',
      ts: Math.floor(Date.now() / 1000),
      time_estimate: '30-60 seconds',
    };
    fs.writeFileSync(path.join(jobDir, 'status.json'), JSON.stringify(initialStatus, null, 2), 'utf-8');

    // Launch python worker
    const scriptPath = path.resolve(process.cwd(), 'server', 'aiExamGenerator.py');
    const pythonExe = process.platform === 'win32' ? 'python' : 'python3';

    const child = spawn(pythonExe, [scriptPath, jobId, configPath], {
      cwd: process.cwd(),
      detached: false,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
      },
    });

    activeProcesses[jobId] = child;

    child.stdout.on('data', (data) => {
      console.log(`[AI-Exam ${jobId}] ${data.toString().trim()}`);
    });

    child.stderr.on('data', (data) => {
      console.warn(`[AI-Exam ${jobId} stderr] ${data.toString().trim()}`);
    });

    child.on('close', (code) => {
      delete activeProcesses[jobId];
      console.log(`[AI-Exam ${jobId}] Finished with exit code ${code}`);
    });

    return res.json({
      success: true,
      job: jobId,
      status_url: `/api/university/ai-generator/status/${jobId}`,
    });
  } catch (err: any) {
    console.error('[handleAiExamUpload Error]:', err);
    return res.status(500).json({ success: false, error: err.message || 'Upload failed' });
  }
}

/**
 * Handle AI Exam Generation Status Polling
 */
export async function handleAiExamStatus(req: Request, res: Response) {
  try {
    const jobId = req.params.job;
    if (!jobId) {
      return res.status(400).json({ success: false, error: 'Missing job parameter' });
    }

    const statusFile = path.join(GENERATED_DIR, jobId, 'status.json');
    if (!fs.existsSync(statusFile)) {
      return res.json({
        pct: 2,
        step: 1,
        label: 'Preparing worker...',
        status: 'running',
        ts: Math.floor(Date.now() / 1000),
      });
    }

    const data = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Handle AI Exam Generated PDF / TeX Download
 */
export async function handleAiExamDownload(req: Request, res: Response) {
  try {
    const { job, which } = req.params;
    if (!job || !which) {
      return res.status(400).send('Invalid download parameters');
    }

    const jobDir = path.join(GENERATED_DIR, job);
    let targetFile = '';
    let contentType = 'application/pdf';

    if (which === 'questions') {
      targetFile = path.join(jobDir, 'questions.pdf');
    } else if (which === 'answers') {
      targetFile = path.join(jobDir, 'answers.pdf');
    } else if (which === 'questions_tex') {
      targetFile = path.join(jobDir, 'questions.tex');
      contentType = 'text/plain; charset=utf-8';
    } else if (which === 'answers_tex') {
      targetFile = path.join(jobDir, 'answers.tex');
      contentType = 'text/plain; charset=utf-8';
    } else {
      return res.status(404).send('Resource not found');
    }

    if (!fs.existsSync(targetFile)) {
      return res.status(404).send('File not found or still generating.');
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${which}_${job}.${which.endsWith('_tex') ? 'tex' : 'pdf'}"`);
    return fs.createReadStream(targetFile).pipe(res);
  } catch (err: any) {
    return res.status(500).send(err.message);
  }
}

/**
 * Handle AI Exam Job Cancellation
 */
export async function handleAiExamCancel(req: Request, res: Response) {
  try {
    const jobId = req.params.job;
    if (activeProcesses[jobId]) {
      try {
        activeProcesses[jobId].kill();
      } catch {}
      delete activeProcesses[jobId];
    }
    const statusFile = path.join(GENERATED_DIR, jobId, 'status.json');
    if (fs.existsSync(statusFile)) {
      const data = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
      data.status = 'canceled';
      data.label = 'Job canceled by user';
      fs.writeFileSync(statusFile, JSON.stringify(data, null, 2), 'utf-8');
    }
    return res.json({ success: true, message: 'Job canceled' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Handle Sending Generated Paper to Printing Operator
 */
export async function handleAiExamSendToPrinter(req: Request, res: Response) {
  try {
    const { job, title, operatorId, operatorName, operatorEmail, centreId, centreName } = req.body;
    if (!job) {
      return res.status(400).json({ success: false, error: 'Job ID is required' });
    }

    const jobDir = path.join(GENERATED_DIR, job);
    const questionsPdf = path.join(jobDir, 'questions.pdf');

    if (!fs.existsSync(questionsPdf)) {
      return res.status(400).json({ success: false, error: 'Generated question paper not found for this job' });
    }

    const assignedOpId = operatorId || 'usr-operator-01';
    const assignedOpName = operatorName || 'Manoj Kumar (Centre Superintendent & Printing Operator)';
    const assignedOpEmail = operatorEmail || 'operator@centre101.edu.in';
    const assignedCentreCode = centreId || 'CTR-101';
    const assignedCentreName = centreName || 'Apex National Engineering Examination Centre 101';
    const cleanTitle = title || 'University Examination Paper';
    const examCode = `UNIV-${job.slice(-6).toUpperCase()}`;
    const today = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();
    const custodyHash = '0x' + crypto.createHash('sha256').update(`${job}-${assignedCentreCode}-${nowIso}`).digest('hex');

    // 1. Copy to printing queue
    const queueFileName = `print_${job}_questions.pdf`;
    const queuePdfPath = path.join(PRINTING_QUEUE_DIR, queueFileName);
    fs.copyFileSync(questionsPdf, queuePdfPath);

    // Also copy to public/compiled_papers for static enclave preview
    const publicCompiledDir = path.join(process.cwd(), 'public', 'compiled_papers');
    fs.mkdirSync(publicCompiledDir, { recursive: true });
    fs.copyFileSync(questionsPdf, path.join(publicCompiledDir, queueFileName));

    // 2. Read / update queue.json
    let queue: any[] = [];
    if (fs.existsSync(QUEUE_JSON)) {
      try {
        queue = JSON.parse(fs.readFileSync(QUEUE_JSON, 'utf-8'));
      } catch {
        queue = [];
      }
    }

    const queueItem = {
      id: `PQ-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      job_id: job,
      title: cleanTitle,
      filename: queueFileName,
      pages: 4,
      copies: 1,
      status: 'QUEUED',
      centre: `${assignedCentreCode} (${assignedCentreName})`,
      assigned_operator: assignedOpName,
      created_at: nowIso,
    };
    queue.unshift(queueItem);
    fs.writeFileSync(QUEUE_JSON, JSON.stringify(queue, null, 2), 'utf-8');

    // 3. Extract or format questions from questions.tex for secure viewer rendering
    let paperQuestions: any[] = [];
    const questionsTexPath = path.join(jobDir, 'questions.tex');
    let latexSource = '';
    if (fs.existsSync(questionsTexPath)) {
      latexSource = fs.readFileSync(questionsTexPath, 'utf-8');
      const questionRegex = /\\textbf\{(\d+)\.\}\s*([\s\S]*?)(?=(\\textbf\{\d+\.\})|(\\end\{document\})|$)/g;
      let match;
      let qNum = 1;
      while ((match = questionRegex.exec(latexSource)) !== null) {
        const rawContent = match[2].trim()
          .replace(/\\hspace\*?\{[^}]+\}/g, ' ')
          .replace(/\\vspace\*?\{[^}]+\}/g, ' ')
          .replace(/\\\\\[\d+(\.\d+)?pt\]/g, '\n')
          .replace(/\\\\/g, '\n')
          .replace(/\\textbf\{/g, '')
          .replace(/\\textit\{/g, '')
          .replace(/\}/g, '')
          .trim();

        if (rawContent) {
          paperQuestions.push({
            id: `Q-AI-${job}-${qNum}`,
            questionNumber: `${qNum}`,
            sectionName: qNum <= 4 ? 'SECTION — I' : 'SECTION — II',
            content_text: rawContent,
            marks: qNum <= 2 ? 2 : qNum <= 6 ? 6 : 10,
            options: []
          });
          qNum++;
        }
      }
    }

    if (paperQuestions.length === 0) {
      paperQuestions = [
        {
          id: `Q-AI-${job}-1`,
          questionNumber: '1',
          sectionName: 'SECTION — I',
          content_text: 'Answer all compulsory questions from the syllabus.',
          marks: 14,
          options: []
        },
        {
          id: `Q-AI-${job}-2`,
          questionNumber: '2',
          sectionName: 'SECTION — I',
          content_text: 'Explain core concepts and solve technical problems.',
          marks: 16,
          options: []
        },
        {
          id: `Q-AI-${job}-3`,
          questionNumber: '3',
          sectionName: 'SECTION — II',
          content_text: 'Detailed analytical questions with practical case studies.',
          marks: 20,
          options: []
        },
        {
          id: `Q-AI-${job}-4`,
          questionNumber: '4',
          sectionName: 'SECTION — II',
          content_text: 'Advanced comprehensive system analysis and design.',
          marks: 20,
          options: []
        }
      ];
    }

    const canonicalPaperContent = {
      exam_name: cleanTitle,
      examinationName: cleanTitle,
      subject: cleanTitle,
      paper_code: examCode,
      courseCode: examCode,
      total_marks: 70,
      totalMarks: 70,
      duration_minutes: 180,
      durationMinutes: 180,
      instructions: [
        '1) Q. No. 1 is compulsory. Solved in the first 30 minutes in Answer Book.',
        '2) Mention question paper set code on top of page.',
        '3) Figures to the right indicate full marks. Assume suitable data if necessary.',
        '4) Draw neat labeled diagrams wherever required.'
      ],
      questions: paperQuestions,
      sections: [
        { name: 'SECTION — I', questions: paperQuestions.filter(q => q.sectionName === 'SECTION — I') },
        { name: 'SECTION — II', questions: paperQuestions.filter(q => q.sectionName === 'SECTION — II') }
      ]
    };

    // 4. Push directly into transferredPrintingJobsServer so it's instantly available in released-exams & open-viewer
    const transferredStore = (globalThis as any).transferredPrintingJobsServer;
    const newJobRecord = {
      id: `JOB-PRINT-${job}`,
      paperId: job,
      title: cleanTitle,
      subject: cleanTitle,
      courseCode: examCode,
      examDate: today,
      examTime: '10:00 AM to 01:00 PM',
      unlockTime: '00:00 AM',
      totalMarks: 70,
      durationHours: 3,
      maxCopies: 500,
      securityKey: `SEC-${assignedCentreCode}-OPERATOR`,
      status: 'READY_FOR_PRINT',
      isTimeUnlocked: true,
      assignedPrintingManager: assignedOpEmail,
      printingManagerName: assignedOpName,
      centreId: assignedCentreCode,
      centreName: assignedCentreName,
      transferredBy: 'University Paper Generation Authority',
      transferredAt: nowIso,
      custodyHash,
      pdfUrl: `/api/university/ai-generator/download/${job}/questions`,
      latexSource,
      paperContent: canonicalPaperContent
    };

    if (Array.isArray(transferredStore)) {
      const existingIdx = transferredStore.findIndex(j => j.paperId === job || j.id === `JOB-PRINT-${job}`);
      if (existingIdx !== -1) {
        transferredStore.splice(existingIdx, 1);
      }
      transferredStore.unshift(newJobRecord);
    }

    // 5. Insert records into SQLite DB so that SQL queries also return this paper
    try {
      const db = await getDb();

      // Ensure examination record exists
      try {
        db.run(
          `INSERT OR REPLACE INTO examinations (
            id, org_id, name, subject, exam_date, exam_time, unlock_time,
            duration_minutes, total_marks, total_questions, status, is_released,
            created_by, created_at, updated_at
          ) VALUES (?, 'ORG-ZEROLEAK-NATIONAL', ?, ?, ?, '10:00:00', '00:00:00', 180, 70, ?, 'READY_FOR_PRINT', 1, 'university-authority', ?, ?)`,
          [job, cleanTitle, cleanTitle, today, paperQuestions.length, nowIso, nowIso]
        );
      } catch (e) {
        console.warn('[handleAiExamSendToPrinter] DB exam insert notice:', e);
      }

      // Ensure examination_centres record exists
      try {
        db.run(
          `INSERT OR REPLACE INTO examination_centres (
            id, exam_id, centre_name, centre_code, max_copies, created_at
          ) VALUES (?, ?, ?, ?, 500, ?)`,
          [`EC-${job}`, job, assignedCentreName, assignedCentreCode, nowIso]
        );
      } catch (e) {
        console.warn('[handleAiExamSendToPrinter] DB centre insert notice:', e);
      }

      // Ensure paper_versions record exists
      try {
        db.run(
          `INSERT OR REPLACE INTO paper_versions (
            id, exam_id, version_code, content_hash, is_current, created_at
          ) VALUES (?, ?, 'SET-A-FINAL', ?, 1, ?)`,
          [`VER-${job}`, job, custodyHash, nowIso]
        );
      } catch (e) {
        console.warn('[handleAiExamSendToPrinter] DB version insert notice:', e);
      }

      // Register into Print Anywhere jobs
      createPrintAnywhereJob(db, {
        examId: job,
        examName: cleanTitle,
        examType: 'UNIVERSITY',
        paperId: job,
        centreId: assignedCentreCode,
        centreName: assignedCentreName,
        operatorId: assignedOpId,
        operatorName: assignedOpName,
        printerId: 'PRN-OFFICE-01',
        printerName: 'Secure Enclave High-Speed Duplex Printer',
        printerLocation: `${assignedCentreName} • Vault Room`,
        status: 'PRINT_REQUESTED',
        unlockTime: new Date(Date.now() - 60000).toISOString(),
        copiesCount: 1,
      });
    } catch (dbErr) {
      console.warn('[handleAiExamSendToPrinter DB Warning]:', dbErr);
    }

    return res.json({
      success: true,
      queue_id: queueItem.id,
      jobId: `JOB-PRINT-${job}`,
      message: `Question Paper successfully dispatched to ${assignedOpName} at ${assignedCentreName}!`,
      operator: {
        id: assignedOpId,
        name: assignedOpName,
        email: assignedOpEmail,
        centreId: assignedCentreCode,
        centreName: assignedCentreName,
      },
      item: queueItem,
      transferredJob: newJobRecord,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
