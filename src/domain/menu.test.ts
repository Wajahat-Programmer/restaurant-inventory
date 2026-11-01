import { classifyDishes, DISH_CLASS_ADVICE, dishAdvice, priceForMargin, unitMargin } from './menu';

// qty, revenue (Rs), cost (Rs) for each dish, in paisa.
const d = (name: string, qty: number, revenue: number, cogs: number) => ({ name, qty, revenuePaisa: revenue * 100, cogsPaisa: cogs * 100 });
const classes = (xs: ReturnType<typeof d>[]) => Object.fromEntries(classifyDishes(xs).map(x => [x.name, x.dishClass]));

describe('classifyDishes', () => {
  it('sorts dishes into star, plowhorse, puzzle and dog by sales and profit per portion', () => {
    // 100 portions in all; even share 25, popular from 17.5. Average profit per portion Rs 100.
    expect(
      classes([
        d('Karahi', 40, 40 * 500, 40 * 300), // profit 200 each, popular
        d('Fries', 40, 40 * 150, 40 * 100), // profit 50 each, popular
        d('Steak', 10, 10 * 900, 10 * 500), // profit 400 each, rare
        d('Salad', 10, 10 * 200, 10 * 160), // profit 40 each, rare
      ]),
    ).toEqual({ Karahi: 'star', Fries: 'plowhorse', Steak: 'puzzle', Salad: 'dog' });
  });

  it('gives no class to a dish that did not sell, and does not count it', () => {
    const r = classes([d('A', 30, 3000, 1000), d('B', 30, 3000, 2000), d('Ghost', 0, 0, 0)]);
    expect(r.Ghost).toBeNull();
    expect(r.A).toBe('star');
    expect(r.B).toBe('plowhorse');
  });

  it('judges nothing when fewer than two dishes sold', () => {
    expect(classes([d('Only', 10, 1000, 500), d('Ghost', 0, 0, 0)])).toEqual({ Only: null, Ghost: null });
    expect(classes([])).toEqual({});
  });

  it('a dish exactly at the average profit counts as profitable', () => {
    // Both earn Rs 100 per portion.
    expect(classes([d('A', 10, 2000, 1000), d('B', 10, 3000, 2000)])).toEqual({ A: 'star', B: 'star' });
  });
});

describe('dishAdvice', () => {
  it('gives the standard advice, unless a low earner already keeps a healthy share of its price', () => {
    expect(dishAdvice('star', 40, 65)).toBe(DISH_CLASS_ADVICE.star);
    expect(dishAdvice('puzzle', 90, 65)).toBe(DISH_CLASS_ADVICE.puzzle);
    expect(dishAdvice('plowhorse', 40, 65)).toBe(DISH_CLASS_ADVICE.plowhorse);
    expect(dishAdvice('plowhorse', null, 65)).toBe(DISH_CLASS_ADVICE.plowhorse);
    expect(dishAdvice('plowhorse', 93, 65)).toContain('Keep it');
    expect(dishAdvice('dog', 70, 65)).toContain('Cheap to keep');
    expect(dishAdvice('dog', 30, 65)).toBe(DISH_CLASS_ADVICE.dog);
  });
});

describe('unitMargin', () => {
  it('is profit per portion sold, zero with no sales', () => {
    expect(unitMargin({ qty: 4, revenuePaisa: 200000, cogsPaisa: 80000 })).toBe(30000);
    expect(unitMargin({ qty: 0, revenuePaisa: 0, cogsPaisa: 0 })).toBe(0);
  });
});

describe('priceForMargin', () => {
  it('finds the price that earns the target share, rounded up to a whole rupee', () => {
    expect(priceForMargin(30000, 70)).toBe(100000); // cost Rs 300, 70% margin: Rs 1000
    expect(priceForMargin(15000, 65)).toBe(42900); // 428.57 -> 429
    expect(priceForMargin(10000, 50)).toBe(20000); // exact: no extra rupee
  });

  it('gives nothing for an unknown cost or a silly target', () => {
    expect(priceForMargin(0, 60)).toBeNull();
    expect(priceForMargin(1000, 0)).toBeNull();
    expect(priceForMargin(1000, 99)).toBeNull();
    expect(priceForMargin(1000, NaN)).toBeNull();
  });
});
