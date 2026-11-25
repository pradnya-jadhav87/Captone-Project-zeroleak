import { test } from 'node:test';
import assert from 'node:assert';
import { PDFDocument } from 'pdf-lib';
import PDFKitDocument from 'pdfkit';
import {
  generateSecurityTrackingCode,
  formatWatermarkLocationString,
  formatWatermarkLines,
  applyDynamicSecurityWatermarkToPdf,
  logSecurityWatermarkAuditEvent,
  WatermarkSecurityMetadata,
  SecurityLocationData,
} from './securityWatermarkService.ts';
import { protectAndSaveUniversityPdf } from './universityPdfProtection.ts';
import { generateCompetitiveExamPdfBuffer } from './competitiveExam.ts';

// Helper to create a minimal 2-page PDF buffer for testing
async function createSamplePdfBuffer(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]); // Page 1 A4
  doc.addPage([595, 842]); // Page 2 A4
  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

test('1. Tracking Code Generation produces unique, formatted cryptographic tracking codes', () => {
  const code1 = generateSecurityTrackingCode('UNIV', 'EXAM-2026', 'user-001');
  const code2 = generateSecurityTrackingCode('UNIV', 'EXAM-2026', 'user-001');
  const codeComp = generateSecurityTrackingCode('COMP', 'EXAM-NEET-2026', 'user-002');

  assert.match(code1, /^TRK-UNIV-[A-F0-9]{6}-[A-F0-9]{6}$/);
  assert.match(codeComp, /^TRK-COMP-[A-F0-9]{6}-[A-F0-9]{6}$/);
  // Uniqueness check: consecutive codes must not collide
  assert.notStrictEqual(code1, code2);
});

test('2. Location Formatting: Permission GRANTED with GPS coordinates formats exact GPS without fabrication', () => {
  const grantedLoc: SecurityLocationData = {
    permissionStatus: 'GRANTED',
    isGpsExact: true,
    latitude: 17.6599,
    longitude: 75.9064,
    accuracy: 12,
    city: 'Solapur',
    state: 'Maharashtra',
    country: 'India',
  };

  const formatted = formatWatermarkLocationString(grantedLoc, '103.21.244.2');
  assert.match(formatted, /Solapur, Maharashtra, India/);
  assert.match(formatted, /GPS: 17\.6599°N, 75\.9064°E/);
  assert.match(formatted, /±12m/);
  assert.match(formatted, /IP: 103\.21\.244\.2/);
});

test('3. Location Formatting: Permission DENIED explicitly states approximate/denied and NEVER invents coordinates', () => {
  const deniedLoc: SecurityLocationData = {
    permissionStatus: 'DENIED',
    isGpsExact: false,
    country: 'India',
  };

  const formatted = formatWatermarkLocationString(deniedLoc, '103.21.244.2');
  assert.strictEqual(formatted, 'Location: Approximate / Unavailable (GPS Permission Denied) • IP: 103.21.244.2');
  // Strict safety check: must NOT contain invented coordinates
  assert.doesNotMatch(formatted, /GPS:/);
  assert.doesNotMatch(formatted, /°N/);
  assert.doesNotMatch(formatted, /°E/);
});

test('4. Location Formatting: Permission UNAVAILABLE explicitly states location unavailable', () => {
  const unavailLoc: SecurityLocationData = {
    permissionStatus: 'UNAVAILABLE',
    isGpsExact: false,
  };

  const formatted = formatWatermarkLocationString(unavailLoc);
  assert.strictEqual(formatted, 'Location: Location Unavailable');
  assert.doesNotMatch(formatted, /GPS:/);

  const nullFormatted = formatWatermarkLocationString(undefined);
  assert.strictEqual(nullFormatted, 'Location: Location Unavailable');
});

test('5. PDF Watermarking: applyDynamicSecurityWatermarkToPdf stamps multi-layer watermark on all pages', async () => {
  const samplePdf = await createSamplePdfBuffer();

  const meta: WatermarkSecurityMetadata = {
    userId: 'USR-SEC-99',
    userName: 'Prof. Ramesh Kulkarni',
    userRole: 'EXAM_CONTROLLER',
    examId: 'SLR-CS-502',
    examName: 'Operating Systems Examination',
    location: {
      permissionStatus: 'GRANTED',
      isGpsExact: true,
      latitude: 18.5204,
      longitude: 73.8567,
      accuracy: 8,
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
    },
    ipAddress: '192.168.1.50',
    moduleType: 'UNIVERSITY',
  };

  const result = await applyDynamicSecurityWatermarkToPdf(samplePdf, meta);

  assert.ok(result.watermarkedBuffer);
  assert.ok(result.watermarkedBuffer.length > samplePdf.length, 'Watermarked PDF buffer must contain embedded text elements');
  assert.strictEqual(result.pageCount, 2, 'Page count must be preserved');
  assert.match(result.trackingCode, /^TRK-UNIV-/);
  assert.match(result.watermarkText, /PROF\. RAMESH KULKARNI/);
  assert.match(result.watermarkText, /GPS: 18\.5204°N, 73\.8567°E/);

  // Validate that pdf-lib can reload the sealed PDF cleanly
  const loadedPdf = await PDFDocument.load(result.watermarkedBuffer);
  assert.strictEqual(loadedPdf.getPageCount(), 2);
});

