// Minimal markdown -> HTML for the deal `description` field.
// Matches the spec AND spacing used by the Deal Room renderer
// (Deal-Room/src/features/deals.js renderMarkdownSafe + .dc-opp-body CSS), so
// the Investment Opportunity reads identically in the club portals:
//   **text**       -> <strong>
//   *text*         -> <em>
//   - item / * item (at line start)  -> <ul><li>...</li></ul> (consecutive lines collapse)
//   blank line     -> paragraph break; each ADDITIONAL blank line in a run
//                     emits a visible empty paragraph so the author's
//                     intentional spacing survives the round-trip
//   single newline -> soft line break (<br/>)
//
// Block spacing mirrors the Deal Room: line-height 1.7, 12px bottom margin on
// paragraphs and lists (none on the last block), 22px list indent, 4px between
// list items.
//
// HTML is escaped *before* markdown conversion, so user-typed <script> or
// other markup cannot sneak through — only the formatting markers above
// produce HTML.

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Inline transforms (run AFTER escaping). Bold first so `**` is consumed
// before the single-`*` italic rule matches its inner asterisks.
function applyInline(s) {
  return s
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
}

export function formatDealDescription(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const escaped = escapeHtml(raw);
  const lines = escaped.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank-line run. The first blank is the implicit paragraph break between
    // blocks; each ADDITIONAL blank emits one visible empty paragraph so the
    // author's intentional spacing survives (matches Deal Room renderMarkdownSafe).
    if (line.trim() === '') {
      let n = 0;
      while (i < lines.length && lines[i].trim() === '') { n++; i++; }
      for (let k = 1; k < n; k++) {
        out.push('<p class="leading-[1.7] min-h-[1em] mb-3 last:mb-0"><br/></p>');
      }
      continue;
    }

    // Consecutive bullet lines collapse into one <ul>.
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(applyInline(lines[i].replace(/^\s*[-*]\s+/, '').trimEnd()));
        i++;
      }
      out.push(
        `<ul class="list-disc leading-[1.7] pl-[22px] mb-3 last:mb-0">${items.map((it) => `<li class="mb-1 last:mb-0">${it}</li>`).join('')}</ul>`
      );
      continue;
    }

    // Paragraph — consecutive non-blank non-bullet lines, soft-break joined.
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^\s*[-*]\s+/.test(lines[i])
    ) {
      para.push(applyInline(lines[i].trimEnd()));
      i++;
    }
    out.push(`<p class="leading-[1.7] mb-3 last:mb-0">${para.join('<br/>')}</p>`);
  }

  return out.join('');
}
