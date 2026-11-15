import { useState, type ReactNode } from 'react';
import { CATEGORIES, CATEGORY_INFO, type Seed } from '../../shared/league';
import type { Bracket, BracketGame, Game, Pairing, Side, StandingRow } from '../../shared/types';
import { pct, type Lookup } from '../lib';
import { Helmet } from './Helmet';

export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className={`display font-bold leading-none ${size === 'lg' ? 'text-5xl' : 'text-xl sm:text-2xl'}`}>
      <span className="text-gold">KFL</span>
      <span className="mx-2 text-mute">·</span>
      <span>Kennedy Football League</span>
    </span>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="card px-4 py-6 text-center text-mute">{children}</div>;
}

export function LoadState({ error, loading }: { error: { message: string } | null; loading: boolean }) {
  if (error && loading) return <Notice>{error.message}</Notice>;
  if (loading) return <Notice>Loading…</Notice>;
  return null;
}

const RESULT_STYLE = { W: 'text-win', L: 'text-loss', T: 'text-mute' } as const;
const RESULT_WORD = { W: 'Win', L: 'Loss', T: 'Tie' } as const;

export function ResultBadge({ r }: { r: 'W' | 'L' | 'T' }) {
  return (
    <span className={`badge ${RESULT_STYLE[r]}`} title={RESULT_WORD[r]}>
      {r}
      <span className="sr-only"> ({RESULT_WORD[r]})</span>
    </span>
  );
}

export function sideResult(game: Game, side: 'a' | 'b'): 'W' | 'L' | 'T' {
  if (game.outcome === 'T') return 'T';
  return (game.outcome === 'A') === (side === 'a') ? 'W' : 'L';
}

function SideRow({ game, side, l }: { game: Game; side: 'a' | 'b'; l: Lookup }) {
  const s: Side = game[side];
  const t = l.team(s.teamId).nfl;
  const r = sideResult(game, side);
  return (
    <div className="flex items-center gap-3">
      <Helmet nfl={t.id} size={44} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-mute">
          {s.seed ? `#${s.seed} · ` : ''}
          {t.city}
        </div>
        <div className={`display truncate text-xl font-bold ${r === 'W' ? 'text-gold' : ''}`}>{t.name}</div>
      </div>
      <ResultBadge r={r} />
      <div className={`display w-14 text-right text-3xl font-bold tabular-nums ${r === 'W' ? 'text-gold' : ''}`}>{s.score}</div>
    </div>
  );
}