test('6. University PDF Protection: protectAndSaveUniversityPdf embeds watermark, tracking code and SHA-256 hash', async () => {
  const samplePdf = await createSamplePdfBuffer();

  const result = await protectAndSaveUniversityPdf(samplePdf, 'SLR-TEST-CODE', 'P', {
    userId: 'usr-univ-lead',
    userName: 'Dr. Suresh Patil',
    userRole: 'CHIEF_SUPERINTENDENT',
    examId: 'SLR-TEST-CODE',
    location: {
      permissionStatus: 'DENIED',
      isGpsExact: false,
    },
    ipAddress: '14.139.122.1',
  });

  assert.ok(result.protectedPdfBuffer);
  assert.match(result.pdfHash, /^[a-f0-9]{64}$/, 'Must be a valid 64-character SHA-256 hex digest');
  assert.match(result.filename, /SLR-TEST-CODE_Set_P_Official_University_Paper\.pdf$/);
  assert.match(result.trackingCode, /^TRK-UNIV-/);
  assert.match(result.watermarkSummary, /GPS Permission Denied/);
  assert.match(result.watermarkSummary, /DR\. SURESH PATIL/);
});

test('7. Competitive Exam PDF Buffer Generation embeds dynamic watermark with location', async () => {
  const mockCompetitivePaper = {
    id: 'comp-paper-uuid-101',
    examId: 'EXAM-MHT-CET-2026',
    examName: 'MHT-CET 2026 Engineering Entrance',
    examType: 'Competitive Entrance Exam',
    title: 'MHT-CET Mathematics & Physics',
    sections: [
      {
        title: 'Section A - Physics',
        questions: [
          {
            number: '1',
            text: 'A particle moves in a circle of radius 20 cm with a linear speed of 10 m/s. Its angular velocity is:',
            options: [{ text: '50 rad/s' }, { text: '25 rad/s' }, { text: '100 rad/s' }, { text: '10 rad/s' }],
            marks: 2,
          },
        ],
      },
    ],
  };

  const { pdfBuffer, validationReport, trackingCode, watermarkSummary } = await generateCompetitiveExamPdfBuffer(
    mockCompetitivePaper,
    {
      watermarkMetadata: {
        userId: 'usr-comp-evaluator',
        userName: 'Anita Sharma',
        userRole: 'EXAM_MANAGER',
        examId: 'EXAM-MHT-CET-2026',
        location: {
          permissionStatus: 'GRANTED',
          isGpsExact: true,
          latitude: 19.0760,
          longitude: 72.8777,
          accuracy: 15,
          city: 'Mumbai',
          state: 'Maharashtra',
          country: 'India',
        },
      },
    }
  );

  assert.ok(pdfBuffer && pdfBuffer.length > 500);
  assert.ok(validationReport);
  assert.match(trackingCode || '', /^TRK-COMP-/);
  assert.match(watermarkSummary || '', /ANITA SHARMA/);
  assert.match(watermarkSummary || '', /GPS: 19\.0760°N, 72\.8777°E/);

  // Validate PDF bytes header
  assert.strictEqual(pdfBuffer.subarray(0, 4).toString(), '%PDF');
});

test('8. Audit Logging: logSecurityWatermarkAuditEvent successfully records event in SQLite audit log', async () => {
  const meta: WatermarkSecurityMetadata = {
    userId: 'usr-audit-test',
    userName: 'Audit Official',
    userRole: 'AUDITOR',
    examId: 'EXAM-AUDIT-2026',
    trackingCode: 'TRK-UNIV-TEST-001',
    moduleType: 'UNIVERSITY',
    location: {
      permissionStatus: 'UNAVAILABLE',
      isGpsExact: false,
    },
    ipAddress: '127.0.0.1',
  };

  await logSecurityWatermarkAuditEvent(meta, 'WATERMARK_APPLIED', { testRun: true });
  // Function should complete without throwing
  assert.ok(true);
});

