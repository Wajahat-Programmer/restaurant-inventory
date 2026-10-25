import { parseRupees } from '../../domain/money';
import { lineFromPack } from '../../domain/purchasing';
import { parseQty } from '../../domain/units';
import { PurchaseInput } from '../../services/purchaseService';

export interface LineForm {
  itemId: number | null;
  /** 'base' or a pack name. */
  unit: string;
  qty: string;
  /** Rupees per chosen unit. */
  price: string;
}

export interface PurchaseForm {
  supplierId: number | null;
  date: string;
  lines: LineForm[];
  /** Blank means paid in full. */
  paid: string;
  note: string;
}

export interface ItemPacks {
  id: number;
  packs: { packName: string; factorToBase: number }[];
}

export const EMPTY_LINE: LineForm = { itemId: null, unit: 'base', qty: '', price: '' };

export type Built =
  | { ok: true; input: PurchaseInput; totalPaisa: number; paidPaisa: number }
  | { ok: false; error: string };

/** Turns the typed form into a service input, or a message for the owner. */
export function buildPurchase(f: PurchaseForm, items: ItemPacks[]): Built {
  if (f.supplierId === null) {
    return { ok: false, error: 'Choose a supplier' };
  }
  if (!f.lines.length) {
    return { ok: false, error: 'Add at least one item' };
  }
  const lines: PurchaseInput['lines'] = [];
  for (const [i, l] of f.lines.entries()) {
    const n = i + 1;
    const item = items.find(x => x.id === l.itemId);
    if (!item) {
      return { ok: false, error: `Line ${n}: choose an item` };
    }
    const qty = parseQty(l.qty);
    if (qty === null) {
      return { ok: false, error: `Line ${n}: enter a quantity like 2 or 1.5` };
    }
    const price = parseRupees(l.price);
    if (price === null) {
      return { ok: false, error: `Line ${n}: enter a price like 250 or 99.50` };
    }
    const factor =
      l.unit === 'base'
        ? 1
        : item.packs.find(p => p.packName === l.unit)?.factorToBase;
    if (!factor) {
      return { ok: false, error: `Line ${n}: unknown pack size` };
    }
    const { qtyBase, totalPaisa } = lineFromPack({
      packQty: qty,
      factorToBase: factor,
      packPricePaisa: price,
    });
    lines.push({ itemId: item.id, qtyBase, totalPaisa });
  }
  const totalPaisa = lines.reduce((a, l) => a + l.totalPaisa, 0);
  const paidPaisa = f.paid.trim() === '' ? totalPaisa : parseRupees(f.paid);
  if (paidPaisa === null) {
    return { ok: false, error: 'Paid must be an amount like 500 or 99.50' };
  }
  if (paidPaisa > totalPaisa) {
    return { ok: false, error: 'Paid amount is more than the total' };
  }
  return {
    ok: true,
    totalPaisa,
    paidPaisa,
    input: {
      supplierId: f.supplierId,
      date: f.date,
      lines,
      paidPaisa,
      note: f.note,
    },
  };
}
