// Minimal markdown-parser för AI-svaren — ren och testbar, inga beroenden,
// ingen dangerouslySetInnerHTML (modellutdata renderas aldrig som rå HTML).
// Stödjer den delmängd Gemini använder: rubriker, punkt-/nummerlistor,
// tabeller (konteringar!), kodblock, fetstil, kursiv och inline-kod.

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string };

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { kind: 'code'; text: string };

const INLINE_RE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    if (m.index! > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('**')) out.push({ kind: 'bold', text: tok.slice(2, -2) });
    else if (tok.startsWith('`')) out.push({ kind: 'code', text: tok.slice(1, -1) });
    else out.push({ kind: 'italic', text: tok.slice(1, -1) });
    last = m.index! + tok.length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isTableSeparator = (line: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
const splitCells = (line: string): Inline[][] =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => parseInline(c.trim()));

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];

  const flushPara = () => {
    const text = para.join(' ').trim();
    if (text) blocks.push({ kind: 'paragraph', inlines: parseInline(text) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Kodblock ```…```
    if (line.trim().startsWith('```')) {
      flushPara();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }

    // Tabell: | rad | följd av |---|-separator
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushPara();
      const header = splitCells(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) rows.push(splitCells(lines[i++]));
      i--;
      blocks.push({ kind: 'table', header, rows });
      continue;
    }

    // Rubrik # / ## / ###
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        inlines: parseInline(heading[2].trim()),
      });
      continue;
    }

    // Lista (punkt eller numrerad) — konsekutiva rader
    const listItem = /^\s*(?:([-*])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (listItem) {
      flushPara();
      const ordered = listItem[2] !== undefined;
      const items: Inline[][] = [parseInline(listItem[3])];
      while (i + 1 < lines.length) {
        const next = /^\s*(?:([-*])|(\d+)[.)])\s+(.*)$/.exec(lines[i + 1]);
        if (!next || (next[2] !== undefined) !== ordered) break;
        items.push(parseInline(next[3]));
        i++;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    if (line.trim() === '') { flushPara(); continue; }
    para.push(line.trim());
  }
  flushPara();
  return blocks;
}
