import { describe, expect, it } from 'vitest';
import { buildCalendar } from '../shared/calendar';
import { scoreKey, type LMatchup } from '../shared/league';
import {
  buildPlayoffs,
  buildPower,
  buildReveal,
  buildSchedule,
  buildScoreboard,
  buildStandings,
  buildState,
  buildTeacherWeek,
  finalField,
  validateStructure,
  type Snapshot,
} from '../server/views';

// 2 divisions × 2 teams, 2 regular weeks, then semifinals and the Super Bowl.
// Scores use unmistakable numbers so we can search the public JSON for leaks.
const cal = buildCalendar('2026-11-30', 2, []);
const [W1, W2, SEMI, SB] = cal;

function snapshot(finalizedThrough: number): Snapshot {
  const weeks = cal.map((w, i) => ({ ...w, id: i + 1, finalized: i + 1 <= finalizedThrough }));
  const matchups: LMatchup[] = [
    { id: 1, weekId: 1, teamAId: 1, teamBId: 2, bracketSlot: null, seedA: null, seedB: null },
    { id: 2, weekId: 1, teamAId: 3, teamBId: 4, bracketSlot: null, seedA: null, seedB: null },
    { id: 3, weekId: 2, teamAId: 1, teamBId: 2, bracketSlot: null, seedA: null, seedB: null },
    { id: 4, weekId: 2, teamAId: 3, teamBId: 4, bracketSlot: null, seedA: null, seedB: null },
  ];
  const all: [number, number, number][] = [
    [1, 1, 7001], [1, 2, 7002], [1, 3, 7003], [1, 4, 7004],
    [2, 1, 8001], [2, 2, 8002], [2, 3, 8003], [2, 4, 8004],
    [3, 1, 9100], [3, 2, 9100], [3, 3, 9103], [3, 4, 9104], // semifinal week (first game is a tie)
    [4, 1, 9901], [4, 2, 9902], [4, 3, 9903], [4, 4, 9904],
  ];
  const scores = new Map();
  for (const [weekId, teamId, pts] of all) {
    if (weekId <= finalizedThrough) scores.set(scoreKey(weekId, teamId), { work: pts, participation: 0, voice: 0, positivity: 0 });
  }
  const snap: Snapshot = {
    season: { name: 'Test', firstMonday: '2026-11-30', regularWeeks: 2 },
    weeks,
    divisions: [
      { id: 1, name: 'Room 1', teacherName: 'A', sortOrder: 1 },
      { id: 2, name: 'Room 2', teacherName: 'B', sortOrder: 2 },
    ],
    teams: [1, 2, 3, 4].map((id) => ({ id, divisionId: id <= 2 ? 1 : 2, nfl: ['kc', 'chi', 'gb', 'dal'][id - 1], createdOrder: id, tiebreakSeed: id / 10 })),
    matchups,
    scores,
  };
  // Mirror what ensureDerived() does lazily after each lock.
  if (finalizedThrough >= 2) {
    const s = finalField(snap).seeds;
    matchups.push({ id: 5, weekId: 3, teamAId: s[0].teamId, teamBId: s[3].teamId, bracketSlot: 'semi1', seedA: 1, seedB: 4 });
    matchups.push({ id: 6, weekId: 3, teamAId: s[1].teamId, teamBId: s[2].teamId, bracketSlot: 'semi2', seedA: 2, seedB: 3 });
  }
  return snap;
}

const publicJson = (snap: Snapshot, now: number) =>
  JSON.stringify([buildState(snap, now), buildScoreboard(snap, now), buildStandings(snap, now), buildPower(snap, now), buildPlayoffs(snap, now), buildSchedule(snap, now)]);

