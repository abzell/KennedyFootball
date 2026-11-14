import { useState, type ReactNode } from 'react';
import { CATEGORIES, CATEGORY_INFO } from '../../shared/league';
import { formatWeekRange } from '../../shared/time';
import type { PlayoffsData, PowerData, ScheduleData, ScoreboardData, StandingsData, WeekInfo } from '../../shared/types';
import { Helmet } from '../components/Helmet';
import { RevealButtons } from '../components/Reveal';
import { BracketView, GameCard, LoadState, Notice, PairingCard, SeedCards, StandingsTable, groupByDivision } from '../components/ui';
import { statusText, useApi, useBoundaryReload, useLookup } from '../lib';

function H1({ children }: { children: ReactNode }) {
  return <h1 className="display mb-4 text-3xl font-bold">{children}</h1>;
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="display mb-2 mt-6 text-xl font-bold text-gold">{children}</h2>;
}

export function ChampionBanner({ teamId, l }: { teamId: number; l: ReturnType<typeof useLookup> }) {
  const t = l.team(teamId);
  return (
    <div className="card mb-4 flex flex-col items-center gap-2 border-2 border-gold bg-gold/10 p-5 text-center sm:flex-row sm:text-left">
      <Helmet nfl={t.nfl.id} size={96} />
      <div>
        <div className="display text-lg text-gold">🏆 Super Bowl Champions</div>
        <div className="display text-4xl font-bold text-gold">
          {t.nfl.city} {t.nfl.name}
        </div>
        <div className="text-mute">{t.division?.name}</div>
      </div>
    </div>
  );
}

const typeLabel = (w: WeekInfo) => (w.type === 'regular' ? 'Regular' : w.type === 'skip' ? 'Skip' : w.type === 'semifinal' ? 'Semifinal' : 'Super Bowl');

