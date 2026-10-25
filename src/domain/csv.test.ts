import { BOM, mapColumns, parseCsv, toCsv } from './csv';

describe('toCsv', () => {
  it('quotes cells with commas, quotes and newlines, and uses CRLF', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"', 'x\ny'], [1, null, undefined, true]])).toBe(
      'a,"b,c","say ""hi""","x\ny"\r\n1,,,true\r\n',
    );
  });

  it('adds a byte order mark for Excel when asked', () => {
    expect(toCsv([['é']], { bom: true }).startsWith(BOM)).toBe(true);
    expect(toCsv([['é']]).startsWith(BOM)).toBe(false);
  });

  it('neutralises spreadsheet formulas but leaves negative numbers alone', () => {
    expect(toCsv([['=SUM(A1)', '+1+1', '@x', '-5', '-2.50', '-abc']])).toBe("'=SUM(A1),'+1+1,'@x,-5,-2.50,'-abc\r\n");
  });

  it('is empty for no rows', () => {
    expect(toCsv([])).toBe('');
  });
});

describe('parseCsv', () => {
  it('reads quoted cells with commas, newlines and doubled quotes', () => {
    expect(parseCsv('a,"b,c","say ""hi""","x\ny"\r\n1,2,3,4\r\n')).toEqual([
      ['a', 'b,c', 'say "hi"', 'x\ny'],
      ['1', '2', '3', '4'],
    ]);
  });

  it('accepts LF, CRLF, a BOM, a missing final newline and blank lines', () => {
    expect(parseCsv(`${BOM}a,b\n\n1,2\r\n\r\n3,4`)).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });

  it('keeps empty cells and trailing commas', () => {
    expect(parseCsv('a,,c,\n,,\n')).toEqual([['a', '', 'c', ''], ['', '', '']]);
  });

  it('refuses an unterminated quote instead of eating the file', () => {
    expect(() => parseCsv('a,"b\n1,2')).toThrow('never closed');
  });

  it('round-trips awkward data', () => {
    const rows = [['name', 'note'], ['Rice, basmati', 'He said "ok"\nthen left'], ['', ' spaced ']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('returns nothing for an empty file', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\r\n\r\n')).toEqual([]);
  });
});

describe('mapColumns', () => {
  const spec = [
    { key: 'name', label: 'Name', required: true },
    { key: 'unit', label: 'Base unit', required: true, aliases: ['uom'] },
    { key: 'note', label: 'Note', required: false },
  ];

  it('matches headers regardless of case, spacing and punctuation', () => {
    const m = mapColumns(['  NAME ', 'Base_Unit', 'extra'], spec);
    expect(m.index).toEqual({ name: 0, unit: 1 });
    expect(m.missing).toEqual([]);
    expect(m.unused).toEqual(['extra']);
  });

  it('uses aliases and reports missing required columns', () => {
    expect(mapColumns(['UOM', 'name'], spec).index).toEqual({ unit: 0, name: 1 });
    expect(mapColumns(['name'], spec).missing.map(c => c.key)).toEqual(['unit']);
  });

  it('does not match one header to two columns', () => {
    const m = mapColumns(['name'], [
      { key: 'a', label: 'Name', required: true },
      { key: 'b', label: 'name', required: true },
    ]);
    expect(Object.keys(m.index)).toHaveLength(1);
    expect(m.missing).toHaveLength(1);
  });
});
