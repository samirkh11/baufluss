import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DocumentsService } from '../documents.service';
import { DocumentItemDto } from '../dto/document-item.dto';
import { parseGaeb } from './gaeb-parser';
import { buildGaebX84 } from './gaeb-writer';
import { GaebError } from './gaeb-xml';

// Protects the server from absurdly large files; real bills of quantities have a few hundred lines.
const MAX_ITEMS = 5000;

// GAEB DA XML is UTF-8, but some tools write Windows-1252/ISO-8859-1 and say so in the XML
// declaration. Honour that, otherwise umlauts would be garbled.
function decode(buffer: Buffer): string {
  const head = buffer.subarray(0, 200).toString('latin1');
  const declared = /encoding\s*=\s*["']([^"']+)["']/i.exec(head)?.[1]?.toLowerCase();
  const text = new TextDecoder(declared && /1252|8859-1|latin/.test(declared) ? 'windows-1252' : 'utf-8').decode(buffer);
  return text.replace(/^﻿/, '');
}

@Injectable()
export class GaebService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
  ) {}

  // Creates a quote draft in the project from a GAEB bill of quantities (X81/X83/X84/X86 …).
  // Prices are taken over when the file contains them, otherwise they stay 0 and are filled in
  // in the editor.
  async importAsQuote(companyId: string, projectId: string, file: Buffer) {
    let parsed;
    try {
      parsed = parseGaeb(decode(file));
    } catch (error) {
      if (error instanceof GaebError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    if (parsed.items.length > MAX_ITEMS) {
      throw new BadRequestException(`Die Datei enthält mehr als ${MAX_ITEMS} Zeilen.`);
    }

    const items: DocumentItemDto[] = parsed.items.map((item) => ({
      kind: item.kind,
      oz: item.oz || undefined,
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      vatRate: 19,
      isOptional: item.isOptional,
    }));
    const document = await this.documents.create(companyId, projectId, {
      type: DocumentType.QUOTE,
      subject: parsed.projectLabel ?? undefined,
      items,
    });
    return {
      document,
      warnings: parsed.warnings,
      source: { version: parsed.version, phase: parsed.phase, name: parsed.projectName },
    };
  }

  // GAEB X84 (Angebotsabgabe) of a quote, incl. prices. Imported lines keep their original numbers.
  async exportQuote(companyId: string, id: string): Promise<{ xml: string; filename: string }> {
    const document = await this.prisma.document.findFirst({
      where: { id, companyId },
      include: { project: true, items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!document) {
      throw new NotFoundException();
    }
    if (document.type !== DocumentType.QUOTE) {
      throw new BadRequestException('Der GAEB-Export ist nur für Angebote verfügbar.');
    }
    if (document.items.length === 0) {
      throw new BadRequestException('Das Angebot enthält keine Positionen.');
    }

    const xml = buildGaebX84({
      projectNumber: document.project.number,
      projectName: document.project.name,
      boqLabel: document.subject ?? document.project.name,
      items: document.items.map((item) => ({
        kind: item.kind,
        oz: item.oz,
        name: item.name,
        description: item.description,
        quantity: item.quantity.toNumber(),
        unit: item.unit,
        unitPrice: item.unitPrice.toNumber(),
        discountPercent: item.discountPercent.toNumber(),
        lineTotal: item.lineTotal.toNumber(),
        isOptional: item.isOptional,
      })),
    });
    return { xml, filename: `Angebot_${(document.number ?? 'Entwurf').replace(/[^A-Za-z0-9_-]/g, '_')}.x84` };
  }
}
