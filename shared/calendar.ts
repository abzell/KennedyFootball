import { addDays, chicagoToUtc } from './time';

export type WeekType = 'regular' | 'skip' | 'semifinal' | 'superbowl';

export interface CalWeek {
  seq: number;
  type: WeekType;
  mondayDate: string;
  /** Monday 00:00 Central */
  startAt: number;
  /** Friday 12:00 PM Central */
  lockAt: number;
  /** Next Monday 00:00 Central */
  publishAt: number;
  label: string;
  /** 1-based number among regular-season weeks, null otherwise */
  regularNo: number | null;
}

export interface SkipWeek {
  date: string;
  label: string;
}

/**
 * Consecutive Mondays from the first game week; skip weeks are dropped from the count;
 * after the requested number of regular weeks, the next two non-skipped weeks are the
 * Semifinals and the Super Bowl.
 */
export function buildCalendar(firstMonday: string, regularWeeks: number, skips: SkipWeek[]): CalWeek[] {
  const skipMap = new Map(skips.map((s) => [s.date, s.label || 'No Games']));
  const out: CalWeek[] = [];
  let monday = firstMonday;
  let regular = 0;
  let playoff = 0;
  // Hard stop guards against a pathological list of skip weeks.
  for (let seq = 1; seq <= 120 && playoff < 2; seq++) {
    let type: WeekType;
    let label: string;
    let regularNo: number | null = null;
    if (skipMap.has(monday)) {
      type = 'skip';
      label = skipMap.get(monday)!;
    } else if (regular < regularWeeks) {
      regular++;
      regularNo = regular;
      type = 'regular';
      label = `Week ${regular}`;
    } else if (playoff === 0) {
      playoff++;
      type = 'semifinal';
      label = 'Playoff Semifinals';
    } else {
      playoff++;
      type = 'superbowl';
      label = 'Super Bowl';
    }
    out.push({
      seq,
      type,
      mondayDate: monday,
      startAt: chicagoToUtc(monday, 0),
      lockAt: chicagoToUtc(addDays(monday, 4), 12),
      publishAt: chicagoToUtc(addDays(monday, 7), 0),
      label,
      regularNo,
    });
    monday = addDays(monday, 7);
  }
  return out;
}

export function defaultSeasonName(firstMonday: string): string {
  const y = Number(firstMonday.slice(0, 4));
  return `Kennedy 5th Grade Football League ${y}–${String((y + 1) % 100).padStart(2, '0')}`;
}

export type ScoringReason = 'no_season' | 'preseason' | 'open' | 'locked' | 'skip' | 'complete';

export interface ClockWeek {
  type: WeekType;
  startAt: number;
  lockAt: number;
  publishAt: number;
}

/** The calendar week whose Monday-to-Monday span contains `now`. */
export function weekAt<T extends ClockWeek>(weeks: T[], now: number): T | null {
  return weeks.find((w) => w.startAt <= now && now < w.publishAt) ?? null;
}

/**
 * The server's single decision about whether scoring is open.
 * Open only Mon 00:00 → Fri 11:59:59 AM Central of a game week.
 */
export function scoringStatus<T extends ClockWeek>(weeks: T[], now: number): { open: boolean; reason: ScoringReason; week: T | null } {
  if (weeks.length === 0) return { open: false, reason: 'no_season', week: null };
  if (now < weeks[0].startAt) return { open: false, reason: 'preseason', week: null };
  const week = weekAt(weeks, now);
  if (!week) return { open: false, reason: 'complete', week: null };
  if (week.type === 'skip') return { open: false, reason: 'skip', week };
  if (now >= week.lockAt) {
    return { open: false, reason: week.type === 'superbowl' ? 'complete' : 'locked', week };
  }
  return { open: true, reason: 'open', week };
}
