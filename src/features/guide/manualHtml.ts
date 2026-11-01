/*
 * Turns the manual into one printable page. Self-contained on purpose (no
 * imports of app code): scripts/build-manual.js loads this file directly to
 * make the PDF that ships with each release.
 */

interface BlockLike {
  type: string;
  text?: string;
  items?: string[];
}

interface ChapterLike {
  id: string;
  title: string;
  summary: string;
  blocks: BlockLike[];
}

function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function block(b: BlockLike): string {
  const items = (b.items ?? []).map(i => `<li>${esc(i)}</li>`).join('');
  switch (b.type) {
    case 'h':
      return `<h3>${esc(b.text)}</h3>`;
    case 'steps':
      return `<ol>${items}</ol>`;
    case 'list':
      return `<ul>${items}</ul>`;
    case 'tip':
      return `<div class="note tip"><b>Tip.</b> ${esc(b.text)}</div>`;
    case 'warn':
      return `<div class="note warn"><b>⚠ Important.</b> ${esc(b.text)}</div>`;
    default:
      return `<p>${esc(b.text)}</p>`;
  }
}

export function manualHtml(chapters: ChapterLike[], meta: { version: string; date: string }): string {
  const toc = chapters.map(c => `<li><a href="#${esc(c.id)}">${esc(c.title)}</a><span> ${esc(c.summary)}</span></li>`).join('');
  const body = chapters
    .map(c => `<section id="${esc(c.id)}"><h2>${esc(c.title)}</h2><p class="sum">${esc(c.summary)}</p>${c.blocks.map(block).join('')}</section>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Restaurant Inventory manual</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: Segoe UI, Roboto, Arial, sans-serif; color: #1c1b1a; font-size: 11pt; line-height: 1.45; }
  h1 { font-size: 26pt; margin: 0 0 4pt; color: #1b5e3b; }
  h2 { font-size: 16pt; color: #1b5e3b; border-bottom: 2px solid #1b5e3b; padding-bottom: 3pt; margin: 0 0 4pt; }
  h3 { font-size: 12pt; margin: 12pt 0 3pt; }
  .sub { color: #5f5b57; margin: 0 0 14pt; }
  .sum { color: #5f5b57; margin: 0 0 8pt; font-style: italic; }
  section { page-break-before: always; }
  .cover { page-break-after: always; }
  ol, ul { margin: 4pt 0 6pt; padding-left: 20pt; }
  li { margin: 2pt 0; }
  .note { border-left: 4px solid; padding: 6pt 9pt; margin: 8pt 0; border-radius: 3pt; }
  .tip { border-color: #1565c0; background: #eef4fc; }
  .warn { border-color: #9a5b00; background: #fff6e8; }
  .toc { list-style: none; padding: 0; }
  .toc li { margin: 5pt 0; }
  .toc a { color: #1b5e3b; font-weight: 600; text-decoration: none; }
  .toc span { color: #5f5b57; font-size: 10pt; }
</style></head><body>
<div class="cover"><h1>Restaurant Inventory</h1><p class="sub">User manual · version ${esc(meta.version)} · ${esc(meta.date)}</p>
<h3>Contents</h3><ul class="toc">${toc}</ul></div>
${body}
</body></html>`;
}
