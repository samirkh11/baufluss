// Date and time helpers for the time tracking screens. Dates are plain "YYYY-MM-DD" strings;
// all arithmetic is done in UTC so daylight saving time can never shift a day.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

const parse = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const format = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  return format(new Date(parse(iso).getTime() + days * DAY_MS));
}

export function mondayOf(iso: string): string {
  const weekday = parse(iso).getUTCDay(); // 0 = Sunday
  return addDays(iso, weekday === 0 ? -6 : 1 - weekday);
}

// ISO 8601 week number (weeks start on Monday, week 1 contains the first Thursday).
export function isoWeek(iso: string): number {
  const date = parse(mondayOf(iso));
  const thursday = new Date(date.getTime() + 3 * DAY_MS);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstWeekMonday = parse(mondayOf(format(firstThursday)));
  return 1 + Math.round((date.getTime() - firstWeekMonday.getTime()) / (7 * DAY_MS));
}

// "Mo, 06.10.2026"
export function formatDayLabel(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${WEEKDAYS[parse(iso).getUTCDay()]}, ${day}.${month}.${year}`;
}

export function formatDateDe(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
}

// 480 -> "8:00 Std."
export function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')} Std.`;
}

// Hours with one decimal for reports: 148.0166 -> "148,0"
export function formatHours(minutes: number): string {
  return (minutes / 60).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// Current date and minute of the day in the company time zone (the server records times in
// Europe/Berlin, so the running timer must be measured in the same zone, whatever the device says).
export function berlinNow(): { date: string; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minute: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
