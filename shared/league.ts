// Pure league math: results, standings, tiebreakers, playoff seeding, power rankings.
// Everything here is derived from matchups + weekly category totals.

export const CATEGORIES = ['work', 'participation', 'voice', 'positivity'] as const;
export type Category = (typeof CATEGORIES)[number];
export type CatTotals = Record<Category, number>;

export const CATEGORY_INFO: Record<Category, { label: string; short: string; description: string }> = {
  work: { label: 'Work Completion', short: 'Work', description: 'Use class time wisely and complete assigned work.' },
  participation: { label: 'Participation', short: 'Participation', description: 'Participate in lessons and discussions.' },
  voice: { label: 'Voice Level', short: 'Voice', description: 'Follow classroom voice-level expectations.' },
  positivity: { label: 'Positivity', short: 'Positivity', description: 'Be a positive teammate. Show sportsmanship and respect.' },
};

export const ZERO_CATS: CatTotals = { work: 0, participation: 0, voice: 0, positivity: 0 };

export function catTotal(c: CatTotals | undefined): number {
  return c ? c.work + c.participation + c.voice + c.positivity : 0;
}

export interface LTeam {
  id: number;
  divisionId: number;
  tiebreakSeed: number;
}

export interface LMatchup {
  id: number;
  weekId: number;
  teamAId: number;
  teamBId: number;
  bracketSlot: 'semi1' | 'semi2' | 'final' | null;
  seedA: number | null;
  seedB: number | null;
}

/** Weekly totals keyed by `${weekId}:${teamId}` */
export type ScoreMap = Map<string, CatTotals>;
export const scoreKey = (weekId: number, teamId: number) => `${weekId}:${teamId}`;

export type Outcome = 'A' | 'B' | 'T';

export interface GameResult {
  a: number;
  b: number;
  outcome: Outcome;
  winnerId: number | null;
  /** Playoff tie decided by the higher seed. */
  onSeed: boolean;
}

export function gameResult(m: LMatchup, scores: ScoreMap): GameResult {
  const a = catTotal(scores.get(scoreKey(m.weekId, m.teamAId)));
  const b = catTotal(scores.get(scoreKey(m.weekId, m.teamBId)));
  if (a > b) return { a, b, outcome: 'A', winnerId: m.teamAId, onSeed: false };
  if (b > a) return { a, b, outcome: 'B', winnerId: m.teamBId, onSeed: false };
  if (m.bracketSlot) {
    // A tied playoff game goes to the higher seed (the lower seed number).
    const aWins = (m.seedA ?? 99) <= (m.seedB ?? 99);
    return { a, b, outcome: aWins ? 'A' : 'B', winnerId: aWins ? m.teamAId : m.teamBId, onSeed: true };
  }
  return { a, b, outcome: 'T', winnerId: null, onSeed: false };
}

export interface TeamRecord {
  teamId: number;
  w: number;
  l: number;
  t: number;
  games: number;
  winPct: number;
  pf: number;
  pa: number;
  streak: string;
  last: { result: 'W' | 'L' | 'T'; pf: number; pa: number; oppId: number; weekId: number } | null;
  /** Weekly scores in week order (regular season only). */
  weekly: number[];
}

export interface PlayedGame {
  aId: number;
  bId: number;
  outcome: Outcome;
}

export interface Records {
  byTeam: Map<number, TeamRecord>;
  games: PlayedGame[];
}

/**
 * Builds W-L-T records from regular-season matchups.
 * `matchups` must already be limited to the weeks that count and be ordered by week.
 */
