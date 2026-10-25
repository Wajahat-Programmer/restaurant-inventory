import { z } from 'zod';

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