export function CategoryBreakdown({ game, l }: { game: Game; l: Lookup }) {
  const max = Math.max(1, ...CATEGORIES.flatMap((c) => [game.a.cats[c], game.b.cats[c]]));
  const a = l.team(game.a.teamId).nfl;
  const b = l.team(game.b.teamId).nfl;
  return (
    <div className="mt-3 space-y-2 border-t border-line pt-3">
      {CATEGORIES.map((c) => (
        <div key={c}>
          <div className="mb-1 flex justify-between text-xs text-mute">
            <span className="font-bold text-white tabular-nums">{game.a.cats[c]}</span>
            <span>{CATEGORY_INFO[c].label}</span>
            <span className="font-bold text-white tabular-nums">{game.b.cats[c]}</span>
          </div>
          <div className="flex gap-1">
            <div className="flex h-2 flex-1 justify-end rounded bg-navy">
              <div className="h-2 rounded" style={{ width: `${(game.a.cats[c] / max) * 100}%`, background: a.primaryColor, outline: '1px solid rgba(255,255,255,.5)' }} />
            </div>
            <div className="h-2 flex-1 rounded bg-navy">
              <div className="h-2 rounded" style={{ width: `${(game.b.cats[c] / max) * 100}%`, background: b.primaryColor, outline: '1px solid rgba(255,255,255,.5)' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** A finished game. Tap / click to show the per-category breakdown. */
export function GameCard({ game, l }: { game: Game; l: Lookup }) {
  const [open, setOpen] = useState(false);
  return (
    <button type="button" className="card block w-full p-3 text-left hover:border-mute" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
      <div className="space-y-2">
        <SideRow game={game} side="a" l={l} />
        <SideRow game={game} side="b" l={l} />
      </div>
      {game.onSeed && <div className="mt-2 text-xs font-semibold text-gold">Tied — advances on seed</div>}
      {open ? <CategoryBreakdown game={game} l={l} /> : <div className="mt-2 text-xs text-mute">Tap for category breakdown</div>}
    </button>
  );
}

export function PairingCard({ p, l }: { p: Pairing; l: Lookup }) {
  const a = l.team(p.aId).nfl;
  const b = l.team(p.bId).nfl;
  return (
    <div className="card flex items-center gap-2 p-3">
      <Helmet nfl={a.id} size={40} />
      <div className="min-w-0 flex-1">
        <div className="display truncate text-lg font-bold">
          {p.seedA ? <span className="text-mute">#{p.seedA} </span> : null}
          {a.name}
        </div>
      </div>
      <span className="display px-1 text-sm text-mute">vs</span>
      <div className="min-w-0 flex-1 text-right">
        <div className="display truncate text-lg font-bold">
          {p.seedB ? <span className="text-mute">#{p.seedB} </span> : null}
          {b.name}
        </div>
      </div>
      <Helmet nfl={b.id} size={40} />
    </div>
  );
}

export function slotTitle(slot: 'semi1' | 'semi2' | 'final' | null): string {
  return slot === 'final' ? 'Super Bowl' : slot ? 'Playoff Semifinal' : '';
}

/** Groups games/pairings by division (in display order), with playoff games last. */
export function groupByDivision<T extends { divisionId: number | null; slot: string | null }>(items: T[], l: Lookup): { title: string; items: T[] }[] {
  const out: { title: string; items: T[] }[] = [];
  for (const d of l.divisions) {
    const list = items.filter((i) => !i.slot && i.divisionId === d.id);
    if (list.length) out.push({ title: d.teacherName ? `${d.name} · ${d.teacherName}` : d.name, items: list });
  }
  const playoff = items.filter((i) => i.slot);
  if (playoff.length) out.push({ title: playoff.some((p) => p.slot === 'final') ? 'Super Bowl' : 'Playoff Semifinals', items: playoff });
  return out;
}

export function PlayoffBadge({ badge }: { badge: 'DIV' | 'WC' | null }) {
  if (!badge) return null;
  return (
    <span className="badge text-gold" title={badge === 'DIV' ? 'Division leader' : 'Wildcard'}>
      {badge}
    </span>
  );
}

export function lastText(row: StandingRow, l: Lookup): string {
  if (!row.last) return '—';
  return `${row.last.result} ${row.last.pf}–${row.last.pa} vs ${l.team(row.last.oppId).nfl.name}`;
}

export function StandingsTable({ rows, l, showDivision = false }: { rows: StandingRow[]; l: Lookup; showDivision?: boolean }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-mute">
            <th className="px-3 py-2 font-semibold">#</th>
            <th className="px-2 py-2 font-semibold">Team</th>
            <th className="px-2 py-2 text-center font-semibold">W-L-T</th>
            <th className="px-2 py-2 text-right font-semibold">Win %</th>
            <th className="px-2 py-2 text-right font-semibold">PF</th>
            <th className="px-2 py-2 text-right font-semibold">PA</th>
            <th className="px-2 py-2 text-center font-semibold">Streak</th>
            <th className="px-3 py-2 font-semibold">Last week</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const t = l.team(r.teamId);
            return (
              <tr key={r.teamId} className="border-b border-line/60 last:border-0">
                <td className="display px-3 py-2 text-lg font-bold text-mute">{r.rank}</td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <Helmet nfl={t.nfl.id} size={32} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-semibold">
                        <span className="truncate">
                          {t.nfl.city} {t.nfl.name}
                        </span>
                        <PlayoffBadge badge={r.badge} />
                      </div>
                      {showDivision && <div className="text-xs text-mute">{t.division?.name}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2 text-center font-semibold tabular-nums">
                  {r.w}-{r.l}-{r.t}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{pct(r.winPct)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.pf}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.pa}</td>
                <td className="px-2 py-2 text-center tabular-nums">{r.streak}</td>
                <td className="px-3 py-2 whitespace-nowrap text-mute">{lastText(r, l)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ playoffs

export function SeedCards({ seeds, hunt, l, big = false }: { seeds: Seed[]; hunt?: number[]; l: Lookup; big?: boolean }) {
  return (
    <div>
      <div className={`grid gap-3 ${big ? 'grid-cols-2' : 'sm:grid-cols-2'}`}>
        {seeds.map((s, i) => {
          const t = l.team(s.teamId);
          return (
            <div key={s.teamId} className="card anim-fade-up flex items-center gap-3 p-3" style={{ animationDelay: `${i * 0.15}s` }}>
              <div className={`display font-bold text-gold ${big ? 'text-6xl' : 'text-3xl'}`}>{s.seed}</div>
              <Helmet nfl={t.nfl.id} size={big ? 96 : 48} />
              <div className="min-w-0">
                <div className={`display truncate font-bold ${big ? 'text-5xl' : 'text-xl'}`}>{t.nfl.name}</div>
                <div className={`text-mute ${big ? 'text-2xl' : 'text-xs'}`}>
                  {s.kind === 'division' ? 'Division Winner' : 'Wildcard'} · {t.division?.name}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {hunt && hunt.length > 0 && (
        <div className="mt-4">
          <div className={`display mb-2 text-mute ${big ? 'text-3xl' : 'text-sm'}`}>In the hunt</div>
          <div className="flex flex-wrap gap-3">
            {hunt.map((id) => {
              const t = l.team(id);
              return (
                <div key={id} className="card flex items-center gap-2 px-3 py-2">
                  <Helmet nfl={t.nfl.id} size={big ? 56 : 32} />
                  <span className={`display font-bold ${big ? 'text-4xl' : 'text-base'}`}>{t.nfl.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function BracketSlot({ teamId, seed, score, state, l, big }: { teamId: number | null; seed: number | null; score: number | null; state: 'win' | 'loss' | 'pending'; l: Lookup; big: boolean }) {
  if (teamId == null) {
    return <div className={`flex items-center rounded-lg border border-dashed border-line px-3 text-mute ${big ? 'h-24 text-3xl' : 'h-14 text-sm'}`}>To be decided</div>;
  }
  const t = l.team(teamId).nfl;
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2 ${big ? 'h-24' : 'h-14'} ${state === 'win' ? 'border-gold bg-gold/10' : 'border-line bg-navy'} ${state === 'loss' ? 'opacity-60' : ''}`}>
      <span className={`display w-6 text-center font-bold text-mute ${big ? 'text-3xl' : 'text-sm'}`}>{seed ?? ''}</span>
      <Helmet nfl={t.id} size={big ? 64 : 34} />
      <span className={`display min-w-0 flex-1 truncate font-bold ${big ? 'text-4xl' : 'text-lg'} ${state === 'win' ? 'text-gold' : ''}`}>{t.name}</span>
      {state !== 'pending' && <ResultBadge r={state === 'win' ? 'W' : 'L'} />}
      {score != null && <span className={`display font-bold tabular-nums ${big ? 'text-5xl' : 'text-2xl'} ${state === 'win' ? 'text-gold' : ''}`}>{score}</span>}
    </div>
  );
}

function BracketMatch({ title, g, l, big }: { title: string; g: BracketGame | null; l: Lookup; big: boolean }) {
  const r = g?.result ?? null;
  const st = (side: 'a' | 'b'): 'win' | 'loss' | 'pending' => (!r ? 'pending' : sideResult(r, side) === 'W' ? 'win' : 'loss');
  return (
    <div className="card p-3">
      <div className={`display mb-2 text-mute ${big ? 'text-2xl' : 'text-xs'}`}>{title}</div>
      <div className="space-y-2">
        <BracketSlot teamId={g?.pairing.aId ?? null} seed={g?.pairing.seedA ?? null} score={r?.a.score ?? null} state={st('a')} l={l} big={big} />
        <BracketSlot teamId={g?.pairing.bId ?? null} seed={g?.pairing.seedB ?? null} score={r?.b.score ?? null} state={st('b')} l={l} big={big} />
      </div>
      {r?.onSeed && <div className={`mt-2 font-semibold text-gold ${big ? 'text-xl' : 'text-xs'}`}>Tied — advances on seed</div>}
    </div>
  );
}

export function BracketView({ bracket, l, big = false }: { bracket: Bracket; l: Lookup; big?: boolean }) {
  const champ = bracket.championTeamId != null ? l.team(bracket.championTeamId).nfl : null;
  return (
    <div className={`grid items-center gap-4 ${big ? 'grid-cols-[1fr_1fr_0.8fr]' : 'md:grid-cols-[1fr_1fr_0.8fr]'}`}>
      <div className="space-y-4">
        <BracketMatch title="Semifinal · #1 vs #4" g={bracket.semi1} l={l} big={big} />
        <BracketMatch title="Semifinal · #2 vs #3" g={bracket.semi2} l={l} big={big} />
      </div>
      <BracketMatch title="Super Bowl" g={bracket.final} l={l} big={big} />
      <div className={`card flex flex-col items-center justify-center gap-2 p-4 text-center ${champ ? 'border-gold' : ''}`}>
        <div className={`display text-gold ${big ? 'text-3xl' : 'text-sm'}`}>Champion</div>
        {champ ? (
          <>
            <Helmet nfl={champ.id} size={big ? 150 : 80} />
            <div className={`display font-bold text-gold ${big ? 'text-5xl' : 'text-2xl'}`}>{champ.name}</div>
          </>
        ) : (
          <div className={`text-mute ${big ? 'py-10 text-3xl' : 'py-4 text-sm'}`}>To be decided</div>
        )}
      </div>
    </div>
  );
}
