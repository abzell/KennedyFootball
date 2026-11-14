// Demo data for local development: 3 divisions × 4 teams, a 5-week season that began three
// weeks ago, and random awards for the weeks already played. Teacher PIN: 1234.
//
//   npm run seed:demo                      (season started 3 Mondays ago)
//   npm run seed:demo -- --start=2026-11-30
//
// Only ever touches the LOCAL database.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { hashPin, newSecret } from '../server/auth';
import { buildCalendar, defaultSeasonName } from '../shared/calendar';
import { CATEGORIES } from '../shared/league';
import { pairingsForRegularWeek } from '../shared/schedule';
import { addDays, chicagoDate, isMonday, mondayOf } from '../shared/time';

const arg = process.argv.find((a) => a.startsWith('--start='));
const nowArg = process.argv.find((a) => a.startsWith('--now='));
const now = nowArg ? Date.parse(nowArg.slice(6)) : Date.now();
const start = arg ? arg.slice(8) : addDays(mondayOf(chicagoDate(now)), -21);
if (!isMonday(start)) throw new Error('--start must be a Monday (YYYY-MM-DD)');

const divisions = [
  { name: 'Room 12', teacher: 'Mrs. Johnson', teams: ['kc', 'chi', 'gb', 'dal'] },
  { name: 'Room 14', teacher: 'Mr. Garcia', teams: ['min', 'sf', 'buf', 'phi'] },
  { name: 'Room 16', teacher: 'Ms. Lee', teams: ['det', 'bal', 'sea', 'mia'] },
];

// Small deterministic PRNG so the demo looks the same each time.
let seed = 20261130;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const sql: string[] = [];
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
for (const t of ['award', 'week_score', 'matchup', 'week', 'team', 'division', 'skip_week', 'season', 'login_attempt']) sql.push(`DELETE FROM ${t};`);
sql.push(`DELETE FROM sqlite_sequence;`);
sql.push(`UPDATE settings SET pin_hash = ${q(await hashPin('1234'))}, session_secret = ${q(newSecret())}, pin_version = pin_version + 1 WHERE id = 1;`);
sql.push(`INSERT INTO season (id, name, first_monday, regular_weeks, created_at) VALUES (1, ${q(defaultSeasonName(start))}, ${q(start)}, 5, ${now});`);

const teamIds: number[][] = [];
let teamId = 0;
divisions.forEach((d, di) => {
  sql.push(`INSERT INTO division (id, name, teacher_name, sort_order) VALUES (${di + 1}, ${q(d.name)}, ${q(d.teacher)}, ${di + 1});`);
  teamIds.push(
    d.teams.map((nfl) => {
      teamId++;
      sql.push(`INSERT INTO team (id, division_id, nfl_team_id, created_order, tiebreak_seed) VALUES (${teamId}, ${di + 1}, ${q(nfl)}, ${teamId}, ${rand()});`);
      return teamId;
    }),
  );
});

const strength = new Map<number, number>();
for (let id = 1; id <= teamId; id++) strength.set(id, 5 + Math.floor(rand() * 6));

let awards = 0;
buildCalendar(start, 5, []).forEach((w, i) => {
  const weekId = i + 1;
  sql.push(
    `INSERT INTO week (id, seq, type, monday_date, start_at, lock_at, publish_at, label, regular_no) VALUES (${weekId}, ${w.seq}, ${q(w.type)}, ${q(w.mondayDate)}, ${w.startAt}, ${w.lockAt}, ${w.publishAt}, ${q(w.label)}, ${w.regularNo ?? 'NULL'});`,
  );
  if (w.type !== 'regular') return;
  for (const ids of teamIds) {
    for (const [a, b] of pairingsForRegularWeek(ids, w.regularNo!)) {
      sql.push(`INSERT INTO matchup (week_id, team_a_id, team_b_id) VALUES (${weekId}, ${a}, ${b});`);
      if (w.startAt > now) continue;
      // Past weeks get full random scores; the current week gets a partial score.
      const until = Math.min(w.lockAt, now);
      for (const team of [a, b]) {
        for (const cat of CATEGORIES) {
          const n = Math.floor((strength.get(team)! * (0.5 + rand()) * (until - w.startAt)) / (w.lockAt - w.startAt));
          for (let k = 0; k < n; k++) {
            const at = Math.floor(w.startAt + rand() * (until - w.startAt));
            sql.push(`INSERT INTO award (team_id, week_id, category, created_at) VALUES (${team}, ${weekId}, ${q(cat)}, ${at});`);
            awards++;
          }
        }
      }
    }
  }
});

mkdirSync('.wrangler', { recursive: true });
const file = '.wrangler/seed-demo.sql';
writeFileSync(file, sql.join('\n') + '\n');
execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--file', file], { stdio: ['ignore', 'ignore', 'inherit'] });
console.log(`\nDemo season seeded: starts ${start}, ${teamId} teams, ${awards} awards. Teacher PIN: 1234`);
