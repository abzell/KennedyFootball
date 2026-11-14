// Pure view builders. Given a snapshot of the league and "now", they produce exactly what each
// audience may see. Public views only ever read weeks whose publish time has passed, so unrevealed
// scores cannot leak; the reveal view reads weeks whose lock time has passed.

import { scoringStatus, weekAt } from '../shared/calendar';
import {
  ZERO_CATS,
  catTotal,
  computeRecords,
  gameResult,
  powerRankings,
  rankTeams,
  scoreKey,
  seedPlayoffs,
  type CatTotals,
  type LMatchup,
  type PlayoffField,
  type Records,
  type ScoreMap,
} from '../shared/league';
import type {
  Base,
  Bracket,
  BracketGame,
  DivisionInfo,
  Game,
  Pairing,
  PlayoffsData,
  PowerData,
  PublicState,
  RevealData,
  ScheduleData,
  ScoreboardData,
  SetupData,
  StandingRow,
  StandingsData,
  TeacherWeekData,
  TeamInfo,
  WeekInfo,
} from '../shared/types';

export interface SWeek extends WeekInfo {
  finalized: boolean;
}

export interface STeam extends TeamInfo {
  createdOrder: number;
  tiebreakSeed: number;
}

export interface Snapshot {
  season: { name: string; firstMonday: string; regularWeeks: number } | null;
  weeks: SWeek[];
  divisions: DivisionInfo[];
  teams: STeam[];
  matchups: LMatchup[];
  /** Final totals of finalized (locked) weeks only. */
  scores: ScoreMap;
}

type WeekPred = (w: SWeek) => boolean;

const info = (w: SWeek): WeekInfo => ({
  id: w.id,
  seq: w.seq,
  type: w.type,
  label: w.label,
  mondayDate: w.mondayDate,
  startAt: w.startAt,
  lockAt: w.lockAt,
  publishAt: w.publishAt,
  regularNo: w.regularNo,
});

const publicTeams = (snap: Snapshot): TeamInfo[] => snap.teams.map((t) => ({ id: t.id, divisionId: t.divisionId, nfl: t.nfl }));

function weekById(snap: Snapshot, id: number): SWeek | undefined {
  return snap.weeks.find((w) => w.id === id);
}

function matchupsOfWeek(snap: Snapshot, weekId: number): LMatchup[] {
  return snap.matchups.filter((m) => m.weekId === weekId).sort((a, b) => a.id - b.id);
}

function divisionOf(snap: Snapshot, teamId: number): number | null {
  return snap.teams.find((t) => t.id === teamId)?.divisionId ?? null;
}

function sortForDisplay<T extends { divisionId: number | null; slot: string | null; id: number }>(snap: Snapshot, list: T[]): T[] {
  const order = new Map(snap.divisions.map((d, i) => [d.id, i]));
  const key = (x: T) => (x.slot ? 1000 + ['semi1', 'semi2', 'final'].indexOf(x.slot) : order.get(x.divisionId ?? -1) ?? 999);
  return [...list].sort((a, b) => key(a) - key(b) || a.id - b.id);
}

function toPairing(snap: Snapshot, m: LMatchup): Pairing {
  return {
    id: m.id,
    divisionId: m.bracketSlot ? null : divisionOf(snap, m.teamAId),
    slot: m.bracketSlot,
    aId: m.teamAId,
    bId: m.teamBId,
    seedA: m.seedA,
    seedB: m.seedB,
  };
}

function toGame(snap: Snapshot, m: LMatchup, scores: ScoreMap = snap.scores): Game {
  const r = gameResult(m, scores);
  const cats = (teamId: number): CatTotals => ({ ...(scores.get(scoreKey(m.weekId, teamId)) ?? ZERO_CATS) });
  return {
    id: m.id,
    divisionId: m.bracketSlot ? null : divisionOf(snap, m.teamAId),
    slot: m.bracketSlot,
    a: { teamId: m.teamAId, seed: m.seedA, score: r.a, cats: cats(m.teamAId) },
    b: { teamId: m.teamBId, seed: m.seedB, score: r.b, cats: cats(m.teamBId) },
    outcome: r.outcome,
    winnerId: r.winnerId,
    onSeed: r.onSeed,
  };
}

const regularWeeks = (snap: Snapshot) => snap.weeks.filter((w) => w.type === 'regular');
const weekOfType = (snap: Snapshot, type: 'semifinal' | 'superbowl') => snap.weeks.find((w) => w.type === type);
const slotMatchup = (snap: Snapshot, slot: 'semi1' | 'semi2' | 'final') => snap.matchups.find((m) => m.bracketSlot === slot);

