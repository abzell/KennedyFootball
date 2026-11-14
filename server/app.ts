// HTTP API. Every write endpoint checks the teacher session on the server.

import { scoringStatus } from '../shared/calendar';
import { CATEGORIES, type Category } from '../shared/league';
import { isNflTeamId } from '../shared/nflTeams';
import { validatePairs, type Pair } from '../shared/schedule';
import { isMonday, isValidDate } from '../shared/time';
import type { AuthStatus, AwardRow } from '../shared/types';
import { checkToken, clearCookie, COOKIE, hashPin, isValidPin, makeToken, newSecret, readCookie, sessionCookie, verifyPin } from './auth';
import { applyCalendar, ensureDerived, HttpError, liveTotals, loadSkipWeeks, loadSnapshot, syncSchedule, type Env } from './store';
import {
  buildPlayoffs,
  buildPower,
  buildReveal,
  buildSchedule,
  buildScoreboard,
  buildSetup,
  buildStandings,
  buildState,
  buildTeacherWeek,
  isStructureLocked,
  type Snapshot,
} from './views';

const MAX_FAILS = 5;
const BLOCK_MS = 15 * 60 * 1000;
const PUBLIC_CACHE_MS = 5000;

// Short in-memory cache of the public snapshot. It only ever holds finalized-week totals, and the
// views re-apply the clock on every request, so serving it slightly stale cannot leak anything.
let cached: { snap: Snapshot; at: number } | null = null;

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** Server clock. NOW_OVERRIDE is honoured only when serving from localhost (development). */
export function getNow(request: Request, env: Env): number {
  if (env.NOW_OVERRIDE && isLocalHost(new URL(request.url).hostname)) {
    const t = Date.parse(env.NOW_OVERRIDE);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

async function body(request: Request): Promise<Record<string, any>> {
  try {
    const data = await request.json();
    if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, any>;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, 'Invalid request.');
}

interface Settings {
  pin_hash: string | null;
  pin_version: number;
  session_secret: string | null;
}

async function loadSettings(db: D1Database): Promise<Settings> {
  const row = await db.prepare('SELECT pin_hash, pin_version, session_secret FROM settings WHERE id = 1').first<Settings>();
  return row ?? { pin_hash: null, pin_version: 1, session_secret: null };
}

async function isAuthed(request: Request, settings: Settings, now: number): Promise<boolean> {
  if (!settings.pin_hash) return false;
  return checkToken(readCookie(request, COOKIE), settings.pin_version, settings.session_secret, now);
}

async function requireTeacher(request: Request, env: Env, now: number): Promise<Settings> {
  const settings = await loadSettings(env.DB);
  if (!(await isAuthed(request, settings, now))) throw new HttpError(401, 'Please enter the teacher PIN.');
  return settings;
}

function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'local';
}

async function assertNotBlocked(db: D1Database, ip: string, now: number) {
  const row = await db.prepare('SELECT fail_count, window_start FROM login_attempt WHERE ip = ?').bind(ip).first<{ fail_count: number; window_start: number }>();
  if (row && row.fail_count >= MAX_FAILS && now - row.window_start < BLOCK_MS) {
    const mins = Math.ceil((BLOCK_MS - (now - row.window_start)) / 60000);
    throw new HttpError(429, `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }
}

async function recordFailure(db: D1Database, ip: string, now: number) {
  // Each failure restarts the 15-minute window; the 5th failure starts the block.
  await db
    .prepare(
      `INSERT INTO login_attempt (ip, fail_count, window_start) VALUES (?1, 1, ?2)
       ON CONFLICT(ip) DO UPDATE SET
         fail_count = CASE WHEN ?2 - window_start >= ?3 THEN 1 ELSE fail_count + 1 END,
         window_start = ?2`,
    )
    .bind(ip, now, BLOCK_MS)
    .run();
}

async function publicSnapshot(env: Env, now: number): Promise<Snapshot> {
  const real = Date.now();
  if (!cached || real - cached.at > PUBLIC_CACHE_MS) cached = { snap: await loadSnapshot(env.DB), at: real };
  await ensureDerived(env.DB, cached.snap, now);
  return cached.snap;
}

async function freshSnapshot(env: Env, now: number): Promise<Snapshot> {
  const snap = await loadSnapshot(env.DB);
  await ensureDerived(env.DB, snap, now);
  return snap;
}

const text = (v: unknown, max: number, what: string, allowEmpty = false): string => {
  if (typeof v !== 'string') throw new HttpError(400, `${what} is required.`);
  const s = v.trim();
  if (!s && !allowEmpty) throw new HttpError(400, `${what} is required.`);
  if (s.length > max) throw new HttpError(400, `${what} is too long (max ${max} characters).`);
  return s;
};

const int = (v: unknown, what: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new HttpError(400, `${what} is invalid.`);
  return v;
};

function assertSameOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  if (!origin) return;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    throw new HttpError(403, 'Forbidden.');
  }
  const url = new URL(request.url);
  if (host === url.host || host === request.headers.get('Host')) return;
  if (isLocalHost(new URL(origin).hostname) && isLocalHost(url.hostname)) return;
  throw new HttpError(403, 'Forbidden.');
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  try {
    if (!env.DB) throw new HttpError(500, 'The database is not connected. Add a D1 binding named "DB" (see the README).');
    return await route(request, env);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    const msg = e instanceof Error ? e.message : String(e);
    if (/no such table/i.test(msg)) return json({ error: 'The database has not been set up yet. Run the schema SQL (see the README).' }, 500);
    if (/UNIQUE constraint failed: team\.nfl_team_id/i.test(msg)) return json({ error: 'That NFL team is already taken.' }, 409);
    console.error('API error', msg);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;
  const now = getNow(request, env);
  const db = env.DB;
  if (method !== 'GET') assertSameOrigin(request);
  const is = (m: string, p: string) => method === m && path === p;
  const match = (m: string, re: RegExp) => (method === m ? re.exec(path) : null);
  let m: RegExpExecArray | null;

  // ------------------------------------------------------------ public (read-only)
  if (is('GET', '/api/public/state')) return json(buildState(await publicSnapshot(env, now), now));
  if (is('GET', '/api/public/scoreboard')) return json(buildScoreboard(await publicSnapshot(env, now), now));
  if (is('GET', '/api/public/standings')) return json(buildStandings(await publicSnapshot(env, now), now));
  if (is('GET', '/api/public/power')) return json(buildPower(await publicSnapshot(env, now), now));
  if (is('GET', '/api/public/playoffs')) return json(buildPlayoffs(await publicSnapshot(env, now), now));
  if (is('GET', '/api/public/schedule')) return json(buildSchedule(await publicSnapshot(env, now), now));
  if (is('GET', '/api/reveal')) {
    const data = buildReveal(await publicSnapshot(env, now), now);
    return data ? json(data) : json({ error: 'No reveal is available right now.' }, 404);
  }

  // ------------------------------------------------------------ auth
  if (is('GET', '/api/auth/status')) {
    const settings = await loadSettings(db);
    const status: AuthStatus = { pinSet: !!settings.pin_hash, authed: await isAuthed(request, settings, now) };
    return json(status);
  }

  if (is('POST', '/api/auth/set-pin')) {
    const { pin } = await body(request);
    if (!isValidPin(pin)) throw new HttpError(400, 'The PIN must be 4 to 8 digits.');
    const secret = newSecret();
    const res = await db
      .prepare('UPDATE settings SET pin_hash = ?, session_secret = ?, updated_at = ? WHERE id = 1 AND pin_hash IS NULL')
      .bind(await hashPin(pin), secret, now)
      .run();
    if (!res.meta.changes) throw new HttpError(409, 'A PIN has already been set.');
    const settings = await loadSettings(db);
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(await makeToken(settings.pin_version, secret, now)) });
  }

  if (is('POST', '/api/auth/pin')) {
    const { pin } = await body(request);
    const ip = clientIp(request);
    await assertNotBlocked(db, ip, now);
    const settings = await loadSettings(db);
    if (!settings.pin_hash || !settings.session_secret) throw new HttpError(409, 'No PIN has been set yet.');
    if (!isValidPin(pin) || !(await verifyPin(pin, settings.pin_hash))) {
      await recordFailure(db, ip, now);
      throw new HttpError(401, 'Wrong PIN.');
    }
    await db.prepare('DELETE FROM login_attempt WHERE ip = ?').bind(ip).run();
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(await makeToken(settings.pin_version, settings.session_secret, now)) });
  }

  if (is('POST', '/api/auth/logout')) {
    await requireTeacher(request, env, now);
    return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
  }

  if (is('POST', '/api/auth/change-pin')) {
    const settings = await requireTeacher(request, env, now);
    const { currentPin, newPin } = await body(request);
    const ip = clientIp(request);
    await assertNotBlocked(db, ip, now);
    if (!isValidPin(currentPin) || !(await verifyPin(currentPin, settings.pin_hash!))) {
      await recordFailure(db, ip, now);
      throw new HttpError(401, 'The current PIN is wrong.');
    }
    if (!isValidPin(newPin)) throw new HttpError(400, 'The new PIN must be 4 to 8 digits.');
    const version = settings.pin_version + 1;
    // Bumping pin_version invalidates every existing session; this device gets a fresh one.
    await db.prepare('UPDATE settings SET pin_hash = ?, pin_version = ?, updated_at = ? WHERE id = 1').bind(await hashPin(newPin), version, now).run();
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(await makeToken(version, settings.session_secret!, now)) });
  }

  // ------------------------------------------------------------ everything below needs a teacher session
  if (!path.startsWith('/api/')) throw new HttpError(404, 'Not found.');
  const known = /^\/api\/(teacher|awards|setup|season)(\/|$)/.test(path);
  if (!known) throw new HttpError(404, 'Not found.');
  await requireTeacher(request, env, now);
  if (method !== 'GET') cached = null;

  if (is('GET', '/api/teacher/week')) {
    const snap = await freshSnapshot(env, now);
    const week = scoringStatus(snap.weeks, now).week;
    const live = week && !week.finalized && week.type !== 'skip' ? await liveTotals(db, week.id) : {};
    return json(buildTeacherWeek(snap, now, live));
  }

  if (is('GET', '/api/teacher/awards')) {
    const weekId = Number(url.searchParams.get('weekId'));
    if (!Number.isInteger(weekId)) throw new HttpError(400, 'weekId is required.');
    const rows = await db
      .prepare('SELECT id, team_id, category, created_at FROM award WHERE week_id = ? ORDER BY id DESC LIMIT 2000')
      .bind(weekId)
      .all<Record<string, any>>();
    const out: AwardRow[] = rows.results.map((r) => ({ id: r.id, teamId: r.team_id, category: r.category, createdAt: r.created_at }));
    return json(out);
  }

  if (is('POST', '/api/awards')) {
    const { teamId, category } = await body(request);
    if (!Number.isInteger(teamId) || !CATEGORIES.includes(category as Category)) throw new HttpError(400, 'Invalid award.');
    const snap = await freshSnapshot(env, now);
    const status = scoringStatus(snap.weeks, now);
    if (!status.open || !status.week) throw new HttpError(409, 'Scoring is closed.');
    const weekId = status.week.id;
    const playing = snap.matchups.some((x) => x.weekId === weekId && (x.teamAId === teamId || x.teamBId === teamId));
    if (!playing) throw new HttpError(409, 'That team has no game this week.');
    // One insert per tap (no read-modify-write), refused if the week has been finalized.
    const res = await db
      .prepare(
        `INSERT INTO award (team_id, week_id, category, created_at)
         SELECT ?1, ?2, ?3, ?4 WHERE (SELECT finalized FROM week WHERE id = ?2) = 0`,
      )
      .bind(teamId, weekId, category, now)
      .run();
    if (!res.meta.changes) throw new HttpError(409, 'Scoring is closed.');
    return json({ id: res.meta.last_row_id, teamId, category, createdAt: now });
  }

  if ((m = match('DELETE', /^\/api\/awards\/(\d+)$/))) {
    const id = Number(m[1]);
    const snap = await freshSnapshot(env, now);
    const status = scoringStatus(snap.weeks, now);
    const award = await db.prepare('SELECT week_id FROM award WHERE id = ?').bind(id).first<{ week_id: number }>();
    if (!award) return json({ ok: true }); // already gone
    if (!status.open || !status.week || award.week_id !== status.week.id) throw new HttpError(409, 'This week is locked. Awards can no longer be changed.');
    const res = await db
      .prepare('DELETE FROM award WHERE id = ?1 AND (SELECT finalized FROM week WHERE id = award.week_id) = 0')
      .bind(id)
      .run();
    if (!res.meta.changes) throw new HttpError(409, 'This week is locked. Awards can no longer be changed.');
    return json({ ok: true });
  }

  // ------------------------------------------------------------ setup
  const setupData = async () => buildSetup(await freshSnapshot(env, now), now, await loadSkipWeeks(db));

  if (is('GET', '/api/setup')) return json(await setupData());

  if (is('PUT', '/api/setup/season')) {
    const b = await body(request);
    const name = text(b.name, 80, 'Season name');
    if (!isValidDate(b.firstMonday) || !isMonday(b.firstMonday)) throw new HttpError(400, 'The first game week must start on a Monday.');
    const regularWeeks = int(b.regularWeeks, 'Regular-season weeks');
    if (regularWeeks < 1 || regularWeeks > 12) throw new HttpError(400, 'Regular-season weeks must be between 1 and 12.');
    if (!Array.isArray(b.skipWeeks) || b.skipWeeks.length > 30) throw new HttpError(400, 'Skip weeks are invalid.');
    const skips = new Map<string, string>();
    for (const s of b.skipWeeks) {
      if (!s || !isValidDate(s.date) || !isMonday(s.date)) throw new HttpError(400, 'Each skip week must be a Monday date.');
      skips.set(s.date, text(s.label ?? '', 40, 'Skip week label', true) || 'No Games');
    }
    await ensureDerived(db, await loadSnapshot(db), now);
    await applyCalendar(
      db,
      now,
      { name, firstMonday: b.firstMonday, regularWeeks },
      [...skips].map(([date, label]) => ({ date, label })),
    );
    return json(await setupData());
  }

  const requireUnlocked = async (): Promise<Snapshot> => {
    const snap = await freshSnapshot(env, now);
    if (isStructureLocked(snap, now)) throw new HttpError(409, 'The season has started. Divisions and teams can no longer be added, removed or moved.');
    return snap;
  };

  if (is('POST', '/api/setup/divisions')) {
    const b = await body(request);
    const snap = await requireUnlocked();
    if (snap.divisions.length >= 4) throw new HttpError(409, 'A league can have at most 4 divisions.');
    const order = Math.max(0, ...snap.divisions.map((d) => d.sortOrder)) + 1;
    await db
      .prepare('INSERT INTO division (name, teacher_name, sort_order) VALUES (?, ?, ?)')
      .bind(text(b.name, 40, 'Division name'), text(b.teacherName ?? '', 40, 'Teacher name', true), order)
      .run();
    await syncSchedule(db, now);
    return json(await setupData());
  }

  if (is('POST', '/api/setup/divisions/order')) {
    const b = await body(request);
    const snap = await freshSnapshot(env, now);
    const ids: number[] = Array.isArray(b.ids) ? b.ids : [];
    if (ids.length !== snap.divisions.length || !snap.divisions.every((d) => ids.includes(d.id))) throw new HttpError(400, 'Invalid order.');
    await db.batch(ids.map((id, i) => db.prepare('UPDATE division SET sort_order = ? WHERE id = ?').bind(i + 1, id)));
    return json(await setupData());
  }

  if ((m = match('PUT', /^\/api\/setup\/divisions\/(\d+)$/))) {
    const b = await body(request);
    await db
      .prepare('UPDATE division SET name = ?, teacher_name = ? WHERE id = ?')
      .bind(text(b.name, 40, 'Division name'), text(b.teacherName ?? '', 40, 'Teacher name', true), Number(m[1]))
      .run();
    return json(await setupData());
  }

  if ((m = match('DELETE', /^\/api\/setup\/divisions\/(\d+)$/))) {
    const id = Number(m[1]);
    const snap = await requireUnlocked();
    const teamIds = snap.teams.filter((t) => t.divisionId === id).map((t) => t.id);
    await db.batch([
      ...teamIds.flatMap((t) => [db.prepare('DELETE FROM matchup WHERE team_a_id = ?1 OR team_b_id = ?1').bind(t), db.prepare('DELETE FROM team WHERE id = ?').bind(t)]),
      db.prepare('DELETE FROM division WHERE id = ?').bind(id),
    ]);
    await syncSchedule(db, now);
    return json(await setupData());
  }

  if (is('POST', '/api/setup/teams')) {
    const b = await body(request);
    const snap = await requireUnlocked();
    if (!snap.divisions.some((d) => d.id === b.divisionId)) throw new HttpError(400, 'Pick a division.');
    if (!isNflTeamId(b.nflTeamId)) throw new HttpError(400, 'Pick an NFL team.');
    if (snap.teams.some((t) => t.nfl === b.nflTeamId)) throw new HttpError(409, 'That NFL team is already taken.');
    const order = Math.max(0, ...snap.teams.map((t) => t.createdOrder)) + 1;
    // The coin-flip tiebreak value is generated once and stored, so the order never changes.
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    await db.prepare('INSERT INTO team (division_id, nfl_team_id, created_order, tiebreak_seed) VALUES (?, ?, ?, ?)').bind(b.divisionId, b.nflTeamId, order, seed).run();
    await syncSchedule(db, now);
    return json(await setupData());
  }

  if ((m = match('PUT', /^\/api\/setup\/teams\/(\d+)$/))) {
    const id = Number(m[1]);
    const b = await body(request);
    const snap = await freshSnapshot(env, now);
    const team = snap.teams.find((t) => t.id === id);
    if (!team) throw new HttpError(404, 'Team not found.');
    if (b.nflTeamId !== undefined && b.nflTeamId !== team.nfl) {
      // Swapping the franchise only changes display, so it is allowed at any time.
      if (!isNflTeamId(b.nflTeamId)) throw new HttpError(400, 'Pick an NFL team.');
      if (snap.teams.some((t) => t.nfl === b.nflTeamId)) throw new HttpError(409, 'That NFL team is already taken.');
      await db.prepare('UPDATE team SET nfl_team_id = ? WHERE id = ?').bind(b.nflTeamId, id).run();
    }
    if (b.divisionId !== undefined && b.divisionId !== team.divisionId) {
      if (isStructureLocked(snap, now)) throw new HttpError(409, 'The season has started. Teams can no longer be moved.');
      if (!snap.divisions.some((d) => d.id === b.divisionId)) throw new HttpError(400, 'Pick a division.');
      await db.prepare('UPDATE team SET division_id = ? WHERE id = ?').bind(b.divisionId, id).run();
      await syncSchedule(db, now);
    }
    return json(await setupData());
  }

  if ((m = match('DELETE', /^\/api\/setup\/teams\/(\d+)$/))) {
    const id = Number(m[1]);
    await requireUnlocked();
    await db.batch([db.prepare('DELETE FROM matchup WHERE team_a_id = ?1 OR team_b_id = ?1').bind(id), db.prepare('DELETE FROM team WHERE id = ?').bind(id)]);
    await syncSchedule(db, now);
    return json(await setupData());
  }

  if ((m = match('PUT', /^\/api\/setup\/weeks\/(\d+)\/matchups$/))) {
    const weekId = Number(m[1]);
    const b = await body(request);
    const snap = await freshSnapshot(env, now);
    const week = snap.weeks.find((w) => w.id === weekId);
    if (!week || week.type !== 'regular') throw new HttpError(404, 'Week not found.');
    if (week.startAt <= now) throw new HttpError(409, 'That week has already started. Only future weeks can be edited.');
    const teamIds = snap.teams.filter((t) => t.divisionId === b.divisionId).map((t) => t.id);
    if (teamIds.length === 0) throw new HttpError(400, 'Pick a division.');
    const pairs: Pair[] = Array.isArray(b.pairs) ? b.pairs.filter((p: unknown) => Array.isArray(p) && p.length === 2).map((p: number[]) => [p[0], p[1]]) : [];
    const problem = validatePairs(teamIds, pairs);
    if (problem) throw new HttpError(400, problem);
    const idList = teamIds.join(',');
    await db.batch([
      db.prepare(`DELETE FROM matchup WHERE week_id = ? AND bracket_slot IS NULL AND team_a_id IN (${idList})`).bind(weekId),
      ...pairs.map(([a, c]) => db.prepare('INSERT INTO matchup (week_id, team_a_id, team_b_id) VALUES (?, ?, ?)').bind(weekId, a, c)),
    ]);
    return json(await setupData());
  }

  if ((m = match('POST', /^\/api\/setup\/weeks\/(\d+)\/regenerate$/))) {
    const weekId = Number(m[1]);
    const snap = await freshSnapshot(env, now);
    const week = snap.weeks.find((w) => w.id === weekId);
    if (!week || week.type !== 'regular') throw new HttpError(404, 'Week not found.');
    if (week.startAt <= now) throw new HttpError(409, 'That week has already started. Only future weeks can be regenerated.');
    await syncSchedule(db, now, week.seq);
    return json(await setupData());
  }

  if (is('POST', '/api/season/reset')) {
    const b = await body(request);
    if (b.confirm !== 'RESET') throw new HttpError(400, 'Type RESET to confirm.');
    // Deletes the whole season. The PIN (settings) is kept. Nothing is archived.
    await db.batch(['award', 'week_score', 'matchup', 'week', 'team', 'division', 'skip_week', 'season'].map((t) => db.prepare(`DELETE FROM ${t}`)));
    return json({ ok: true });
  }

  throw new HttpError(404, 'Not found.');
}
