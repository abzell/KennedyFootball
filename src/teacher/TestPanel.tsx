import { useCallback, useEffect, useState } from 'react';
import { chicagoParts, chicagoToUtc, formatInstant } from '../../shared/time';
import type { TestClock } from '../../shared/types';
import { CLOCK_CHANGED } from '../components/TestBanner';
import { Notice } from '../components/ui';
import { statusText } from '../lib';
import { useTeacher } from './Teacher';

const pad = (n: number) => String(n).padStart(2, '0');

/** Value for <input type="datetime-local"> showing a UTC instant as Central wall-clock time. */
function toLocalInput(ms: number): string {
  const p = chicagoParts(ms);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

/** Test site only: step the simulated clock through a season. */
export default function TestPanel() {
  const { call } = useTeacher();
  const [clock, setClock] = useState<TestClock | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState('');

  const apply = useCallback((c: TestClock) => {
    setClock(c);
    setCustom(toLocalInput(c.now));
    window.dispatchEvent(new Event(CLOCK_CHANGED));
  }, []);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      setNote(null);
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    run(async () => apply(await call<TestClock>('/api/test/clock')));
  }, [run, apply, call]);

  const post = (body: unknown) => run(async () => apply(await call<TestClock>('/api/test/clock', { method: 'POST', body })));

  const fill = () =>
    run(async () => {
      const r = await call<{ awards: number; teams: number }>('/api/test/fill', { method: 'POST', body: {} });
      setNote(`Added ${r.awards} random points across ${r.teams} teams.`);
      apply(await call<TestClock>('/api/test/clock'));
    });

  const setCustomTime = () => {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(custom);
    if (!m) return setError('Pick a date and time.');
    return post({ action: 'set', at: chicagoToUtc(m[1], Number(m[2]), Number(m[3])) });
  };

  if (!clock) return <Notice>{error ?? 'Loading…'}</Notice>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="display text-2xl font-bold">Test clock</h1>
      <p className="text-sm text-mute">
        This is the test site. The clock here is simulated so you can walk through a whole season in a few minutes. Nothing here affects the real site.
      </p>

      <div className="card p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-mute">Simulated time (Central)</div>
        <div className="display text-3xl font-bold text-gold">{formatInstant(clock.now)}</div>
        <div className="mt-1 font-semibold" role="status">
          {statusText(clock.state)}
        </div>
        <div className="mt-1 text-xs text-mute">
          Real time: {formatInstant(clock.realNow)}
          {clock.offsetMs === 0 ? ' · the clock is not shifted' : ''}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-loss bg-red-950 px-3 py-2 text-loss" role="alert">
          {error}
        </div>
      )}
      {note && (
        <div className="rounded-lg border border-win px-3 py-2 text-win" role="status">
          {note}
        </div>
      )}

      <div className="card space-y-3 p-4">
        <h2 className="display text-xl font-bold">Step through the season</h2>
        <button type="button" className="btn btn-gold w-full flex-col gap-0 py-3 text-left" disabled={busy || !clock.next} onClick={() => post({ action: 'next' })}>
          <span className="display text-lg">Next step ▶</span>
          <span className="text-sm font-normal">{clock.next ? `${clock.next.label} — ${formatInstant(clock.next.at)}` : clock.state.phase === 'no_season' ? 'Finish Setup first: there is no schedule yet.' : 'The season is over. Nothing left to step to.'}</span>
        </button>
        <button type="button" className="btn w-full" disabled={busy || !clock.scoringOpen} onClick={fill}>
          🎲 Fill random scores for this week
        </button>
        {!clock.scoringOpen && <p className="text-xs text-mute">Random scores can be added only while a game week is open for scoring.</p>}
        <ol className="list-decimal space-y-1 pl-5 text-sm text-mute">
          <li>Step until a week begins, then fill random scores (or tap points yourself on the Score tab).</li>
          <li>Step to the lock: the Reveal button appears on the public scoreboard and on /tv.</li>
          <li>Step again: results go public and the next week opens. Repeat through the Super Bowl.</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <a className="btn" href="/" target="_blank" rel="noreferrer">
            Open scoreboard ↗
          </a>
          <a className="btn" href="/tv" target="_blank" rel="noreferrer">
            Open projector ↗
          </a>
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <h2 className="display text-xl font-bold">Set a specific time</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-56">
            <label className="label" htmlFor="test-time">
              Date and time (Central)
            </label>
            <input id="test-time" className="input" type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} />
          </div>
          <button type="button" className="btn" disabled={busy} onClick={setCustomTime}>
            Set time
          </button>
          <button type="button" className="btn" disabled={busy || clock.offsetMs === 0} onClick={() => post({ action: 'real' })}>
            Back to real time
          </button>
        </div>
        <p className="text-xs text-mute">
          Moving the clock backwards does not undo anything: a week that has locked stays locked. To run the season again, use Settings → Start new season.
        </p>
      </div>
    </div>
  );
}
