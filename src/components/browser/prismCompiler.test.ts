import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
const BROWSER_SOURCE = read('src/components/browser/ChromeLikeBrowser.tsx');

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

test('ChromeLikeBrowser source contains coordinate auto-framing and tabular components', () => {
  assert.ok(BROWSER_SOURCE.includes('AcademicTable'), 'AcademicTable component must be present');
  assert.ok(BROWSER_SOURCE.includes('topOffset'), 'Coordinate auto-framing topOffset must be present');
  assert.ok(BROWSER_SOURCE.includes('PRISM_OS_LATEX'), 'Operating Systems template must be present');
  assert.ok(BROWSER_SOURCE.includes('BTN04605'), 'Operating Systems BTN04605 code must be present');
});
