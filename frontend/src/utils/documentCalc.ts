import { DocumentItemKind } from '../types';

// Client-side preview of the server's calculation (backend/src/documents/calculations.ts, which is
// authoritative: totals are recalculated on save). Uses a tiny epsilon so half-cent cases round up
// like the server's decimal arithmetic.
export interface EditorLine {
  kind: DocumentItemKind;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  discountPercent: number;
  isOptional: boolean;
}

const roundCents = (value: number) => Math.round(value * 100 + 1e-7) / 100;

export function lineTotal(line: EditorLine): number {
  if (line.kind !== 'POSITION') {
    return 0;
  }
  return roundCents((line.quantity * line.unitPrice * (100 - line.discountPercent)) / 100);
}

export function calculateTotals(lines: EditorLine[]) {
  const netByRate = new Map<number, number>();
  for (const line of lines) {
    if (line.kind === 'POSITION' && !line.isOptional) {
      netByRate.set(line.vatRate, (netByRate.get(line.vatRate) ?? 0) + lineTotal(line));
    }
  }
  const vatGroups = [...netByRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([vatRate, net]) => ({ vatRate, net: roundCents(net), vat: roundCents((net * vatRate) / 100) }));
  const net = vatGroups.reduce((sum, group) => sum + group.net, 0);
  const vat = vatGroups.reduce((sum, group) => sum + group.vat, 0);
  return { net: roundCents(net), vat: roundCents(vat), gross: roundCents(net + vat), vatGroups };
}

// Same numbering as the PDF: headings 1, 2, ...; positions below a heading 1.1, 1.2, ...
export function buildOrdinals(kinds: DocumentItemKind[]): (string | null)[] {
  let heading = 0;
  let position = 0;
  return kinds.map((kind) => {
    if (kind === 'HEADING') {
      heading++;
      position = 0;
      return String(heading);
    }
    if (kind === 'POSITION') {
      position++;
      return heading > 0 ? `${heading}.${position}` : String(position);
    }
    return null;
  });
}
