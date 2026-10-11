import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { diskStorage } from 'multer';
import { extname, join, resolve, sep } from 'path';

// Root folder for all user uploads. Resolved from the working directory (not __dirname) because the
// compiled code lives in dist/src. Also served statically under "/uploads" (see main.ts).
export const UPLOAD_ROOT = join(process.cwd(), 'uploads');

// SVG is intentionally NOT allowed for user uploads: an SVG opened directly in the browser can
// execute scripts. Only the company logo (trusted, admin-only) keeps SVG support.
export const RASTER_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
export const LOGO_EXTENSIONS = [...RASTER_IMAGE_EXTENSIONS, '.svg'];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// Builds multer options that store images under uploads/<subdir>/ with random file names
// (prevents overwriting and path traversal through client-supplied names).
export function imageUploadOptions(subdir: string, allowedExtensions: string[] = RASTER_IMAGE_EXTENSIONS): MulterOptions {
  const directory = join(UPLOAD_ROOT, subdir);
  return {
    storage: diskStorage({
      destination: (_req, _file, callback) => {
        if (!existsSync(directory)) {
          mkdirSync(directory, { recursive: true });
        }
        callback(null, directory);
      },
      filename: (_req, file, callback) => callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
    }),
    fileFilter: (_req, file, callback) => {
      const extension = extname(file.originalname).toLowerCase();
      if (!allowedExtensions.includes(extension) || !file.mimetype.startsWith('image/')) {
        callback(new BadRequestException('Nicht unterstütztes Bildformat.'), false);
        return;
      }
      callback(null, true);
    },
    limits: { fileSize: MAX_IMAGE_BYTES },
  };
}

// Public URL path (stored in the database) for a file multer saved in uploads/<subdir>/.
export function publicUploadPath(subdir: string, filename: string): string {
  return `/uploads/${subdir}/${filename}`;
}

// Best-effort removal of a previously stored file given its public path. Never throws: a missing
// file must not break the request that replaced or deleted its owner.
export async function deleteUploadedFile(publicPath: string | null | undefined): Promise<void> {
  if (!publicPath || !publicPath.startsWith('/uploads/')) {
    return;
  }
  const absolute = resolve(UPLOAD_ROOT, publicPath.slice('/uploads/'.length));
  // Guard against path traversal: only files inside the upload root may be deleted.
  if (!absolute.startsWith(UPLOAD_ROOT + sep)) {
    return;
  }
  await unlink(absolute).catch(() => undefined);
}
