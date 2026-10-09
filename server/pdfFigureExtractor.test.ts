import test from 'node:test';
import assert from 'node:assert/strict';

import { parseExtractorJson, readPublishedFigureResources } from './pdfFigureExtractor.ts';
import { renderSourceFigureLatex } from './formatex.ts';

test('a figure URL from the browser cannot escape the figures directory', () => {
  const result = readPublishedFigureResources([
    '/extracted_figures/../../server.ts/figure-1.png',
    '/extracted_figures/ok/..%2f..%2fsecrets.png',
    'https://evil.example.com/figure-1.png',
    '/public/uploads/papers/33f68fb6-OS_OS.pdf',
    '',
    null,
  ]);

  assert.deepEqual(result.resources, [], 'nothing usable was offered, so nothing may be shipped');
  assert.ok(result.warnings.length >= 3, 'each unusable reference is reported');
});

test('an unusable reference is reported rather than thrown', () => {
  const result = readPublishedFigureResources(undefined);
  assert.deepEqual(result.resources, []);
  assert.deepEqual(result.warnings, []);
});

test('the referenced file name always matches the number in the marker', () => {
  // The extractor names its crops figure-<n>.png from the same counter it hands
  // the model as [FIGURE:n], so renderSourceFigureLatex(n) must resolve.
  for (const n of [1, 2, 12]) {
    const latex = renderSourceFigureLatex(n);
    assert.ok(latex.includes(`{figure-${n}.png}`), `[FIGURE:${n}] must reference figure-${n}.png`);
  }
});

test('parseExtractorJson extracts valid JSON even when PyMuPDF or Python emits deprecation warnings to stdout', () => {
  const noisyStdout = "warning: The 'fitz' API is deprecated and will be removed in future. Use 'import pymupdf' instead.\n" +
    JSON.stringify({ success: true, totalPages: 3, figures: [{ index: 1 }], warnings: [] });

  const parsed = parseExtractorJson<{ success: boolean; totalPages: number; figures: any[]; warnings: string[] }>(noisyStdout);
  assert.equal(parsed.success, true);
  assert.equal(parsed.totalPages, 3);
  assert.equal(parsed.figures.length, 1);
});

test('parseExtractorJson handles clean JSON and trailing garbage', () => {
  const clean = JSON.stringify({ ok: true });
  assert.deepEqual(parseExtractorJson(clean), { ok: true });

  const trailing = 'Some info: ' + JSON.stringify({ count: 42 }) + '\nProcess finished with code 0';
  assert.deepEqual(parseExtractorJson(trailing), { count: 42 });
});

test('parseExtractorJson throws error when no JSON object is found', () => {
  assert.throws(
    () => parseExtractorJson('Fatal error: cannot open file'),
    /No valid JSON object found in extractor output/
  );
});
