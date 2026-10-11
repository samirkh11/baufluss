// Shared helpers for the development seed. The seed writes simple generated SVG pictures straight
// into uploads/ so demo data looks realistic without committing binary assets (uploads/ is gitignored).
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const UPLOAD_ROOT = join(process.cwd(), 'uploads');

const PALETTE = ['#c0392b', '#d35400', '#b9770e', '#1e8449', '#117a65', '#1f618d', '#6c3483', '#566573'];

// Deterministic colour per text so re-running the seed produces identical pictures.
export function colorFor(text: string): string {
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Writes an SVG into uploads/<subdir>/ and returns the public path stored in the database.
export function writeSeedImage(subdir: string, filename: string, svg: string): string {
  const directory = join(UPLOAD_ROOT, subdir);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, filename), svg);
  return `/uploads/${subdir}/${filename}`;
}

// Square avatar with initials (people and organisations).
export function avatarSvg(initials: string, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
<rect width="200" height="200" rx="24" fill="${color}"/>
<text x="100" y="125" font-family="Arial, sans-serif" font-size="80" font-weight="bold" fill="#fff" text-anchor="middle">${escapeXml(initials)}</text>
</svg>`;
}

// Landscape tile with a caption (stand-in for a product / job-site photo).
export function tileSvg(caption: string, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
<rect width="400" height="300" fill="${color}"/>
<polygon points="0,300 120,170 200,240 290,140 400,300" fill="rgba(0,0,0,0.18)"/>
<text x="200" y="155" font-family="Arial, sans-serif" font-size="30" font-weight="bold" fill="#fff" text-anchor="middle">${escapeXml(caption)}</text>
</svg>`;
}

// Company logo: a simple roof symbol next to the company name.
export function logoSvg(name: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="120" viewBox="0 0 420 120">
<polygon points="10,70 60,20 110,70" fill="#b03a2e"/>
<rect x="30" y="70" width="60" height="35" fill="#7b241c"/>
<text x="125" y="75" font-family="Arial, sans-serif" font-size="30" font-weight="bold" fill="#333">${escapeXml(name)}</text>
</svg>`;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => /^[A-Za-zÄÖÜäöü]/.test(part))
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}
