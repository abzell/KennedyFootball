import { useEffect, useMemo, useState } from 'react';
import { buildCalendar, defaultSeasonName } from '../../shared/calendar';
import { NFL_TEAMS, fullName } from '../../shared/nflTeams';
import { validatePairs, type Pair } from '../../shared/schedule';
import { chicagoDate, formatDate, formatInstant, formatWeekRange, isMonday, isValidDate, mondayAfterThanksgiving, mondayOf } from '../../shared/time';
import type { DivisionInfo, SetupData } from '../../shared/types';
import { Helmet } from '../components/Helmet';
import { Notice, PairingCard } from '../components/ui';
import { useLookup, type Lookup } from '../lib';
import { useTeacher } from './Teacher';

const STEPS = ['Season', 'Divisions', 'Teams', 'Schedule'] as const;
const TYPE_LABEL = { regular: 'Regular', skip: 'Skip', semifinal: 'Semifinal', superbowl: 'Super Bowl' } as const;

interface StepProps {
  data: SetupData;
  run: (fn: () => Promise<SetupData>) => Promise<boolean>;
  l: Lookup;
}

function defaultFirstMonday(now: number): string {
  const today = chicagoDate(now);
  const year = Number(today.slice(0, 4));
  // From February on, plan for this year's season; in January the season in progress began last year.
  return mondayAfterThanksgiving(Number(today.slice(5, 7)) >= 2 ? year : year - 1);
}

// ------------------------------------------------------------------ step 1: season

