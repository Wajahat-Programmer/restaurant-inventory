#!/usr/bin/env node
/**
 * Builds the illustrated user manual: docs/Restaurant-Inventory-User-Manual.pdf
 * (and the .html it is printed from). The words and callouts live in
 * docs/manual/content.js; the screenshots in docs/manual/web/*.jpg were taken
 * from the running app (see docs/manual/README.md). Needs Microsoft Edge or
 * Chrome to print the PDF.
 *
 *   node scripts/build-user-manual.js
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manualDir = path.join(root, 'docs', 'manual');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

const esc = s =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
// Inline markup in the content: **bold** and `button names`.
const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<span class="btn">$1</span>');

const crops = JSON.parse(fs.readFileSync(path.join(manualDir, 'crops.json'), 'utf8'));
const cache = {};
const missing = [];
const has = name => fs.existsSync(path.join(manualDir, 'web', `${name}.jpg`));
function dataUri(name) {
  if (!cache[name]) {
    const file = path.join(manualDir, 'web', `${name}.jpg`);
    if (!fs.existsSync(file)) {
      throw new Error(`Missing screenshot: ${file}`);
    }
    cache[name] = `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`;
  }
  return cache[name];
}

/* ---------- building blocks the content file uses ---------- */
const h = {
  p: t => `<p>${rich(t)}</p>`,
  h3: t => `<h3>${rich(t)}</h3>`,
  list: items => `<ul>${items.map(i => `<li>${rich(i)}</li>`).join('')}</ul>`,
  steps: items => `<ol class="steps">${items.map(i => `<li>${rich(i)}</li>`).join('')}</ol>`,
  tip: t => `<div class="note tip"><b>Tip</b>${rich(t)}</div>`,
  warn: t => `<div class="note warn"><b>Important</b>${rich(t)}</div>`,
  rule: t => `<div class="note rule"><b>How the app thinks</b>${rich(t)}</div>`,
  table: (head, rows) =>
    `<table><tr>${head.map(c => `<th>${rich(c)}</th>`).join('')}</tr>${rows
      .map(r => `<tr>${r.map(c => `<td>${rich(c)}</td>`).join('')}</tr>`)
      .join('')}</table>`,
  svg: markup => `<div class="diagram">${markup}</div>`,
  /** A phone picture with numbered pins. pins: [{ x, y }] in percent of the picture. */
  phone(name, pins = [], caption = '') {
    if (!has(name)) {
      missing.push(name);
      return '';
    }
    const keep = crops[name] || 100; // the picture was cropped to the top `keep` percent
    const dots = pins
      .map((p, i) => `<span class="pin" style="left:${p.x}%;top:${((p.y * 100) / keep).toFixed(2)}%">${i + 1}</span>`)
      .join('');
    return `<figure class="phone"><div class="frame"><img src="${dataUri(name)}" alt="">${dots}</div>${caption ? `<figcaption>${rich(caption)}</figcaption>` : ''}</figure>`;
  },
  /** Picture on the left, numbered explanation on the right. */
  figure(name, pins, legend, caption) {
    const items = legend.map((t, i) => `<li><span class="n">${i + 1}</span><div>${rich(t)}</div></li>`).join('');
    return `<div class="figrow">${h.phone(name, pins, caption)}<ol class="legend">${items}</ol></div>`;
  },
  /** Several pictures side by side, each with its caption. */
  gallery: items => `<div class="gallery">${items.map(i => h.phone(i.name, i.pins || [], i.caption)).join('')}</div>`,
};

/* ---------- the pages ---------- */
const { chapters, intro } = require(path.join(manualDir, 'content.js'))(h, { version });

if (missing.length) {
  console.warn(`Screenshots not found, pictures left out: ${[...new Set(missing)].join(', ')}`);
}

