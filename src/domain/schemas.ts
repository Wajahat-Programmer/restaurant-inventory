import { z } from 'zod';
import { isValidDate } from './periods';

const trimmed = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform(v => (v ? v : undefined));

export const packSchema = z.object({
  packName: trimmed('Pack name', 30),
  factorToBase: z.number().positive('Pack size must be more than 0'),
});

export const itemInputSchema = z.object({
  name: trimmed('Name', 80),
  baseUnit: z.enum(['g', 'ml', 'pcs']),
  categoryName: optionalText(40),
  parLevel: z.number().min(0, 'Par level cannot be negative').default(0),
  reorderPoint: z.number().min(0, 'Reorder point cannot be negative').default(0),
  shelfLifeDays: z.number().int().positive().optional(),
  barcode: optionalText(40),
  packs: z.array(packSchema).default([]),
});

export const openingStockSchema = z.object({
  qtyBase: z.number().positive('Opening quantity must be more than 0'),
  valuePaisa: z.number().int().min(0),
});

export const supplierInputSchema = z.object({
  name: trimmed('Name', 80),
  phone: optionalText(30),
  openingBalancePaisa: z.number().int().min(0).default(0),
});

export type ItemInput = z.input<typeof itemInputSchema>;
export type ItemData = z.output<typeof itemInputSchema>;
export type SupplierInput = z.input<typeof supplierInputSchema>;

export const EXPENSE_CATEGORIES = ['rent', 'salaries', 'gas', 'utilities', 'maintenance', 'other'] as const;
export const PAY_METHODS = ['cash', 'bank', 'other'] as const;

export const dateSchema = z.string().refine(isValidDate, 'Date must be a real date like 2026-10-25');

export const recipeInputSchema = z.object({
  name: trimmed('Name', 80),
  sellPricePaisa: z.number().int('Price must be in whole paisa').min(0, 'Price cannot be negative'),
  lines: z
    .array(
      z.object({
        itemId: z.number().int().positive('Choose an ingredient'),
        qtyBase: z.number().positive('Each ingredient needs a quantity above 0'),
      }),
    )
    .min(1, 'Add at least one ingredient')
    .refine(ls => new Set(ls.map(l => l.itemId)).size === ls.length, 'An ingredient is listed twice'),
});

export const expenseInputSchema = z.object({
  date: dateSchema,
  category: z.enum(EXPENSE_CATEGORIES),
  amountPaisa: z.number().int('Amount must be in whole paisa').positive('Amount must be more than 0'),
  method: z.enum(PAY_METHODS).default('cash'),
  note: optionalText(200),
});

export type RecipeInput = z.input<typeof recipeInputSchema>;
export type ExpenseInput = z.input<typeof expenseInputSchema>;
