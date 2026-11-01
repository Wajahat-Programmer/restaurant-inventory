import { useState } from 'react';
import { Card, Text } from 'react-native-paper';
import { formatPct } from '../../src/domain/finance';
import { formatPKR } from '../../src/domain/money';
import { periodRange } from '../../src/domain/periods';
import { formatQty } from '../../src/domain/units';
import { wasteBreakdown, WasteGroup } from '../../src/domain/waste';
import { useQuery } from '../../src/features/data';
import { Body, ErrorText, Line, PeriodNav, PeriodState, todayISO, useColors } from '../../src/features/ui';
import { wastageReport } from '../../src/services/reportService';

const share = (g: WasteGroup) => `${formatPKR(g.valuePaisa)} (${g.sharePct}%)`;

export default function WastageScreen() {
  const c = useColors();
  const [period, setPeriod] = useState<PeriodState>({ kind: 'month', anchor: todayISO() });
  const { from, to } = periodRange(period.kind, period.anchor);
  const { data, error } = useQuery(async q => {
    const report = await wastageReport(q, from, to);
    return { report, ...wasteBreakdown(report.rows) };
  }, [from, to]);

  return (
    <Body>
      <PeriodNav value={period} onChange={setPeriod} testID="wastage-period" />
      <ErrorText message={error} />
      <Card>
        <Card.Content>
          <Text variant="titleMedium">Thrown away</Text>
          <Line testID="wastage-total" label="Total" strong value={formatPKR(data?.report.totalPaisa ?? 0)} />
          <Line testID="wastage-pct" label="Wastage % (of stock used)" value={formatPct(data?.report.pct ?? null)} />
          {data && data.report.rows.length === 0 && (
            <Text testID="no-wastage" style={{ color: c.success }}>
              ✓ Nothing was thrown away in this period.
            </Text>
          )}
        </Card.Content>
      </Card>

      {(data?.byReason ?? []).length > 0 && (
        <Card>
          <Card.Content>
            <Text variant="titleMedium">By reason</Text>
            {data!.byReason.map(g => (
              <Line key={g.label} testID={`reason-${g.label}`} label={`${g.label} (${g.count})`} value={share(g)} />
            ))}
          </Card.Content>
        </Card>
      )}

      {(data?.byItem ?? []).length > 0 && (
        <Card>
          <Card.Content>
            <Text variant="titleMedium">By item</Text>
            {data!.byItem.map(g => (
              <Line
                key={g.label}
                testID={`waste-item-${g.label}`}
                label={`${g.label}: ${formatQty(g.qtyBase, g.baseUnit!)}`}
                value={share(g)}
              />
            ))}
          </Card.Content>
        </Card>
      )}

      {(data?.report.rows ?? []).length > 0 && (
        <Card>
          <Card.Content>
            <Text variant="titleMedium">Every time, newest first</Text>
            {data!.report.rows.map(r => (
              <Line
                key={r.id}
                label={`${r.date}  ${r.item} ${formatQty(r.qtyBase, r.baseUnit)}${r.reason ? `, ${r.reason}` : ''}`}
                value={formatPKR(r.valuePaisa)}
              />
            ))}
          </Card.Content>
        </Card>
      )}
    </Body>
  );
}
