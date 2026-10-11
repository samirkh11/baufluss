import { createHash } from 'crypto';
import { join, resolve, sep } from 'path';

// GoBD archive root, outside the public uploads folder. Files are write-once.
export const ARCHIVE_ROOT = join(process.cwd(), 'storage', 'archive');

export const sha256Of = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

export function archivePath(relative: string): string {
  const absolute = resolve(ARCHIVE_ROOT, relative);
  if (!absolute.startsWith(ARCHIVE_ROOT + sep)) {
    throw new Error('Invalid archive path');
  }
  return absolute;
}

// End of the retention period: 31 Dec of the year of the document plus the configured years.
export function retainUntil(documentDate: Date, years: number): Date {
  return new Date(Date.UTC(documentDate.getUTCFullYear() + years, 11, 31));
}

