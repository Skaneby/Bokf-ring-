import React from 'react';
import { parseBlocks, Inline } from '../lib/markdown';

// Renderar AI-svarens markdown som riktiga React-element — läsbara rubriker,
// listor och framför allt konteringstabeller. Ingen rå HTML injiceras.

function InlineSpans({ inlines }: { inlines: Inline[] }) {
  return (
    <>
      {inlines.map((seg, i) => {
        if (seg.kind === 'bold') return <strong key={i} className="font-semibold text-slate-900">{seg.text}</strong>;
        if (seg.kind === 'italic') return <em key={i}>{seg.text}</em>;
        if (seg.kind === 'code') return <code key={i} className="rounded bg-slate-200 px-1 py-0.5 font-mono text-[0.85em] text-slate-800">{seg.text}</code>;
        return <React.Fragment key={i}>{seg.text}</React.Fragment>;
      })}
    </>
  );
}

export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-2.5 text-sm leading-relaxed">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading': {
            const cls = b.level === 1
              ? 'text-base font-bold text-slate-900 pt-1'
              : b.level === 2
                ? 'text-sm font-bold text-slate-900 pt-1'
                : 'text-sm font-semibold text-slate-800';
            return <p key={i} className={cls}><InlineSpans inlines={b.inlines} /></p>;
          }
          case 'list':
            return b.ordered ? (
              <ol key={i} className="list-decimal space-y-1 pl-5">
                {b.items.map((item, j) => <li key={j}><InlineSpans inlines={item} /></li>)}
              </ol>
            ) : (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {b.items.map((item, j) => <li key={j}><InlineSpans inlines={item} /></li>)}
              </ul>
            );
          case 'table':
            return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      {b.header.map((cell, j) => (
                        <th key={j} className="border-b-2 border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700">
                          <InlineSpans inlines={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, j) => (
                      <tr key={j} className="border-b border-slate-200 last:border-0">
                        {row.map((cell, k) => (
                          <td key={k} className="px-2 py-1.5 align-top tabular-nums">
                            <InlineSpans inlines={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'code':
            return (
              <pre key={i} className="overflow-x-auto rounded-lg bg-slate-800 p-3 font-mono text-xs text-slate-100">
                {b.text}
              </pre>
            );
          default:
            return <p key={i}><InlineSpans inlines={b.inlines} /></p>;
        }
      })}
    </div>
  );
}
