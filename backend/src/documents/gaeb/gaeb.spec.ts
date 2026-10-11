import { DocumentItemKind } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseGaeb } from './gaeb-parser';
import { buildGaebX84, GaebExportItem } from './gaeb-writer';
import { GaebError } from './gaeb-xml';

const samples = join(__dirname, '../../../../docs/gaeb-samples');
const read = (file: string) => readFileSync(join(samples, file), 'utf8');

describe('parseGaeb (X83, GAEB DA XML 3.3, nested categories)', () => {
  const parsed = parseGaeb(read('lv-dachsanierung.x83'));
  const byOz = (oz: string) => parsed.items.find((item) => item.oz === oz)!;

  it('reads meta data', () => {
    expect(parsed.version).toBe('3.3');
    expect(parsed.phase).toBe('83');
    expect(parsed.projectName).toBe('2026-117');
    expect(parsed.projectLabel).toBe('Dachsanierung Wohnanlage Gartenstraße 8–12');
    expect(parsed.warnings).toEqual([]);
  });

  it('keeps the reading order of categories and items with full Ordnungszahlen', () => {
    expect(parsed.items.map((item) => item.oz)).toEqual([
      '01', '01.0010', '01.0020',
      '02', '02.01', '02.01.0010', '02.01.0020', '02.01.0030', '02.01.0040',
      '02.02', '02.02.0010', '02.02.0020', '02.02.0030',
      '03', '03.0010', '03.0020', '03.0030',
    ]);
  });

  it('turns categories into headings (HTML entities decoded)', () => {
    expect(byOz('01').kind).toBe(DocumentItemKind.HEADING);
    expect(byOz('02.01').name).toBe('Steildach');
    expect(byOz('03').name).toBe('Zusatzleistungen & Stundenlohn');
  });

  it('reads quantity, unit (m2 -> m²) and short/long text', () => {
    const item = byOz('02.01.0010');
    expect(item).toMatchObject({ kind: DocumentItemKind.POSITION, quantity: 320, unit: 'm²', unitPrice: 0, isOptional: false });
    expect(item.name).toBe('Alte Dacheindeckung abbrechen');
    expect(item.description).toContain('Betondachsteine');
  });

  it('joins several paragraphs of a long text with line breaks and decodes entities', () => {
    expect(byOz('02.01.0040').description).toBe(
      'Falzziegel, naturrot, Deckung nach Herstellervorschrift.\nSturmklammern an Traufe, Ortgang und First. Material & Montage einschließlich Verschnitt.',
    );
  });

  it('handles lump sum, Bedarfs-, Alternativ- and text items', () => {
    expect(byOz('01.0010')).toMatchObject({ kind: DocumentItemKind.POSITION, quantity: 1, unit: 'psch' });
    expect(byOz('02.02.0030').isOptional).toBe(true); // Provis = Bedarfsposition
    expect(byOz('03.0010').isOptional).toBe(true); // ALNGroupNo = Alternativposition
    expect(byOz('03.0020').kind).toBe(DocumentItemKind.TEXT);
    expect(byOz('03.0030')).toMatchObject({ quantity: 16, unit: 'h', isOptional: false });
  });
});

describe('parseGaeb (X81, GAEB DA XML 3.2, flat list, no short text)', () => {
  const parsed = parseGaeb(read('lv-einfach-3.2.x81'));

  it('reads a flat item list with numeric RNoPart', () => {
    expect(parsed.version).toBe('3.2');
    expect(parsed.items.map((item) => item.oz)).toEqual(['1', '2', '3']);
    expect(parsed.items.every((item) => item.kind === DocumentItemKind.POSITION)).toBe(true);
  });

  it('joins spans inline and keeps paragraphs', () => {
    expect(parsed.items[0].description).toBe('Trapezblech-Dacheindeckung liefern und montieren.\nBlech 0,75 mm, Farbe anthrazit, inkl. Befestigungsmaterial.');
    expect(parsed.items[0].name).toBe('Trapezblech-Dach');
  });

  it('derives the name from the long text when there is no short text', () => {
    expect(parsed.items[2].name).toBe('Dachentwässerung komplett: Rinne, Rinnenhalter, Fallrohr mit Wasserfangkasten.');
    expect(parsed.items[2].description).toBeUndefined();
    expect(parsed.items[2].unit).toBe('Stk');
  });
});

