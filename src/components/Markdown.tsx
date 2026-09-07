import { Fragment } from 'react';
import type { ReactNode } from 'react';
import katex from 'katex';

// Dependency-light markdown renderer for chat answers with KaTeX math support.
// Supports fenced code, headings, ordered/unordered lists, blockquotes,
// inline bold / italic / inline-code, and LaTeX math:
//   inline: $...$  or  \( ... \)
//   block:  $$...$$  or  \[ ... \]
// KaTeX HTML is generated from the math source only (throwOnError: false),
// which is the library's standard trusted-output usage.

function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: false,
      output: 'htmlAndMathml',
    });
  } catch {
    return '';
  }
}

function MathInline({ tex }: { tex: string }) {
  const html = renderMath(tex, false);
  if (!html) return <code className="font-mono text-[0.85em]">{tex}</code>;
  return <span className="katex-inline" dangerouslySetInnerHTML={{ __html: html }} />;
}

function MathBlock({ tex }: { tex: string }) {
  const html = renderMath(tex, true);
  if (!html) {
    return (
      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/60 p-3 font-mono text-[0.8rem]">
        <code>{tex}</code>
      </pre>
    );
  }
  return (
    <div className="katex-block overflow-x-auto py-1" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

// Split a string into text / inline-code / inline-math tokens, preserving order.
type Token = { kind: 'text' | 'code' | 'math'; value: string };

function tokenizeInline(input: string): Token[] {
  const tokens: Token[] = [];
  let rest = input;
  // Matches inline code, $...$ math, or \( ... \) math.
  const pattern = /(`[^`]+`)|(\\\([\s\S]+?\\\))|(\$[^\$\n]+?\$)/;
  while (rest.length) {
    const m = pattern.exec(rest);
    if (!m || m.index === undefined) {
      tokens.push({ kind: 'text', value: rest });
      break;
    }
    if (m.index > 0) tokens.push({ kind: 'text', value: rest.slice(0, m.index) });
    const match = m[0];
    if (match.startsWith('`')) {
      tokens.push({ kind: 'code', value: match.slice(1, -1) });
    } else if (match.startsWith('\\(')) {
      tokens.push({ kind: 'math', value: match.slice(2, -2) });
    } else {
      tokens.push({ kind: 'math', value: match.slice(1, -1) });
    }
    rest = rest.slice(m.index + match.length);
  }
  return tokens;
}

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokens = tokenizeInline(text);
  tokens.forEach((tok, i) => {
    const key = keyBase + '-' + i;
    if (tok.kind === 'code') {
      nodes.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {tok.value}
        </code>,
      );
      return;
    }
    if (tok.kind === 'math') {
      nodes.push(<MathInline key={key} tex={tok.value} />);
      return;
    }
    // Plain text: apply bold then italic.
    const boldParts = tok.value.split(/(\*\*[^*]+\*\*)/g);
    boldParts.forEach((chunk, j) => {
      if (chunk.length >= 4 && chunk.startsWith('**') && chunk.endsWith('**')) {
        nodes.push(
          <strong key={key + '-b' + j} className="font-semibold">
            {chunk.slice(2, -2)}
          </strong>,
        );
        return;
      }
      const italicParts = chunk.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
      italicParts.forEach((seg, k) => {
        const isItalic =
          seg.length >= 2 &&
          ((seg.startsWith('*') && seg.endsWith('*')) || (seg.startsWith('_') && seg.endsWith('_')));
        if (isItalic) {
          nodes.push(<em key={key + '-i' + j + '-' + k}>{seg.slice(1, -1)}</em>);
        } else if (seg) {
          nodes.push(<Fragment key={key + '-t' + j + '-' + k}>{seg}</Fragment>);
        }
      });
    });
  });
  return nodes;
}

// Pull block math ($$...$$ and \[ ... \]) out into standalone segments so
// they render as centered display math rather than inline text.
type Segment = { type: 'text' | 'blockmath'; value: string };

function splitBlockMath(source: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(source)) !== null) {
    if (m.index > last) segments.push({ type: 'text', value: source.slice(last, m.index) });
    segments.push({ type: 'blockmath', value: (m[1] ?? m[2] ?? '').trim() });
    last = m.index + m[0].length;
  }
  if (last < source.length) segments.push({ type: 'text', value: source.slice(last) });
  return segments;
}

function renderTextBlock(text: string, keyPrefix: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const FENCE = '```';

  const nextKey = () => keyPrefix + '-' + key++;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith(FENCE)) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(FENCE)) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre
          key={nextKey()}
          className="overflow-x-auto rounded-lg border border-border bg-muted/60 p-3 font-mono text-[0.8rem] leading-5"
        >
          <code>{buf.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const cls = level <= 2 ? 'text-base font-semibold' : 'text-sm font-semibold';
      const k = nextKey();
      blocks.push(
        <p key={k} className={cls + ' mt-1'}>
          {renderInline(heading[2], k)}
        </p>,
      );
      i += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        if (/^\s*[-*]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
          i += 1;
        } else if (lines[i].trim() === '' && /^\s*[-*]\s+/.test(lines[i + 1] ?? '')) {
          i += 1;
        } else {
          break;
        }
      }
      const k = nextKey();
      blocks.push(
        <ul key={k} className="ml-4 list-disc space-y-1">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, k + '-' + idx)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const startMatch = /^\s*(\d+)[.)]\s+/.exec(line);
      const start = startMatch ? Number(startMatch[1]) : 1;
      const items: string[] = [];
      while (i < lines.length) {
        if (/^\s*\d+[.)]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
          i += 1;
        } else if (lines[i].trim() === '' && /^\s*\d+[.)]\s+/.test(lines[i + 1] ?? '')) {
          // Skip a single blank line between numbered items so the list stays continuous.
          i += 1;
        } else {
          break;
        }
      }
      const k = nextKey();
      blocks.push(
        <ol key={k} start={start} className="ml-5 list-decimal space-y-1">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, k + '-' + idx)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      const k = nextKey();
      blocks.push(
        <blockquote key={k} className="border-l-2 border-scope/50 pl-3 text-muted-foreground">
          {renderInline(buf.join(' '), k)}
        </blockquote>,
      );
      continue;
    }

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith(FENCE) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    const k = nextKey();
    blocks.push(
      <p key={k} className="whitespace-pre-wrap break-words leading-6">
        {renderInline(para.join('\n'), k)}
      </p>,
    );
  }

  return blocks;
}

export function Markdown({ text }: { text: string }) {
  const segments = splitBlockMath(text);
  const out: ReactNode[] = [];
  segments.forEach((seg, i) => {
    if (seg.type === 'blockmath') {
      out.push(<MathBlock key={'bm' + i} tex={seg.value} />);
    } else {
      out.push(...renderTextBlock(seg.value, 'seg' + i));
    }
  });
  return <div className="space-y-2">{out}</div>;
}
