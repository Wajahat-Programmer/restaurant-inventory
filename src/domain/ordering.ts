import { BaseUnit, formatQty } from './units';

/** The last price one supplier charged for one item. */
export interface SupplierPrice {
  supplierId: number;
  supplierName: string;
  /** Paisa per base unit. */
  pricePerBase: number;
  date: string;
  id: number;
}

export interface WantedItem {
  itemId: number;
  name: string;
  baseUnit: BaseUnit;
  /** What to order, in base units. */
  qty: number;
}

export interface OrderLine extends WantedItem {
  /** Estimated cost in paisa, or null when no price is known. */
  estimatePaisa: number | null;
  /** Another supplier that charged clearly less last time. */
  cheaperAt: { supplierName: string; savePct: number } | null;
}

export interface SupplierOrder {
  /** Null for the items nobody has been bought from yet. */
  supplierId: number | null;
  supplierName: string;
  lines: OrderLine[];
  /** Sum of the known estimates, in paisa. */
  estimatePaisa: number;
  /** How many lines have no price, so the estimate is a minimum. */
  unpriced: number;
}

/**
 * Who to order an item from: whoever supplied it most recently (the usual
 * supplier), and whether another supplier was clearly cheaper last time.
 */
export function pickSupplier(prices: SupplierPrice[], cheaperBy = 0.1): { chosen: SupplierPrice | null; cheaper: SupplierPrice | null } {
  if (!prices.length) {
    return { chosen: null, cheaper: null };
  }
  const chosen = [...prices].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))[0];
  const cheaper =
    [...prices]
      .filter(p => p.supplierId !== chosen.supplierId && p.pricePerBase <= chosen.pricePerBase * (1 - cheaperBy))
      .sort((a, b) => a.pricePerBase - b.pricePerBase)[0] ?? null;
  return { chosen, cheaper };
}

/** Splits what to order into one list per supplier, suppliers A to Z, the unknown last. */
export function groupBySupplier(wanted: WantedItem[], pricesByItem: Map<number, SupplierPrice[]>): SupplierOrder[] {
  const groups = new Map<number | null, SupplierOrder>();
  for (const w of wanted) {
    const { chosen, cheaper } = pickSupplier(pricesByItem.get(w.itemId) ?? []);
    const key = chosen?.supplierId ?? null;
    const group =
      groups.get(key) ??
      ({ supplierId: key, supplierName: chosen?.supplierName ?? 'No supplier yet', lines: [], estimatePaisa: 0, unpriced: 0 } as SupplierOrder);
    const estimatePaisa = chosen ? Math.round(chosen.pricePerBase * w.qty) : null;
    group.lines.push({
      ...w,
      estimatePaisa,
      cheaperAt: chosen && cheaper ? { supplierName: cheaper.supplierName, savePct: Math.round((1 - cheaper.pricePerBase / chosen.pricePerBase) * 100) } : null,
    });
    group.estimatePaisa += estimatePaisa ?? 0;
    group.unpriced += estimatePaisa === null ? 1 : 0;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.supplierId === null ? 1 : b.supplierId === null ? -1 : a.supplierName.localeCompare(b.supplierName),
  );
}

/** The text sent to one supplier. No prices: the supplier says what they charge. */
export function orderMessage(order: SupplierOrder, dateLabel: string): string {
  if (!order.lines.length) {
    return '';
  }
  const to = order.supplierId === null ? 'Order' : `Order for ${order.supplierName}`;
  return [
    `${to}, ${dateLabel}`,
    ...order.lines.map(l => `- ${l.name}: ${formatQty(l.qty, l.baseUnit)}`),
    'Please confirm what is available and the price.',
  ].join('\n');
}
