import { sanitizeDetails } from './audit.service';

describe('sanitizeDetails', () => {
  it('masks secrets at any depth', () => {
    expect(sanitizeDetails({ email: 'a@b.de', password: 'geheim', nested: { accessToken: 'x' } })).toEqual({ email: 'a@b.de', password: '***', nested: { accessToken: '***' } });
  });

  it('shortens long strings and long lists', () => {
    const result = sanitizeDetails({ text: 'x'.repeat(500), list: Array.from({ length: 50 }, (_, i) => i) }) as { text: string; list: number[] };
    expect(result.text.length).toBe(301);
    expect(result.list).toHaveLength(20);
  });

  it('keeps plain values', () => {
    expect(sanitizeDetails(5)).toBe(5);
    expect(sanitizeDetails(null)).toBeNull();
  });
});
