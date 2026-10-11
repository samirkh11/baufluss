import { DocumentItemKind } from '@prisma/client';
import { child, cleanText, elements, GaebError, parseXml, path, XmlNode } from './gaeb-xml';

// One line of an imported bill of quantities (Leistungsverzeichnis).
export interface ParsedGaebItem {
  kind: DocumentItemKind;
  oz: string; // Ordnungszahl, e.g. "02.01.0030"
  name: string; // Kurztext
  description?: string; // Langtext
  quantity: number;
  unit: string;
  unitPrice: number;
  isOptional: boolean; // Bedarfs-/Alternativposition
}

export interface ParsedGaeb {
  version: string | null; // e.g. "3.3"
  phase: string | null; // e.g. "83" (Leistungsverzeichnis), "84" (Angebot)
  projectName: string | null;
  projectLabel: string | null;
  items: ParsedGaebItem[];
  warnings: string[];
}

// GAEB writes square/cubic metres as "m2"/"m3"; the app uses the typographic units.
const UNIT_IN: Record<string, string> = { m2: 'm²', qm: 'm²', m3: 'm³', cbm: 'm³' };

const MAX_NAME_LENGTH = 150;

function parseNumber(text: string): number | null {
  const value = Number.parseFloat(text.replace(',', '.').trim());
  return Number.isFinite(value) ? value : null;
}

// Alternative positions are marked by ALN* elements or attributes depending on the file version.
function isAlternative(item: XmlNode): boolean {
  const names = ['ALNGroupNo', 'ALNSerNo', 'ALNBidd'];
  return names.some((name) => child(item, name) !== undefined || item.attrs[name] !== undefined);
}

function parseItem(item: XmlNode, ozPath: string[]): ParsedGaebItem {
  const oz = [...ozPath, item.attrs.RNoPart ?? ''].filter(Boolean).join('.');

  const complete = path(item, 'Description', 'CompleteText');
  const outline = cleanText(path(complete, 'OutlineText', 'OutlTxt', 'TextOutlTxt'));
  const detail = cleanText(path(complete, 'DetailTxt'));

  // Kurztext is optional in GAEB; without it the first line of the Langtext becomes the name.
  let name = outline;
  let description: string | undefined = detail || undefined;
  if (!name && detail) {
    const lines = detail.split('\n');
    if (lines[0].length <= MAX_NAME_LENGTH) {
      name = lines[0];
      description = lines.slice(1).join('\n').trim() || undefined;
    } else {
      name = lines[0].slice(0, MAX_NAME_LENGTH - 1) + '…';
    }
  }

  const quantityText = cleanText(child(item, 'Qty'));
  const unitText = cleanText(child(item, 'QU'));
  const lumpSum = child(item, 'LumpSumItem') !== undefined;
  // An item without quantity and unit is an explanatory text (Hinweis), not a priced position.
  const kind = quantityText === '' && unitText === '' && !lumpSum ? DocumentItemKind.TEXT : DocumentItemKind.POSITION;

  return {
    kind,
    oz,
    name: name || '(ohne Bezeichnung)',
    description,
    quantity: parseNumber(quantityText) ?? 1,
    unit: lumpSum && !unitText ? 'psch' : (UNIT_IN[unitText.toLowerCase()] ?? (unitText || 'Stk')),
    unitPrice: parseNumber(cleanText(child(item, 'UP'))) ?? 0,
    isOptional: child(item, 'Provis') !== undefined || isAlternative(item),
  };
}

// Parses a GAEB DA XML file (versions 3.x, any phase with a bill of quantities: X81, X83, X84, X86 …)
// into a flat list of headings, positions and texts. Nested categories become headings in reading
// order; their full Ordnungszahl is kept so exports can refer to the original numbering.
export function parseGaeb(xml: string): ParsedGaeb {
  const root = parseXml(xml).find((node) => node.name === 'GAEB');
  if (!root) {
    throw new GaebError('Keine GAEB-DA-XML-Datei. (Das alte GAEB-90-Format .d83 wird nicht unterstützt.)');
  }
  const award = child(root, 'Award');
  const boq = child(award, 'BoQ');
  if (!boq) {
    throw new GaebError('Die GAEB-Datei enthält kein Leistungsverzeichnis.');
  }

  const items: ParsedGaebItem[] = [];
  const warnings: string[] = [];
  let skippedMarkups = 0;

  const walk = (body: XmlNode | undefined, ozPath: string[]) => {
    for (const node of elements(body)) {
      if (node.name === 'BoQCtgy') {
        const categoryPath = [...ozPath, node.attrs.RNoPart ?? ''];
        items.push({
          kind: DocumentItemKind.HEADING,
          oz: categoryPath.filter(Boolean).join('.'),
          name: cleanText(child(node, 'LblTx')) || '(ohne Titel)',
          quantity: 1,
          unit: 'Stk',
          unitPrice: 0,
          isOptional: false,
        });
        walk(child(node, 'BoQBody'), categoryPath);
      } else if (node.name === 'Itemlist') {
        for (const entry of elements(node)) {
          if (entry.name === 'Item') {
            items.push(parseItem(entry, ozPath));
          } else if (entry.name === 'MarkupItem') {
            skippedMarkups++;
          }
        }
      }
    }
  };
  walk(child(boq, 'BoQBody'), []);

  if (skippedMarkups > 0) {
    warnings.push(`${skippedMarkups} Zuschlagspositionen (Zulagen) wurden nicht übernommen.`);
  }
  if (!items.some((item) => item.kind === DocumentItemKind.POSITION)) {
    throw new GaebError('Die GAEB-Datei enthält keine Positionen.');
  }

  const info = child(root, 'GAEBInfo');
  const project = child(root, 'PrjInfo');
  return {
    version: cleanText(child(info, 'Version')) || null,
    phase: cleanText(child(award, 'DP')) || null,
    projectName: cleanText(child(project, 'NamePrj')) || null,
    projectLabel: cleanText(child(project, 'LblPrj')) || null,
    items,
    warnings,
  };
}