describe('Public data never contains unrevealed scores', () => {
  it('during a game week: no scores, no reveal', () => {
    const snap = snapshot(0);
    const now = W1.startAt + 3600_000;
    expect(buildState(snap, now)).toMatchObject({ phase: 'open', revealAvailable: false });
    expect(buildReveal(snap, now)).toBeNull();
    expect(buildScoreboard(snap, now).lastWeek).toBeNull();
    expect(buildScoreboard(snap, now).thisWeek?.pairings.length).toBe(2);
    expect(buildPower(snap, now).ready).toBe(false);
  });

  it('in the reveal window: only /api/reveal has the new results', () => {
    const snap = snapshot(1);
    const now = W1.lockAt;
    const pub = publicJson(snap, now);
    expect(pub).not.toMatch(/700[1-4]/);
    expect(buildState(snap, now)).toMatchObject({ phase: 'locked', revealAvailable: true });
    expect(buildStandings(snap, now).league.every((r) => r.w + r.l + r.t === 0)).toBe(true);
    const reveal = buildReveal(snap, now)!;
    expect(JSON.stringify(reveal)).toMatch(/7001/);
    expect(reveal.games.length).toBe(2);
    expect(reveal.standings![0].after[0].teamId).toBe(2); // 7002 beat 7001
    expect(reveal.bracket).toBeNull();
  });

  it('at publish (Monday 00:00): results appear everywhere and the reveal closes', () => {
    const snap = snapshot(1);
    const before = W1.publishAt - 1;
    const after = W1.publishAt;
    expect(publicJson(snap, before)).not.toMatch(/700[1-4]/);
    expect(buildReveal(snap, before)).not.toBeNull();
    expect(publicJson(snap, after)).toMatch(/7001/);
    expect(buildReveal(snap, after)).toBeNull();
    expect(buildState(snap, after).revealAvailable).toBe(false);
    expect(buildScoreboard(snap, after).lastWeek?.games.length).toBe(2);
    expect(buildPower(snap, after)).toMatchObject({ ready: true, frozen: false });
    expect(buildPlayoffs(snap, after).stage).toBe('picture');
  });

  it('keeps week 2 secret while week 1 stays published', () => {
    const snap = snapshot(2);
    const now = W2.lockAt + 1000;
    const pub = publicJson(snap, now);
    expect(pub).toMatch(/7001/);
    expect(pub).not.toMatch(/800[1-4]/);
  });
});