export function computeRecords(teams: LTeam[], matchups: LMatchup[], scores: ScoreMap): Records {
  const byTeam = new Map<number, TeamRecord>();
  const results = new Map<number, ('W' | 'L' | 'T')[]>();
  for (const t of teams) {
    byTeam.set(t.id, { teamId: t.id, w: 0, l: 0, t: 0, games: 0, winPct: 0, pf: 0, pa: 0, streak: '—', last: null, weekly: [] });
    results.set(t.id, []);
  }
  const games: PlayedGame[] = [];
  for (const m of matchups) {
    if (m.bracketSlot) continue; // playoff games never change standings
    const ra = byTeam.get(m.teamAId);
    const rb = byTeam.get(m.teamBId);
    if (!ra || !rb) continue;
    const g = gameResult(m, scores);
    games.push({ aId: m.teamAId, bId: m.teamBId, outcome: g.outcome });
    const apply = (r: TeamRecord, pf: number, pa: number, res: 'W' | 'L' | 'T', oppId: number) => {
      r.games++;
      r.pf += pf;
      r.pa += pa;
      if (res === 'W') r.w++;
      else if (res === 'L') r.l++;
      else r.t++;
      r.weekly.push(pf);
      r.last = { result: res, pf, pa, oppId, weekId: m.weekId };
      results.get(r.teamId)!.push(res);
    };
    apply(ra, g.a, g.b, g.outcome === 'A' ? 'W' : g.outcome === 'B' ? 'L' : 'T', m.teamBId);
    apply(rb, g.b, g.a, g.outcome === 'B' ? 'W' : g.outcome === 'A' ? 'L' : 'T', m.teamAId);
  }
  for (const r of byTeam.values()) {
    r.winPct = r.games ? (r.w + 0.5 * r.t) / r.games : 0;
    const list = results.get(r.teamId)!;
    if (list.length) {
      const lastRes = list[list.length - 1];
      let n = 0;
      for (let i = list.length - 1; i >= 0 && list[i] === lastRes; i--) n++;
      r.streak = `${lastRes}${n}`;
    }
  }
  return { byTeam, games };
}

const EPS = 1e-9;
const cmpDesc = (a: number, b: number) => (Math.abs(a - b) < EPS ? 0 : b - a);

/**
 * Orders teams by the section 6.4 tiebreakers:
 * 1. Win %  2. PF  3. head-to-head win % among the tied teams only  4. stored coin flip.
 */
export function rankTeams(teams: LTeam[], rec: Records): LTeam[] {
  const r = (id: number) => rec.byTeam.get(id)!;
  const sorted = [...teams].sort((x, y) => cmpDesc(r(x.id).winPct, r(y.id).winPct) || r(y.id).pf - r(x.id).pf || 0);
  const out: LTeam[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && cmpDesc(r(sorted[i].id).winPct, r(sorted[j].id).winPct) === 0 && r(sorted[i].id).pf === r(sorted[j].id).pf) j++;
    const group = sorted.slice(i, j);
    if (group.length > 1) {
      const ids = new Set(group.map((g) => g.id));
      const h2h = new Map<number, { pts: number; games: number }>();
      for (const g of group) h2h.set(g.id, { pts: 0, games: 0 });
      for (const g of rec.games) {
        if (!ids.has(g.aId) || !ids.has(g.bId)) continue;
        const a = h2h.get(g.aId)!;
        const b = h2h.get(g.bId)!;
        a.games++;
        b.games++;
        if (g.outcome === 'A') a.pts += 1;
        else if (g.outcome === 'B') b.pts += 1;
        else {
          a.pts += 0.5;
          b.pts += 0.5;
        }
      }
      // Teams that never met the others sit at .500 so only the coin flip separates them.
      const pct = (id: number) => {
        const h = h2h.get(id)!;
        return h.games ? h.pts / h.games : 0.5;
      };
      group.sort((x, y) => cmpDesc(pct(x.id), pct(y.id)) || y.tiebreakSeed - x.tiebreakSeed || x.id - y.id);
    }
    out.push(...group);
    i = j;
  }
  return out;
}

export interface Seed {
  seed: number;
  teamId: number;
  kind: 'division' | 'wildcard';
}

export interface PlayoffField {
  seeds: Seed[];
  /** The next two teams outside the field. */
  hunt: number[];
}

export const PLAYOFF_TEAMS = 4;

