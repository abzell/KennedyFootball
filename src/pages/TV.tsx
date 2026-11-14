import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Game, PlayoffsData, PowerData, ScoreboardData, StandingRow, StandingsData } from '../../shared/types';
import { Helmet } from '../components/Helmet';
import { RevealButton } from '../components/Reveal';
import { BracketView, ResultBadge, SeedCards, Wordmark, groupByDivision, lastText, sideResult } from '../components/ui';
import { divisionLabel, pct, statusText, useApi, useBoundaryReload, useLookup, type Lookup } from '../lib';
import { Movement } from './Public';

const W = 1920;
const H = 1080;
const ROTATE_MS = 15000;

interface Slide {
  key: string;
  title: string;
  body: ReactNode;
}

function TvGame({ game, l }: { game: Game; l: Lookup }) {
  const row = (side: 'a' | 'b') => {
    const s = game[side];
    const t = l.team(s.teamId).nfl;
    const r = sideResult(game, side);
    return (
      <div className="flex items-center gap-4">
        <Helmet nfl={t.id} size={72} facing={side === 'a' ? 'right' : 'left'} />
        <div className={`display min-w-0 flex-1 truncate text-[44px] font-bold leading-tight ${r === 'W' ? 'text-gold' : ''}`}>{t.name}</div>
        <span className="text-2xl">
          <ResultBadge r={r} />
        </span>
        <div className={`display w-28 text-right text-[64px] font-bold leading-none tabular-nums ${r === 'W' ? 'text-gold' : ''}`}>{s.score}</div>
      </div>
    );
  };
  return (
    <div className="card space-y-2 p-5">
      {row('a')}
      {row('b')}
      {game.onSeed && <div className="text-xl font-semibold text-gold">Tied — advances on seed</div>}
    </div>
  );
}

function TvStandings({ rows, l }: { rows: StandingRow[]; l: Lookup }) {
  const rowH = Math.min(104, Math.floor(800 / Math.max(rows.length, 1)));
  const name = Math.max(26, Math.min(48, rowH * 0.5));
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-[80px_1fr_220px_160px_140px_140px_150px_420px] items-center border-b border-line px-6 py-3 text-2xl font-semibold uppercase tracking-wide text-mute">
        <span>#</span>
        <span>Team</span>
        <span className="text-center">W-L-T</span>
        <span className="text-right">Win %</span>
        <span className="text-right">PF</span>
        <span className="text-right">PA</span>
        <span className="text-center">Streak</span>
        <span>Last week</span>
      </div>
      {rows.map((r) => {
        const t = l.team(r.teamId).nfl;
        return (
          <div key={r.teamId} className="grid grid-cols-[80px_1fr_220px_160px_140px_140px_150px_420px] items-center border-b border-line/60 px-6 text-3xl last:border-0" style={{ height: rowH }}>
            <span className="display font-bold text-mute" style={{ fontSize: name }}>
              {r.rank}
            </span>
            <span className="flex min-w-0 items-center gap-4">
              <Helmet nfl={t.id} size={Math.min(72, rowH * 0.7)} />
              <span className="display truncate font-bold" style={{ fontSize: name }}>
                {t.name}
              </span>
              {r.badge && <span className="badge text-xl text-gold">{r.badge}</span>}
            </span>
            <span className="text-center font-bold tabular-nums">
              {r.w}-{r.l}-{r.t}
            </span>
            <span className="text-right tabular-nums">{pct(r.winPct)}</span>
            <span className="text-right tabular-nums">{r.pf}</span>
            <span className="text-right tabular-nums">{r.pa}</span>
            <span className="text-center tabular-nums">{r.streak}</span>
            <span className="truncate text-2xl text-mute">{lastText(r, l)}</span>
          </div>
        );
      })}
    </div>
  );
}

