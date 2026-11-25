import katex from 'katex';

/**
 * Universal helper to convert mixed text containing LaTeX math
 * (using $, $$, \(, \), \[, \], or bare LaTeX formulas) into rendered KaTeX HTML.
 */
export function renderLatexToHtml(raw: string): string {
  if (!raw) return '';
  let str = String(raw).trim();

  // Clean corrupted font encodings and noise
  str = str
    .replace(/\uF057/g, 'Ω')
    .replace(/\uF0B0/g, '°')
    .replace(/\uF06D/g, 'μ')
    .replace(/\uF070/g, 'π')
    .replace(/\uF06C/g, 'λ')
    .replace(/\uF0B1/g, '±')
    .replace(/\uF0AE/g, '→')
    .replace(/\uF0B4/g, '×')
    .replace(/\uF044/g, 'Δ')
    .replace(/\uF061/g, 'α')
    .replace(/\uF062/g, 'β')
    .replace(/\uF067/g, 'γ')
    .replace(/\uF071/g, 'θ')
    .replace(/[\uF020-\uF0FF]/g, ' ')
    .replace(/\*[A-Z0-9_-]{2,10}\*/g, ' ')
    .replace(/\bALHCA\b/g, ' ')
    .replace(/\bSPACE\s+FOR\s+ROUGH\s+WORK\b/gi, ' ')
    .replace(/_{5,}/g, '____')
    .replace(/\s{2,}/g, ' ');

  // Normalize delimiters: \[...\] to $$...$$, \(...\) to $...$
  str = str.replace(/\\\[([\s\S]+?)\\\]/g, '$$$$$1$$$$');
  str = str.replace(/\\\(([\s\S]+?)\\\)/g, '$$$1$$');

  // If text does not contain dollar delimiters but has obvious bare LaTeX math
  if (!str.includes('$')) {
    if (/(\\[a-zA-Z]+|\^|_|\{|\})/.test(str)) {
      try {
        return katex.renderToString(str, { displayMode: false, throwOnError: false });
      } catch {}
    }
    return str;
  }

  // Replace $$...$$ and $...$
  const regex = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  return str.replace(regex, (match, block, inline) => {
    const formula = (block || inline || '').trim();
    const isBlock = Boolean(block);
    try {
      return katex.renderToString(formula, { displayMode: isBlock, throwOnError: false });
    } catch {
      return match;
    }
  });
}

