import { DocumentItemKind } from '@prisma/client';

// A document line as needed for the export (numbers already converted from Decimal).
export interface GaebExportItem {
  kind: DocumentItemKind;
  oz: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPercent: number;
  lineTotal: number;
  isOptional: boolean;
}

export interface GaebExportInput {
  projectNumber: string;
  projectName: string;
  boqLabel: string; // e.g. the document subject
  items: GaebExportItem[];
  now?: Date;
}

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The app uses typographic units, GAEB files conventionally use ASCII.
const unitOut = (unit: string) => unit.replace('²', '2').replace('³', '3');

// A category (Titel) of the bill of quantities; leaves are items.
interface Category {
  rno: string;
  label: string;
  categories: Category[];
  items: { rno: string; item: GaebExportItem }[];
}

const newCategory = (rno: string, label = ''): Category => ({ rno, label, categories: [], items: [] });

// Builds the category tree. If every line carries its original Ordnungszahl (imported from a GAEB
// file) the original hierarchy is reproduced, so the priced offer refers to the same numbers as the
// bill of quantities we received. Otherwise numbers are generated: titles 01, 02, ..., positions
// 0010, 0020, ... (positions before the first title go into a "Positionen" category).
function buildTree(items: GaebExportItem[]): Category {
  const root = newCategory('');
  const useOriginal = items.length > 0 && items.every((item) => !!item.oz);

  if (useOriginal) {
    const ensure = (parts: string[]): Category =>
      parts.reduce((current, part) => {
        let next = current.categories.find((category) => category.rno === part);
        if (!next) {
          next = newCategory(part);
          current.categories.push(next);
        }
        return next;
      }, root);

    for (const item of items) {
      const parts = item.oz!.split('.');
      if (item.kind === DocumentItemKind.HEADING) {
        ensure(parts).label = item.name;
      } else {
        ensure(parts.slice(0, -1)).items.push({ rno: parts[parts.length - 1], item });
      }
    }
  } else {
    let current: Category | null = null;
    let categoryCount = 0;
    for (const item of items) {
      if (item.kind === DocumentItemKind.HEADING) {
        categoryCount++;
        current = newCategory(String(categoryCount).padStart(2, '0'), item.name);
        root.categories.push(current);
      } else {
        if (!current) {
          categoryCount++;
          current = newCategory(String(categoryCount).padStart(2, '0'), 'Positionen');
          root.categories.push(current);
        }
        current.items.push({ rno: String((current.items.length + 1) * 10).padStart(4, '0'), item });
      }
    }
  }
  return root;
}

// A BoQBody may contain categories OR an item list, never both. Mixed levels (possible with
// original numbering) get their items moved into a "Positionen" sub-category.
function normalize(category: Category) {
  if (category.categories.length > 0 && category.items.length > 0) {
    const holder = newCategory('00', 'Positionen');
    holder.items = category.items;
    category.items = [];
    category.categories.unshift(holder);
  }
  category.categories.forEach(normalize);
}

function depthLengths(category: Category, depth: number, lengths: number[]) {
  for (const sub of category.categories) {
    lengths[depth] = Math.max(lengths[depth] ?? 0, sub.rno.length);
    depthLengths(sub, depth + 1, lengths);
  }
}

const richText = (text: string) =>
  text
    .split('\n')
    .map((line) => `<p><span>${escapeXml(line)}</span></p>`)
    .join('');

const money = (value: number) => value.toFixed(2);

function itemXml(rno: string, item: GaebExportItem, id: number): string {
  const head = `<Item ID="ID${id}" RNoPart="${escapeXml(rno)}">`;
  const outline = `<OutlineText><OutlTxt><TextOutlTxt><span>${escapeXml(item.name)}</span></TextOutlTxt></OutlTxt></OutlineText>`;
  const detail = `<DetailTxt><Text>${richText(item.description || item.name)}</Text></DetailTxt>`;
  const description = `<Description><CompleteText>${detail}${outline}</CompleteText></Description>`;

  if (item.kind === DocumentItemKind.TEXT) {
    return `${head}${description}</Item>`;
  }

  // Discounts are folded into the unit price (X84 has no per-item discount field).
  const unitPrice = (item.unitPrice * (100 - item.discountPercent)) / 100;
  return (
    head +
    // Bedarfs-/Alternativposition: unit price only, not part of the total.
    (item.isOptional ? '<Provis>WithoutTotal</Provis>' : '') +
    `<Qty>${item.quantity.toFixed(3)}</Qty>` +
    `<QU>${escapeXml(unitOut(item.unit))}</QU>` +
    `<UP>${money(unitPrice)}</UP>` +
    (item.isOptional ? '' : `<IT>${money(item.lineTotal)}</IT>`) +
    description +
    '</Item>'
  );
}

function categoryXml(category: Category, counter: { id: number }): string {
  const inner =
    category.categories.length > 0
      ? category.categories.map((sub) => categoryXml(sub, counter)).join('')
      : `<Itemlist>${category.items.map(({ rno, item }) => itemXml(rno, item, ++counter.id)).join('')}</Itemlist>`;
  return `<BoQCtgy ID="ID${++counter.id}" RNoPart="${escapeXml(category.rno)}"><LblTx>${richText(category.label)}</LblTx><BoQBody>${inner}</BoQBody></BoQCtgy>`;
}

// Builds a GAEB DA XML 3.3 file, phase X84 (Angebotsabgabe: bill of quantities with prices).
// Written to the best of our knowledge; not validated against the official GAEB schema.
export function buildGaebX84(input: GaebExportInput): string {
  const root = buildTree(input.items);
  normalize(root);

  const lengths: number[] = [];
  depthLengths(root, 0, lengths);
  const leafLength = Math.max(
    4,
    ...flattenItems(root).map((entry) => entry.rno.length),
  );
  const levels = lengths.map((length) => `<BoQBkdn><Type>BoQLevel</Type><Length>${length}</Length><Num>Yes</Num></BoQBkdn>`).join('');

  const counter = { id: 0 };
  const body =
    root.categories.length > 0
      ? root.categories.map((category) => categoryXml(category, counter)).join('')
      : `<Itemlist>${root.items.map(({ rno, item }) => itemXml(rno, item, ++counter.id)).join('')}</Itemlist>`;

  const now = input.now ?? new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19);

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.3">' +
    `<GAEBInfo><Version>3.3</Version><VersDate>2021-05</VersDate><Date>${date}</Date><Time>${time}</Time>` +
    '<ProgSystem>Meisterwerk</ProgSystem><ProgName>Meisterwerk</ProgName></GAEBInfo>' +
    `<PrjInfo><NamePrj>${escapeXml(input.projectNumber)}</NamePrj><LblPrj>${escapeXml(input.projectName)}</LblPrj><Cur>EUR</Cur><CurLbl>Euro</CurLbl></PrjInfo>` +
    '<Award><DP>84</DP><AwardInfo><Cur>EUR</Cur><CurLbl>Euro</CurLbl></AwardInfo>' +
    `<BoQ ID="ID0"><BoQInfo><Name>LV</Name><LblBoQ>${escapeXml(input.boqLabel)}</LblBoQ>${levels}<BoQBkdn><Type>Item</Type><Length>${leafLength}</Length><Num>Yes</Num></BoQBkdn></BoQInfo>` +
    `<BoQBody>${body}</BoQBody></BoQ></Award></GAEB>\n`
  );
}

function flattenItems(category: Category): { rno: string }[] {
  return [...category.items, ...category.categories.flatMap(flattenItems)];
}