function TvPower({ data, l }: { data: PowerData; l: Lookup }) {
  const cols = data.rows.length > 8 ? 2 : 1;
  const perCol = Math.ceil(data.rows.length / cols);
  const rowH = Math.min(100, Math.floor(840 / Math.max(perCol, 1)));
  const name = Math.max(26, Math.min(44, rowH * 0.5));
  return (
    <div className="grid gap-x-10" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${perCol}, ${rowH}px)`, gridAutoFlow: 'column' }}>
      {data.rows.map((r) => {
        const t = l.team(r.teamId);
        return (
          <div key={r.teamId} className="flex items-center gap-4 border-b border-line/60 px-2">
            <span className="display w-16 text-center font-bold text-gold" style={{ fontSize: name * 1.15 }}>
              {r.rank}
            </span>
            <span className="w-20 text-center">
              <Movement move={r.move} big />
            </span>
            <Helmet nfl={t.nfl.id} size={Math.min(68, rowH * 0.7)} />
            <span className="min-w-0 flex-1">
              <span className="display block truncate font-bold leading-tight" style={{ fontSize: name }}>
                {t.nfl.city} {t.nfl.name}
              </span>
              {rowH >= 80 && <span className="block text-xl text-mute">{t.division?.name}</span>}
            </span>
            <span className="text-3xl font-bold tabular-nums">
              {r.w}-{r.l}-{r.t}
            </span>
            <span className="w-32 text-right text-2xl text-mute tabular-nums">{r.pf} PF</span>
          </div>
        );
      })}
    </div>
  );
}

export function TVPage() {
  const sb = useApi<ScoreboardData>('/api/public/scoreboard');
  const st = useApi<StandingsData>('/api/public/standings');
  const pw = useApi<PowerData>('/api/public/power');
  const po = useApi<PlayoffsData>('/api/public/playoffs');
  const l = useLookup(sb.data);
  const reloadAll = useCallback(() => {
    sb.reload();
    st.reload();
    pw.reload();
    po.reload();
  }, [sb.reload, st.reload, pw.reload, po.reload]);
  useBoundaryReload(sb.data?.state, reloadAll);

  const slides = useMemo<Slide[]>(() => {
    const out: Slide[] = [];
    const s = sb.data;
    if (!s) return out;
    if (s.state.revealAvailable && s.state.revealWeek) {
      out.push({
        key: 'reveal',
        title: `${s.state.revealWeek.label} is in the books`,
        body: (
          <div className="flex h-full flex-col items-center justify-center gap-10">
            <div className="display text-6xl text-mute">Who won this week?</div>
            <RevealButton label={s.state.revealWeek.label} big />
          </div>
        ),
      });
    }
    if (s.state.championTeamId != null) {
      const t = l.team(s.state.championTeamId);
      out.push({
        key: 'champion',
        title: 'Super Bowl Champions',
        body: (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <Helmet nfl={t.nfl.id} size={360} />
            <div className="display text-[120px] font-bold leading-none text-gold">
              {t.nfl.city} {t.nfl.name}
            </div>
            <div className="text-4xl text-mute">{divisionLabel(t.division)}</div>
          </div>
        ),
      });
    }
    if (s.lastWeek) {
      const groups = groupByDivision(s.lastWeek.games, l);
      const total = s.lastWeek.games.length;
      out.push({
        key: 'results',
        title: `${s.lastWeek.week.label} Results`,
        body: (
          <div className="grid h-full content-start gap-x-8 gap-y-4" style={{ gridTemplateColumns: `repeat(${Math.min(groups.length, total > 9 ? 4 : 3) || 1}, 1fr)` }}>
            {groups.map((g) => (
              <div key={g.title} className="space-y-4">
                <div className="display text-3xl text-gold">{g.title}</div>
                {g.items.map((game) => (
                  <TvGame key={game.id} game={game} l={l} />
                ))}
              </div>
            ))}
          </div>
        ),
      });
    }
    if (st.data) {
      for (const d of st.data.byDivision) {
        if (!d.rows.length) continue;
        out.push({ key: `st-${d.divisionId}`, title: `Standings · ${divisionLabel(l.division(d.divisionId))}`, body: <TvStandings rows={d.rows} l={l} /> });
      }
    }
    if (pw.data?.ready) out.push({ key: 'power', title: `Power Rankings${pw.data.asOfWeek ? ` · After ${pw.data.asOfWeek.label}` : ''}`, body: <TvPower data={pw.data} l={l} /> });
    if (po.data && po.data.stage === 'picture') {
      out.push({ key: 'picture', title: 'Playoff Picture · If the season ended today', body: <SeedCards seeds={po.data.seeds} hunt={po.data.hunt} l={l} big /> });
    } else if (po.data && po.data.stage === 'bracket' && po.data.bracket) {
      out.push({ key: 'bracket', title: 'Playoff Bracket', body: <BracketView bracket={po.data.bracket} l={l} big /> });
    }
    if (out.length === 0) {
      out.push({
        key: 'status',
        title: s.state.seasonName ?? 'Kennedy Football League',
        body: <div className="display flex h-full items-center justify-center text-center text-7xl">{statusText(s.state)}</div>,
      });
    }
    return out;
  }, [sb.data, st.data, pw.data, po.data, l]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length || 1;
  const current = slides[index % count];

  useEffect(() => {
    if (paused || count < 2) return;
    const id = setInterval(() => {
      // Never rotate away while the reveal animation is playing.
      if (!document.querySelector('[role="dialog"]')) setIndex((i) => (i + 1) % count);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [paused, count, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // While the reveal overlay is open it handles its own keys.
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % count);
      else if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + count) % count);
      else if (e.key === 'p' || e.key === 'P') setPaused((p) => !p);
      else if (e.key === 'f' || e.key === 'F') {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count]);

  // Scale the fixed 1920×1080 stage to fit any screen.
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-navy">
      <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left', marginLeft: (window.innerWidth - W * scale) / 2, marginTop: (window.innerHeight - H * scale) / 2 }} className="flex flex-col px-14 py-8">
        <header className="mb-6 flex items-end justify-between border-b-4 border-gold pb-4">
          <div>
            <Wordmark size="lg" />
            <h1 className="display mt-3 text-6xl font-bold">{current?.title ?? 'Loading…'}</h1>
          </div>
          <div className="text-right text-2xl text-mute">
            {sb.data && <div>{statusText(sb.data.state)}</div>}
            <div className="mt-2 flex justify-end gap-2" aria-hidden="true">
              {slides.map((s, i) => (
                <span key={s.key} className={`h-3 w-10 rounded-full ${i === index % count ? 'bg-gold' : 'bg-line'}`} />
              ))}
            </div>
            <div className="mt-2 text-lg">{paused ? 'Paused · P to resume' : '← → change slide · P pause · F fullscreen'}</div>
          </div>
        </header>
        <main className="min-h-0 flex-1" key={current?.key}>
          {current?.body ?? <div className="text-4xl text-mute">{sb.error?.message ?? 'Loading…'}</div>}
        </main>
      </div>
    </div>
  );
}
