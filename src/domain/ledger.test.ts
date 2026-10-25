import {
  applyMovement,
  EMPTY_LEVEL,
  Movement,
  replay,
  reverse,
  stockValue,
} from './ledger';

const inn = (qtyBase: number, unitCostPaisa: number): Movement => ({
  itemId: 'rice',
  type: 'IN',
  qtyBase,
  unitCostPaisa,
});

const issue = (qtyBase: number): Movement => ({
  itemId: 'rice',
  type: 'ISSUE',
  qtyBase,
  unitCostPaisa: 0,
});

describe('ledger', () => {
  it('computes weighted-average cost on IN', () => {
    const a = applyMovement(EMPTY_LEVEL, inn(1000, 10));
    const b = applyMovement(a, inn(1000, 20));
    expect(b).toEqual({ qtyBase: 2000, avgCostPaisa: 15 });
  });

  it('keeps the average on outflows', () => {
    const lvl = applyMovement(EMPTY_LEVEL, inn(1000, 10));
    const out = applyMovement(lvl, issue(-400));
    expect(out).toEqual({ qtyBase: 600, avgCostPaisa: 10 });
    expect(stockValue(out)).toBe(6000);
  });

  it('rejects negative stock', () => {
    expect(() => applyMovement(EMPTY_LEVEL, issue(-1))).toThrow(
      'Insufficient stock',
    );
  });

  it('rejects wrong-signed movements and zero quantity', () => {
    expect(() => applyMovement(EMPTY_LEVEL, inn(-5, 10))).toThrow('positive');
    expect(() => applyMovement(EMPTY_LEVEL, inn(0, 10))).toThrow('non-zero');
    expect(() =>
      applyMovement({ qtyBase: 10, avgCostPaisa: 1 }, issue(5)),
    ).toThrow('negative');
  });

  it('rejects non-integer and negative unit cost', () => {
    expect(() => applyMovement(EMPTY_LEVEL, inn(10, 1.5))).toThrow(
      'integer paisa',
    );
    expect(() => applyMovement(EMPTY_LEVEL, inn(10, -1))).toThrow('negative');
  });

  it('a reversing entry returns quantity to its prior value', () => {
    const out = issue(-300);
    expect(replay([inn(1000, 10), out, reverse(out)]).qtyBase).toBe(1000);
  });

  it('reversing an IN removes its stock and restores the earlier average', () => {
    const first = inn(1000, 10);
    const second = inn(1000, 20);
    expect(replay([first, reverse(first)])).toEqual(EMPTY_LEVEL);
    expect(replay([first, second, reverse(first)])).toEqual({
      qtyBase: 1000,
      avgCostPaisa: 20,
    });
  });

  it('cannot reverse an IN after the stock was used', () => {
    const buy = inn(1000, 10);
    expect(() => replay([buy, issue(-600), reverse(buy)])).toThrow(
      'Insufficient stock',
    );
  });

  it('replay equals incremental application', () => {
    const history = [inn(500, 12), inn(500, 18), issue(-250)];
    expect(replay(history)).toEqual(history.reduce(applyMovement, EMPTY_LEVEL));
  });
});
