// All league clock math happens in America/Chicago (DST-aware). Timestamps are UTC ms.

export const TZ = 'America/Chicago';

const dtf = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export interface Parts {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

export function chicagoParts(ms: number): Parts {
  const out: Record<string, number> = {};
  for (const p of dtf.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return { y: out.year, m: out.month, d: out.day, h: out.hour % 24, mi: out.minute, s: out.second };
}

function offsetAt(ms: number): number {
  const p = chicagoParts(ms);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

function parseDate(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Bad date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function isValidDate(date: unknown): date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = parseDate(date);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** UTC ms for a Chicago wall-clock time on a calendar date (YYYY-MM-DD). */
export function chicagoToUtc(date: string, hour = 0, minute = 0): number {
  const [y, m, d] = parseDate(date);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const off = offsetAt(guess);
  let t = guess - off;
  const off2 = offsetAt(t);
  if (off2 !== off) t = guess - off2;
  return t;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function addDays(date: string, n: number): string {
  const [y, m, d] = parseDate(date);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(date: string): number {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isMonday(date: string): boolean {
  return dayOfWeek(date) === 1;
}

/** The Monday of the week (Mon–Sun) containing the date. */
export function mondayOf(date: string): string {
  const dow = dayOfWeek(date);
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/** Chicago calendar date (YYYY-MM-DD) for a UTC instant. */
export function chicagoDate(ms: number): string {
  const p = chicagoParts(ms);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** Fourth Thursday of November. */
export function thanksgiving(year: number): string {
  const first = `${year}-11-01`;
  const dow = dayOfWeek(first);
  const firstThu = 1 + ((4 - dow + 7) % 7);
  return `${year}-11-${pad(firstThu + 21)}`;
}

export function mondayAfterThanksgiving(year: number): string {
  return addDays(thanksgiving(year), 4);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon, Nov 30" */
export function formatDate(date: string, withDay = true): string {
  const [, m, d] = parseDate(date);
  const base = `${MONTHS[m - 1]} ${d}`;
  return withDay ? `${DAYS[dayOfWeek(date)]}, ${base}` : base;
}

/** "Nov 30 – Dec 4" (the Mon–Fri school week) */
export function formatWeekRange(monday: string): string {
  return `${formatDate(monday, false)} – ${formatDate(addDays(monday, 4), false)}`;
}

/** "Fri, Dec 4 · 12:00 PM" in Central time */
export function formatInstant(ms: number): string {
  const p = chicagoParts(ms);
  const date = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${formatDate(date)} · ${h12}:${pad(p.mi)} ${p.h < 12 ? 'AM' : 'PM'}`;
}
