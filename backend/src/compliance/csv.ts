import { Prisma } from '@prisma/client';

// CSV helpers for the audit exports: semicolon separated, decimal comma, German dates.
export const csvCell = (value: string | number | null | undefined): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
export const csvLine = (cells: (string | number | null | undefined)[]): string => cells.map(csvCell).join(';');
export const decimalDe = (value: Prisma.Decimal.Value | null | undefined): string =>
  value === null || value === undefined ? '' : new Prisma.Decimal(value).toDecimalPlaces(2).toFixed(2).replace('.', ',');
export const dateDe = (date: Date | null | undefined): string => {
  if (!date) return '';
  const iso = date.toISOString().slice(0, 10);
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
};
