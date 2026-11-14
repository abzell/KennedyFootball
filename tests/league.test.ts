import { describe, expect, it } from 'vitest';
import { buildCalendar, defaultSeasonName, scoringStatus } from '../shared/calendar';
import {
  computeRecords,
  gameResult,
  powerOrder,
  powerRankings,
  rankTeams,
  scoreKey,
  seedPlayoffs,
  type LMatchup,
  type LTeam,
  type ScoreMap,
} from '../shared/league';
import { pairingsForRegularWeek, roundRobinRounds, validatePairs } from '../shared/schedule';
import { addDays, chicagoToUtc, isMonday, mondayAfterThanksgiving, mondayOf } from '../shared/time';

const iso = (ms: number) => new Date(ms).toISOString();

describe('Central time math', () => {
  it('converts winter (CST) and summer (CDT) wall-clock times to UTC', () => {
    expect(iso(chicagoToUtc('2026-12-04', 12))).toBe('2026-12-04T18:00:00.000Z');
    expect(iso(chicagoToUtc('2026-07-06', 0))).toBe('2026-07-06T05:00:00.000Z');
  });
  it('handles the weeks in which DST changes', () => {
    // DST ends Sun Nov 1 2026: Monday before is CDT, Monday after is CST.
    expect(iso(chicagoToUtc('2026-10-26', 0))).toBe('2026-10-26T05:00:00.000Z');
    expect(iso(chicagoToUtc('2026-11-02', 0))).toBe('2026-11-02T06:00:00.000Z');
    // DST starts Sun Mar 14 2027.
    expect(iso(chicagoToUtc('2027-03-12', 12))).toBe('2027-03-12T18:00:00.000Z');
    expect(iso(chicagoToUtc('2027-03-15', 0))).toBe('2027-03-15T05:00:00.000Z');
  });
  it('finds Mondays', () => {
    expect(mondayAfterThanksgiving(2026)).toBe('2026-11-30');
    expect(mondayAfterThanksgiving(2027)).toBe('2027-11-29');
    expect(isMonday('2026-11-30')).toBe(true);
    expect(isMonday('2026-12-01')).toBe(false);
    expect(mondayOf('2026-12-06')).toBe('2026-11-30'); // Sunday belongs to the week before
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
  });
});

describe('Season calendar', () => {
  const cal = buildCalendar('2026-11-30', 5, [
    { date: '2026-12-21', label: 'Winter Break' },
    { date: '2026-12-28', label: 'Winter Break' },
  ]);
  it('matches the example in the requirements (section 4.1)', () => {
    expect(cal.map((w) => [w.mondayDate, w.type, w.label])).toEqual([
      ['2026-11-30', 'regular', 'Week 1'],
      ['2026-12-07', 'regular', 'Week 2'],
      ['2026-12-14', 'regular', 'Week 3'],
      ['2026-12-21', 'skip', 'Winter Break'],
      ['2026-12-28', 'skip', 'Winter Break'],
      ['2027-01-04', 'regular', 'Week 4'],
      ['2027-01-11', 'regular', 'Week 5'],
      ['2027-01-18', 'semifinal', 'Playoff Semifinals'],
      ['2027-01-25', 'superbowl', 'Super Bowl'],
    ]);
  });
  it('locks Friday 12:00 PM and publishes the next Monday 12:00 AM Central', () => {
    expect(iso(cal[0].startAt)).toBe('2026-11-30T06:00:00.000Z');
    expect(iso(cal[0].lockAt)).toBe('2026-12-04T18:00:00.000Z');
    expect(iso(cal[0].publishAt)).toBe('2026-12-07T06:00:00.000Z');
    expect(cal[0].publishAt).toBe(cal[1].startAt);
  });
  it('builds the default season name from the start year', () => {
    expect(defaultSeasonName('2026-11-30')).toBe('Kennedy 5th Grade Football League 2026–27');
  });
});

