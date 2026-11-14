// D1 access: loading the league snapshot and lazily deriving anything that depends on the clock.
// There are no scheduled jobs — every read calls ensureDerived(), which is idempotent.

import { buildCalendar, type SkipWeek } from '../shared/calendar';
import { CATEGORIES, gameResult, scoreKey, type CatTotals, type LMatchup, type ScoreMap } from '../shared/league';
import { pairingsForRegularWeek } from '../shared/schedule';
import { finalField, validateStructure, type SWeek, type Snapshot } from './views';

export interface Env {
  DB: D1Database;
  NOW_OVERRIDE?: string;
  /** Set (to any value except off/false/0) only on a separate TEST site: enables the simulated clock. */
  TEST_MODE?: string;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Row = Record<string, any>;

const toMatchup = (r: Row): LMatchup => ({
  id: r.id,
  weekId: r.week_id,
  teamAId: r.team_a_id,
  teamBId: r.team_b_id,
  bracketSlot: r.bracket_slot ?? null,
  seedA: r.seed_a ?? null,
  seedB: r.seed_b ?? null,
});

const toCats = (r: Row): CatTotals => ({ work: r.work, participation: r.participation, voice: r.voice, positivity: r.positivity });

export async function loadSnapshot(db: D1Database): Promise<Snapshot> {
  const [season, weeks, divisions, teams, matchups, scores] = await db.batch<Row>([
    db.prepare('SELECT name, first_monday, regular_weeks FROM season WHERE id = 1'),
    db.prepare('SELECT * FROM week ORDER BY seq'),
    db.prepare('SELECT * FROM division ORDER BY sort_order, id'),
    db.prepare('SELECT * FROM team ORDER BY created_order, id'),
    db.prepare('SELECT * FROM matchup ORDER BY id'),
    db.prepare('SELECT * FROM week_score'),
  ]);
  const s = season.results[0];
  const scoreMap: ScoreMap = new Map();
  for (const r of scores.results) scoreMap.set(scoreKey(r.week_id, r.team_id), toCats(r));
  return {
    season: s ? { name: s.name, firstMonday: s.first_monday, regularWeeks: s.regular_weeks } : null,
    weeks: weeks.results.map(
      (w): SWeek => ({
        id: w.id,
        seq: w.seq,
        type: w.type,
        label: w.label,
        mondayDate: w.monday_date,
        startAt: w.start_at,
        lockAt: w.lock_at,
        publishAt: w.publish_at,
        regularNo: w.regular_no ?? null,
        finalized: !!w.finalized,
      }),
    ),
    divisions: divisions.results.map((d) => ({ id: d.id, name: d.name, teacherName: d.teacher_name, sortOrder: d.sort_order })),
    teams: teams.results.map((t) => ({
      id: t.id,
      divisionId: t.division_id,
      nfl: t.nfl_team_id,
      createdOrder: t.created_order,
      tiebreakSeed: t.tiebreak_seed,
    })),
    matchups: matchups.results.map(toMatchup),
    scores: scoreMap,
  };
}

async function reloadPlayoffMatchups(db: D1Database, snap: Snapshot) {
  const rows = await db.prepare('SELECT * FROM matchup WHERE bracket_slot IS NOT NULL').all<Row>();
  snap.matchups = [...snap.matchups.filter((m) => !m.bracketSlot), ...rows.results.map(toMatchup)];
}

/**
 * Freezes a locked week: copies its totals from the raw awards into week_score and marks the week
 * finalized. Award inserts/deletes are guarded by the same flag, so nothing can change afterwards.
 */
async function finalizeWeek(db: D1Database, snap: Snapshot, week: SWeek) {
  const sums = CATEGORIES.map((c) => `COALESCE(SUM(a.category = '${c}'), 0)`).join(', ');
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO week_score (week_id, team_id, work, participation, voice, positivity)
         SELECT ?1, t.team_id, ${sums}
         FROM (SELECT team_a_id AS team_id FROM matchup WHERE week_id = ?1
               UNION SELECT team_b_id FROM matchup WHERE week_id = ?1) t
         LEFT JOIN award a ON a.team_id = t.team_id AND a.week_id = ?1
         WHERE (SELECT finalized FROM week WHERE id = ?1) = 0
         GROUP BY t.team_id`,
      )
      .bind(week.id),
    db.prepare('UPDATE week SET finalized = 1 WHERE id = ?1').bind(week.id),
  ]);
  const rows = await db.prepare('SELECT * FROM week_score WHERE week_id = ?1').bind(week.id).all<Row>();
  for (const r of rows.results) snap.scores.set(scoreKey(r.week_id, r.team_id), toCats(r));
  week.finalized = true;
}

async function ensureSemis(db: D1Database, snap: Snapshot) {
  if (snap.matchups.some((m) => m.bracketSlot === 'semi1')) return;
  const semiWeek = snap.weeks.find((w) => w.type === 'semifinal');
  if (!semiWeek) return;
  const { seeds } = finalField(snap);
  if (seeds.length < 4) return;
  const ins = 'INSERT OR IGNORE INTO matchup (week_id, team_a_id, team_b_id, bracket_slot, seed_a, seed_b) VALUES (?, ?, ?, ?, ?, ?)';
  await db.batch([
    db.prepare(ins).bind(semiWeek.id, seeds[0].teamId, seeds[3].teamId, 'semi1', 1, 4),
    db.prepare(ins).bind(semiWeek.id, seeds[1].teamId, seeds[2].teamId, 'semi2', 2, 3),
  ]);
  await reloadPlayoffMatchups(db, snap);
}

async function ensureFinal(db: D1Database, snap: Snapshot) {
  if (snap.matchups.some((m) => m.bracketSlot === 'final')) return;
  const sbWeek = snap.weeks.find((w) => w.type === 'superbowl');
  const s1 = snap.matchups.find((m) => m.bracketSlot === 'semi1');
  const s2 = snap.matchups.find((m) => m.bracketSlot === 'semi2');
  if (!sbWeek || !s1 || !s2) return;
  const side = (m: LMatchup) => {
    const r = gameResult(m, snap.scores);
    return r.winnerId === m.teamAId ? { id: m.teamAId, seed: m.seedA } : { id: m.teamBId, seed: m.seedB };
  };
  const a = side(s1);
  const b = side(s2);
  await db
    .prepare('INSERT OR IGNORE INTO matchup (week_id, team_a_id, team_b_id, bracket_slot, seed_a, seed_b) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(sbWeek.id, a.id, b.id, 'final', a.seed, b.seed)
    .run();
  await reloadPlayoffMatchups(db, snap);
}

/** Finalizes every week whose lock has passed and creates playoff games when they are due. */
export async function ensureDerived(db: D1Database, snap: Snapshot, now: number): Promise<void> {
  const regs = snap.weeks.filter((w) => w.type === 'regular');
  const lastRegular = regs[regs.length - 1];
  for (const w of snap.weeks) {
    if (w.type === 'skip') continue;
    if (w.lockAt > now) break;
    if (!w.finalized) await finalizeWeek(db, snap, w);
    if (lastRegular && w.id === lastRegular.id) await ensureSemis(db, snap);
    if (w.type === 'semifinal') await ensureFinal(db, snap);
  }
}

export async function liveTotals(db: D1Database, weekId: number): Promise<Record<number, CatTotals>> {
  const rows = await db
    .prepare('SELECT team_id, category, COUNT(*) AS c FROM award WHERE week_id = ?1 GROUP BY team_id, category')
    .bind(weekId)
    .all<Row>();
  const out: Record<number, CatTotals> = {};
  for (const r of rows.results) {
    out[r.team_id] ??= { work: 0, participation: 0, voice: 0, positivity: 0 };
    out[r.team_id][r.category as keyof CatTotals] = r.c;
  }
  return out;
}

export async function loadSkipWeeks(db: D1Database): Promise<SkipWeek[]> {
  const rows = await db.prepare('SELECT monday_date, label FROM skip_week ORDER BY monday_date').all<Row>();
  return rows.results.map((r) => ({ date: r.monday_date, label: r.label }));
}

// ---------------------------------------------------------------- schedule + calendar writes

function regularPairStatements(db: D1Database, snap: Snapshot, weeks: SWeek[]): D1PreparedStatement[] {
  const out: D1PreparedStatement[] = [];
  for (const w of weeks) {
    for (const d of snap.divisions) {
      const ids = snap.teams
        .filter((t) => t.divisionId === d.id)
        .sort((a, b) => a.createdOrder - b.createdOrder || a.id - b.id)
        .map((t) => t.id);
      for (const [a, b] of pairingsForRegularWeek(ids, w.regularNo!)) {
        out.push(db.prepare('INSERT INTO matchup (week_id, team_a_id, team_b_id) VALUES (?, ?, ?)').bind(w.id, a, b));
      }
    }
  }
  return out;
}

/**
 * (Re)generates the round-robin schedule for regular weeks that have not started,
 * optionally only from a given week onward. Clears them instead when the setup is invalid.
 */
export async function syncSchedule(db: D1Database, now: number, fromSeq = 0): Promise<void> {
  const snap = await loadSnapshot(db);
  const weeks = snap.weeks.filter((w) => w.type === 'regular' && w.startAt > now && w.seq >= fromSeq);
  if (weeks.length === 0) return;
  const valid = validateStructure(snap.divisions, snap.teams).length === 0;
  const stmts: D1PreparedStatement[] = weeks.map((w) => db.prepare('DELETE FROM matchup WHERE week_id = ? AND bracket_slot IS NULL').bind(w.id));
  if (valid) stmts.push(...regularPairStatements(db, snap, weeks));
  await db.batch(stmts);
}

/**
 * Rebuilds the calendar from the season fields. Weeks that already started are never touched;
 * a change that would alter one is rejected.
 */
export async function applyCalendar(
  db: D1Database,
  now: number,
  season: { name: string; firstMonday: string; regularWeeks: number },
  skips: SkipWeek[],
): Promise<void> {
  const snap = await loadSnapshot(db);
  const cal = buildCalendar(season.firstMonday, season.regularWeeks, skips);
  const started = snap.weeks.filter((w) => w.startAt <= now);
  if (started.length > 0) {
    const calStarted = cal.filter((w) => w.startAt <= now);
    const same =
      calStarted.length === started.length &&
      started.every((w, i) => calStarted[i].mondayDate === w.mondayDate && calStarted[i].type === w.type && calStarted[i].regularNo === w.regularNo);
    if (!same) throw new HttpError(409, 'That change would alter a week that has already started. Only future weeks can change.');
  }
  const startedDates = new Set(started.map((w) => w.mondayDate));
  const future = snap.weeks.filter((w) => !startedDates.has(w.mondayDate));
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO season (id, name, first_monday, regular_weeks, created_at) VALUES (1, ?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET name = ?1, first_monday = ?2, regular_weeks = ?3`,
      )
      .bind(season.name, season.firstMonday, season.regularWeeks, now),
    db.prepare('DELETE FROM skip_week'),
    ...skips.map((s) => db.prepare('INSERT INTO skip_week (monday_date, label) VALUES (?, ?)').bind(s.date, s.label)),
    ...future.flatMap((w) => [
      db.prepare('DELETE FROM matchup WHERE week_id = ?').bind(w.id),
      db.prepare('DELETE FROM week_score WHERE week_id = ?').bind(w.id),
      db.prepare('DELETE FROM week WHERE id = ?').bind(w.id),
    ]),
    ...cal
      .filter((w) => !startedDates.has(w.mondayDate))
      .map((w) =>
        db
          .prepare('INSERT INTO week (seq, type, monday_date, start_at, lock_at, publish_at, label, regular_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(w.seq, w.type, w.mondayDate, w.startAt, w.lockAt, w.publishAt, w.label, w.regularNo),
      ),
  ];
  await db.batch(stmts);
  await syncSchedule(db, now);
}
