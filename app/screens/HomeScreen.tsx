import { Card, Text } from 'react-native-paper';
import { formatPct } from '../../src/domain/finance';
import { formatPKR } from '../../src/domain/money';
import { periodRange } from '../../src/domain/periods';
import { useQuery } from '../../src/features/data';
import { Body, Btn, ErrorText, Line, Row, todayISO } from '../../src/features/ui';
import { dashboard } from '../../src/services/reportService';
import { useRootNav } from '../navigation/useRootNav';

export default function HomeScreen() {
  const nav = useRootNav();
  const today = todayISO();
  const { data: d, error } = useQuery(db => dashboard(db, today, periodRange('month', today)), [today]);

  return (
    <Body>
      <ErrorText message={error} />
      <Row>
        <Btn testID="home-enter-sales" mode="contained" icon="cash-plus" onPress={() => nav.navigate('SalesEntry')}>
          Enter sales
        </Btn>
        <Btn testID="home-add-expense" mode="contained-tonal" icon="cash-minus" onPress={() => nav.navigate('ExpenseForm')}>
          Add expense
        </Btn>
      </Row>

      <Card>
        <Card.Content>
          <Text variant="titleMedium">Today</Text>
          <Line testID="home-today-revenue" label="Sales" value={formatPKR(d?.today.revenue ?? 0)} />
          <Line label="Ingredient cost" value={formatPKR(d?.today.cogs ?? 0)} />
          <Line
            testID="home-today-net"
            label="Profit after expenses"
            strong
            tone={(d?.today.netProfit ?? 0) < 0 ? 'bad' : 'good'}
            value={formatPKR(d?.today.netProfit ?? 0)}
          />
        </Card.Content>
      </Card>

      <Card>
        <Card.Content>
          <Text variant="titleMedium">This month</Text>
          <Line testID="home-month-revenue" label="Sales" value={formatPKR(d?.month.revenue ?? 0)} />
          <Line label="Gross profit" value={formatPKR(d?.month.grossProfit ?? 0)} />
          <Line label="Food cost" value={formatPct(d?.month.foodCostPct ?? null)} />
          <Line label="Wastage" value={formatPct(d?.month.wastagePct ?? null)} />
          <Line
            testID="home-month-net"
            label="Net profit"
            strong
            tone={(d?.month.netProfit ?? 0) < 0 ? 'bad' : 'good'}
            value={formatPKR(d?.month.netProfit ?? 0)}
          />
        </Card.Content>
      </Card>

      <Card>
        <Card.Content>
          <Text variant="titleMedium">Right now</Text>
          <Line testID="home-stock-value" label="Stock value" value={formatPKR(d?.stockValuePaisa ?? 0)} />
          <Line
            testID="home-low"
            label="Items low or out"
            tone={(d?.lowOrOutItems ?? 0) > 0 ? 'warn' : undefined}
            value={`${(d?.lowOrOutItems ?? 0) > 0 ? '⚠ ' : '✓ '}${d?.lowOrOutItems ?? 0}`}
          />
          <Line label="Owed to suppliers" value={formatPKR(d?.suppliersOwedPaisa ?? 0)} />
          <Line testID="home-cash" label="Cash book balance" strong value={formatPKR(d?.cashBalancePaisa ?? 0)} />
        </Card.Content>
      </Card>
    </Body>
  );
}
