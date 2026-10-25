import {
  applyMovement,
  avgCost,
  EMPTY_LEVEL,
  Movement,
  PostedMovement,
  replay,
  reverse,
  StockLevel,
} from './ledger';

const inn = (qtyBase: number, valuePaisa: number): PostedMovement => ({
  itemId: 1,
  type: 'IN',
  qtyBase,
  valuePaisa,
});

const out = (type: 'ISSUE' | 'WASTE' | 'SALE', qtyBase: number): Movement => ({
  itemId: 1,
  type,
  qtyBase,
});

const post = (lvl: StockLevel, m: Movement): PostedMovement => {
  const r = applyMovement(lvl, m);
  return { ...m, valuePaisa: r.valuePaisa };
};

describe('applyMovement', () => {
  it('computes weighted-average cost on IN', () => {
    const a = applyMovement(EMPTY_LEVEL, inn(1000, 10000)).level;
    const b = applyMovement(a, inn(1000, 20000)).level;
    expect(b).toEqual({ qtyBase: 2000, valuePaisa: 30000 });
    expect(avgCost(b)).toBe(15);
  });

  it('keeps sub-paisa unit costs exact', () => {
    // Rs 50 for a 25 kg bag is 0.2 paisa per gram.
    const lvl = applyMovement(EMPTY_LEVEL, inn(25000, 5000)).level;
    expect(avgCost(lvl)).toBe(0.2);
    const r = applyMovement(lvl, out('ISSUE', -5000));
    expect(r.valuePaisa).toBe(-1000);
    expect(r.level).toEqual({ qtyBase: 20000, valuePaisa: 4000 });
  });

  it('outflows remove value at the average and report it', () => {
    const lvl = applyMovement(EMPTY_LEVEL, inn(1000, 10000)).level;
    const r = applyMovement(lvl, out('ISSUE', -400));
    expect(r.valuePaisa).toBe(-4000);
    expect(r.level).toEqual({ qtyBase: 600, valuePaisa: 6000 });
  });

  it('emptying an item clears its value exactly (no rounding residue)', () => {
    let lvl = applyMovement(EMPTY_LEVEL, inn(3, 100)).level;
    lvl = applyMovement(lvl, out('ISSUE', -1)).level;
    lvl = applyMovement(lvl, out('ISSUE', -2)).level;
    expect(lvl).toEqual(EMPTY_LEVEL);
  });

  it('a gain via ADJUST or COUNT is valued at the current average', () => {
    const lvl = applyMovement(EMPTY_LEVEL, inn(1000, 10000)).level;
    const r = applyMovement(lvl, { itemId: 1, type: 'COUNT', qtyBase: 100 });
    expect(r.valuePaisa).toBe(1000);
    expect(r.level.qtyBase).toBe(1100);
  });

  it('a gain with no stock and no value is valued at zero', () => {
    const r = applyMovement(EMPTY_LEVEL, { itemId: 1, type: 'ADJUST', qtyBase: 5 });
    expect(r).toEqual({ level: { qtyBase: 5, valuePaisa: 0 }, valuePaisa: 0 });
  });

  it('an explicit value on ADJUST is honoured', () => {
    const r = applyMovement(EMPTY_LEVEL, {
      itemId: 1,
      type: 'ADJUST',
      qtyBase: 5,
      valuePaisa: 250,
    });
    expect(r.level).toEqual({ qtyBase: 5, valuePaisa: 250 });
  });

  it('rejects negative stock', () => {
    expect(() => applyMovement(EMPTY_LEVEL, out('ISSUE', -1))).toThrow(
      'Insufficient stock',
    );
  });

  it('rejects invalid movements', () => {
    expect(() => applyMovement(EMPTY_LEVEL, inn(-5, 10))).toThrow('positive');
    expect(() => applyMovement(EMPTY_LEVEL, inn(0, 10))).toThrow('non-zero');
    expect(() => applyMovement(EMPTY_LEVEL, inn(5, -10))).toThrow('negative');
    expect(() =>
      applyMovement(EMPTY_LEVEL, { itemId: 1, type: 'IN', qtyBase: 5 }),
    ).toThrow('need a value');
    expect(() =>
      applyMovement({ qtyBase: 10, valuePaisa: 100 }, out('SALE', 5)),
    ).toThrow('negative');
  });

  it('rejects non-integer paisa', () => {
    expect(() => applyMovement(EMPTY_LEVEL, inn(10, 1.5))).toThrow(
      'integer paisa',
    );
    expect(() =>
      applyMovement(EMPTY_LEVEL, {
        itemId: 1,
        type: 'ADJUST',
        qtyBase: 1,
        valuePaisa: 0.5,
      }),
    ).toThrow('integer paisa');
  });
});

describe('reverse and replay', () => {
  it('reversing an ISSUE restores quantity and value', () => {
    const buy = inn(1000, 10000);
    const l1 = applyMovement(EMPTY_LEVEL, buy).level;
    const issue = post(l1, out('ISSUE', -300));
    const l2 = applyMovement(l1, issue).level;
    expect(applyMovement(l2, reverse(issue)).level).toEqual(l1);
  });

  it('reversing an IN restores the earlier average', () => {
    const first = inn(1000, 10000);
    const second = inn(1000, 20000);
    expect(replay([first, reverse(first)])).toEqual(EMPTY_LEVEL);
    const l = replay([first, second, reverse(first)]);
    expect(l).toEqual({ qtyBase: 1000, valuePaisa: 20000 });
    expect(avgCost(l)).toBe(20);
  });

  it('cannot reverse an IN after its stock was used', () => {
    const buy = inn(1000, 10000);
    const l1 = applyMovement(EMPTY_LEVEL, buy).level;
    const issue = post(l1, out('ISSUE', -600));
    expect(() => replay([buy, issue, reverse(buy)])).toThrow(
      'Insufficient stock',
    );
  });

  it('cannot reverse an IN when only other stock would remain unvalued', () => {
    const a = inn(1000, 10000);
    const b = inn(1000, 20000);
    const l = applyMovement(applyMovement(EMPTY_LEVEL, a).level, b).level;
    const issue = post(l, out('ISSUE', -1000)); // removes 15000
    // 1000 left worth 15000; undoing A leaves qty 0 with 5000 value.
    expect(() => replay([a, b, issue, reverse(a)])).toThrow(
      'inconsistent stock value',
    );
  });

  it('a reversal must carry its value', () => {
    expect(() =>
      applyMovement(EMPTY_LEVEL, {
        itemId: 1,
        type: 'IN',
        qtyBase: -1,
        isReversal: true,
      }),
    ).toThrow('original value');
  });

  it('replay equals incremental application', () => {
    const a = inn(500, 6000);
    const b = inn(500, 9000);
    const l = applyMovement(applyMovement(EMPTY_LEVEL, a).level, b).level;
    const issue = post(l, out('ISSUE', -250));
    expect(replay([a, b, issue])).toEqual(applyMovement(l, issue).level);
  });
});
