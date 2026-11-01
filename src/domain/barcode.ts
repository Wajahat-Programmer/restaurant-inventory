/**
 * Barcodes are stored without spaces or dashes, in capitals, so what a scanner
 * reads and what a person typed compare equal. Returns null for something that
 * cannot be a barcode.
 */
export function normalizeBarcode(raw: string): string | null {
  const s = raw.trim().replace(/[\s-]/g, '').toUpperCase();
  return s.length >= 3 && s.length <= 40 && /^[A-Z0-9]+$/.test(s) ? s : null;
}

/**
 * The same product can be read as a 12-digit UPC-A or as the 13-digit EAN-13
 * that is the same number with a leading 0. Both spellings find the item.
 */
export function barcodeVariants(code: string): string[] {
  if (/^\d{12}$/.test(code)) {
    return [code, `0${code}`];
  }
  if (/^0\d{12}$/.test(code)) {
    return [code, code.slice(1)];
  }
  return [code];
}
