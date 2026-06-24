// Minimal markdown -> HTML for the deal `description` field.
// Spec + spacing match the Deal Room's Investment Description EDITOR
// (Deal-Room/src/styles/dealDetail.css .dd-investment-desc), so the portal
// renders exactly what the admin composes:
//   **text**       -> <strong>
//   *text*         -> <em>
//   - item / * item (at line start)  -> <ul><li>...</li></ul> (consecutive lines collapse)
//   blank line     -> paragraph break; each ADDITIONAL blank line in a run
//                     emits a visible empty paragraph so the author's
//                     intentional spacing survives the round-trip
//   single newline -> soft line break (<br/>)
//
// Spacing mirrors the editor's "Docs/Word feel" (commit 3d9f991): line-height
// 1.6 supplies the inter-row spacing, so a hard paragraph break needs only a
// small 2px gap; lists are 6px / 24px-indent with 2px between items; empty
// paragraphs (deliberate blank lines) keep a full line (min-height: 1em) so
// the author's intentional section spacing stays visible.
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
        out.push('<p class="leading-[1.6] min-h-[1em] mb-0.5 last:mb-0"><br/></p>');
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
        `<ul class="list-disc leading-[1.6] pl-6 my-1.5 last:mb-0">${items.map((it) => `<li class="mb-0.5 last:mb-0">${it}</li>`).join('')}</ul>`
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
    out.push(`<p class="leading-[1.6] mb-0.5 last:mb-0">${para.join('<br/>')}</p>`);
  }

  return out.join('');
}