/**
 * Division winners take seeds 1..D (ranked against each other with the standard tiebreakers).
 * The remaining spots are wildcards: best non-winners by PF, then win %, then coin flip.
 */
export function seedPlayoffs(divisionIds: number[], teams: LTeam[], rec: Records): PlayoffField {
  const winners: LTeam[] = [];
  for (const d of divisionIds) {
    const ranked = rankTeams(teams.filter((t) => t.divisionId === d), rec);
    if (ranked.length) winners.push(ranked[0]);
  }
  const winnerIds = new Set(winners.map((w) => w.id));
  const seededWinners = rankTeams(winners, rec).slice(0, PLAYOFF_TEAMS);
  const r = (id: number) => rec.byTeam.get(id)!;
  const rest = teams
    .filter((t) => !winnerIds.has(t.id))
    .sort((x, y) => r(y.id).pf - r(x.id).pf || cmpDesc(r(x.id).winPct, r(y.id).winPct) || y.tiebreakSeed - x.tiebreakSeed || x.id - y.id);
  const wildCount = Math.max(0, PLAYOFF_TEAMS - seededWinners.length);
  const seeds: Seed[] = [
    ...seededWinners.map((t, i) => ({ seed: i + 1, teamId: t.id, kind: 'division' as const })),
    ...rest.slice(0, wildCount).map((t, i) => ({ seed: seededWinners.length + i + 1, teamId: t.id, kind: 'wildcard' as const })),
  ];
  return { seeds, hunt: rest.slice(wildCount, wildCount + 2).map((t) => t.id) };
}

export interface PowerRow {
  teamId: number;
  rank: number;
  power: number;
  /** Positive = moved up n places; null = first week (no previous ranking). */
  move: number | null;
}

/** Power = 0.5·WinPct + 0.3·Recent + 0.2·Season, ties falling back to league-table order. */
export function powerOrder(teams: LTeam[], rec: Records): { teamId: number; power: number }[] {
  const r = (id: number) => rec.byTeam.get(id)!;
  const recentOf = (id: number) => {
    const w = r(id).weekly.slice(-2);
    return w.length ? w.reduce((s, v) => s + v, 0) / w.length : 0;
  };
  const seasonOf = (id: number) => (r(id).games ? r(id).pf / r(id).games : 0);
  const maxRecent = Math.max(0, ...teams.map((t) => recentOf(t.id)));
  const maxSeason = Math.max(0, ...teams.map((t) => seasonOf(t.id)));
  const league = rankTeams(teams, rec);
  const leagueIdx = new Map(league.map((t, i) => [t.id, i]));
  return teams
    .map((t) => ({
      teamId: t.id,
      power:
        0.5 * r(t.id).winPct +
        0.3 * (maxRecent > 0 ? recentOf(t.id) / maxRecent : 0) +
        0.2 * (maxSeason > 0 ? seasonOf(t.id) / maxSeason : 0),
    }))
    .sort((x, y) => cmpDesc(x.power, y.power) || leagueIdx.get(x.teamId)! - leagueIdx.get(y.teamId)!);
}

/**
 * `weeksOfMatchups` holds the regular-season matchups of each counted week, in week order.
 * Returns null before the first week counts.
 */
export function powerRankings(teams: LTeam[], weeksOfMatchups: LMatchup[][], scores: ScoreMap): PowerRow[] | null {
  const k = weeksOfMatchups.length;
  if (k === 0) return null;
  const current = powerOrder(teams, computeRecords(teams, weeksOfMatchups.flat(), scores));
  let prevRank: Map<number, number> | null = null;
  if (k > 1) {
    const prev = powerOrder(teams, computeRecords(teams, weeksOfMatchups.slice(0, k - 1).flat(), scores));
    prevRank = new Map(prev.map((p, i) => [p.teamId, i + 1]));
  }
  return current.map((c, i) => ({
    teamId: c.teamId,
    rank: i + 1,
    power: c.power,
    move: prevRank ? prevRank.get(c.teamId)! - (i + 1) : null,
  }));
}
