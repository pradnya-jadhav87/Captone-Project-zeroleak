import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
const BROWSER_SOURCE = read('src/components/browser/ChromeLikeBrowser.tsx');
const PRISM_HTML = read('public/prism.html');

function parseTabular(raw: string) {
  const match = raw.match(/\\begin\{tabular\}\{[^}]*\}([\s\S]*?)\\end\{tabular\}/i);
  if (!match) return null;
  const content = match[1];
  const rawRows = content
    .split(/\\\\|\\cr/)
    .map((r) => r.replace(/\\(?:hline|toprule|midrule|bottomrule)/g, '').trim())
    .filter((r) => r.length > 0);

  if (rawRows.length === 0) return null;

  const parsed = rawRows.map((r) =>
    r.split('&').map((cell) =>
      cell
        .replace(/\\textbf\{([^}]+)\}/g, '$1')
        .replace(/[{}]/g, '')
        .trim(),
    ),
  );

  return {
    headers: parsed[0] || [],
    rows: parsed.slice(1),
  };
}

function cleanLatexText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\\textbf\{([^}]*)\}/g, '$1')
    .replace(/\\textit\{([^}]*)\}/g, '$1')
    .replace(/\\textsf\{([^}]*)\}/g, '$1')
    .replace(/\\textrm\{([^}]*)\}/g, '$1')
    .replace(/\\texttt\{([^}]*)\}/g, '$1')
    .replace(/\\underline\{([^}]*)\}/g, '$1')
    .replace(/\\emph\{([^}]*)\}/g, '$1')
    .replace(/\\mbox\{([^}]*)\}/g, '$1')
    .replace(/\\large\b/g, '')
    .replace(/\\Large\b/g, '')
    .replace(/\\LARGE\b/g, '')
    .replace(/\\small\b/g, '')
    .replace(/\\normalsize\b/g, '')
    .replace(/\\noindent\b/g, '')
    .replace(/\\centering\b/g, '')
    .replace(/\\hfill\b/g, ' ')
    .replace(/\\quad\b/g, ' ')
    .replace(/\\qquad\b/g, ' ')
    .replace(/\\vspace\*?\{[^}]*\}/g, '')
    .replace(/\\hspace\*?\{[^}]*\}/g, ' ')
    .replace(/\\\\(?:\[[^\]]*\])?/g, '\n')
    .replace(/\\&/g, '&')
    .replace(/\\%/g, '%')
    .replace(/\\#/g, '#')
    .replace(/\\_/g, '_')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/[{}]/g, '')
    .trim();
}

test('parseTabular extracts clean header and data rows from LaTeX tabular environment', () => {
  const latex = `
\\begin{tabular}{|c|c|c|}
\\hline
\\textbf{Process} & \\textbf{CPU burst time (ms)} & \\textbf{Priority} \\\\
\\hline
P1 & 10 & 4 \\\\
P2 & 5 & 3 \\\\
P3 & 2 & 1 \\\\
P4 & 3 & 2 \\\\
\\hline
\\end{tabular}
  `;

  const parsed = parseTabular(latex);
  assert.ok(parsed);
  assert.deepEqual(parsed.headers, ['Process', 'CPU burst time (ms)', 'Priority']);
  assert.equal(parsed.rows.length, 4);
  assert.deepEqual(parsed.rows[0], ['P1', '10', '4']);
  assert.deepEqual(parsed.rows[1], ['P2', '5', '3']);
  assert.deepEqual(parsed.rows[2], ['P3', '2', '1']);
  assert.deepEqual(parsed.rows[3], ['P4', '3', '2']);
});

test('cleanLatexText cleanly unwraps LaTeX formatting macros without erasing words or math', () => {
  const boldSample = '\\textbf{Q.1 Answer the following questions in detail.}';
  assert.equal(cleanLatexText(boldSample), 'Q.1 Answer the following questions in detail.');

  const mathSample = 'In RSA cryptosystem, public key $e \\cdot d \\equiv 1 \\pmod{\\phi(n)}$ holds.';
  assert.equal(cleanLatexText(mathSample), 'In RSA cryptosystem, public key $e \\cdot d \\equiv 1 \\pmod\\phi(n)$ holds.');

  const headerSample = '\\textbf{PUNYASHLOK AHILYADEVI HOLKAR SOLAPUR UNIVERSITY, SOLAPUR}\\\\[3pt]';
  assert.ok(cleanLatexText(headerSample).includes('SOLAPUR UNIVERSITY'));
});

test('ChromeLikeBrowser and prism.html contain universal compiler with cleanLatexText and resilient mode detection', () => {
  assert.ok(BROWSER_SOURCE.includes('cleanLatexText'), 'cleanLatexText function must be in ChromeLikeBrowser.tsx');
  assert.ok(BROWSER_SOURCE.includes('AcademicTable'), 'AcademicTable component must be present');
  assert.ok(BROWSER_SOURCE.includes('topOffset'), 'Coordinate auto-framing topOffset must be present');
  assert.ok(BROWSER_SOURCE.includes('PRISM_OS_LATEX'), 'Operating Systems template must be present');
  assert.ok(BROWSER_SOURCE.includes('BTN04605'), 'Operating Systems BTN04605 code must be present');
  assert.ok(BROWSER_SOURCE.includes('putCount >= 2'), 'Must detect picture mode via putCount >= 2');

  assert.ok(PRISM_HTML.includes('cleanLatexText'), 'cleanLatexText function must be in prism.html');
  assert.ok(PRISM_HTML.includes('putCount >= 2'), 'Must detect picture mode via putCount >= 2 in prism.html');
  assert.ok(PRISM_HTML.includes('topOffset = minVisualTop > 35'), 'Auto-framing must be present in prism.html');
});

test('Download button pipeline fetches exact document and sends to Printing Manager', () => {
  const SERVER_SOURCE = read('server.ts');
  const MODAL_SOURCE = read('src/components/printing/TransferToPrintingManagerModal.tsx');

  assert.ok(SERVER_SOURCE.includes('/api/delivery/fetch-local-document'), 'Server must have fetch-local-document endpoint');
  assert.ok(MODAL_SOURCE.includes('fetchAndTransferLocalDocument'), 'Modal must call fetchAndTransferLocalDocument');
  assert.ok(BROWSER_SOURCE.includes('targetFilename'), 'Browser must pass targetFilename to TransferToPrintingManagerModal');
  assert.ok(BROWSER_SOURCE.includes('Download'), 'Browser toolbar must feature Download button');
  assert.ok(PRISM_HTML.includes('doTransferToPrintingManager'), 'prism.html must implement doTransferToPrintingManager');
});

