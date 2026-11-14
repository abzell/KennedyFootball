import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, CATEGORY_INFO } from '../../shared/league';
import { readableOn } from '../../shared/nflTeams';
import type { Game, RevealData, StandingRow } from '../../shared/types';
import { api, divisionLabel, makeLookup, usePrefersReducedMotion, type Lookup } from '../lib';
import { Helmet } from './Helmet';
import { BracketView, SeedCards, sideResult, slotTitle } from './ui';

type Step = { kind: 'game'; game: Game } | { kind: 'standings' } | { kind: 'bracket' } | { kind: 'champion' };

const GAME_MS = 7000;
const END_MS = 12000;

/** Button that fetches the just-locked week's results and plays them in this browser only. */
export function RevealButton({ label, big = false }: { label: string; big?: boolean }) {
  const [data, setData] = useState<RevealData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await api<RevealData>('/api/reveal'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className={`btn btn-gold anim-pulse display font-bold ${big ? 'rounded-3xl px-16 py-10 text-7xl' : 'w-full px-6 py-4 text-2xl sm:w-auto'}`}
      >
        🏈 Reveal {label} Winners
      </button>
      {error && <p className="mt-2 text-loss">{error}</p>}
      {data && <Reveal data={data} onClose={() => setData(null)} />}
    </>
  );
}

function useCountUp(target: number, run: boolean, instant: boolean, duration = 2600): number {
  const [value, setValue] = useState(instant ? target : 0);
  useEffect(() => {
    if (instant) {
      setValue(target);
      return;
    }
    if (!run) {
      setValue(0);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 2))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, instant, duration]);
  return value;
}

