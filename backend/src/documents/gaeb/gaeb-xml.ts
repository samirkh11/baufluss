import { XMLParser } from 'fast-xml-parser';

// Minimal, order-preserving XML tree used by the GAEB parser. GAEB long texts are mixed content
// (<p><span>..</span><span>..</span></p>), so the order of children matters.
export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: (XmlNode | string)[];
}

export class GaebError extends Error {}

// Namespace prefixes are stripped: the namespace differs per exchange phase and version
// (…/DA83/3.3, …/DA81/3.2), but the element names are the same.
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
});

type RawEntry = Record<string, unknown>;

function toTree(entries: RawEntry[]): (XmlNode | string)[] {
  const result: (XmlNode | string)[] = [];
  for (const entry of entries) {
    const attrs = (entry[':@'] as Record<string, string> | undefined) ?? {};
    for (const [key, value] of Object.entries(entry)) {
      if (key === ':@') {
        continue;
      }
      if (key === '#text') {
        result.push(String(value));
      } else {
        result.push({ name: key, attrs, children: toTree(value as RawEntry[]) });
      }
    }
  }
  return result;
}

export function parseXml(xml: string): XmlNode[] {
  let raw: RawEntry[];
  try {
    raw = parser.parse(xml) as RawEntry[];
  } catch {
    throw new GaebError('Die Datei ist kein gültiges XML.');
  }
  return toTree(raw).filter((node): node is XmlNode => typeof node !== 'string');
}

export function elements(node: XmlNode | undefined): XmlNode[] {
  return node ? node.children.filter((child): child is XmlNode => typeof child !== 'string') : [];
}

export function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return elements(node).find((candidate) => candidate.name === name);
}

export function childrenNamed(node: XmlNode | undefined, name: string): XmlNode[] {
  return elements(node).filter((candidate) => candidate.name === name);
}

// Follows a path of element names, e.g. path(item, 'Description', 'CompleteText').
export function path(node: XmlNode | undefined, ...names: string[]): XmlNode | undefined {
  return names.reduce<XmlNode | undefined>((current, name) => child(current, name), node);
}

// Plain text of a node. Paragraphs and <br/> become line breaks; spans are joined inline.
export function textOf(node: XmlNode | string | undefined): string {
  if (node === undefined) {
    return '';
  }
  if (typeof node === 'string') {
    // Line breaks in the source file are only pretty-printing; real breaks come from <p> and <br/>.
    return node.replace(/[\r\n]+/g, ' ');
  }
  const inner = node.children.map(textOf).join('');
  if (node.name === 'br') {
    return '\n';
  }
  return node.name === 'p' ? inner + '\n' : inner;
}

// Collapses whitespace per line and drops empty leading/trailing/duplicate lines.
export function normalizeText(text: string): string {
  const lines = text.split('\n').map((line) => line.replace(/\s+/g, ' ').trim());
  const out: string[] = [];
  for (const line of lines) {
    if (line === '' && (out.length === 0 || out[out.length - 1] === '')) {
      continue;
    }
    out.push(line);
  }
  while (out.length > 0 && out[out.length - 1] === '') {
    out.pop();
  }
  return out.join('\n');
}

export const cleanText = (node: XmlNode | undefined) => normalizeText(textOf(node));