function SeasonStep({ data, run }: StepProps) {
  const { call } = useTeacher();
  const initialMonday = data.season?.firstMonday ?? defaultFirstMonday(data.now);
  const [firstMonday, setFirstMonday] = useState(initialMonday);
  const [name, setName] = useState(data.season?.name ?? defaultSeasonName(initialMonday));
  const [regularWeeks, setRegularWeeks] = useState(data.season?.regularWeeks ?? 5);
  const [skips, setSkips] = useState(data.skipWeeks);
  const [skipDate, setSkipDate] = useState('');
  const [skipLabel, setSkipLabel] = useState('Winter Break');
  const [saved, setSaved] = useState(false);

  const mondayOk = isValidDate(firstMonday) && isMonday(firstMonday);
  const weeksOk = Number.isInteger(regularWeeks) && regularWeeks >= 1 && regularWeeks <= 12;
  const calendar = useMemo(() => (mondayOk && weeksOk ? buildCalendar(firstMonday, regularWeeks, skips) : []), [mondayOk, weeksOk, firstMonday, regularWeeks, skips]);

  const changeMonday = (v: string) => {
    // Keep the default name in step with the start year unless the teacher typed their own.
    if (isValidDate(firstMonday) && name === defaultSeasonName(firstMonday) && isValidDate(v)) setName(defaultSeasonName(v));
    setFirstMonday(v);
    setSaved(false);
  };
  const addSkip = () => {
    if (!isValidDate(skipDate)) return;
    const date = mondayOf(skipDate);
    setSkips((s) => [...s.filter((x) => x.date !== date), { date, label: skipLabel.trim() || 'No Games' }].sort((a, b) => a.date.localeCompare(b.date)));
    setSkipDate('');
    setSaved(false);
  };

  return (
    <div className="space-y-4">
      <div className="card grid gap-3 p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="season-name">
            Season name
          </label>
          <input id="season-name" className="input" value={name} maxLength={80} onChange={(e) => (setName(e.target.value), setSaved(false))} />
        </div>
        <div>
          <label className="label" htmlFor="first-monday">
            First game week (Monday)
          </label>
          <input id="first-monday" className="input" type="date" value={firstMonday} onChange={(e) => changeMonday(e.target.value)} aria-invalid={!mondayOk} />
          {!mondayOk && (
            <p className="mt-1 text-sm text-loss" role="alert">
              The first game week must start on a Monday.
            </p>
          )}
          {mondayOk && calendar.length > 0 && calendar[0].startAt <= data.now && !data.weeks.some((w) => w.started) && (
            <p className="mt-1 text-sm text-gold" role="alert">
              This date has already passed. Weeks before today will have no games; pick a future Monday unless that is what you want.
            </p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="regular-weeks">
            Regular-season game weeks (1–12)
          </label>
          <input id="regular-weeks" className="input" type="number" min={1} max={12} value={regularWeeks} onChange={(e) => (setRegularWeeks(Number(e.target.value)), setSaved(false))} aria-invalid={!weeksOk} />
        </div>
      </div>

      <div className="card p-4">
        <h2 className="display mb-1 text-xl font-bold">Skip weeks</h2>
        <p className="mb-3 text-sm text-mute">Weeks with no games, such as winter break. They do not count toward the regular-season total.</p>
        {skips.length > 0 && (
          <ul className="mb-3 space-y-2">
            {skips.map((s) => (
              <li key={s.date} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                <span className="flex-1">
                  <b>Week of {formatDate(s.date)}</b> <span className="text-mute">· {s.label}</span>
                </span>
                <button type="button" className="btn" onClick={() => (setSkips((list) => list.filter((x) => x.date !== s.date)), setSaved(false))} aria-label={`Remove skip week of ${formatDate(s.date)}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="skip-date">
              Any day in the week to skip
            </label>
            <input id="skip-date" className="input" type="date" value={skipDate} onChange={(e) => setSkipDate(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="skip-label">
              Label
            </label>
            <input id="skip-label" className="input" value={skipLabel} maxLength={40} onChange={(e) => setSkipLabel(e.target.value)} />
          </div>
          <button type="button" className="btn" onClick={addSkip} disabled={!isValidDate(skipDate)}>
            Add skip week
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto p-4">
        <h2 className="display mb-2 text-xl font-bold">Calendar preview</h2>
        {calendar.length === 0 ? (
          <p className="text-sm text-mute">Enter a Monday start date to see the calendar.</p>
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-mute">
                <th className="py-2 pr-3">Week</th>
                <th className="py-2 pr-3">Monday</th>
                <th className="py-2 pr-3">Locks</th>
                <th className="py-2 pr-3">Publishes</th>
                <th className="py-2">Type</th>
              </tr>
            </thead>
            <tbody>
              {calendar.map((w) => (
                <tr key={w.mondayDate} className={`border-b border-line/60 last:border-0 ${w.type === 'skip' ? 'text-mute' : ''}`}>
                  <td className="py-2 pr-3 font-semibold">{w.label}</td>
                  <td className="py-2 pr-3">{formatDate(w.mondayDate)}</td>
                  <td className="py-2 pr-3">{w.type === 'skip' ? '—' : formatInstant(w.lockAt)}</td>
                  <td className="py-2 pr-3">{w.type === 'skip' ? '—' : formatInstant(w.publishAt)}</td>
                  <td className="py-2">{TYPE_LABEL[w.type]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-gold"
          disabled={!mondayOk || !weeksOk || !name.trim()}
          onClick={async () => setSaved(await run(() => call<SetupData>('/api/setup/season', { method: 'PUT', body: { name, firstMonday, regularWeeks, skipWeeks: skips } })))}
        >
          {data.season ? 'Save season' : 'Create season'}
        </button>
        {saved && <span className="text-win">Saved ✓</span>}
      </div>
      {data.weeks.some((w) => w.started) && <p className="text-sm text-mute">The season has started: only weeks that have not started yet can change.</p>}
    </div>
  );
}

// ------------------------------------------------------------------ step 2: divisions

function DivisionRow({ d, index, count, data, run }: { d: DivisionInfo; index: number; count: number } & Pick<StepProps, 'data' | 'run'>) {
  const { call } = useTeacher();
  const [name, setName] = useState(d.name);
  const [teacher, setTeacher] = useState(d.teacherName);
  const dirty = name !== d.name || teacher !== d.teacherName;
  const move = (dir: -1 | 1) => {
    const ids = data.divisions.map((x) => x.id);
    [ids[index], ids[index + dir]] = [ids[index + dir], ids[index]];
    return run(() => call<SetupData>('/api/setup/divisions/order', { method: 'POST', body: { ids } }));
  };
  return (
    <li className="card grid gap-2 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <label className="label" htmlFor={`dn-${d.id}`}>
          Division name
        </label>
        <input id={`dn-${d.id}`} className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor={`dt-${d.id}`}>
          Teacher display name
        </label>
        <input id={`dt-${d.id}`} className="input" value={teacher} maxLength={40} onChange={(e) => setTeacher(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-gold" disabled={!dirty || !name.trim()} onClick={() => run(() => call<SetupData>(`/api/setup/divisions/${d.id}`, { method: 'PUT', body: { name, teacherName: teacher } }))}>
          Save
        </button>
        <button type="button" className="btn" disabled={index === 0} onClick={() => move(-1)} aria-label={`Move ${d.name} up`}>
          ↑
        </button>
        <button type="button" className="btn" disabled={index === count - 1} onClick={() => move(1)} aria-label={`Move ${d.name} down`}>
          ↓
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={data.structureLocked}
          onClick={() => window.confirm(`Remove ${d.name} and all of its teams?`) && run(() => call<SetupData>(`/api/setup/divisions/${d.id}`, { method: 'DELETE' }))}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

function DivisionsStep({ data, run }: StepProps) {
  const { call } = useTeacher();
  const [name, setName] = useState('');
  const [teacher, setTeacher] = useState('');
  const full = data.divisions.length >= 4;
  return (
    <div className="space-y-4">
      <p className="text-sm text-mute">Each classroom is a division. You can have 1 to 4 divisions (the playoffs always have 4 teams).</p>
      {data.structureLocked && <p className="text-sm text-gold">The season has started: divisions can be renamed, but not added or removed.</p>}
      <ul className="space-y-3">
        {data.divisions.map((d, i) => (
          <DivisionRow key={d.id} d={d} index={i} count={data.divisions.length} data={data} run={run} />
        ))}
      </ul>
      {!data.structureLocked && (
        <form
          className="card grid gap-2 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => call<SetupData>('/api/setup/divisions', { method: 'POST', body: { name, teacherName: teacher } }))) {
              setName('');
              setTeacher('');
            }
          }}
        >
          <div>
            <label className="label" htmlFor="new-div-name">
              New division name
            </label>
            <input id="new-div-name" className="input" placeholder="Room 12" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} disabled={full} />
          </div>
          <div>
            <label className="label" htmlFor="new-div-teacher">
              Teacher display name
            </label>
            <input id="new-div-teacher" className="input" placeholder="Mrs. Johnson" value={teacher} maxLength={40} onChange={(e) => setTeacher(e.target.value)} disabled={full} />
          </div>
          <button type="submit" className="btn btn-gold" disabled={full || !name.trim()}>
            Add division
          </button>
          {full && <p className="text-sm text-mute sm:col-span-3">The league already has the maximum of 4 divisions.</p>}
        </form>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ step 3: teams

function TeamsStep({ data, run, l }: StepProps) {
  const { call } = useTeacher();
  const used = new Set(data.teams.map((t) => t.nfl));
  const free = NFL_TEAMS.filter((t) => !used.has(t.id));
  const [pick, setPick] = useState<Record<number, string>>({});
  return (
    <div className="space-y-4">
      <p className="text-sm text-mute">
        Give each division an even number of teams (at least 2). Each NFL team can be used once. Teams hold no student names: the app stores no student information.
      </p>
      {data.structureLocked && <p className="text-sm text-gold">The season has started: you can still swap a team’s NFL franchise, but teams cannot be added, removed or moved.</p>}
      {data.divisions.length === 0 && <Notice>Add a division first.</Notice>}
      {data.divisions.map((d) => {
        const teams = data.teams.filter((t) => t.divisionId === d.id);
        const odd = teams.length % 2 !== 0;
        const few = teams.length < 2;
        const choice = pick[d.id] && !used.has(pick[d.id]) ? pick[d.id] : free[0]?.id ?? '';
        return (
          <section key={d.id} className={`card p-4 ${odd || few ? 'border-loss' : ''}`}>
            <h2 className="display text-xl font-bold">
              {d.name} <span className="text-sm font-normal normal-case text-mute">{d.teacherName}</span>
              <span className="ml-2 text-sm font-normal normal-case text-mute">
                · {teams.length} team{teams.length === 1 ? '' : 's'}
              </span>
            </h2>
            {(odd || few) && (
              <p className="mt-1 text-sm font-semibold text-loss" role="alert">
                {few ? `${d.name} needs at least 2 teams.` : `${d.name} has an odd number of teams (${teams.length}). Add or remove one team.`}
              </p>
            )}
            <ul className="mt-3 space-y-2">
              {teams.map((t) => {
                const nfl = l.team(t.id).nfl;
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2">
                    <Helmet nfl={nfl.id} size={36} />
                    <label className="sr-only" htmlFor={`nfl-${t.id}`}>
                      NFL team for {fullName(nfl)}
                    </label>
                    <select
                      id={`nfl-${t.id}`}
                      className="input min-w-0 flex-1 basis-40"
                      value={t.nfl}
                      onChange={(e) => run(() => call<SetupData>(`/api/setup/teams/${t.id}`, { method: 'PUT', body: { nflTeamId: e.target.value } }))}
                    >
                      <option value={t.nfl}>{fullName(nfl)}</option>
                      {free.map((f) => (
                        <option key={f.id} value={f.id}>
                          {fullName(f)}
                        </option>
                      ))}
                    </select>
                    {!data.structureLocked && data.divisions.length > 1 && (
                      <>
                        <label className="sr-only" htmlFor={`div-${t.id}`}>
                          Division for {fullName(nfl)}
                        </label>
                        <select
                          id={`div-${t.id}`}
                          className="input w-auto"
                          value={t.divisionId}
                          onChange={(e) => run(() => call<SetupData>(`/api/setup/teams/${t.id}`, { method: 'PUT', body: { divisionId: Number(e.target.value) } }))}
                        >
                          {data.divisions.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                    {!data.structureLocked && (
                      <button type="button" className="btn btn-danger" onClick={() => run(() => call<SetupData>(`/api/setup/teams/${t.id}`, { method: 'DELETE' }))} aria-label={`Remove ${fullName(nfl)}`}>
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {!data.structureLocked && free.length > 0 && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1 basis-48">
                  <label className="label" htmlFor={`add-${d.id}`}>
                    Add a team to {d.name}
                  </label>
                  <select id={`add-${d.id}`} className="input" value={choice} onChange={(e) => setPick((p) => ({ ...p, [d.id]: e.target.value }))}>
                    {free.map((f) => (
                      <option key={f.id} value={f.id}>
                        {fullName(f)}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button" className="btn btn-gold" onClick={() => run(() => call<SetupData>('/api/setup/teams', { method: 'POST', body: { divisionId: d.id, nflTeamId: choice } }))}>
                  Add team
                </button>
              </div>
            )}
          </section>
        );
      })}
      {data.teams.length < 4 && data.divisions.length > 0 && (
        <p className="text-sm font-semibold text-loss" role="alert">
          The league needs at least 4 teams in total (it has {data.teams.length}).
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ step 4: schedule

function PairEditor({ weekId, division, initial, data, run, l, onDone }: { weekId: number; division: DivisionInfo; initial: Pair[]; onDone: () => void } & StepProps) {
  const { call } = useTeacher();
  const [pairs, setPairs] = useState<Pair[]>(initial);
  const teamIds = data.teams.filter((t) => t.divisionId === division.id).map((t) => t.id);
  const problem = validatePairs(teamIds, pairs);
  const set = (i: number, side: 0 | 1, id: number) => setPairs((p) => p.map((pair, j) => (j === i ? (side === 0 ? [id, pair[1]] : [pair[0], id]) : pair)));
  return (
    <div className="rounded-lg border border-gold p-3">
      <div className="mb-2 font-semibold">Edit {division.name} matchups</div>
      <div className="space-y-2">
        {pairs.map((pair, i) => (
          <div key={i} className="flex items-center gap-2">
            {([0, 1] as const).map((side) => (
              <span key={side} className="contents">
                {side === 1 && <span className="text-mute">vs</span>}
                <select className="input" aria-label={`Game ${i + 1} team ${side + 1}`} value={pair[side]} onChange={(e) => set(i, side, Number(e.target.value))}>
                  {teamIds.map((id) => (
                    <option key={id} value={id}>
                      {l.team(id).nfl.name}
                    </option>
                  ))}
                </select>
              </span>
            ))}
          </div>
        ))}
      </div>
      {problem && (
        <p className="mt-2 text-sm text-loss" role="alert">
          {problem}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn btn-gold"
          disabled={!!problem}
          onClick={async () => (await run(() => call<SetupData>(`/api/setup/weeks/${weekId}/matchups`, { method: 'PUT', body: { divisionId: division.id, pairs } }))) && onDone()}
        >
          Save matchups
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ScheduleStep(props: StepProps) {
  const { data, run, l } = props;
  const { call } = useTeacher();
  const [editing, setEditing] = useState<string | null>(null);
  if (!data.season) return <Notice>Create the season first (step 1).</Notice>;
  return (
    <div className="space-y-4">
      {data.errors.length > 0 ? (
        <div className="card border-loss p-4" role="alert">
          <div className="display mb-1 text-xl font-bold text-loss">The season cannot start yet</div>
          <ul className="list-disc pl-5 text-sm">
            {data.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-mute">Fix these in the Divisions and Teams steps. The schedule is created automatically once everything is valid.</p>
        </div>
      ) : (
        <div className="card border-win p-4 text-sm">
          <b className="text-win">Ready ✓</b> The schedule below was generated automatically (round-robin inside each division). You can edit any week that has not started.
        </div>
      )}
      {data.weeks.map((w) => {
        const editable = w.type === 'regular' && !w.started && data.errors.length === 0;
        return (
          <section key={w.id} className="card p-4">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="display text-xl font-bold">{w.label}</h2>
              <span className="text-sm text-mute">{formatWeekRange(w.mondayDate)}</span>
              <span className="badge text-mute">{TYPE_LABEL[w.type]}</span>
              {w.started && <span className="badge text-gold">Started</span>}
              {editable && (
                <button type="button" className="btn ml-auto" onClick={() => window.confirm(`Regenerate the matchups for ${w.label} and every later week? Manual edits to those weeks will be replaced.`) && run(() => call<SetupData>(`/api/setup/weeks/${w.id}/regenerate`, { method: 'POST', body: {} }))}>
                  Regenerate remaining weeks
                </button>
              )}
            </div>
            {w.type === 'skip' ? (
              <p className="text-sm text-mute">No games this week.</p>
            ) : w.type !== 'regular' ? (
              w.pairings.length ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {w.pairings.map((p) => (
                    <PairingCard key={p.id} p={p} l={l} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-mute">{w.type === 'semifinal' ? 'Set automatically when the regular season ends: #1 vs #4 and #2 vs #3.' : 'The two semifinal winners.'}</p>
              )
            ) : (
              data.divisions.map((d) => {
                const list = w.pairings.filter((p) => p.divisionId === d.id);
                const key = `${w.id}:${d.id}`;
                return (
                  <div key={d.id} className="mt-3">
                    <div className="mb-2 flex items-center gap-3">
                      <h3 className="text-sm font-semibold text-mute">{d.name}</h3>
                      {editable && list.length > 0 && editing !== key && (
                        <button type="button" className="text-sm text-gold underline" onClick={() => setEditing(key)}>
                          Edit
                        </button>
                      )}
                    </div>
                    {editing === key ? (
                      <PairEditor {...props} weekId={w.id} division={d} initial={list.map((p) => [p.aId, p.bId])} onDone={() => setEditing(null)} />
                    ) : list.length ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        {list.map((p) => (
                          <PairingCard key={p.id} p={p} l={l} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-mute">No matchups.</p>
                    )}
                  </div>
                );
              })
            )}
          </section>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ wizard

export default function Setup() {
  const { call } = useTeacher();
  const [data, setData] = useState<SetupData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const l = useLookup(data);

  useEffect(() => {
    call<SetupData>('/api/setup').then(setData, (e: Error) => setError(e.message));
  }, [call]);

  const run = async (fn: () => Promise<SetupData>): Promise<boolean> => {
    setError(null);
    try {
      setData(await fn());
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };

  if (!data) return <Notice>{error ?? 'Loading…'}</Notice>;
  const props: StepProps = { data, run, l };

  return (
    <div>
      <h1 className="display mb-3 text-2xl font-bold">Season setup</h1>
      <ol className="mb-4 grid grid-cols-4 gap-2" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" className={`btn w-full flex-col gap-0 px-1 ${i === step ? 'btn-gold' : ''}`} aria-current={i === step ? 'step' : undefined} onClick={() => (setStep(i), setError(null))}>
              <span className="text-xs opacity-80">Step {i + 1}</span>
              <span className="display text-base">{s}</span>
            </button>
          </li>
        ))}
      </ol>
      {error && (
        <div className="mb-3 rounded-lg border border-loss bg-red-950 px-3 py-2 text-loss" role="alert">
          {error}
        </div>
      )}
      {step === 0 && <SeasonStep {...props} />}
      {step === 1 && <DivisionsStep {...props} />}
      {step === 2 && <TeamsStep {...props} />}
      {step === 3 && <ScheduleStep {...props} />}
      <div className="mt-6 flex justify-between">
        <button type="button" className="btn" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          ‹ Back
        </button>
        <button type="button" className="btn" disabled={step === STEPS.length - 1} onClick={() => setStep((s) => s + 1)}>
          Next ›
        </button>
      </div>
    </div>
  );
}
