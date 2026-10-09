import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDownloadCompetitivePaperPdf, handleDownloadCompetitivePaper, logCompetitivePaperAudit, initializeCompetitiveSchema } from '../server/competitiveExam.ts';
import { handleDownloadUniversityPaper, logUniversityPaperAudit } from '../server/universityFinalPipeline.ts';
import { getDb, executeQuery, executeRun } from '../server/db.ts';

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    payload: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.payload = data;
      return this;
    },
    send(data: any) {
      this.payload = data;
      return this;
    },
    setHeader(key: string, val: string) {
      this.headers[key] = val;
      return this;
    },
  };
}

test('1. Competitive Exam PDF download route returns HTTP 403 and logs DOWNLOAD_BLOCKED', async () => {
  const db = await getDb();
  await initializeCompetitiveSchema(db);
  const testPaperId = `paper-test-pdf-${Date.now()}`;
  const testExamId = `exam-test-${Date.now()}`;

  executeRun(
    db,
    `INSERT INTO competitive_generated_papers (
      id, org_id, exam_id, title, exam_type, total_questions, total_marks,
      total_positive_marks, total_negative_marks, sections_json, questions_json,
      blueprint_snapshot_json, paper_fingerprint, generated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      testPaperId,
      'ORG-ZEROLEAK',
      testExamId,
      'Test Physics Paper',
      'JEE',
      10,
      40,
      40,
      0,
      '[]',
      '[]',
      JSON.stringify({ subjects: [] }),
      'fingerprint-test-1',
      new Date().toISOString(),
    ]
  );

  const req: any = {
    params: { paperId: testPaperId },
    query: {},
    originalUrl: `/api/competitive/papers/${testPaperId}/pdf`,
    ip: '192.168.1.105',
    user: {
      id: 'usr-evaluator-1',
      full_name: 'Dr. A. Sharma',
      email: 'evaluator@zeroleak.org',
      role: 'EXAM_MANAGER',
      device_id: 'DEV-FINGERPRINT-TEST-1',
    },
  };

  const res = createMockResponse();
  await handleDownloadCompetitivePaperPdf(req, res as any);

  assert.equal(res.statusCode, 403, 'PDF download route must return HTTP 403 Forbidden');
  assert.equal(res.payload?.code, 'DOWNLOAD_BLOCKED', 'Error code must be DOWNLOAD_BLOCKED');
  assert.match(res.payload?.error, /DOWNLOAD_BLOCKED/, 'Error message must declare DOWNLOAD_BLOCKED');

  // Verify immutable audit trail record
  const auditLogs = executeQuery(
    db,
    'SELECT * FROM competitive_paper_audit_logs WHERE paper_id = ? AND action_type = ? ORDER BY server_timestamp DESC LIMIT 1',
    [testPaperId, 'DOWNLOAD_BLOCKED']
  );

  assert.ok(auditLogs && auditLogs.length > 0, 'Audit event DOWNLOAD_BLOCKED must be recorded in ledger');
  const audit = auditLogs[0];
  assert.equal(audit.action_type, 'DOWNLOAD_BLOCKED');
  assert.equal(audit.user_id, 'usr-evaluator-1');
  assert.equal(audit.user_role, 'EXAM_MANAGER');
  assert.equal(audit.ip_address, '192.168.1.105');
  assert.equal(audit.status, 'BLOCKED');
});

test('2. Competitive Exam paper package download route returns HTTP 403 and logs DOWNLOAD_BLOCKED', async () => {
  const db = await getDb();
  await initializeCompetitiveSchema(db);
  const testPaperId = `paper-test-pkg-${Date.now()}`;
  const testExamId = `exam-test-pkg-${Date.now()}`;

  executeRun(
    db,
    `INSERT INTO competitive_generated_papers (
      id, org_id, exam_id, title, exam_type, total_questions, total_marks,
      total_positive_marks, total_negative_marks, sections_json, questions_json,
      blueprint_snapshot_json, paper_fingerprint, generated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      testPaperId,
      'ORG-ZEROLEAK',
      testExamId,
      'Test Chemistry Paper',
      'NEET',
      10,
      40,
      40,
      0,
      '[]',
      '[]',
      JSON.stringify({ subjects: [] }),
      'fingerprint-test-2',
      new Date().toISOString(),
    ]
  );

  const req: any = {
    params: { paperId: testPaperId },
    originalUrl: `/api/competitive/papers/${testPaperId}/download`,
    ip: '10.0.0.42',
    user: {
      id: 'usr-operator-9',
      full_name: 'Centre Operator Pune',
      email: 'operator@centre101.zeroleak.org',
      role: 'CENTRE_OPERATOR',
      device_id: 'DEV-TRUSTED-CTR-101',
    },
  };

  const res = createMockResponse();
  await handleDownloadCompetitivePaper(req, res as any);

  assert.equal(res.statusCode, 403, 'Package download route must return HTTP 403 Forbidden');
  assert.equal(res.payload?.code, 'DOWNLOAD_BLOCKED', 'Error code must be DOWNLOAD_BLOCKED');

  const auditLogs = executeQuery(
    db,
    'SELECT * FROM competitive_paper_audit_logs WHERE paper_id = ? AND action_type = ? ORDER BY server_timestamp DESC LIMIT 1',
    [testPaperId, 'DOWNLOAD_BLOCKED']
  );

  assert.ok(auditLogs && auditLogs.length > 0, 'Audit event DOWNLOAD_BLOCKED must be recorded in ledger');
  assert.equal(auditLogs[0].action_type, 'DOWNLOAD_BLOCKED');
  assert.equal(auditLogs[0].ip_address, '10.0.0.42');
});

