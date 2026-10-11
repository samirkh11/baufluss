import { computeDuration, formatTime, localNow, overlaps, parseTime, TimeEntryError } from './time-utils';

describe('parseTime / formatTime', () => {
  it('parses valid times', () => {
    expect(parseTime('07:30')).toBe(450);
    expect(parseTime('7:05')).toBe(425);
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('23:59')).toBe(1439);
  });

  it('rejects invalid times', () => {
    for (const value of ['24:00', '12:60', '7', 'abc', '12:5', '']) {
      expect(parseTime(value)).toBeNull();
    }
  });

  it('formats minutes as HH:MM', () => {
    expect(formatTime(450)).toBe('07:30');
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(null)).toBeNull();
  });
});

describe('computeDuration', () => {
  const spec = (overrides: Partial<Parameters<typeof computeDuration>[0]>) => ({
    startMinute: null, endMinute: null, breakMinutes: 0, durationMinutes: null, ...overrides,
  });

  it('subtracts the break from a time range', () => {
    expect(computeDuration(spec({ startMinute: 420, endMinute: 960, breakMinutes: 60 }))).toBe(480);
  });

  it('uses a plain duration when there is no range', () => {
    expect(computeDuration(spec({ durationMinutes: 90 }))).toBe(90);
  });

  it('prefers the range over a given duration', () => {
    expect(computeDuration(spec({ startMinute: 480, endMinute: 540, durationMinutes: 999 }))).toBe(60);
  });

  it('rejects end before start, break longer than work, half ranges and missing data', () => {
    expect(() => computeDuration(spec({ startMinute: 600, endMinute: 540 }))).toThrow(TimeEntryError);
    expect(() => computeDuration(spec({ startMinute: 600, endMinute: 660, breakMinutes: 60 }))).toThrow(/Pause/);
    expect(() => computeDuration(spec({ startMinute: 600 }))).toThrow(TimeEntryError);
    expect(() => computeDuration(spec({}))).toThrow(TimeEntryError);
    expect(() => computeDuration(spec({ durationMinutes: 0 }))).toThrow(TimeEntryError);
    expect(() => computeDuration(spec({ durationMinutes: 1441 }))).toThrow(TimeEntryError);
  });
});

describe('overlaps', () => {
  it('detects overlapping ranges but allows touching ones', () => {
    expect(overlaps({ start: 420, end: 720 }, { start: 600, end: 900 })).toBe(true);
    expect(overlaps({ start: 420, end: 720 }, { start: 720, end: 900 })).toBe(false);
    expect(overlaps({ start: 420, end: 720 }, { start: 0, end: 420 })).toBe(false);
  });

  it('treats a running entry as lasting until midnight', () => {
    expect(overlaps({ start: 600, end: null }, { start: 900, end: 960 })).toBe(true);
    expect(overlaps({ start: 600, end: null }, { start: 300, end: 600 })).toBe(false);
  });
});

describe('localNow', () => {
  it('converts to Europe/Berlin (summer time, UTC+2)', () => {
    expect(localNow(new Date('2026-07-01T10:30:00Z'))).toEqual({ date: '2026-07-01', minute: 12 * 60 + 30 });
  });

  it('converts to Europe/Berlin (winter time, UTC+1) and rolls over the date', () => {
    expect(localNow(new Date('2026-12-31T23:30:00Z'))).toEqual({ date: '2027-01-01', minute: 30 });
  });
});