describe('Playoffs', () => {
  it('hides the bracket until the final regular week publishes, but reveals it in the animation', () => {
    const snap = snapshot(2);
    const now = W2.lockAt + 1000;
    const playoffs = buildPlayoffs(snap, now);
    expect(playoffs.stage).toBe('picture');
    expect(playoffs.bracket).toBeNull();
    expect(buildSchedule(snap, now).weeks[2].pairings).toEqual([]);
    const reveal = buildReveal(snap, now)!;
    expect(reveal.seeds?.length).toBe(4);
    expect(reveal.bracket?.semi1?.pairing).toMatchObject({ seedA: 1, seedB: 4 });
    expect(reveal.bracket?.semi2?.pairing).toMatchObject({ seedA: 2, seedB: 3 });
  });

  it('shows the official bracket and freezes power rankings after the regular season', () => {
    const snap = snapshot(2);
    const now = SEMI.startAt;
    const playoffs = buildPlayoffs(snap, now);
    expect(playoffs.stage).toBe('bracket');
    expect(playoffs.seeds.map((s) => s.kind)).toEqual(['division', 'division', 'wildcard', 'wildcard']);
    expect(playoffs.bracket?.semi1?.result).toBeNull();
    expect(buildPower(snap, now).frozen).toBe(true);
    expect(buildScoreboard(snap, now).thisWeek?.pairings.map((p) => p.slot)).toEqual(['semi1', 'semi2']);
  });

  it('only teams with a playoff game can be scored in playoff weeks', () => {
    const snap = snapshot(2);
    // Pretend only one semifinal exists to prove eligibility follows the matchups.
    snap.matchups = snap.matchups.filter((m) => m.bracketSlot !== 'semi2');
    const t = buildTeacherWeek(snap, SEMI.startAt + 1000, {});
    const semi1 = snap.matchups.find((m) => m.bracketSlot === 'semi1')!;
    expect(t.scoring.open).toBe(true);
    expect([...t.eligibleTeamIds].sort()).toEqual([semi1.teamAId, semi1.teamBId].sort());
  });

  it('a tied semifinal advances the higher seed; the final and champion appear on schedule', () => {
    const snap = snapshot(3);
    const semi1 = snap.matchups.find((m) => m.bracketSlot === 'semi1')!;
    const semi2 = snap.matchups.find((m) => m.bracketSlot === 'semi2')!;
    // Force a tie in semi1 by giving both teams the same score.
    snap.scores.set(scoreKey(3, semi1.teamAId), { work: 5, participation: 0, voice: 0, positivity: 0 });
    snap.scores.set(scoreKey(3, semi1.teamBId), { work: 5, participation: 0, voice: 0, positivity: 0 });
    snap.matchups.push({ id: 7, weekId: 4, teamAId: semi1.teamAId, teamBId: semi2.teamAId, bracketSlot: 'final', seedA: 1, seedB: 2 });

    // Semifinal reveal window: public bracket has no results and no final yet.
    let now = SEMI.lockAt;
    let pub = buildPlayoffs(snap, now);
    expect(pub.bracket?.semi1?.result).toBeNull();
    expect(pub.bracket?.final).toBeNull();
    const reveal = buildReveal(snap, now)!;
    expect(reveal.bracket?.semi1?.result).toMatchObject({ winnerId: semi1.teamAId, onSeed: true });
    expect(reveal.bracket?.final?.pairing.slot).toBe('final');
    expect(reveal.championTeamId).toBeNull();

    // Semifinals published: results + Super Bowl pairing are public, no champion yet.
    now = SB.startAt;
    pub = buildPlayoffs(snap, now);
    expect(pub.bracket?.semi1?.result?.onSeed).toBe(true);
    expect(pub.bracket?.final?.result).toBeNull();
    expect(buildState(snap, now).championTeamId).toBeNull();

    // Super Bowl locked (not finalized in this snapshot → still nothing public).
    const done = snapshot(4);
    const s1 = done.matchups.find((m) => m.bracketSlot === 'semi1')!;
    const s2 = done.matchups.find((m) => m.bracketSlot === 'semi2')!;
    done.matchups.push({ id: 7, weekId: 4, teamAId: s1.teamAId, teamBId: s2.teamAId, bracketSlot: 'final', seedA: 1, seedB: 2 });
    expect(buildState(done, SB.lockAt)).toMatchObject({ phase: 'locked', revealAvailable: true, championTeamId: null });
    expect(JSON.stringify(buildPlayoffs(done, SB.lockAt))).not.toMatch(/990[1-4]/);
    expect(buildReveal(done, SB.lockAt)!.championTeamId).not.toBeNull();
    const end = buildState(done, SB.publishAt);
    expect(end.phase).toBe('complete');
    expect(end.championTeamId).toBe(buildReveal(done, SB.lockAt)!.championTeamId);
  });
});

describe('Setup validation', () => {
  const divs = [
    { id: 1, name: 'Room 12', teacherName: '', sortOrder: 1 },
    { id: 2, name: 'Room 14', teacherName: '', sortOrder: 2 },
  ];
  const teams = (a: number, b: number) => [...Array(a).fill({ divisionId: 1 }), ...Array(b).fill({ divisionId: 2 })];
  it('blocks odd divisions (naming the division) and leagues under 4 teams', () => {
    expect(validateStructure(divs, teams(3, 2)).join(' ')).toMatch(/Room 12 has an odd number/);
    expect(validateStructure([divs[0]], teams(2, 0)).join(' ')).toMatch(/at least 4 teams/);
    expect(validateStructure(divs, teams(2, 2))).toEqual([]);
    expect(validateStructure([divs[0]], teams(4, 0))).toEqual([]);
  });
});
