// Pure helpers for working-time entries (no database access, unit-tested).

// Working times are recorded in the company's time zone (configurable per company later).
export const TIME_ZONE = 'Europe/Berlin';

export const MINUTES_PER_DAY = 24 * 60;

// Current local date ("YYYY-MM-DD") and minute of the day in the company time zone.
export function localNow(now: Date = new Date()): { date: string; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minute: Number(get('hour')) * 60 + Number(get('minute')) };
}

// "07:30" -> 450. Returns null for anything that is not a valid HH:MM time of day.
export function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number(match[1]) < 24 && Number(match[2]) < 60 ? minutes : null;
}

// 450 -> "07:30"
export function formatTime(minute: number | null): string | null {
  return minute === null ? null : `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export interface TimeSpec {
  startMinute: number | null;
  endMinute: number | null;
  breakMinutes: number;
  durationMinutes: number | null; // used when no start/end is given
}

export class TimeEntryError extends Error {}

// Net working time in minutes for a finished entry. A range (start + end) wins over a plain duration.
export function computeDuration(spec: TimeSpec): number {
  const { startMinute, endMinute, breakMinutes, durationMinutes } = spec;
  if (startMinute !== null && endMinute !== null) {
    if (endMinute <= startMinute) {
      throw new TimeEntryError('Das Ende muss nach dem Beginn liegen.');
    }
    const net = endMinute - startMinute - breakMinutes;
    if (net <= 0) {
      throw new TimeEntryError('Die Pause ist länger als die Arbeitszeit.');
    }
    return net;
  }
  if (startMinute !== null || endMinute !== null) {
    throw new TimeEntryError('Bitte Beginn und Ende angeben oder nur eine Dauer.');
  }
  if (durationMinutes === null || durationMinutes < 1 || durationMinutes > MINUTES_PER_DAY) {
    throw new TimeEntryError('Bitte Beginn und Ende oder eine Dauer angeben.');
  }
  return durationMinutes;
}

// True if two [start, end) ranges overlap. A running entry (end = null) lasts until midnight.
export function overlaps(a: { start: number; end: number | null }, b: { start: number; end: number | null }): boolean {
  const aEnd = a.end ?? MINUTES_PER_DAY;
  const bEnd = b.end ?? MINUTES_PER_DAY;
  return a.start < bEnd && b.start < aEnd;
}