/** A playoff pairing may be shown once the round that produced it is visible. */
function pairingVisible(snap: Snapshot, m: LMatchup, visible: WeekPred): boolean {
  if (!m.bracketSlot) return true;
  if (m.bracketSlot === 'final') {
    const semi = weekOfType(snap, 'semifinal');
    return !!semi && visible(semi);
  }
  const regs = regularWeeks(snap);
  const lastReg = regs[regs.length - 1];
  return !!lastReg && visible(lastReg);
}

export function validateStructure(divisions: DivisionInfo[], teams: { divisionId: number }[]): string[] {
  const errors: string[] = [];
  if (divisions.length === 0) errors.push('Add at least one division.');
  for (const d of divisions) {
    const n = teams.filter((t) => t.divisionId === d.id).length;
    if (n < 2) errors.push(`${d.name} needs at least 2 teams (it has ${n}).`);
    else if (n % 2 !== 0) errors.push(`${d.name} has an odd number of teams (${n}). Add or remove one team.`);
  }
  if (teams.length < 4) errors.push(`The league needs at least 4 teams in total (it has ${teams.length}).`);
  return errors;
}

// ---------------------------------------------------------------- standings

interface Table {
  rec: Records;
  field: PlayoffField;
  weeksCounted: number;
  byDivision: { divisionId: number; rows: StandingRow[] }[];
  league: StandingRow[];
}

function buildTable(snap: Snapshot, counts: WeekPred): Table {
  const weeks = regularWeeks(snap).filter(counts);
  const matchups = weeks.flatMap((w) => matchupsOfWeek(snap, w.id));
  const rec = computeRecords(snap.teams, matchups, snap.scores);
  const field = seedPlayoffs(
    snap.divisions.map((d) => d.id),
    snap.teams,
    rec,
  );
  const badge = new Map<number, 'DIV' | 'WC'>();
  if (weeks.length > 0) for (const s of field.seeds) badge.set(s.teamId, s.kind === 'division' ? 'DIV' : 'WC');
  const row = (t: { id: number }, i: number): StandingRow => {
    const r = rec.byTeam.get(t.id)!;
    return {
      teamId: t.id,
      rank: i + 1,
      w: r.w,
      l: r.l,
      t: r.t,
      winPct: r.winPct,
      pf: r.pf,
      pa: r.pa,
      streak: r.streak,
      last: r.last ? { result: r.last.result, pf: r.last.pf, pa: r.last.pa, oppId: r.last.oppId } : null,
      badge: badge.get(t.id) ?? null,
    };
  };
  return {
    rec,
    field,
    weeksCounted: weeks.length,
    byDivision: snap.divisions.map((d) => ({
      divisionId: d.id,
      rows: rankTeams(
        snap.teams.filter((t) => t.divisionId === d.id),
        rec,
      ).map(row),
    })),
    league: rankTeams(snap.teams, rec).map(row),
  };
}

// ---------------------------------------------------------------- state

export function buildState(snap: Snapshot, now: number): PublicState {
  const live = snap.weeks.length > 0 && snap.matchups.length > 0;
  const weeks = live ? snap.weeks : [];
  const status = scoringStatus(weeks, now);
  const week = weekAt(weeks, now);
  const games = weeks.filter((w) => w.type !== 'skip');
  const published = games.filter((w) => w.publishAt <= now);
  const revealWeek = week && week.type !== 'skip' && week.lockAt <= now && week.finalized ? week : null;
  let championTeamId: number | null = null;
  const sb = weeks.find((w) => w.type === 'superbowl');
  const final = slotMatchup(snap, 'final');
  if (sb && final && sb.publishAt <= now) championTeamId = gameResult(final, snap.scores).winnerId;
  let phase = status.reason;
  // The public site treats the Super Bowl weekend like any other reveal window.
  if (phase === 'complete' && week) phase = 'locked';
  return {
    now,
    seasonName: snap.season?.name ?? null,
    phase,
    week: week ? info(week) : null,
    nextGameWeek: (() => {
      const next = games.find((w) => w.startAt > now);
      return next ? info(next) : null;
    })(),
    lastPublishedWeek: published.length ? info(published[published.length - 1]) : null,
    revealAvailable: !!revealWeek,
    revealWeek: revealWeek ? info(revealWeek) : null,
    revealBracket: !!revealWeek && revealWeek.type === 'regular' && regularWeeks(snap).at(-1)?.id === revealWeek.id && !!slotMatchup(snap, 'semi1'),
    championTeamId,
  };
}

