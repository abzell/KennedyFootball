import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fullName, nflTeam, type NflTeam } from '../shared/nflTeams';
import { formatDate } from '../shared/time';
import type { DivisionInfo, PublicState, TeamInfo } from '../shared/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? 'GET',
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'No connection. Check the internet and try again.');
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status}).`);
  return data as T;
}

/** Fetches on mount, every `intervalMs` while the tab is visible, and whenever the tab regains focus. */
export function useApi<T>(path: string | null, intervalMs = 60000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    if (!path) return;
    const mine = ++seq.current;
    try {
      const d = await api<T>(path);
      if (mine === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (mine === seq.current) setError(e as ApiError);
    }
  }, [path]);
  useEffect(() => {
    reload();
    const id = setInterval(() => {
      if (!document.hidden) reload();
    }, intervalMs);
    const onVisible = () => {
      if (!document.hidden) reload();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload, intervalMs]);
  return { data, error, reload, setData };
}

/** Re-fetches right after the next lock / publish moment so the page flips without a reload. */
export function useBoundaryReload(state: PublicState | undefined | null, reload: () => void) {
  useEffect(() => {
    if (!state) return;
    const times = [state.week?.lockAt, state.week?.publishAt, state.nextGameWeek?.startAt].filter((t): t is number => !!t && t > state.now);
    if (!times.length) return;
    const delay = Math.min(...times) - state.now + 1500;
    if (delay > 24 * 3600 * 1000) return;
    const id = setTimeout(reload, delay);
    return () => clearTimeout(id);
  }, [state, reload]);
}

export interface Lookup {
  team: (id: number) => { info: TeamInfo | undefined; nfl: NflTeam; division: DivisionInfo | undefined };
  division: (id: number | null) => DivisionInfo | undefined;
  divisions: DivisionInfo[];
  teams: TeamInfo[];
}

export function makeLookup(base: { teams: TeamInfo[]; divisions: DivisionInfo[] }): Lookup {
  const teams = new Map(base.teams.map((t) => [t.id, t]));
  const divisions = new Map(base.divisions.map((d) => [d.id, d]));
  return {
    team: (id) => {
      const info = teams.get(id);
      return { info, nfl: nflTeam(info?.nfl ?? ''), division: info ? divisions.get(info.divisionId) : undefined };
    },
    division: (id) => (id == null ? undefined : divisions.get(id)),
    divisions: base.divisions,
    teams: base.teams,
  };
}

export function useLookup(base: { teams: TeamInfo[]; divisions: DivisionInfo[] } | null | undefined): Lookup {
  return useMemo(() => makeLookup(base ?? { teams: [], divisions: [] }), [base]);
}

export const teamFull = (l: Lookup, id: number) => fullName(l.team(id).nfl);

export function divisionLabel(d: DivisionInfo | undefined): string {
  if (!d) return '';
  return d.teacherName ? `${d.name} · ${d.teacherName}` : d.name;
}

/** .667 / 1.000 / .000 */
export function pct(v: number): string {
  const s = v.toFixed(3);
  return s.startsWith('0') ? s.slice(1) : s;
}

export function statusText(s: PublicState): string {
  switch (s.phase) {
    case 'no_season':
      return 'The season is being set up. Check back soon!';
    case 'preseason':
      return s.nextGameWeek ? `Season starts ${formatDate(s.nextGameWeek.mondayDate)}` : 'Season starts soon';
    case 'open':
      return `${s.week?.label ?? 'Game week'} in progress · Locks Fri 12:00 PM`;
    case 'locked':
      return `${s.week?.label ?? 'This week'} is locked · Results go public Monday`;
    case 'skip':
      return `No games this week (${s.week?.label ?? 'Break'})${s.nextGameWeek ? ` · Next games ${formatDate(s.nextGameWeek.mondayDate)}` : ''}`;
    case 'complete':
      return 'Season complete';
  }
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);
  return online;
}