describe('parseGaeb errors and variants', () => {
  it('rejects text that is not XML', () => {
    expect(() => parseGaeb('das ist kein xml <<<')).toThrow(GaebError);
  });

  it('rejects XML that is not GAEB', () => {
    expect(() => parseGaeb('<?xml version="1.0"?><html><body/></html>')).toThrow(/Keine GAEB/);
  });

  it('rejects a file without positions', () => {
    const empty = '<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3"><Award><DP>83</DP><BoQ><BoQBody><BoQCtgy RNoPart="01"><LblTx><p><span>Leer</span></p></LblTx><BoQBody><Itemlist/></BoQBody></BoQCtgy></BoQBody></BoQ></Award></GAEB>';
    expect(() => parseGaeb(empty)).toThrow(/keine Positionen/);
  });

  it('accepts namespace prefixes and decimal commas', () => {
    const xml = '<g:GAEB xmlns:g="http://www.gaeb.de/GAEB_DA_XML/DA84/3.3"><g:Award><g:DP>84</g:DP><g:BoQ><g:BoQBody><g:Itemlist><g:Item RNoPart="10"><g:Qty>2,5</g:Qty><g:QU>m3</g:QU><g:UP>12,50</g:UP><g:Description><g:CompleteText><g:OutlineText><g:OutlTxt><g:TextOutlTxt><g:span>Beton</g:span></g:TextOutlTxt></g:OutlTxt></g:OutlineText></g:CompleteText></g:Description></g:Item></g:Itemlist></g:BoQBody></g:BoQ></g:Award></g:GAEB>';
    const item = parseGaeb(xml).items[0];
    expect(item).toMatchObject({ name: 'Beton', quantity: 2.5, unit: 'm³', unitPrice: 12.5, oz: '10' });
  });

  it('warns about skipped surcharge items', () => {
    const xml = '<GAEB><Award><BoQ><BoQBody><Itemlist><Item RNoPart="1"><Qty>1</Qty><QU>Stk</QU></Item><MarkupItem/></Itemlist></BoQBody></BoQ></Award></GAEB>';
    expect(parseGaeb(xml).warnings).toEqual(['1 Zuschlagspositionen (Zulagen) wurden nicht übernommen.']);
  });
});

describe('buildGaebX84', () => {
  const item = (overrides: Partial<GaebExportItem>): GaebExportItem => ({
    kind: DocumentItemKind.POSITION, oz: null, name: 'Pos', description: null, quantity: 1, unit: 'Stk',
    unitPrice: 0, discountPercent: 0, lineTotal: 0, isOptional: false, ...overrides,
  });
  const input = (items: GaebExportItem[]) => ({
    projectNumber: 'P-0001', projectName: 'Test & Co', boqLabel: 'Angebot', items, now: new Date('2026-10-11T12:30:45Z'),
  });

  it('writes the X84 envelope with escaped text', () => {
    const xml = buildGaebX84(input([item({ name: 'Ziegel <A> & B' })]));
    expect(xml).toContain('xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.3"');
    expect(xml).toContain('<DP>84</DP>');
    expect(xml).toContain('<Date>2026-10-11</Date><Time>12:30:45</Time>');
    expect(xml).toContain('<LblPrj>Test &amp; Co</LblPrj>');
    expect(xml).toContain('Ziegel &lt;A&gt; &amp; B');
  });

  it('generates numbers when lines have no Ordnungszahl', () => {
    const xml = buildGaebX84(input([
      item({ name: 'Ohne Titel' }),
      item({ kind: DocumentItemKind.HEADING, name: 'Dach' }),
      item({ name: 'Eindeckung', unit: 'm²', quantity: 10, unitPrice: 20, lineTotal: 200 }),
    ]));
    const parsed = parseGaeb(xml);
    expect(parsed.items.map((entry) => entry.oz)).toEqual(['01', '01.0010', '02', '02.0010']);
    expect(xml).toContain('<QU>m2</QU>');
  });

  it('round-trips an imported bill of quantities with its original numbering and adds prices', () => {
    const imported = parseGaeb(read('lv-dachsanierung.x83'));
    const items = imported.items.map((entry, index) =>
      item({
        kind: entry.kind, oz: entry.oz, name: entry.name, description: entry.description ?? null, quantity: entry.quantity,
        unit: entry.unit, isOptional: entry.isOptional,
        unitPrice: entry.kind === DocumentItemKind.POSITION ? 10 + index : 0,
        lineTotal: entry.kind === DocumentItemKind.POSITION ? Math.round(entry.quantity * (10 + index) * 100) / 100 : 0,
      }),
    );
    const exported = parseGaeb(buildGaebX84(input(items)));

    expect(exported.phase).toBe('84');
    expect(exported.items.map((entry) => entry.oz)).toEqual(imported.items.map((entry) => entry.oz));
    expect(exported.items.map((entry) => entry.kind)).toEqual(imported.items.map((entry) => entry.kind));
    expect(exported.items.map((entry) => entry.name)).toEqual(imported.items.map((entry) => entry.name));
    expect(exported.items.map((entry) => entry.isOptional)).toEqual(imported.items.map((entry) => entry.isOptional));
    expect(exported.items.find((entry) => entry.oz === '02.01.0010')).toMatchObject({ quantity: 320, unit: 'm²', unitPrice: 10 + 5 });
    expect(exported.items.find((entry) => entry.oz === '02.01.0040')!.description).toContain('Sturmklammern');
  });

  it('folds the item discount into the unit price and omits the total of optional items', () => {
    const xml = buildGaebX84(input([
      item({ quantity: 2, unitPrice: 100, discountPercent: 10, lineTotal: 180 }),
      item({ name: 'Opt', quantity: 1, unitPrice: 50, lineTotal: 50, isOptional: true }),
    ]));
    expect(xml).toContain('<UP>90.00</UP><IT>180.00</IT>');
    expect(xml).toContain('<Provis>WithoutTotal</Provis><Qty>1.000</Qty><QU>Stk</QU><UP>50.00</UP><Description>');
  });
});
