import { formatPct } from '../../domain/finance';
import { formatPKR } from '../../domain/money';
import { formatQty } from '../../domain/units';
import { PnlReport, StockValuation } from '../../services/reportService';
import { WastageReport } from '../../services/reportService';

/** Escapes text so a name like <b>Rice</b> prints as typed and cannot change the page. */
export function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CSS = `
  body { font-family: sans-serif; color: #1C1B1A; font-size: 12pt; }
  h1 { color: #1B5E3B; font-size: 20pt; margin: 0 0 4pt; }
  h2 { font-size: 14pt; margin: 18pt 0 6pt; }
  .sub { color: #5F5B57; margin-bottom: 12pt; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 5pt 4pt; border-bottom: 1px solid #D9D4CE; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  tr.total td { font-weight: bold; border-top: 2px solid #1C1B1A; }
  .foot { margin-top: 24pt; color: #5F5B57; font-size: 9pt; }
`;

function page(title: string, subtitle: string, body: string, generatedOn: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head>
<body><h1>${esc(title)}</h1><div class="sub">${esc(subtitle)}</div>${body}
<div class="foot">Made by Restaurant Inventory on ${esc(generatedOn)}. Amounts are in Pakistani rupees.</div></body></html>`;
}

const row = (label: string, value: string, cls = '') =>
  `<tr class="${cls}"><td>${esc(label)}</td><td class="n">${esc(value)}</td></tr>`;

/** Profit and loss for one period, with the cost-control percentages. */
export function pnlHtml(p: PnlReport, periodLabel: string, generatedOn: string): string {
  const net = p.netProfit;
  const rows = [
    row('Sales', formatPKR(p.revenue)),
    row('Ingredient cost (food sold)', formatPKR(-p.cogs)),
    row('Gross profit', formatPKR(p.grossProfit), 'total'),
    row('Wastage', formatPKR(-p.wastage)),
    row('Stock count and adjustment losses', formatPKR(-p.adjustments)),
    ...p.expensesByCategory.map(e => row(`Expenses: ${e.category}`, formatPKR(-e.amountPaisa))),
    row(`${net < 0 ? '✖ Net loss' : '✓ Net profit'}`, formatPKR(net), 'total'),
  ].join('');
  const control = [
    row('Food cost % (ingredients ÷ sales)', formatPct(p.foodCostPct)),
    row('Wastage % (of stock used)', formatPct(p.wastagePct)),
    row('Portions sold in the period', String(p.salesCount)),
  ].join('');
  return page(
    'Profit and loss',
    periodLabel,
    `<table>${rows}</table><h2>Cost control</h2><table>${control}</table>
     <div class="sub" style="margin-top:12pt">Purchases are not a cost until the stock is sold or lost.</div>`,
    generatedOn,
  );
}

export function stockValuationHtml(
  v: StockValuation,
  items: { name: string; category: string | null; qtyBase: number; baseUnit: 'g' | 'ml' | 'pcs'; valuePaisa: number; status: string }[],
  generatedOn: string,
): string {
  const byCat = v.byCategory.map(c => row(`${c.category} (${c.items} items)`, formatPKR(c.valuePaisa))).join('');
  const list = items
    .map(
      i =>
        `<tr><td>${esc(i.name)}</td><td>${esc(i.category ?? '')}</td><td class="n">${esc(formatQty(i.qtyBase, i.baseUnit))}</td><td class="n">${esc(
          formatPKR(i.valuePaisa),
        )}</td><td>${esc(i.status)}</td></tr>`,
    )
    .join('');
  return page(
    'Stock valuation',
    `As of ${generatedOn}`,
    `<table>${byCat}${row('Total stock value', formatPKR(v.totalPaisa), 'total')}</table>
     <h2>Every item</h2>
     <table><tr><th>Item</th><th>Category</th><th class="n">On hand</th><th class="n">Value</th><th>Status</th></tr>${list}</table>`,
    generatedOn,
  );
}

export function wastageHtml(w: WastageReport, periodLabel: string, generatedOn: string): string {
  const rows = w.rows
    .map(
      r =>
        `<tr><td>${esc(r.date)}</td><td>${esc(r.item)}</td><td class="n">${esc(formatQty(r.qtyBase, r.baseUnit))}</td><td>${esc(r.reason ?? '')}</td><td class="n">${esc(
          formatPKR(r.valuePaisa),
        )}</td></tr>`,
    )
    .join('');
  return page(
    'Wastage',
    periodLabel,
    `<table>${row('Total thrown away', formatPKR(w.totalPaisa), 'total')}${row('Wastage % (of stock used)', formatPct(w.pct))}</table>
     <h2>What was thrown away</h2>
     ${
       w.rows.length
         ? `<table><tr><th>Date</th><th>Item</th><th class="n">Quantity</th><th>Reason</th><th class="n">Value</th></tr>${rows}</table>`
         : '<div class="sub">Nothing was thrown away in this period. ✓</div>'
     }`,
    generatedOn,
  );
}
