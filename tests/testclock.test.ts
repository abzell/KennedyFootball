import { describe, expect, it } from 'vitest';
import { buildCalendar, nextClockStep, scoringStatus } from '../shared/calendar';

describe('Test-site clock stepping', () => {
  const cal = buildCalendar('2026-11-30', 2, [{ date: '2026-12-07', label: 'Winter Break' }]);
  it('walks every boundary of the season in order', () => {
    const labels: string[] = [];
    let now = cal[0].startAt - 5 * 86400000;
    for (let i = 0; i < 50; i++) {
      const step = nextClockStep(cal, now);
      if (!step) break;
      expect(step.at).toBeGreaterThan(now);
      labels.push(step.label);
      now = step.at;
    }
    expect(labels).toEqual([
      'Week 1 begins: scoring opens',
      'Week 1 locks: reveal opens',
      'Week 1 results go public · Winter Break begins (no games)',
      'Week 2 begins: scoring opens',
      'Week 2 locks: reveal opens',
      'Week 2 results go public · Playoff Semifinals begins: scoring opens',
      'Playoff Semifinals locks: reveal opens',
      'Playoff Semifinals results go public · Super Bowl begins: scoring opens',
      'Super Bowl locks: reveal opens',
      'Super Bowl results go public',
    ]);
  });
  it('lands exactly on the moment the state changes', () => {
    const toLock = nextClockStep(cal, cal[0].startAt)!;
    expect(toLock.at).toBe(cal[0].lockAt);
    expect(scoringStatus(cal, toLock.at - 1).open).toBe(true);
    expect(scoringStatus(cal, toLock.at).open).toBe(false);
  });
  it('has nothing to step to without a calendar or after the season', () => {
    expect(nextClockStep([], Date.now())).toBeNull();
    expect(nextClockStep(cal, cal[cal.length - 1].publishAt)).toBeNull();
  });
});
