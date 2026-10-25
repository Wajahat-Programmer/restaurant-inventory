/** Excel opens UTF-8 CSV correctly only when it starts with a byte order mark. */
export const BOM = '﻿';

export type Cell = string | number | boolean | null | undefined;

function quote(c: Cell): string {
  const s = c === null || c === undefined ? '' : String(c);
  // A leading = + - @ can be run as a formula by spreadsheets: neutralise it,
  // except for plain numbers like -5.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** RFC 4180 CSV with CRLF line ends. Pass `bom` for files meant to open in Excel. */
export function toCsv(rows: Cell[][], opts: { bom?: boolean } = {}): string {
  return (opts.bom ? BOM : '') + rows.map(r => r.map(quote).join(',')).join('\r\n') + (rows.length ? '\r\n' : '');
}

/**
 * Parses CSV text into rows of strings. Handles quoted cells with commas,
 * newlines and doubled quotes, CRLF or LF, a leading BOM, and skips blank lines.
 * Throws on an unterminated quote instead of silently swallowing the rest.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let started = false; // anything seen on this line

  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (started && !(row.length === 1 && row[0] === '')) {
      rows.push(row);
    }
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      started = true;
    } else if (ch === ',') {
      started = true;
      endCell();
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i++;
      }
      endRow();
    } else {
      cell += ch;
      started = true;
    }
  }
  if (inQuotes) {
    throw new Error('The file has a quote that is never closed');
  }
  if (started || cell !== '') {
    endRow();
  }
  return rows;
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface ColumnSpec {
  key: string;
  label: string;
  required: boolean;
  /** Other header names people use for the same column. */
  aliases?: string[];
}

export interface ColumnMapping {
  /** key -> column index, for the columns that were found. */
  index: Record<string, number>;
  missing: ColumnSpec[];
  /** Headers in the file that matched nothing. */
  unused: string[];
}

/** Matches a file's header row to the expected columns, ignoring case, spaces and punctuation. */
export function mapColumns(header: string[], spec: ColumnSpec[]): ColumnMapping {
  const index: Record<string, number> = {};
  const used = new Set<number>();
  for (const col of spec) {
    const names = [col.key, col.label, ...(col.aliases ?? [])].map(normalise);
    const at = header.findIndex((h, i) => !used.has(i) && names.includes(normalise(h)));
    if (at >= 0) {
      index[col.key] = at;
      used.add(at);
    }
  }
  return {
    index,
    missing: spec.filter(c => c.required && index[c.key] === undefined),
    unused: header.filter((_, i) => !used.has(i)),
  };
}