function base(snap: Snapshot, now: number): Base {
  return { state: buildState(snap, now), divisions: snap.divisions, teams: publicTeams(snap) };
}

// ---------------------------------------------------------------- public pages

export function buildScoreboard(snap: Snapshot, now: number): ScoreboardData {
  const b = base(snap, now);
  const published: WeekPred = (w) => w.publishAt <= now;
  const last = b.state.lastPublishedWeek;
  const cur = b.state.week && b.state.week.type !== 'skip' ? b.state.week : null;
  const upcoming = cur ?? b.state.nextGameWeek;
  return {
    ...b,
    lastWeek: last
      ? {
          week: last,
          games: sortForDisplay(
            snap,
            matchupsOfWeek(snap, last.id).map((m) => toGame(snap, m)),
          ),
        }
      : null,
    thisWeek: upcoming
      ? {
          week: upcoming,
          isCurrent: !!cur,
          pairings: sortForDisplay(
            snap,
            matchupsOfWeek(snap, upcoming.id)
              .filter((m) => pairingVisible(snap, m, published))
              .map((m) => toPairing(snap, m)),
          ),
        }
      : null,
  };
}

export function buildStandings(snap: Snapshot, now: number): StandingsData {
  const table = buildTable(snap, (w) => w.publishAt <= now);
  return { ...base(snap, now), byDivision: table.byDivision, league: table.league };
}

export function buildPower(snap: Snapshot, now: number): PowerData {
  const regs = regularWeeks(snap);
  const published = regs.filter((w) => w.publishAt <= now);
  const rows = powerRankings(
    snap.teams,
    published.map((w) => matchupsOfWeek(snap, w.id)),
    snap.scores,
  );
  const rec = computeRecords(
    snap.teams,
    published.flatMap((w) => matchupsOfWeek(snap, w.id)),
    snap.scores,
  );
  return {
    ...base(snap, now),
    ready: !!rows && snap.teams.length > 0,
    frozen: regs.length > 0 && published.length === regs.length,
    asOfWeek: published.length ? info(published[published.length - 1]) : null,
    rows: (rows ?? []).map((p) => {
      const r = rec.byTeam.get(p.teamId)!;
      return { teamId: p.teamId, rank: p.rank, move: p.move, power: p.power, w: r.w, l: r.l, t: r.t, pf: r.pf };
    }),
  };
}

function buildBracket(snap: Snapshot, visible: WeekPred): Bracket {
  const semiWeek = weekOfType(snap, 'semifinal');
  const sbWeek = weekOfType(snap, 'superbowl');
  const entry = (slot: 'semi1' | 'semi2' | 'final', week: SWeek | undefined): BracketGame | null => {
    const m = slotMatchup(snap, slot);
    if (!m || !pairingVisible(snap, m, visible)) return null;
    return { pairing: toPairing(snap, m), result: week && visible(week) && week.finalized ? toGame(snap, m) : null };
  };
  const final = entry('final', sbWeek);
  return {
    semi1: entry('semi1', semiWeek),
    semi2: entry('semi2', semiWeek),
    final,
    championTeamId: final?.result?.winnerId ?? null,
  };
}

export function buildPlayoffs(snap: Snapshot, now: number): PlayoffsData {
  const published: WeekPred = (w) => w.publishAt <= now;
  const regs = regularWeeks(snap);
  const done = regs.filter(published).length;
  const table = buildTable(snap, published);
  const semiWeek = weekOfType(snap, 'semifinal');
  const sbWeek = weekOfType(snap, 'superbowl');
  const official = regs.length > 0 && done === regs.length && !!slotMatchup(snap, 'semi1');
  const stage = official ? 'bracket' : done === 0 ? 'pre' : 'picture';
  return {
    ...base(snap, now),
    stage,
    seeds: stage === 'pre' ? [] : table.field.seeds,
    hunt: stage === 'picture' ? table.field.hunt : [],
    bracket: official ? buildBracket(snap, published) : null,
    semifinalWeek: semiWeek ? info(semiWeek) : null,
    superBowlWeek: sbWeek ? info(sbWeek) : null,
  };
}