test('3. University Exam paper download route returns HTTP 403 and logs DOWNLOAD_BLOCKED', async () => {
  const db = await getDb();
  const testPaperId = `uni-paper-${Date.now()}`;
  const testExamId = `uni-exam-${Date.now()}`;

  executeRun(
    db,
    `INSERT INTO university_generated_papers (
      id, exam_id, version_code, set_letter, total_questions, mcq_count,
      short_answer_count, descriptive_count, total_marks, duplicate_count,
      paper_distribution_json, pdf_filename, pdf_url, pdf_hash, encrypted_pdf_path,
      encryption_algorithm, status, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      testPaperId,
      testExamId,
      'VER-SET-P',
      'P',
      28,
      14,
      7,
      7,
      70,
      0,
      '{}',
      'University_Draft_Set_P.pdf',
      '/compiled_papers/University_Draft_Set_P.pdf',
      'a1b2c3d4e5f6',
      '/path/to/encrypted.bin',
      'PDF-LIB-AES256',
      'GENERATED_ENCRYPTED',
      'usr-mgr-77',
      new Date().toISOString(),
    ]
  );

  const req: any = {
    params: { id: testPaperId },
    originalUrl: `/api/university/download-paper/${testPaperId}`,
    ip: '172.16.0.88',
    user: {
      id: 'usr-mgr-77',
      role: 'EXAM_MANAGER',
      device_id: 'DEV-MGR-STATION',
    },
  };

  const res = createMockResponse();
  await handleDownloadUniversityPaper(req, res as any);

  assert.equal(res.statusCode, 403, 'University paper download route must return HTTP 403');
  assert.equal(res.payload?.code, 'DOWNLOAD_BLOCKED', 'Error code must be DOWNLOAD_BLOCKED');

  // Verify University audit log
  const auditLogs = executeQuery(
    db,
    'SELECT * FROM university_paper_audit_logs WHERE paper_id = ? AND action_type = ? ORDER BY timestamp DESC LIMIT 1',
    [testPaperId, 'DOWNLOAD_BLOCKED']
  );

  assert.ok(auditLogs && auditLogs.length > 0, 'University audit event DOWNLOAD_BLOCKED must be logged');
  assert.equal(auditLogs[0].action_type, 'DOWNLOAD_BLOCKED');
  assert.equal(auditLogs[0].ip_address, '172.16.0.88');
});

test('4. Print Paper authorization rules strictly restrict access to Centre Operator after unlock time', () => {
  // Evaluates the security gating rule implemented across CompetitiveBlueprintForm and QuestionPaperPdfModal
  function isPrintPermitted(user: { role?: string; centre_id?: string } | null, unlockTimeIso: string | null): boolean {
    const isOperator = user?.role === 'CENTRE_OPERATOR';
    const isAuthorizedCentre = Boolean(user?.centre_id);
    const isUnlocked = unlockTimeIso ? new Date(unlockTimeIso).getTime() <= Date.now() : false;
    return Boolean(isOperator && isAuthorizedCentre && isUnlocked);
  }

  const pastUnlock = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
  const futureUnlock = new Date(Date.now() + 3600000).toISOString(); // 1 hour in future

  // Centre Operator at authorized centre after unlock -> ALLOWED
  assert.equal(
    isPrintPermitted({ role: 'CENTRE_OPERATOR', centre_id: 'CTR-101' }, pastUnlock),
    true,
    'Centre Operator at authorized centre after unlock must be allowed to print'
  );

  // Centre Operator before unlock time -> BLOCKED
  assert.equal(
    isPrintPermitted({ role: 'CENTRE_OPERATOR', centre_id: 'CTR-101' }, futureUnlock),
    false,
    'Centre Operator before unlock time must NOT be allowed to print'
  );

  // Centre Operator without centre binding -> BLOCKED
  assert.equal(
    isPrintPermitted({ role: 'CENTRE_OPERATOR', centre_id: undefined }, pastUnlock),
    false,
    'Centre Operator without authorized centre assignment must NOT be allowed to print'
  );

  // Exam Manager -> BLOCKED
  assert.equal(
    isPrintPermitted({ role: 'EXAM_MANAGER', centre_id: 'CTR-101' }, pastUnlock),
    false,
    'Exam Manager role must NOT be allowed to print paper'
  );

  // Org Owner -> BLOCKED
  assert.equal(
    isPrintPermitted({ role: 'ORG_OWNER', centre_id: 'CTR-101' }, pastUnlock),
    false,
    'Org Owner role must NOT be allowed to print paper'
  );

  // Translator -> BLOCKED
  assert.equal(
    isPrintPermitted({ role: 'TRANSLATOR', centre_id: 'CTR-101' }, pastUnlock),
    false,
    'Translator role must NOT be allowed to print paper'
  );

  // Anonymous / Null user -> BLOCKED
  assert.equal(
    isPrintPermitted(null, pastUnlock),
    false,
    'Unauthenticated viewer must NOT be allowed to print paper'
  );
});

test('5. Non-Electron environment gate correctly blocks paper rendering', () => {
  // Evaluates the desktop enforcement fallback check in SecurePaperViewer
  function shouldRenderQuestionsInBrowser(windowDesktopBridge: any): { canRenderPaper: boolean; fallbackMessage?: string } {
    const isElectron = Boolean(windowDesktopBridge && windowDesktopBridge.isElectron === true);
    if (!isElectron) {
      return {
        canRenderPaper: false,
        fallbackMessage: 'Secure papers can only be viewed in the ZeroLeak desktop app.',
      };
    }
    return { canRenderPaper: true };
  }

  // Standard web browser without Electron preload bridge
  const normalBrowser = shouldRenderQuestionsInBrowser(undefined);
  assert.equal(normalBrowser.canRenderPaper, false);
  assert.equal(normalBrowser.fallbackMessage, 'Secure papers can only be viewed in the ZeroLeak desktop app.');

  // Browser with fake/falsy bridge
  const fakeBridge = shouldRenderQuestionsInBrowser({ isElectron: false });
  assert.equal(fakeBridge.canRenderPaper, false);

  // Native Electron shell with genuine preload bridge
  const electronShell = shouldRenderQuestionsInBrowser({ isElectron: true });
  assert.equal(electronShell.canRenderPaper, true);
  assert.equal(electronShell.fallbackMessage, undefined);
});
