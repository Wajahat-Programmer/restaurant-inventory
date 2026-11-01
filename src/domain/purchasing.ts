import { assertPaisa, Paisa } from './money';
import { toBase } from './units';

export type PaymentStatus = 'PAID' | 'PARTIAL' | 'CREDIT';

export interface PackLineInput {
  packQty: number;
  factorToBase: number;
  /** Price of one pack. */
  packPricePaisa: Paisa;
}

/** One purchase line in base units; the total is the exact cost of the line. */
export function lineFromPack(l: PackLineInput): {
  qtyBase: number;
  totalPaisa: Paisa;
} {
  if (!(l.packQty > 0) || !(l.factorToBase > 0)) {
    throw new RangeError('Pack quantity and factor must be positive');
  }
  assertPaisa(l.packPricePaisa);
  if (l.packPricePaisa < 0) {
    throw new RangeError('Price cannot be negative');
  }
  return {
    qtyBase: toBase(l.packQty, l.factorToBase),
    totalPaisa: Math.round(l.packQty * l.packPricePaisa),
  };
}

export function paymentStatus(total: Paisa, paid: Paisa): PaymentStatus {
  if (paid < 0 || paid > total) {
    throw new RangeError('Paid must be between 0 and the total');
  }
  if (paid === total) {
    return 'PAID';
  }
  return paid === 0 ? 'CREDIT' : 'PARTIAL';
}

/** What we still owe a supplier. Never negative: overpayment is rejected upstream. */
export function supplierDue(args: {
  openingBalancePaisa: Paisa;
  purchasesTotalPaisa: Paisa;
  paidPaisa: Paisa;
}): Paisa {
  return args.openingBalancePaisa + args.purchasesTotalPaisa - args.paidPaisa;
}

/** Price per base unit for comparison across suppliers (float, display only). */
export function pricePerBase(totalPaisa: Paisa, qtyBase: number): number {
  return qtyBase > 0 ? totalPaisa / qtyBase : 0;
}

export interface SettleInput {
  id: number;
  date: string;
  totalPaisa: Paisa;
  /** Paid when the purchase was recorded. */
  paidPaisa: Paisa;
  /** Later payments made against this purchase on purpose. */
  tiedPaisa: Paisa;
}

/**
 * How much of each purchase is settled now. Payments to a supplier that are not
 * tied to one purchase pay the oldest debt first: the supplier's opening
 * balance, then purchases from the oldest. This keeps the purchase list in
 * step with what the supplier screen says is owed.
 */
export function settle(
  purchases: SettleInput[],
  openingBalancePaisa: Paisa,
  generalPaymentsPaisa: Paisa,
): Map<number, Paisa> {
  let pool = Math.max(0, generalPaymentsPaisa - openingBalancePaisa);
  const out = new Map<number, Paisa>();
  const ordered = [...purchases].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
  for (const p of ordered) {
    const own = Math.min(p.totalPaisa, p.paidPaisa + p.tiedPaisa);
    const give = Math.min(pool, p.totalPaisa - own);
    pool -= give;
    out.set(p.id, own + give);
  }
  return out;
}
