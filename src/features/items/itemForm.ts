import { z } from 'zod';
import { parseRupees } from '../../domain/money';
import { ItemInput } from '../../domain/schemas';
import { parseQty } from '../../domain/units';

const qty = (label: string, opts: { allowZero?: boolean } = {}) =>
  z
    .string()
    .trim()
    .refine(v => v === '' || parseQty(v, opts) !== null, {
      message: `${label} must be a number like 2 or 1.5`,
    });

const money = (label: string) =>
  z
    .string()
    .trim()
    .refine(v => v === '' || parseRupees(v) !== null, {
      message: `${label} must be an amount like 250 or 99.50`,
    });

/** Everything the form holds is text; this validates it before conversion. */
export const itemFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80, 'Name is too long'),
    baseUnit: z.enum(['g', 'ml', 'pcs']),
    categoryName: z.string().trim().max(40, 'Category is too long'),
    parLevel: qty('Par level', { allowZero: true }),
    reorderPoint: qty('Reorder point', { allowZero: true }),
    shelfLifeDays: z
      .string()
      .trim()
      .refine(v => v === '' || /^[1-9]\d{0,4}$/.test(v), {
        message: 'Shelf life must be a whole number of days',
      }),
    barcode: z.string().trim().max(40, 'Barcode is too long'),
    packs: z.array(
      z.object({
        packName: z.string().trim().max(30, 'Pack name is too long'),
        size: qty('Pack size'),
      }),
    ),
    openingQty: qty('Opening quantity'),
    openingValue: money('Opening value'),
  })
  .superRefine((v, ctx) => {
    v.packs.forEach((p, i) => {
      if ((p.packName === '') !== (p.size === '')) {
        ctx.addIssue({
          code: 'custom',
          path: ['packs', i, p.packName === '' ? 'packName' : 'size'],
          message: 'Fill both the pack name and its size',
        });
      }
    });
    if (v.openingQty !== '' && v.openingValue === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['openingValue'],
        message: 'Enter what the opening stock cost (0 if unknown)',
      });
    }
    if (v.openingValue !== '' && v.openingQty === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['openingQty'],
        message: 'Enter the opening quantity',
      });
    }
  });

export type ItemFormValues = z.input<typeof itemFormSchema>;

export const EMPTY_ITEM_FORM: ItemFormValues = {
  name: '',
  baseUnit: 'g',
  categoryName: '',
  parLevel: '',
  reorderPoint: '',
  shelfLifeDays: '',
  barcode: '',
  packs: [],
  openingQty: '',
  openingValue: '',
};

/** Converts validated form text to the service input. */
export function toItemInput(v: ItemFormValues): {
  input: ItemInput;
  opening?: { qtyBase: number; valuePaisa: number };
} {
  const n = (s: string) => (s === '' ? 0 : Number(s));
  return {
    input: {
      name: v.name,
      baseUnit: v.baseUnit,
      categoryName: v.categoryName || undefined,
      parLevel: n(v.parLevel),
      reorderPoint: n(v.reorderPoint),
      shelfLifeDays: v.shelfLifeDays ? Number(v.shelfLifeDays) : undefined,
      barcode: v.barcode || undefined,
      packs: v.packs
        .filter(p => p.packName !== '')
        .map(p => ({ packName: p.packName, factorToBase: Number(p.size) })),
    },
    opening:
      v.openingQty !== ''
        ? {
            qtyBase: Number(v.openingQty),
            valuePaisa: parseRupees(v.openingValue) ?? 0,
          }
        : undefined,
  };
}