const logo = `<svg viewBox="0 0 120 120" width="96" height="96" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" rx="26" fill="#1B5E3B"/><path d="M60 22 94 40v40L60 98 26 80V40z" fill="#fff" opacity=".12"/><path d="M60 26 90 42 60 58 30 42z" fill="#E09F1F"/><path d="M30 42v36l30 16V58z" fill="#fff"/><path d="M90 42v36L60 94V58z" fill="#d7e8de"/><path d="m44 70 8 8 16-18" fill="none" stroke="#1B5E3B" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const toc = chapters
  .map(
    (c, i) =>
      `<li><a href="#ch${i + 1}"><span class="tn">${i + 1}</span><span class="tt">${esc(c.title)}</span><span class="ts">${esc(c.summary)}</span></a></li>`,
  )
  .join('');

const body = chapters
  .map(
    (c, i) =>
      `<section id="ch${i + 1}"><div class="chead"><span class="cnum">${i + 1}</span><div><h2>${esc(c.title)}</h2><p class="lead">${rich(c.summary)}</p></div></div>${c.html}</section>`,
  )
  .join('');

const css = `
  @page { size: A4; margin: 15mm 14mm 17mm 14mm;
    @bottom-left { content: "Restaurant Inventory · User manual"; font: 8pt Segoe UI, Arial, sans-serif; color: #7a756f; }
    @bottom-right { content: "Page " counter(page); font: 8pt Segoe UI, Arial, sans-serif; color: #7a756f; } }
  @page :first { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Roboto, Arial, sans-serif; color: #1c1b1a; font-size: 10.5pt; line-height: 1.5; margin: 0; }
  h2 { font-size: 21pt; margin: 0; color: #1b5e3b; line-height: 1.15; }
  h3 { font-size: 12.5pt; margin: 15pt 0 4pt; color: #1b5e3b; break-after: avoid; }
  p { margin: 5pt 0; }
  ul, ol { margin: 5pt 0; padding-left: 19pt; } li { margin: 2.5pt 0; }
  b { font-weight: 650; }
  .btn { display: inline-block; background: #eef3ef; border: 1px solid #c5d5ca; border-radius: 4pt; padding: 0 5pt; font-weight: 600; color: #1b5e3b; white-space: nowrap; }
  section { break-before: page; }
  .chead { display: flex; gap: 12pt; align-items: center; border-bottom: 3px solid #e09f1f; padding-bottom: 9pt; margin-bottom: 8pt; }
  .cnum { flex: none; width: 40pt; height: 40pt; border-radius: 10pt; background: #1b5e3b; color: #fff; font-size: 21pt; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .lead { color: #5f5b57; font-size: 11.5pt; margin: 3pt 0 0; }
  .cover { height: 297mm; break-after: page; background: linear-gradient(160deg, #1b5e3b 0%, #164b30 55%, #0e3220 100%); color: #fff; padding: 34mm 22mm 20mm; position: relative; overflow: hidden; }
  .cover h1 { font-size: 40pt; line-height: 1.05; margin: 18mm 0 4mm; }
  .cover .sub { font-size: 17pt; opacity: .92; }
  .cover .meta { position: absolute; left: 22mm; bottom: 22mm; font-size: 11pt; opacity: .85; line-height: 1.7; }
  .cover .stripe { position: absolute; right: -30mm; top: 60mm; width: 120mm; height: 120mm; border-radius: 50%; background: #e09f1f; opacity: .16; }
  .cover .stripe2 { position: absolute; right: 20mm; bottom: 40mm; width: 60mm; height: 60mm; border-radius: 50%; background: #fff; opacity: .07; }
  .cover .cphone { position: absolute; right: 18mm; bottom: 30mm; width: 62mm; filter: drop-shadow(0 6mm 8mm rgba(0,0,0,.4)); }
  .tocpage { break-after: page; } .tocpage h2 { margin-bottom: 8pt; }
  .toc { list-style: none; padding: 0; margin: 0; }
  .toc li { margin: 0; border-bottom: 1px solid #e6e1da; }
  .toc a { display: grid; grid-template-columns: 26pt 150pt 1fr; gap: 8pt; padding: 6.5pt 0; color: inherit; text-decoration: none; align-items: baseline; }
  .toc .tn { font-weight: 700; color: #e09f1f; font-size: 13pt; } .toc .tt { font-weight: 650; color: #1b5e3b; } .toc .ts { color: #5f5b57; font-size: 9.5pt; }
  .note { border-left: 5px solid; border-radius: 4pt; padding: 7pt 10pt; margin: 9pt 0; break-inside: avoid; }
  .note > b:first-child { display: block; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 1pt; }
  .tip { background: #eef4fc; border-color: #1565c0; } .tip b { color: #1565c0; }
  .warn { background: #fff5e5; border-color: #c77700; } .warn b { color: #9a5b00; }
  .rule { background: #edf6ef; border-color: #2e7d32; } .rule b { color: #2e7d32; }
  ol.steps { list-style: none; counter-reset: s; padding-left: 0; }
  ol.steps li { counter-increment: s; position: relative; padding-left: 27pt; margin: 6pt 0; min-height: 19pt; }
  ol.steps li::before { content: counter(s); position: absolute; left: 0; top: 0; width: 19pt; height: 19pt; border-radius: 50%; background: #1b5e3b; color: #fff; font-weight: 700; font-size: 9.5pt; display: flex; align-items: center; justify-content: center; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9.6pt; break-inside: avoid; }
  th { background: #1b5e3b; color: #fff; text-align: left; padding: 5pt 7pt; font-weight: 600; }
  td { border-bottom: 1px solid #ddd8d0; padding: 5pt 7pt; vertical-align: top; }
  tr:nth-child(even) td { background: #faf8f5; }
  .figrow { display: flex; gap: 14pt; align-items: flex-start; margin: 10pt 0; break-inside: avoid; }
  figure.phone { margin: 0; flex: none; width: 50mm; text-align: center; break-inside: avoid; }
  .frame { position: relative; border: 2.2pt solid #26302b; border-radius: 13pt; overflow: hidden; background: #26302b; box-shadow: 0 3pt 8pt rgba(0,0,0,.22); }
  .frame img { display: block; width: 100%; }
  figcaption { font-size: 8.5pt; color: #5f5b57; margin-top: 4pt; }
  .pin { position: absolute; transform: translate(-50%, -50%); width: 12.5pt; height: 12.5pt; border-radius: 50%; background: #e09f1f; color: #1c1b1a; font-weight: 800; font-size: 7.5pt; display: flex; align-items: center; justify-content: center; border: 1.4pt solid #fff; box-shadow: 0 1pt 3pt rgba(0,0,0,.45); }
  ol.legend { list-style: none; padding: 0; margin: 0; flex: 1; }
  ol.legend li { display: flex; gap: 8pt; margin: 0 0 8pt; align-items: flex-start; }
  ol.legend .n { flex: none; width: 15pt; height: 15pt; border-radius: 50%; background: #e09f1f; color: #1c1b1a; font-weight: 800; font-size: 8.5pt; display: flex; align-items: center; justify-content: center; margin-top: 1.5pt; }
  .gallery { display: flex; gap: 10pt; justify-content: center; margin: 10pt 0; break-inside: avoid; }
  .gallery figure.phone { width: 42mm; }
  .diagram { margin: 10pt 0; text-align: center; break-inside: avoid; } .diagram svg { max-width: 92%; height: auto; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12pt; }
  .card { border: 1px solid #ddd8d0; border-radius: 8pt; padding: 8pt 11pt; background: #fff; break-inside: avoid; }
  .card h4 { margin: 0 0 3pt; color: #1b5e3b; font-size: 11pt; }
`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Restaurant Inventory - User manual</title><style>${css}</style></head><body>
<div class="cover"><div class="stripe"></div><div class="stripe2"></div>${logo}
<h1>Restaurant<br>Inventory</h1><div class="sub">User manual</div>
<img class="cphone" src="${dataUri('01-home')}" alt="">
<div class="meta">Version ${esc(version)}<br>For Android phones · Works without internet<br>Your data stays on your phone</div></div>
<div class="tocpage"><h2>Contents</h2>${intro || ''}<ul class="toc">${toc}</ul></div>
${body}
</body></html>`;

const htmlPath = path.join(root, 'docs', 'Restaurant-Inventory-User-Manual.html');
const pdfPath = path.join(root, 'docs', 'Restaurant-Inventory-User-Manual.pdf');
fs.writeFileSync(htmlPath, html);
console.log(`Wrote ${htmlPath} (${(html.length / 1024 / 1024).toFixed(1)} MB)`);

const candidates = [
  process.env.BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const browser = candidates.find(p => fs.existsSync(p));
if (!browser) {
  console.warn('No Edge or Chrome found: open the HTML and print it to PDF.');
  process.exit(0);
}
const startedAt = Date.now() - 1000;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'um-'));
const r = spawnSync(
  browser,
  ['--headless=new', '--disable-gpu', `--user-data-dir=${profile}`, '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, `file:///${htmlPath.replace(/\\/g, '/')}`],
  { stdio: 'inherit', timeout: 240000 },
);
fs.rmSync(profile, { recursive: true, force: true });
// Edge can exit non-zero after writing a good file (a noisy extension error), so judge by the file.
if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).mtimeMs < startedAt) {
  console.error('The browser could not make the PDF.');
  process.exit(1);
}
console.log(`Wrote ${pdfPath} (${(fs.statSync(pdfPath).size / 1024 / 1024).toFixed(1)} MB)`);
