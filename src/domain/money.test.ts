import { formatPKR, rupeesToPaisa } from './money';

describe('money', () => {
  it('formats paisa with grouping', () => {
    expect(formatPKR(123450)).toBe('Rs 1,234.50');
    expect(formatPKR(5)).toBe('Rs 0.05');
    expect(formatPKR(-100000)).toBe('-Rs 1,000.00');
  });

  it('rejects floats', () => {
    expect(() => formatPKR(10.5)).toThrow('integer paisa');
  });

  it('converts rupees to integer paisa', () => {
    expect(rupeesToPaisa(19.99)).toBe(1999);
  });
});
