// Shapes shared by the API (server) and the web app (client).
import type { ScoringReason, WeekType } from './calendar';
import type { CatTotals, Category, Outcome, Seed } from './league';

export interface WeekInfo {
  id: number;
  seq: number;
  type: WeekType;
  label: string;
  mondayDate: string;
  startAt: number;
  lockAt: number;
  publishAt: number;
  regularNo: number | null;
}

export interface DivisionInfo {
  id: number;
  name: string;
  teacherName: string;
  sortOrder: number;
}

export interface TeamInfo {
  id: number;
  divisionId: number;
  nfl: string;
}

export type Phase = 'no_season' | 'preseason' | 'open' | 'locked' | 'skip' | 'complete';

export interface PublicState {
  now: number;
  seasonName: string | null;
  phase: Phase;
  /** Calendar week containing "now". */
  week: WeekInfo | null;
  /** Next week with games, when the current one has none (or the season has not begun). */
  nextGameWeek: WeekInfo | null;
  lastPublishedWeek: WeekInfo | null;
  revealAvailable: boolean;
  revealWeek: WeekInfo | null;
  championTeamId: number | null;
}

export interface Base {
  state: PublicState;
  divisions: DivisionInfo[];
  teams: TeamInfo[];
}

export interface Side {
  teamId: number;
  seed: number | null;
  score: number;
  cats: CatTotals;
}

export interface Game {
  id: number;
  divisionId: number | null;
  slot: 'semi1' | 'semi2' | 'final' | null;
  a: Side;
  b: Side;
  outcome: Outcome;
  winnerId: number | null;
  onSeed: boolean;
}

export interface Pairing {
  id: number;
  divisionId: number | null;
  slot: 'semi1' | 'semi2' | 'final' | null;
  aId: number;
  bId: number;
  seedA: number | null;
  seedB: number | null;
}

export interface ScoreboardData extends Base {
  lastWeek: { week: WeekInfo; games: Game[] } | null;
  thisWeek: { week: WeekInfo; pairings: Pairing[]; isCurrent: boolean } | null;
}

export interface StandingRow {
  teamId: number;
  rank: number;
  w: number;
  l: number;
  t: number;
  winPct: number;
  pf: number;
  pa: number;
  streak: string;
  last: { result: 'W' | 'L' | 'T'; pf: number; pa: number; oppId: number } | null;
  badge: 'DIV' | 'WC' | null;
}

export interface StandingsData extends Base {
  byDivision: { divisionId: number; rows: StandingRow[] }[];
  league: StandingRow[];
}

export interface PowerData extends Base {
  ready: boolean;
  frozen: boolean;
  asOfWeek: WeekInfo | null;
  rows: { teamId: number; rank: number; move: number | null; power: number; w: number; l: number; t: number; pf: number }[];
}

export interface BracketGame {
  pairing: Pairing;
  /** Present only once that game's week has been published (or inside the reveal payload). */
  result: Game | null;
}

export interface Bracket {
  semi1: BracketGame | null;
  semi2: BracketGame | null;
  final: BracketGame | null;
  championTeamId: number | null;
}

export interface PlayoffsData extends Base {
  /** pre = nothing published yet; picture = "if the season ended today"; bracket = official. */
  stage: 'pre' | 'picture' | 'bracket';
  seeds: Seed[];
  hunt: number[];
  bracket: Bracket | null;
  semifinalWeek: WeekInfo | null;
  superBowlWeek: WeekInfo | null;
}

export interface ScheduleData extends Base {
  weeks: { week: WeekInfo; pairings: Pairing[]; games: Game[] | null }[];
}

export interface RevealData extends Base {
  week: WeekInfo;
  games: Game[];
  /** Division order before / after this week (regular-season weeks only). */
  standings: { divisionId: number; before: number[]; after: StandingRow[] }[] | null;
  /** Final regular-season week: the bracket that was just set. */
  seeds: Seed[] | null;
  bracket: Bracket | null;
  championTeamId: number | null;
}

export interface TeacherWeekData {
  now: number;
  seasonName: string | null;
  scoring: { open: boolean; reason: ScoringReason };
  week: WeekInfo | null;
  nextGameWeek: WeekInfo | null;
  firstWeek: WeekInfo | null;
  divisions: DivisionInfo[];
  teams: TeamInfo[];
  pairings: Pairing[];
  totals: Record<number, CatTotals>;
  /** Teams that may receive points right now. */
  eligibleTeamIds: number[];
}

export interface AwardRow {
  id: number;
  teamId: number;
  category: Category;
  createdAt: number;
}

export interface SetupData {
  now: number;
  season: { name: string; firstMonday: string; regularWeeks: number } | null;
  skipWeeks: { date: string; label: string }[];
  divisions: DivisionInfo[];
  teams: TeamInfo[];
  weeks: (WeekInfo & { started: boolean; pairings: Pairing[] })[];
  /** True once Week 1 has started with a schedule: divisions and teams can no longer change. */
  structureLocked: boolean;
  errors: string[];
}

export interface AuthStatus {
  pinSet: boolean;
  authed: boolean;
}
