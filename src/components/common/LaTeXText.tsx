import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { renderLatexToHtml } from '../../utils/latexRenderer';

export { renderLatexToHtml };

interface LaTeXTextProps {
  text: string;
  className?: string;
}

export const LaTeXText: React.FC<LaTeXTextProps> = ({ text, className = '' }) => {
  if (!text) return null;

  let str = String(text);
  // Normalize \( ... \) to $ ... $ and \[ ... \] to $$ ... $$
  str = str.replace(/\\\[([\s\S]+?)\\\]/g, '$$$$$1$$$$');
  str = str.replace(/\\\(([\s\S]+?)\\\)/g, '$$$1$$');

  // If text does not contain LaTeX math delimiters, check if it's bare LaTeX
  if (!str.includes('$')) {
    if (/(\\[a-zA-Z]+|\^|_|\{|\})/.test(str)) {
      try {
        const html = katex.renderToString(str, { displayMode: false, throwOnError: false });
        return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
      } catch {}
    }
    return <span className={className}>{str}</span>;
  }

  const parts: React.ReactNode[] = [];
  const regex = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(str)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`txt-${lastIndex}`}>{str.substring(lastIndex, match.index)}</span>);
    }
    const isBlock = Boolean(match[1]);
    const formula = (match[1] || match[2] || '').trim();
    try {
      const html = katex.renderToString(formula, {
        displayMode: isBlock,
        throwOnError: false,
      });
      parts.push(
        <span
          key={`math-${match.index}`}
          dangerouslySetInnerHTML={{ __html: html }}
          className={isBlock ? 'block my-1.5 overflow-x-auto' : 'inline-block align-baseline mx-0.5'}
        />
      );
    } catch {
      parts.push(<span key={`err-${match.index}`}>{isBlock ? `$$${formula}$$` : `$${formula}$`}</span>);
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < str.length) {
    parts.push(<span key={`txt-${lastIndex}`}>{str.substring(lastIndex)}</span>);
  }

  return <span className={className}>{parts}</span>;
};