function GameStep({ game, l, reduced }: { game: Game; l: Lookup; reduced: boolean }) {
  // phase 0: helmets slide in · 1: scores count up · 2: result stamp
  const [phase, setPhase] = useState(reduced ? 2 : 0);
  useEffect(() => {
    if (reduced) return;
    const a = setTimeout(() => setPhase(1), 900);
    const b = setTimeout(() => setPhase(2), 3700);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [reduced]);
  const a = useCountUp(game.a.score, phase >= 1, reduced);
  const b = useCountUp(game.b.score, phase >= 1, reduced);
  const frac = Math.max(game.a.score, game.b.score) ? Math.max(a, b) / Math.max(game.a.score, game.b.score) : 1;
  const maxCat = Math.max(1, ...CATEGORIES.flatMap((c) => [game.a.cats[c], game.b.cats[c]]));
  const title = game.slot ? slotTitle(game.slot) : divisionLabel(l.division(game.divisionId));

  const side = (key: 'a' | 'b') => {
    const s = game[key];
    const t = l.team(s.teamId).nfl;
    const res = sideResult(game, key);
    const won = phase === 2 && res === 'W';
    const stamp = res === 'T' ? 'TIE' : res === 'W' ? (game.onSeed ? 'ADVANCES ON SEED' : 'WIN') : null;
    return (
      <div className={`relative flex flex-1 flex-col items-center overflow-hidden rounded-3xl border-2 p-4 sm:p-8 ${won ? 'border-gold' : 'border-line'} bg-navy-2`}>
        {won && <div className="anim-flash pointer-events-none absolute inset-0" style={{ background: `linear-gradient(135deg, ${t.primaryColor}, ${t.secondaryColor})` }} />}
        <div className={`relative flex flex-col items-center ${key === 'a' ? 'anim-left' : 'anim-right'}`}>
          <Helmet nfl={t.id} size={Math.min(200, Math.max(90, window.innerWidth / 8))} facing={key === 'a' ? 'right' : 'left'} />
          <div className="mt-2 text-center text-sm text-mute sm:text-xl">
            {s.seed ? `#${s.seed} seed · ` : ''}
            {t.city}
          </div>
          <div className="display text-center text-3xl font-bold sm:text-6xl">{t.name}</div>
        </div>
        <div className={`display relative mt-2 text-7xl font-bold tabular-nums sm:text-9xl ${won ? 'text-gold' : ''}`} aria-live="off">
          {phase >= 1 ? (key === 'a' ? a : b) : 0}
        </div>
        <div className="relative mt-3 w-full max-w-md space-y-2">
          {CATEGORIES.map((c) => (
            <div key={c}>
              <div className="flex justify-between text-xs text-mute sm:text-sm">
                <span>{CATEGORY_INFO[c].label}</span>
                <span className="font-bold text-white tabular-nums">{Math.round(s.cats[c] * (phase >= 1 ? frac : 0))}</span>
              </div>
              <div className="h-3 rounded bg-navy">
                <div
                  className="h-3 rounded"
                  style={{ width: `${(s.cats[c] / maxCat) * (phase >= 1 ? frac : 0) * 100}%`, background: t.primaryColor, outline: '1px solid rgba(255,255,255,.6)' }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="relative mt-4 flex h-16 items-center justify-center sm:h-24">
          {phase === 2 && stamp && (
            <div
              className={`anim-stamp display rounded-xl border-4 px-4 py-1 text-center font-bold ${stamp.length > 4 ? 'text-2xl sm:text-4xl' : 'text-5xl sm:text-7xl'}`}
              style={
                res === 'T'
                  ? { borderColor: '#fff', color: '#fff', transform: 'rotate(-8deg)' }
                  : { borderColor: '#F2B705', color: readableOn(t.primaryColor), background: t.primaryColor, transform: 'rotate(-8deg)' }
              }
            >
              {stamp}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="display mb-3 text-center text-xl text-gold sm:text-3xl">{title}</div>
      <div className="flex flex-1 items-stretch gap-3 sm:gap-6">
        {side('a')}
        <div className="display hidden items-center text-4xl text-mute sm:flex">VS</div>
        {side('b')}
      </div>
    </div>
  );
}

function SortingTable({ title, before, after, l, reduced }: { title: string; before: number[]; after: StandingRow[]; l: Lookup; reduced: boolean }) {
  const [sorted, setSorted] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const id = setTimeout(() => setSorted(true), 1200);
    return () => clearTimeout(id);
  }, [reduced]);
  const ROW = 64;
  return (
    <div className="card p-4">
      <div className="display mb-3 text-xl text-gold">{title}</div>
      <div className="relative" style={{ height: after.length * ROW }}>
        {after.map((r, newIdx) => {
          const oldIdx = before.indexOf(r.teamId);
          const idx = sorted || oldIdx < 0 ? newIdx : oldIdx;
          const t = l.team(r.teamId).nfl;
          const moved = sorted && oldIdx >= 0 ? oldIdx - newIdx : 0;
          return (
            <div
              key={r.teamId}
              className="absolute inset-x-0 flex items-center gap-3 rounded-lg border border-line bg-navy px-3"
              style={{ height: ROW - 8, transform: `translateY(${idx * ROW}px)`, transition: 'transform 1s cubic-bezier(.3,.9,.3,1)' }}
            >
              <span className="display w-6 text-xl font-bold text-mute">{idx + 1}</span>
              <Helmet nfl={t.id} size={36} />
              <span className="display min-w-0 flex-1 truncate text-2xl font-bold">{t.name}</span>
              {moved !== 0 && (
                <span className={`text-sm font-bold ${moved > 0 ? 'text-win' : 'text-loss'}`}>
                  {moved > 0 ? '▲' : '▼'}
                  {Math.abs(moved)}
                </span>
              )}
              <span className="text-lg font-semibold tabular-nums">
                {sorted ? `${r.w}-${r.l}-${r.t}` : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: ((i * 53) % 40) / 10,
        duration: 3 + ((i * 17) % 30) / 10,
        color: ['#F2B705', '#ffffff', '#4ade80', '#60a5fa', '#f87171'][i % 5],
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <span key={i} className="confetti" style={{ left: `${p.left}%`, background: p.color, animationDelay: `-${p.delay}s`, animationDuration: `${p.duration}s` }} />
      ))}
    </div>
  );
}

export function Reveal({ data, onClose }: { data: RevealData; onClose: () => void }) {
  const l = useMemo(() => makeLookup(data), [data]);
  const reduced = usePrefersReducedMotion();
  const steps = useMemo<Step[]>(() => {
    const s: Step[] = data.games.map((game) => ({ kind: 'game', game }));
    if (data.standings) s.push({ kind: 'standings' });
    if (data.bracket && data.championTeamId == null) s.push({ kind: 'bracket' });
    if (data.championTeamId != null) s.push({ kind: 'champion' });
    return s;
  }, [data]);
  const [i, setI] = useState(0);
  const step = steps[i];
  const last = i >= steps.length - 1;
  const next = useCallback(() => setI((v) => Math.min(v + 1, steps.length - 1)), [steps.length]);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Auto-advance: ~7 s per matchup.
  useEffect(() => {
    if (last) return;
    const id = setTimeout(next, step?.kind === 'game' ? GAME_MS : END_MS);
    return () => clearTimeout(id);
  }, [i, last, next, step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [next, onClose]);

  const champ = data.championTeamId != null ? l.team(data.championTeamId).nfl : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-navy" role="dialog" aria-modal="true" aria-label={`${data.week.label} results`}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="display flex-1 truncate text-lg font-bold sm:text-2xl">
          <span className="text-gold">{data.week.label}</span> Results
          <span className="ml-3 text-sm text-mute">
            {i + 1} / {steps.length}
          </span>
        </div>
        <button type="button" className="btn" onClick={next} disabled={last}>
          Next ›
        </button>
        <button type="button" className="btn" onClick={() => setI(steps.length - 1)} disabled={last}>
          Skip to end
        </button>
        <button type="button" className="btn" onClick={onClose} ref={closeRef}>
          Close ✕
        </button>
      </div>
      <div className="relative flex-1 overflow-auto p-3 sm:p-6">
        {step?.kind === 'game' && <GameStep key={step.game.id} game={step.game} l={l} reduced={reduced} />}
        {step?.kind === 'standings' && data.standings && (
          <div>
            <div className="display mb-4 text-center text-3xl font-bold">Updated Standings</div>
            <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.standings.map((d) => (
                <SortingTable key={d.divisionId} title={divisionLabel(l.division(d.divisionId))} before={d.before} after={d.after} l={l} reduced={reduced} />
              ))}
            </div>
          </div>
        )}
        {step?.kind === 'bracket' && data.bracket && (
          <div className="mx-auto max-w-6xl">
            <div className="display mb-4 text-center text-3xl font-bold">{data.seeds ? 'The Playoff Bracket Is Set' : 'Playoff Bracket'}</div>
            {data.seeds && (
              <div className="mb-6">
                <SeedCards seeds={data.seeds} l={l} />
              </div>
            )}
            <BracketView bracket={data.bracket} l={l} />
          </div>
        )}
        {step?.kind === 'champion' && champ && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Confetti />
            <div className="display text-3xl text-gold sm:text-5xl">Super Bowl Champions</div>
            <div className="anim-fade-up my-6">
              <Helmet nfl={champ.id} size={Math.min(320, window.innerWidth / 3)} />
            </div>
            <div className="display text-5xl font-bold text-gold sm:text-8xl">
              {champ.city} {champ.name}
            </div>
            <div className="mt-3 text-xl text-mute">{divisionLabel(l.team(data.championTeamId!).division)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
