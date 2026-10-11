import { join } from 'path';

const FONT_DIR = join(process.cwd(), 'assets', 'fonts');

// Default font of a document: PDFKit would otherwise start with the non-embedded standard Helvetica.
export const DEFAULT_FONT = join(FONT_DIR, 'LiberationSans-Regular.ttf');

// Registers the embedded Liberation Sans fonts under the names of the PDF standard fonts, so all
// existing drawing code (doc.font('Helvetica-Bold') ...) keeps working but the fonts end up
// embedded in the file. Embedding is mandatory for PDF/A-3 (ZUGFeRD / Factur-X).
export function registerEmbeddedFonts(doc: PDFKit.PDFDocument): void {
  doc.registerFont('Helvetica', DEFAULT_FONT);
  doc.registerFont('Helvetica-Bold', join(FONT_DIR, 'LiberationSans-Bold.ttf'));
  doc.registerFont('Helvetica-Oblique', join(FONT_DIR, 'LiberationSans-Italic.ttf'));
}