export function ScoreboardPage() {
  const { data, error, reload } = useApi<ScoreboardData>('/api/public/scoreboard');
  const l = useLookup(data);
  useBoundaryReload(data?.state, reload);
  if (!data) return <LoadState error={error} loading />;
  const s = data.state;
  return (
    <div>
      {s.championTeamId != null && <ChampionBanner teamId={s.championTeamId} l={l} />}
      <div className="card mb-4 flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-mute">{s.seasonName ?? 'Kennedy Football League'}</div>
          <div className="display text-xl font-bold" role="status">
            {statusText(s)}
          </div>
        </div>
        <RevealButtons state={s} divisions={data.divisions} />
      </div>

      {data.lastWeek && (
        <section>
          <H2>{data.lastWeek.week.label} Results</H2>
          {groupByDivision(data.lastWeek.games, l).map((g) => (
            <div key={g.title} className="mb-4">
              <h3 className="mb-2 text-sm font-semibold text-mute">{g.title}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {g.items.map((game) => (
                  <GameCard key={game.id} game={game} l={l} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {data.thisWeek && data.thisWeek.pairings.length > 0 && (
        <section>
          <H2>
            {data.thisWeek.isCurrent ? 'This Week' : 'Up Next'} · {data.thisWeek.week.label}
            <span className="ml-2 text-sm font-normal normal-case text-mute">{formatWeekRange(data.thisWeek.week.mondayDate)}</span>
          </H2>
          {groupByDivision(data.thisWeek.pairings, l).map((g) => (
            <div key={g.title} className="mb-4">
              <h3 className="mb-2 text-sm font-semibold text-mute">{g.title}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {g.items.map((p) => (
                  <PairingCard key={p.id} p={p} l={l} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {s.phase === 'no_season' && <Notice>No season is running yet.</Notice>}

      <section>
        <H2>How Teams Score</H2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((c) => (
            <div key={c} className="card p-3">
              <div className="display font-bold">{CATEGORY_INFO[c].label}</div>
              <div className="text-sm text-mute">{CATEGORY_INFO[c].description}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function StandingsPage() {
  const { data, error } = useApi<StandingsData>('/api/public/standings');
  const l = useLookup(data);
  const [tab, setTab] = useState<number | 'league' | null>(null);
  if (!data) return <LoadState error={error} loading />;
  const active = tab ?? data.divisions[0]?.id ?? 'league';
  const rows = active === 'league' ? data.league : data.byDivision.find((d) => d.divisionId === active)?.rows ?? [];
  return (
    <div>
      <H1>Standings</H1>
      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Standings view">
        {[...data.divisions.map((d) => ({ id: d.id as number | 'league', name: d.name })), { id: 'league' as const, name: 'League' }].map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={active === t.id} className={`btn ${active === t.id ? 'btn-gold' : ''}`} onClick={() => setTab(t.id)}>
            {t.name}
          </button>
        ))}
      </div>
      {rows.length ? <StandingsTable rows={rows} l={l} showDivision={active === 'league'} /> : <Notice>No teams yet.</Notice>}
      <p className="mt-3 text-xs text-mute">
        <span className="badge mr-1 text-gold">DIV</span> division leader · <span className="badge mx-1 text-gold">WC</span> wildcard, if the season ended today. Standings update every Monday.
        Ties are broken by win %, points for, head-to-head, then a coin flip.
      </p>
    </div>
  );
}

export function Movement({ move, big = false }: { move: number | null; big?: boolean }) {
  const cls = big ? 'text-3xl' : 'text-sm';
  if (move == null || move === 0)
    return (
      <span className={`${cls} text-mute`} aria-label="no change">
        —
      </span>
    );
  return move > 0 ? (
    <span className={`${cls} font-bold text-win`} aria-label={`up ${move}`}>
      ▲{move}
    </span>
  ) : (
    <span className={`${cls} font-bold text-loss`} aria-label={`down ${-move}`}>
      ▼{-move}
    </span>
  );
}

export function PowerPage() {
  const { data, error } = useApi<PowerData>('/api/public/power');
  const l = useLookup(data);
  if (!data) return <LoadState error={error} loading />;
  return (
    <div>
      <H1>Power Rankings</H1>
      {!data.ready ? (
        <Notice>Power rankings begin after Week 1.</Notice>
      ) : (
        <>
          <p className="mb-3 text-sm text-mute">
            After {data.asOfWeek?.label}
            {data.frozen ? ' · Final regular-season rankings' : ''}
          </p>
          <div className="card divide-y divide-line/60">
            {data.rows.map((r) => {
              const t = l.team(r.teamId);
              return (
                <div key={r.teamId} className="flex items-center gap-3 px-3 py-2">
                  <div className="display w-8 text-center text-2xl font-bold text-gold">{r.rank}</div>
                  <div className="w-10 text-center">
                    <Movement move={r.move} />
                  </div>
                  <Helmet nfl={t.nfl.id} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="display truncate text-lg font-bold">
                      {t.nfl.city} {t.nfl.name}
                    </div>
                    <div className="text-xs text-mute">{t.division?.name}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-semibold tabular-nums">
                      {r.w}-{r.l}-{r.t}
                    </div>
                    <div className="text-xs text-mute tabular-nums">{r.pf} PF</div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-mute">Power = 50% win percentage + 30% last two weeks’ scoring + 20% season scoring.</p>
        </>
      )}
    </div>
  );
}

export function PlayoffsPage() {
  const { data, error } = useApi<PlayoffsData>('/api/public/playoffs');
  const l = useLookup(data);
  if (!data) return <LoadState error={error} loading />;
  return (
    <div>
      <H1>Playoffs</H1>
      {data.state.championTeamId != null && <ChampionBanner teamId={data.state.championTeamId} l={l} />}
      {data.stage === 'pre' && <Notice>The playoff picture appears after Week 1. The top team in each division plus wildcards (4 teams total) make the playoffs.</Notice>}
      {data.stage === 'picture' && (
        <>
          <H2>If the season ended today</H2>
          <SeedCards seeds={data.seeds} hunt={data.hunt} l={l} />
          <p className="mt-4 text-sm text-mute">Semifinals: #1 vs #4 and #2 vs #3. The winners meet in the Super Bowl.</p>
        </>
      )}
      {data.stage === 'bracket' && data.bracket && (
        <>
          <p className="mb-3 text-sm text-mute">
            Semifinals {data.semifinalWeek ? formatWeekRange(data.semifinalWeek.mondayDate) : ''} · Super Bowl {data.superBowlWeek ? formatWeekRange(data.superBowlWeek.mondayDate) : ''}
          </p>
          <BracketView bracket={data.bracket} l={l} />
          <H2>Seeds</H2>
          <SeedCards seeds={data.seeds} l={l} />
        </>
      )}
    </div>
  );
}

export function SchedulePage() {
  const { data, error } = useApi<ScheduleData>('/api/public/schedule');
  const l = useLookup(data);
  if (!data) return <LoadState error={error} loading />;
  return (
    <div>
      <H1>Schedule</H1>
      {data.weeks.length === 0 && <Notice>The schedule has not been set yet.</Notice>}
      <div className="space-y-4">
        {data.weeks.map(({ week, pairings, games }) => {
          const current = data.state.week?.id === week.id;
          return (
            <section key={week.id} className={`card p-4 ${current ? 'border-gold' : ''}`}>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="display text-xl font-bold">{week.label}</h2>
                <span className="text-sm text-mute">{formatWeekRange(week.mondayDate)}</span>
                <span className="badge text-mute">{typeLabel(week)}</span>
                {current && <span className="badge text-gold">This week</span>}
              </div>
              {week.type === 'skip' ? (
                <p className="text-sm text-mute">No games this week.</p>
              ) : games ? (
                groupByDivision(games, l).map((g) => (
                  <div key={g.title} className="mt-3">
                    <h3 className="mb-2 text-sm font-semibold text-mute">{g.title}</h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      {g.items.map((game) => (
                        <GameCard key={game.id} game={game} l={l} />
                      ))}
                    </div>
                  </div>
                ))
              ) : pairings.length ? (
                groupByDivision(pairings, l).map((g) => (
                  <div key={g.title} className="mt-3">
                    <h3 className="mb-2 text-sm font-semibold text-mute">{g.title}</h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      {g.items.map((p) => (
                        <PairingCard key={p.id} p={p} l={l} />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-mute">{week.type === 'regular' ? 'Matchups to be announced.' : 'Teams to be decided.'}</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