describe('Scoring window', () => {
  const cal = buildCalendar('2026-11-30', 2, [{ date: '2026-12-07', label: 'Winter Break' }]);
  const at = (s: string) => scoringStatus(cal, Date.parse(s));
  it('is closed before the season', () => {
    expect(at('2026-11-29T23:59:59-06:00')).toMatchObject({ open: false, reason: 'preseason' });
  });
  it('opens Monday 00:00', () => {
    expect(at('2026-11-30T00:00:00-06:00')).toMatchObject({ open: true, reason: 'open' });
  });
  it('accepts Fri 11:59:59 AM and rejects Fri 12:00:00 PM', () => {
    expect(at('2026-12-04T11:59:59-06:00').open).toBe(true);
    expect(at('2026-12-04T11:59:59.999-06:00').open).toBe(true);
    expect(at('2026-12-04T12:00:00-06:00')).toMatchObject({ open: false, reason: 'locked' });
  });
  it('stays closed over the weekend and in skip weeks', () => {
    expect(at('2026-12-06T23:59:59-06:00')).toMatchObject({ open: false, reason: 'locked' });
    expect(at('2026-12-09T10:00:00-06:00')).toMatchObject({ open: false, reason: 'skip' });
    expect(at('2026-12-14T08:00:00-06:00')).toMatchObject({ open: true });
  });
  it('is complete once the Super Bowl locks', () => {
    const sb = cal[cal.length - 1];
    expect(sb.type).toBe('superbowl');
    expect(scoringStatus(cal, sb.lockAt - 1).open).toBe(true);
    expect(scoringStatus(cal, sb.lockAt)).toMatchObject({ open: false, reason: 'complete' });
    expect(scoringStatus(cal, sb.publishAt + 1000)).toMatchObject({ open: false, reason: 'complete' });
  });
  it('reports no season when there is no calendar', () => {
    expect(scoringStatus([], Date.now())).toMatchObject({ open: false, reason: 'no_season' });
  });
});

