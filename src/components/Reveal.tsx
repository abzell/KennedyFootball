import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, CATEGORY_INFO } from '../../shared/league';
import { readableOn } from '../../shared/nflTeams';
import type { DivisionInfo, Game, PublicState, RevealData, StandingRow } from '../../shared/types';
import { api, divisionLabel, makeLookup, usePrefersReducedMotion, type Lookup } from '../lib';
import { Helmet } from './Helmet';
import { BracketView, SeedCards, sideResult, slotTitle } from './ui';

type Step = { kind: 'game'; game: Game } | { kind: 'standings' } | { kind: 'bracket' } | { kind: 'champion' };

/** What one button reveals: one division's games, or just the playoff bracket. Empty = everything. */
export interface RevealScope {
  divisionId?: number;
  part?: 'bracket';
}

const SIZES = {
  sm: 'px-4 py-3 text-xl',
  md: 'px-6 py-4 text-2xl',
  lg: 'rounded-2xl px-10 py-8 text-5xl',
  xl: 'rounded-3xl px-16 py-10 text-7xl',
} as const;

/** Button that fetches the just-locked week's results and plays them in this browser only. */
export function RevealButton({ text, size = 'md', scope }: { text: string; size?: keyof typeof SIZES; scope?: RevealScope }) {
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
      <button type="button" onClick={open} disabled={busy} className={`btn btn-gold anim-pulse display font-bold ${SIZES[size]}`}>
        {text}
      </button>
      {error && <p className="mt-2 text-loss">{error}</p>}
      {data && <Reveal data={data} scope={scope} onClose={() => setData(null)} />}
    </>
  );
}

/**
 * Regular season: one button per division (plus the playoff bracket after the final week),
 * so each class reveals only its own games. Playoffs: a single button.
 */
export function RevealButtons({ state, divisions, big = false }: { state: PublicState; divisions: DivisionInfo[]; big?: boolean }) {
  const week = state.revealWeek;
  if (!state.revealAvailable || !week) return null;
  if (week.type !== 'regular') {
    return <RevealButton text={`🏈 Reveal ${week.label} Winners`} size={big ? 'xl' : 'md'} />;
  }
  const size = big ? 'lg' : 'sm';
  return (
    <div className={`flex flex-wrap ${big ? 'justify-center gap-8' : 'gap-2 sm:justify-end'}`} role="group" aria-label={`Reveal ${week.label} winners`}>
      {divisions.map((d) => (
        <RevealButton key={d.id} text={`🏈 Reveal ${d.name}`} size={size} scope={{ divisionId: d.id }} />
      ))}
      {state.revealBracket && <RevealButton text="🏆 Reveal Playoff Bracket" size={size} scope={{ part: 'bracket' }} />}
    </div>
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

export function Reveal({ data, scope, onClose }: { data: RevealData; scope?: RevealScope; onClose: () => void }) {
  const l = useMemo(() => makeLookup(data), [data]);
  const reduced = usePrefersReducedMotion();
  const regular = data.week.type === 'regular';
  const divisionId = regular ? scope?.divisionId : undefined;
  const standings = useMemo(() => (data.standings ?? []).filter((d) => divisionId == null || d.divisionId === divisionId), [data, divisionId]);
  const steps = useMemo<Step[]>(() => {
    if (regular && scope?.part === 'bracket') return data.bracket ? [{ kind: 'bracket' }] : [];
    const s: Step[] = data.games.filter((g) => divisionId == null || g.divisionId === divisionId).map((game) => ({ kind: 'game', game }));
    if (standings.length) s.push({ kind: 'standings' });
    // In the regular season the bracket has its own button, so no division's reveal spoils it.
    if (!regular && data.bracket && data.championTeamId == null) s.push({ kind: 'bracket' });
    if (data.championTeamId != null) s.push({ kind: 'champion' });
    return s;
  }, [data, regular, scope, divisionId, standings]);
  const [i, setI] = useState(0);
  const step = steps[i];
  const last = i >= steps.length - 1;
  // Nothing advances on its own: each game waits for a click so the class can talk about it.
  const next = useCallback(() => setI((v) => Math.min(v + 1, steps.length - 1)), [steps.length]);
  const nextRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const upcoming = steps[i + 1];
  const nextLabel = !upcoming ? '' : upcoming.kind === 'game' ? 'Next game ▶' : upcoming.kind === 'standings' ? 'Standings ▶' : upcoming.kind === 'bracket' ? 'Bracket ▶' : 'Champion ▶';
  const scopeTitle = regular && scope?.part === 'bracket' ? 'Playoff Bracket' : divisionId != null ? l.division(divisionId)?.name ?? '' : '';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', onKey);
    (nextRef.current ?? closeRef.current)?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [next, onClose]);

  const champ = data.championTeamId != null ? l.team(data.championTeamId).nfl : null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-navy" role="dialog" aria-modal="true" aria-label={`${data.week.label} results`}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="display flex-1 truncate text-lg font-bold sm:text-2xl">
          <span className="text-gold">{data.week.label}</span> Results
          {scopeTitle && <span className="ml-2 text-mute">· {scopeTitle}</span>}
          <span className="ml-3 text-sm text-mute">
            {i + 1} / {steps.length}
          </span>
        </div>
        {!last && (
          <button type="button" className="btn btn-gold display px-5 text-lg" onClick={next} ref={nextRef}>
            {nextLabel}
          </button>
        )}
        {steps.length > 2 && (
          <button type="button" className="btn" onClick={() => setI(steps.length - 1)} disabled={last}>
            Skip to end
          </button>
        )}
        <button type="button" className="btn" onClick={onClose} ref={closeRef}>
          Close ✕
        </button>
      </div>
      <div className="relative flex-1 overflow-auto p-3 sm:p-6">
        {step?.kind === 'game' && <GameStep key={step.game.id} game={step.game} l={l} reduced={reduced} />}
        {step?.kind === 'standings' && standings.length > 0 && (
          <div>
            <div className="display mb-4 text-center text-3xl font-bold">Updated Standings</div>
            <div className={`mx-auto grid gap-4 ${standings.length === 1 ? 'max-w-xl' : 'max-w-6xl md:grid-cols-2 xl:grid-cols-3'}`}>
              {standings.map((d) => (
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
