import { formatPKR, parseRupees } from './money';

describe('money', () => {
  it('formats paisa with grouping', () => {
    expect(formatPKR(123450)).toBe('Rs 1,234.50');
    expect(formatPKR(5)).toBe('Rs 0.05');
    expect(formatPKR(-100000)).toBe('-Rs 1,000.00');
  });

  it('rejects floats', () => {
    expect(() => formatPKR(10.5)).toThrow('integer paisa');
  });

  it('parses typed rupees to integer paisa without float error', () => {
    expect(parseRupees('19.99')).toBe(1999);
    expect(parseRupees('1,234.5')).toBe(123450);
    expect(parseRupees(' 50 ')).toBe(5000);
    expect(parseRupees('0.05')).toBe(5);
  });

  it('rejects malformed amounts', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1e3', '.5', '1.']) {
      expect(parseRupees(bad)).toBeNull();
    }
  });
});
