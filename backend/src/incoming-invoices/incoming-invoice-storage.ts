import { BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join, resolve, sep } from 'path';

// Original invoice files live OUTSIDE the publicly served uploads/ folder: they contain business data
// and are only handed out through the authenticated API (tenant-checked).
export const STORAGE_ROOT = join(process.cwd(), 'storage', 'incoming-invoices');

export const MAX_INVOICE_FILE_BYTES = 15 * 1024 * 1024;
// XML is accepted for XRechnung files (parsing follows with Block 7).
const ALLOWED: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.webp': ['image/webp'],
  '.xml': ['application/xml', 'text/xml'],
};

export function validateInvoiceFile(file: { originalname: string; mimetype: string }): string {
  const extension = extname(file.originalname).toLowerCase();
  if (!ALLOWED[extension] || !ALLOWED[extension].includes(file.mimetype)) {
    throw new BadRequestException('Erlaubt sind PDF, Bilder (PNG/JPG/WebP) und XML (XRechnung).');
  }
  return extension;
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

// Stores the file under <root>/<companyId>/<random>.<ext> and returns the path relative to the root.
export async function storeInvoiceFile(companyId: string, extension: string, buffer: Buffer): Promise<string> {
  const relative = join(companyId, `${randomUUID()}${extension}`);
  await mkdir(join(STORAGE_ROOT, companyId), { recursive: true });
  await writeFile(join(STORAGE_ROOT, relative), buffer);
  return relative;
}

// Absolute path of a stored file; refuses anything outside the storage root.
export function absoluteInvoicePath(relative: string): string {
  const absolute = resolve(STORAGE_ROOT, relative);
  if (!absolute.startsWith(STORAGE_ROOT + sep)) {
    throw new BadRequestException('Ungültiger Dateipfad.');
  }
  return absolute;
}

export async function deleteInvoiceFile(relative: string | null | undefined): Promise<void> {
  if (!relative) {
    return;
  }
  await unlink(absoluteInvoicePath(relative)).catch(() => undefined);
}
