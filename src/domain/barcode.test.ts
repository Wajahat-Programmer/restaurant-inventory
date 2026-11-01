import { barcodeVariants, normalizeBarcode } from './barcode';

describe('normalizeBarcode', () => {
  it('drops spaces and dashes and capitalises', () => {
    expect(normalizeBarcode(' 8964 0001-23456 ')).toBe('8964000123456');
    expect(normalizeBarcode('ab-12')).toBe('AB12');
  });
  it('refuses what cannot be a barcode', () => {
    expect(normalizeBarcode('')).toBeNull();
    expect(normalizeBarcode('12')).toBeNull();
    expect(normalizeBarcode('12 34 / 56')).toBeNull();
    expect(normalizeBarcode('1'.repeat(41))).toBeNull();
  });
});

describe('barcodeVariants', () => {
  it('knows UPC-A and EAN-13 are the same product', () => {
    expect(barcodeVariants('036000291452')).toEqual(['036000291452', '0036000291452']);
    expect(barcodeVariants('0036000291452')).toEqual(['0036000291452', '036000291452']);
  });
  it('leaves other codes alone', () => {
    expect(barcodeVariants('8964000123456')).toEqual(['8964000123456']);
    expect(barcodeVariants('ABC123')).toEqual(['ABC123']);
  });
});
