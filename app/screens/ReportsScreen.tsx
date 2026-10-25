import { useState } from 'react';
import { Card, Text } from 'react-native-paper';
import { formatPct } from '../../src/domain/finance';
import { formatPKR } from '../../src/domain/money';
import { periodLabel, periodRange } from '../../src/domain/periods';
import { STATUS_LABEL } from '../../src/domain/stockStatus';
import { useQuery } from '../../src/features/data';
import { sharePdf } from '../../src/features/reports/pdfDevice';
import { pnlHtml, stockValuationHtml, wastageHtml } from '../../src/features/reports/pdfHtml';
import { Body, Btn, ErrorText, Line, PeriodNav, PeriodState, todayISO, useColors } from '../../src/features/ui';
import { listItems } from '../../src/services/itemService';
import { profitAndLoss, stockValuation, supplierSpend, wastageReport } from '../../src/services/reportService';
import { useDb } from '../../src/features/DbProvider';

export default function ReportsScreen() {
  const c = useColors();
  const db = useDb();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState<PeriodState>({ kind: 'month', anchor: todayISO() });
  const { from, to } = periodRange(period.kind, period.anchor);
  const { data, error } = useQuery(async q => ({
    pnl: await profitAndLoss(q, from, to),
    stock: await stockValuation(q),
    spend: await supplierSpend(q, from, to),
  }), [from, to]);
  const p = data?.pnl;

  const share = async (kind: 'pnl' | 'stock' | 'wastage') => {
    setBusy(true);
    setNote(null);
    try {
      const today = todayISO();
      const label = periodLabel(period.kind, period.anchor);
      let html: string;
      if (kind === 'pnl') {
        html = pnlHtml(await profitAndLoss(db, from, to), label, today);
      } else if (kind === 'wastage') {
        html = wastageHtml(await wastageReport(db, from, to), label, today);
      } else {
        const items = (await listItems(db)).map(i => ({
          name: i.name,
          category: i.categoryName,
          qtyBase: i.qtyBase,
          baseUnit: i.baseUnit,
          valuePaisa: i.valuePaisa,
          status: STATUS_LABEL[i.status],
        }));
        html = stockValuationHtml(await stockValuation(db), items, today);
      }
      const name = { pnl: `profit-and-loss-${from}-to-${to}`, stock: `stock-valuation-${today}`, wastage: `wastage-${from}-to-${to}` }[kind];
      await sharePdf(html, `${name}.pdf`);
      setNote('✓ PDF ready. Choose where to send or save it.');
    } catch (e) {
      setNote(`✖ ${e instanceof Error ? e.message : 'Could not make the PDF.'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Body>
      <PeriodNav value={period} onChange={setPeriod} testID="report-period" />
      <ErrorText message={error} />

      <Card>
        <Card.Content>
          <Text variant="titleMedium">Profit and loss</Text>
          <Line testID="pnl-revenue" label="Sales" value={formatPKR(p?.revenue ?? 0)} />
          <Line testID="pnl-cogs" label="− Ingredient cost (food sold)" value={formatPKR(p?.cogs ?? 0)} />
          <Line testID="pnl-gross" label="Gross profit" strong value={formatPKR(p?.grossProfit ?? 0)} />
          <Line testID="pnl-wastage" label="− Wastage" value={formatPKR(p?.wastage ?? 0)} />
          <Line testID="pnl-adjustments" label="− Stock count and adjustment losses" value={formatPKR(p?.adjustments ?? 0)} />
          <Line testID="pnl-expenses" label="− Expenses" value={formatPKR(p?.expenses ?? 0)} />
          {(p?.expensesByCategory ?? []).map(e => (
            <Line key={e.category} label={`    ${e.category}`} value={formatPKR(e.amountPaisa)} />
          ))}
          <Line
            testID="pnl-net"
            label="Net profit"
            strong
            tone={(p?.netProfit ?? 0) < 0 ? 'bad' : 'good'}
            value={`${(p?.netProfit ?? 0) < 0 ? '✖ ' : '✓ '}${formatPKR(p?.netProfit ?? 0)}`}
          />
          <Text style={{ color: c.textSecondary }}>Purchases are not a cost until the stock is sold or lost.</Text>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content>
          <Text variant="titleMedium">Cost control</Text>
          <Line testID="pnl-foodcost" label="Food cost % (ingredients ÷ sales)" value={formatPct(p?.foodCostPct ?? null)} />
          <Line testID="pnl-wastagepct" label="Wastage % (of stock used)" value={formatPct(p?.wastagePct ?? null)} />
        </Card.Content>
      </Card>

      <Card>
        <Card.Content>
          <Text variant="titleMedium">Stock valuation (now)</Text>
          <Line testID="stock-total-value" label="Total" strong value={formatPKR(data?.stock.totalPaisa ?? 0)} />
          {(data?.stock.byCategory ?? []).map(s => (
            <Line key={s.category} label={`${s.category} (${s.items})`} value={formatPKR(s.valuePaisa)} />
          ))}
        </Card.Content>
      </Card>

      <Card>
        <Card.Content>
          <Text variant="titleMedium">Share as PDF</Text>
          <Btn testID="pdf-pnl" mode="outlined" disabled={busy} onPress={() => share('pnl')}>Profit and loss</Btn>
          <Btn testID="pdf-stock" mode="outlined" disabled={busy} onPress={() => share('stock')}>Stock valuation</Btn>
          <Btn testID="pdf-wastage" mode="outlined" disabled={busy} onPress={() => share('wastage')}>Wastage</Btn>
          {note && <Text testID="pdf-note" style={{ color: c.textSecondary }}>{note}</Text>}
        </Card.Content>
      </Card>

      <Card>
        <Card.Content>
          <Text variant="titleMedium">Supplier spend</Text>
          {(data?.spend ?? []).length === 0 && <Text style={{ color: c.textSecondary }}>No purchases in this period.</Text>}
          {(data?.spend ?? []).map(s => (
            <Line key={s.supplierId} label={`${s.supplier} (${s.purchases})`} value={formatPKR(s.totalPaisa)} />
          ))}
        </Card.Content>
      </Card>
    </Body>
  );
}