export function buildSchedule(snap: Snapshot, now: number): ScheduleData {
  const published: WeekPred = (w) => w.publishAt <= now;
  return {
    ...base(snap, now),
    weeks: snap.weeks.map((w) => {
      const ms = matchupsOfWeek(snap, w.id).filter((m) => pairingVisible(snap, m, published));
      return {
        week: info(w),
        pairings: sortForDisplay(
          snap,
          ms.map((m) => toPairing(snap, m)),
        ),
        games:
          w.type !== 'skip' && published(w)
            ? sortForDisplay(
                snap,
                ms.map((m) => toGame(snap, m)),
              )
            : null,
      };
    }),
  };
}

/** Results of the just-locked week. Null (→ HTTP 404) outside the reveal window. */
export function buildReveal(snap: Snapshot, now: number): RevealData | null {
  const b = base(snap, now);
  const rw = b.state.revealWeek;
  if (!rw) return null;
  const week = weekById(snap, rw.id)!;
  const locked: WeekPred = (w) => w.lockAt <= now && w.finalized;
  const published: WeekPred = (w) => w.publishAt <= now;
  const games = sortForDisplay(
    snap,
    matchupsOfWeek(snap, week.id).map((m) => toGame(snap, m)),
  );
  const regs = regularWeeks(snap);
  const isFinalRegular = week.type === 'regular' && regs[regs.length - 1]?.id === week.id;
  let standings: RevealData['standings'] = null;
  let seeds: RevealData['seeds'] = null;
  if (week.type === 'regular') {
    const before = buildTable(snap, published);
    const after = buildTable(snap, locked);
    standings = after.byDivision.map((d) => ({
      divisionId: d.divisionId,
      before: before.byDivision.find((x) => x.divisionId === d.divisionId)!.rows.map((r) => r.teamId),
      after: d.rows,
    }));
    if (isFinalRegular) seeds = after.field.seeds;
  }
  const bracket = isFinalRegular || week.type !== 'regular' ? buildBracket(snap, locked) : null;
  return {
    ...b,
    week: rw,
    games,
    standings,
    seeds,
    bracket,
    championTeamId: week.type === 'superbowl' ? bracket?.championTeamId ?? null : null,
  };
}

// ---------------------------------------------------------------- teacher

export function buildTeacherWeek(snap: Snapshot, now: number, live: Record<number, CatTotals>): TeacherWeekData {
  const status = scoringStatus(snap.weeks, now);
  const week = weekAt(snap.weeks, now);
  const games = snap.weeks.filter((w) => w.type !== 'skip');
  const next = games.find((w) => w.startAt > now);
  const pairings =
    week && week.type !== 'skip'
      ? sortForDisplay(
          snap,
          matchupsOfWeek(snap, week.id).map((m) => toPairing(snap, m)),
        )
      : [];
  const totals: Record<number, CatTotals> = {};
  for (const p of pairings) {
    for (const id of [p.aId, p.bId]) {
      totals[id] = week!.finalized ? { ...(snap.scores.get(scoreKey(week!.id, id)) ?? ZERO_CATS) } : { ...(live[id] ?? ZERO_CATS) };
    }
  }
  return {
    now,
    seasonName: snap.season?.name ?? null,
    scoring: { open: status.open && pairings.length > 0, reason: status.reason },
    week: week ? info(week) : null,
    nextGameWeek: next ? info(next) : null,
    firstWeek: snap.weeks.length ? info(snap.weeks[0]) : null,
    divisions: snap.divisions,
    teams: publicTeams(snap),
    pairings,
    totals,
    eligibleTeamIds: status.open ? pairings.flatMap((p) => [p.aId, p.bId]) : [],
  };
}

export function isStructureLocked(snap: Snapshot, now: number): boolean {
  return snap.matchups.some((m) => (weekById(snap, m.weekId)?.startAt ?? Infinity) <= now);
}

export function buildSetup(snap: Snapshot, now: number, skipWeeks: { date: string; label: string }[]): SetupData {
  return {
    now,
    season: snap.season,
    skipWeeks,
    divisions: snap.divisions,
    teams: publicTeams(snap),
    weeks: snap.weeks.map((w) => ({
      ...info(w),
      started: w.startAt <= now,
      pairings: sortForDisplay(
        snap,
        matchupsOfWeek(snap, w.id).map((m) => toPairing(snap, m)),
      ),
    })),
    structureLocked: isStructureLocked(snap, now),
    errors: validateStructure(snap.divisions, snap.teams),
  };
}

/** Seeds for the official bracket: computed from every regular-season week. */
export function finalField(snap: Snapshot): PlayoffField {
  return buildTable(snap, () => true).field;
}

export { catTotal };
