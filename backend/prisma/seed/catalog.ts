// Block 2 test data: services and articles typical for a roofing business (several pictures on some).
import { CatalogItemKind, PrismaClient } from '@prisma/client';
import { colorFor, tileSvg, writeSeedImage } from './helpers';

const { SERVICE, ARTICLE } = CatalogItemKind;

interface SeedItem {
  kind: CatalogItemKind;
  sku: string;
  name: string;
  description?: string;
  unit: string;
  netPrice: number;
  purchasePrice?: number;
  vatRate?: number;
  imageCount: number;
}

const ITEMS: SeedItem[] = [
  { kind: SERVICE, sku: 'L-100', name: 'Dachdeckermeister, Stunde', unit: 'h', netPrice: 68, purchasePrice: 44, imageCount: 1 },
  { kind: SERVICE, sku: 'L-101', name: 'Dachdeckergeselle, Stunde', unit: 'h', netPrice: 54, purchasePrice: 36, imageCount: 1 },
  { kind: SERVICE, sku: 'L-102', name: 'Helfer, Stunde', unit: 'h', netPrice: 38, purchasePrice: 25, imageCount: 1 },
  {
    kind: SERVICE, sku: 'L-110', name: 'Neueindeckung Tonziegel inkl. Lattung', unit: 'm²', netPrice: 95, purchasePrice: 61, imageCount: 3,
    description: 'Dachfläche abdecken, Konterlattung und Lattung erneuern, Tonziegel eindecken, First und Ortgang ausbilden.',
  },
  { kind: SERVICE, sku: 'L-111', name: 'Dachrinne montieren', unit: 'm', netPrice: 28.5, purchasePrice: 17, imageCount: 2 },
  { kind: SERVICE, sku: 'L-120', name: 'Gerüststellung (Subunternehmer)', unit: 'psch', netPrice: 1450, purchasePrice: 1100, imageCount: 1 },
  { kind: SERVICE, sku: 'L-130', name: 'Dachfenster einbauen', unit: 'Stk', netPrice: 420, purchasePrice: 280, imageCount: 2 },
  { kind: ARTICLE, sku: 'A-200', name: 'Tondachziegel Falzziegel, naturrot', unit: 'Stk', netPrice: 1.45, purchasePrice: 0.92, imageCount: 2 },
  { kind: ARTICLE, sku: 'A-201', name: 'Dachlatte 30x50 mm', unit: 'm', netPrice: 1.8, purchasePrice: 1.1, imageCount: 1 },
  { kind: ARTICLE, sku: 'A-202', name: 'Unterspannbahn diffusionsoffen', unit: 'm²', netPrice: 2.6, purchasePrice: 1.5, imageCount: 1 },
  { kind: ARTICLE, sku: 'A-203', name: 'Zink-Regenrinne halbrund NW 333', unit: 'm', netPrice: 14.9, purchasePrice: 9.4, imageCount: 2 },
  { kind: ARTICLE, sku: 'A-204', name: 'Dachfenster Schwingfenster 78x118', unit: 'Stk', netPrice: 389, purchasePrice: 255, imageCount: 3 },
  { kind: ARTICLE, sku: 'A-205', name: 'Dachschrauben 4,5x50 (Pack à 200)', unit: 'Pack', netPrice: 9.9, purchasePrice: 5.8, imageCount: 1 },
];

export interface SeededCatalogItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  netPrice: number;
  vatRate: number;
}

// Returns the created entries keyed by SKU so documents can reference them.
export async function seedCatalog(prisma: PrismaClient, companyId: string): Promise<Record<string, SeededCatalogItem>> {
  const bySku: Record<string, SeededCatalogItem> = {};
  for (const { imageCount, ...item } of ITEMS) {
    const created = await prisma.catalogItem.create({ data: { ...item, companyId } });
    bySku[item.sku] = { id: created.id, sku: item.sku, name: item.name, description: created.description, unit: item.unit, netPrice: item.netPrice, vatRate: item.vatRate ?? 19 };
    for (let index = 0; index < imageCount; index++) {
      const caption = imageCount > 1 ? `${item.sku} · Bild ${index + 1}` : item.sku;
      const path = writeSeedImage('catalog', `seed-${item.sku.toLowerCase()}-${index + 1}.svg`, tileSvg(caption, colorFor(item.sku + index)));
      await prisma.catalogItemImage.create({ data: { catalogItemId: created.id, path, sortOrder: index } });
    }
  }
  return bySku;
}
