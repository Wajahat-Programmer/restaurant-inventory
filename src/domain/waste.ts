import { Paisa } from './money';
import { BaseUnit } from './units';

export interface WasteRow {
  item: string;
  baseUnit: BaseUnit;
  qtyBase: number;
  valuePaisa: Paisa;
  reason: string | null;
}

export interface WasteGroup {
  label: string;
  /** How many times something was thrown away. */
  count: number;
  valuePaisa: Paisa;
  /** Share of all wastage by value, 0 to 100 (one decimal). */
  sharePct: number;
  /** Quantity, only for items (one unit per item). */
  qtyBase: number;
  baseUnit: BaseUnit | null;
}

export interface WasteBreakdown {
  byReason: WasteGroup[];
  byItem: WasteGroup[];
}

function group(rows: WasteRow[], key: (r: WasteRow) => string, withQty: boolean): WasteGroup[] {
  const total = rows.reduce((a, r) => a + r.valuePaisa, 0);
  const map = new Map<string, WasteGroup>();
  for (const r of rows) {
    const label = key(r);
    const g = map.get(label) ?? { label, count: 0, valuePaisa: 0, sharePct: 0, qtyBase: 0, baseUnit: withQty ? r.baseUnit : null };
    g.count += 1;
    g.valuePaisa += r.valuePaisa;
    g.qtyBase += withQty ? r.qtyBase : 0;
    map.set(label, g);
  }
  return [...map.values()]
    .map(g => ({ ...g, sharePct: total > 0 ? Math.round((g.valuePaisa / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.valuePaisa - a.valuePaisa || a.label.localeCompare(b.label));
}

/** Where the money thrown away went: by reason and by item, biggest first. */
export function wasteBreakdown(rows: WasteRow[]): WasteBreakdown {
  return {
    byReason: group(rows, r => r.reason ?? 'No reason given', false),
    byItem: group(rows, r => r.item, true),
  };
}