describe('Round-robin schedule', () => {
  for (const n of [2, 4, 6, 8]) {
    it(`${n} teams: one game each per week and no repeat opponent within a cycle`, () => {
      const ids = Array.from({ length: n }, (_, i) => i + 1);
      const rounds = roundRobinRounds(ids);
      expect(rounds.length).toBe(n - 1);
      const seen = new Set<string>();
      for (const round of rounds) {
        expect(round.flat().sort((a, b) => a - b)).toEqual(ids);
        for (const [a, b] of round) {
          const key = [a, b].sort((x, y) => x - y).join('-');
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
      expect(seen.size).toBe((n * (n - 1)) / 2);
    });
  }
  it('repeats the cycle from round 1 when there are more weeks than rounds', () => {
    const ids = [1, 2, 3, 4];
    expect(pairingsForRegularWeek(ids, 4)).toEqual(pairingsForRegularWeek(ids, 1));
    expect(pairingsForRegularWeek([7, 9], 5)).toEqual([[7, 9]]);
  });
  it('rejects odd divisions', () => {
    expect(() => roundRobinRounds([1, 2, 3])).toThrow();
  });
  it('validates manual edits', () => {
    expect(validatePairs([1, 2, 3, 4], [[1, 3], [2, 4]])).toBeNull();
    expect(validatePairs([1, 2, 3, 4], [[1, 3]])).toMatch(/exactly once/);
    expect(validatePairs([1, 2, 3, 4], [[1, 3], [1, 4]])).toMatch(/more than once/);
    expect(validatePairs([1, 2, 3, 4], [[1, 3], [2, 9]])).toMatch(/not in this division/);
  });
});

// ---- helpers for standings tests -------------------------------------------------------------

const team = (id: number, divisionId: number, tiebreakSeed = id / 100): LTeam => ({ id, divisionId, tiebreakSeed });
let nextId = 1;
const game = (weekId: number, a: number, b: number, slot: LMatchup['bracketSlot'] = null, seedA: number | null = null, seedB: number | null = null): LMatchup => ({
  id: nextId++,
  weekId,
  teamAId: a,
  teamBId: b,
  bracketSlot: slot,
  seedA,
  seedB,
});
function scoresOf(entries: [number, number, number][]): ScoreMap {
  const m: ScoreMap = new Map();
  for (const [weekId, teamId, pts] of entries) m.set(scoreKey(weekId, teamId), { work: pts, participation: 0, voice: 0, positivity: 0 });
  return m;
}

describe('Game results and records', () => {
  it('records a tie on equal scores (including 0–0) and counts it as half a win', () => {
    const teams = [team(1, 1), team(2, 1)];
    const ms = [game(1, 1, 2), game(2, 1, 2), game(3, 1, 2)];
    const scores = scoresOf([
      [1, 1, 10],
      [1, 2, 10],
      [2, 1, 12],
      [2, 2, 8],
    ]); // week 3 is 0–0
    const rec = computeRecords(teams, ms, scores);
    const r1 = rec.byTeam.get(1)!;
    expect([r1.w, r1.l, r1.t]).toEqual([1, 0, 2]);
    expect(r1.winPct).toBeCloseTo(2 / 3);
    expect(rec.byTeam.get(2)!.winPct).toBeCloseTo(1 / 3);
    expect(r1.pf).toBe(22);
    expect(r1.pa).toBe(18);
    expect(r1.streak).toBe('T1');
    expect(r1.last).toMatchObject({ result: 'T', pf: 0, pa: 0, oppId: 2 });
  });
  it('shows .000 with no games and ignores playoff games in the standings', () => {
    const teams = [team(1, 1), team(2, 1)];
    const rec = computeRecords(teams, [game(9, 1, 2, 'semi1', 1, 4)], scoresOf([[9, 1, 5]]));
    expect(rec.byTeam.get(1)).toMatchObject({ games: 0, winPct: 0, pf: 0 });
  });
  it('sends a tied playoff game to the higher seed', () => {
    const tied = gameResult(game(9, 1, 2, 'semi1', 4, 1), scoresOf([[9, 1, 7], [9, 2, 7]]));
    expect(tied).toMatchObject({ winnerId: 2, onSeed: true });
    const clear = gameResult(game(9, 1, 2, 'semi1', 4, 1), scoresOf([[9, 1, 8], [9, 2, 7]]));
    expect(clear).toMatchObject({ winnerId: 1, onSeed: false });
  });
});

describe('Tiebreakers (win %, PF, head-to-head, coin flip)', () => {
  it('1. win % comes before points', () => {
    const teams = [team(1, 1), team(2, 1), team(3, 1), team(4, 1)];
    const rec = computeRecords(teams, [game(1, 1, 2), game(1, 3, 4)], scoresOf([[1, 1, 5], [1, 2, 4], [1, 3, 50], [1, 4, 60]]));
    // 1 and 4 won; 4 has more PF. 3 lost with 50 but still ranks below both winners.
    expect(rankTeams(teams, rec).map((t) => t.id)).toEqual([4, 1, 3, 2]);
  });
  it('2. PF breaks equal win %', () => {
    const teams = [team(1, 1), team(2, 1)];
    const rec = computeRecords(teams, [game(1, 1, 2), game(2, 1, 2)], scoresOf([[1, 1, 10], [1, 2, 5], [2, 1, 5], [2, 2, 11]]));
    expect(rankTeams(teams, rec).map((t) => t.id)).toEqual([2, 1]);
  });
  it('3. head-to-head among the tied teams breaks equal win % and PF', () => {
    // Teams 1 and 2 each go 1-1 with 20 PF; team 2 beat team 1 head-to-head.
    const teams = [team(1, 1, 0.9), team(2, 1, 0.1), team(3, 1), team(4, 1)];
    const ms = [game(1, 1, 2), game(1, 3, 4), game(2, 1, 3), game(2, 2, 4)];
    const scores = scoresOf([
      [1, 1, 8], [1, 2, 9], [1, 3, 1], [1, 4, 0],
      [2, 1, 12], [2, 3, 2], [2, 2, 11], [2, 4, 30],
    ]);
    const rec = computeRecords(teams, ms, scores);
    expect(rec.byTeam.get(1)).toMatchObject({ w: 1, l: 1, pf: 20 });
    expect(rec.byTeam.get(2)).toMatchObject({ w: 1, l: 1, pf: 20 });
    const order = rankTeams(teams, rec).map((t) => t.id);
    expect(order.indexOf(2)).toBeLessThan(order.indexOf(1)); // despite team 1's better coin flip
  });
  it('4. the stored coin flip decides what is left, and the order is stable', () => {
    const teams = [team(1, 1, 0.2), team(2, 1, 0.8), team(3, 2, 0.5), team(4, 2, 0.1)];
    const rec = computeRecords(teams, [], new Map());
    const first = rankTeams(teams, rec).map((t) => t.id);
    expect(first).toEqual([2, 3, 1, 4]);
    for (let i = 0; i < 5; i++) expect(rankTeams([...teams].reverse(), rec).map((t) => t.id)).toEqual(first);
  });
});

describe('Playoff seeding', () => {
  // 3 divisions × 2 teams. Division winners: 1 (2-0), 3 (2-0), 5 (1-1).
  const teams = [team(1, 1), team(2, 1), team(3, 2), team(4, 2), team(5, 3), team(6, 3)];
  const ms = [game(1, 1, 2), game(1, 3, 4), game(1, 5, 6), game(2, 1, 2), game(2, 3, 4), game(2, 5, 6)];
  const scores = scoresOf([
    [1, 1, 20], [1, 2, 10], [1, 3, 30], [1, 4, 25], [1, 5, 9], [1, 6, 8],
    [2, 1, 20], [2, 2, 12], [2, 3, 30], [2, 4, 28], [2, 5, 7], [2, 6, 8],
  ]);
  const rec = computeRecords(teams, ms, scores);
  const field = seedPlayoffs([1, 2, 3], teams, rec);

  it('3 divisions → 3 division winners + 1 wildcard (highest PF among the rest)', () => {
    expect(field.seeds.map((s) => s.kind)).toEqual(['division', 'division', 'division', 'wildcard']);
    // Team 4 is 0-2 but has the most points (53) of the non-winners, so it is the wildcard.
    expect(field.seeds[3].teamId).toBe(4);
  });
  it('seeds division winners by the standard tiebreakers', () => {
    // 3 (2-0, 60 PF) > 1 (2-0, 40 PF) > division 3's winner (1-1)
    expect(field.seeds.slice(0, 2).map((s) => s.teamId)).toEqual([3, 1]);
    expect([5, 6]).toContain(field.seeds[2].teamId);
  });
  it('lists the next two teams as "in the hunt"', () => {
    expect(field.hunt.length).toBe(2);
    expect(field.hunt[0]).toBe(2); // 22 PF
  });
  it('4 divisions → no wildcards; 1 division → 3 wildcards', () => {
    const t4 = [team(1, 1), team(2, 1), team(3, 2), team(4, 2), team(5, 3), team(6, 3), team(7, 4), team(8, 4)];
    const f4 = seedPlayoffs([1, 2, 3, 4], t4, computeRecords(t4, [], new Map()));
    expect(f4.seeds.map((s) => s.kind)).toEqual(['division', 'division', 'division', 'division']);
    const t1 = [team(1, 1), team(2, 1), team(3, 1), team(4, 1)];
    const f1 = seedPlayoffs([1], t1, computeRecords(t1, [], new Map()));
    expect(f1.seeds.map((s) => s.kind)).toEqual(['division', 'wildcard', 'wildcard', 'wildcard']);
  });
});

describe('Power rankings', () => {
  const teams = [team(1, 1), team(2, 1), team(3, 1), team(4, 1)];
  const w1 = [game(1, 1, 2), game(1, 3, 4)];
  const w2 = [game(2, 1, 3), game(2, 2, 4)];
  const scores = scoresOf([
    [1, 1, 10], [1, 2, 20], [1, 3, 30], [1, 4, 5],
    [2, 1, 40], [2, 3, 10], [2, 2, 20], [2, 4, 20],
  ]);
  it('follows Power = 0.5·WinPct + 0.3·Recent + 0.2·Season', () => {
    const order = powerOrder(teams, computeRecords(teams, [...w1, ...w2], scores));
    const p = new Map(order.map((o) => [o.teamId, o.power]));
    // Averages over two weeks: T1 25, T2 20, T3 20, T4 12.5 (max 25). Recent == Season here.
    expect(p.get(1)).toBeCloseTo(0.5 * 0.5 + 0.3 * 1 + 0.2 * 1);
    expect(p.get(2)).toBeCloseTo(0.5 * 0.75 + 0.3 * 0.8 + 0.2 * 0.8);
    expect(p.get(3)).toBeCloseTo(0.5 * 0.5 + 0.3 * 0.8 + 0.2 * 0.8);
    expect(p.get(4)).toBeCloseTo(0.5 * 0.25 + 0.3 * 0.5 + 0.2 * 0.5);
    expect(order.map((o) => o.teamId)).toEqual([2, 1, 3, 4]);
  });
  it('uses only the last two weeks for Recent', () => {
    const w3 = [game(3, 1, 4), game(3, 2, 3)];
    const s = scoresOf([
      [1, 1, 100], [1, 2, 0], [1, 3, 0], [1, 4, 0],
      [2, 1, 0], [2, 3, 0], [2, 2, 0], [2, 4, 0],
      [3, 1, 0], [3, 4, 10], [3, 2, 0], [3, 3, 0],
    ]);
    const order = powerOrder(teams, computeRecords(teams, [...w1, ...w2, ...w3], s));
    const p = new Map(order.map((o) => [o.teamId, o.power]));
    // Team 1: 1-1-1 (.5), Recent 0/5, Season (100/3)/(100/3)
    expect(p.get(1)).toBeCloseTo(0.5 * 0.5 + 0 + 0.2);
    // Team 4: W in week 3, ties in 1? no — lost week 1 (0 vs 0 is a tie): T, T, W
    expect(p.get(4)).toBeCloseTo(0.5 * (2 / 3) + 0.3 * 1 + 0.2 * (10 / 3 / (100 / 3)));
  });
  it('shows movement against the previous week, and none for the first week', () => {
    expect(powerRankings(teams, [], scores)).toBeNull();
    const first = powerRankings(teams, [w1], scores)!;
    expect(first.every((r) => r.move === null)).toBe(true);
    expect(first.map((r) => r.teamId)).toEqual([3, 2, 1, 4]);
    const second = powerRankings(teams, [w1, w2], scores)!;
    expect(second.map((r) => [r.teamId, r.move])).toEqual([
      [2, 1],
      [1, 1],
      [3, -2],
      [4, 0],
    ]);
  });
  it('gives everyone 0 for a term whose divisor is 0', () => {
    const order = powerOrder(teams, computeRecords(teams, w1, new Map()));
    for (const o of order) expect(o.power).toBeCloseTo(0.25); // all ties, nobody scored
  });
});
