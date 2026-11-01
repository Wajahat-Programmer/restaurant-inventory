import { Card, Text } from 'react-native-paper';
import { useTour } from '../../src/features/guide/TourProvider';
import { TourTarget } from '../../src/features/guide/TourTarget';
import { formatPct } from '../../src/domain/finance';
import { formatPKR } from '../../src/domain/money';
import { periodRange } from '../../src/domain/periods';
import { useQuery, useWrite } from '../../src/features/data';
import { installedVersion } from '../../src/features/update/devicePorts';
import { knownUpdate } from '../../src/features/update/updateController';
import { Body, Btn, ErrorText, Line, Row, todayISO, useColors } from '../../src/features/ui';
import { alerts } from '../../src/services/forecastService';
import { dashboard } from '../../src/services/reportService';
import { allowed } from '../../src/services/session';
import { getSetting, setSetting } from '../../src/services/settingsService';
import { useRootNav } from '../navigation/useRootNav';

export default function HomeScreen() {
  const nav = useRootNav();
  const c = useColors();
  const today = todayISO();
  const seesMoney = allowed('finance');
  const canManage = allowed('manage');
  const tour = useTour();
  const write = useWrite();

  const { data, error } = useQuery(
    async db => ({
      d: seesMoney ? await dashboard(db, today, periodRange('month', today)) : null,
      alerts: await alerts(db, today),
      update: canManage ? await knownUpdate(db, await installedVersion()) : null,
      showGuide: (await getSetting(db, 'guide.seen')) === '0',
    }),
    [today, seesMoney, canManage],
  );
  const d = data?.d;
  const list = data?.alerts ?? [];

  return (
    <Body>
      <ErrorText message={error} />

      {data?.update && (
        <Card testID="update-banner">
          <Card.Content>
            <Text variant="titleMedium" style={{ color: c.warning }}>
              {`⚠ Update ${data.update} is available`}
            </Text>
            <Btn testID="update-banner-open" mode="contained-tonal" icon="update" onPress={() => nav.navigate('Settings')}>
              See and install
            </Btn>
          </Card.Content>
        </Card>
      )}

      {data?.showGuide && (
        <Card testID="guide-offer">
          <Card.Content>
            <Text variant="titleMedium">New here? Take the two-minute tour</Text>
            <Text style={{ color: c.textSecondary }}>It shows where everything is. The manual is always under More, then Help and manual.</Text>
            <Row>
              <Btn testID="guide-start" mode="contained" icon="map-marker-path" onPress={() => tour.start()}>
                Start the tour
              </Btn>
              <Btn testID="guide-dismiss" onPress={() => write(conn => setSetting(conn, 'guide.seen', '1'))}>
                Not now
              </Btn>
            </Row>
          </Card.Content>
        </Card>
      )}

      <TourTarget id="home-actions">
      <Row>
        <Btn testID="home-enter-sales" mode="contained" icon="cash-plus" onPress={() => nav.navigate('SalesEntry')}>
          Enter sales
        </Btn>
        {seesMoney && (
          <Btn testID="home-add-expense" mode="contained-tonal" icon="cash-minus" onPress={() => nav.navigate('ExpenseForm')}>
            Add expense
          </Btn>
        )}
      </Row>
      </TourTarget>

      <TourTarget id="home-alerts">
      <Card testID="home-alerts">
        <Card.Content>
          <Text variant="titleMedium">Needs attention</Text>
          {list.length === 0 && (
            <Text testID="home-no-alerts" style={{ color: c.success }}>
              ✓ Nothing needs attention.
            </Text>
          )}
          {list.slice(0, 3).map((a, i) => (
            <Text key={i} testID={`home-alert-${a.kind}`}>
              {a.message}
            </Text>
          ))}
          {list.length > 3 && <Text style={{ color: c.textSecondary }}>{`…and ${list.length - 3} more`}</Text>}
          <Btn testID="home-open-forecast" onPress={() => nav.navigate('Forecast')}>
            Forecast and ordering
          </Btn>
        </Card.Content>
      </Card>
      </TourTarget>

      {seesMoney && (
        <>
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
                value={`${(d?.today.netProfit ?? 0) < 0 ? '✖ ' : '✓ '}${formatPKR(d?.today.netProfit ?? 0)}`}
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
                value={`${(d?.month.netProfit ?? 0) < 0 ? '✖ ' : '✓ '}${formatPKR(d?.month.netProfit ?? 0)}`}
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
        </>
      )}
    </Body>
  );
}
