// Static data for the 32 NFL franchises. Logos are loaded from ESPN's public CDN
// at view time and are never stored by this app.

export interface NflTeam {
  id: string;
  city: string;
  name: string;
  abbr: string;
  espnAbbr: string;
  conference: 'AFC' | 'NFC';
  primaryColor: string;
  secondaryColor: string;
}

const t = (
  abbr: string,
  city: string,
  name: string,
  conference: 'AFC' | 'NFC',
  primaryColor: string,
  secondaryColor: string,
  espnAbbr = abbr.toLowerCase(),
): NflTeam => ({ id: abbr.toLowerCase(), city, name, abbr, espnAbbr, conference, primaryColor, secondaryColor });

export const NFL_TEAMS: NflTeam[] = [
  t('ARI', 'Arizona', 'Cardinals', 'NFC', '#97233F', '#FFB612'),
  t('ATL', 'Atlanta', 'Falcons', 'NFC', '#A71930', '#A5ACAF'),
  t('BAL', 'Baltimore', 'Ravens', 'AFC', '#241773', '#9E7C0C'),
  t('BUF', 'Buffalo', 'Bills', 'AFC', '#00338D', '#C60C30'),
  t('CAR', 'Carolina', 'Panthers', 'NFC', '#0085CA', '#101820'),
  t('CHI', 'Chicago', 'Bears', 'NFC', '#0B162A', '#C83803'),
  t('CIN', 'Cincinnati', 'Bengals', 'AFC', '#FB4F14', '#000000'),
  t('CLE', 'Cleveland', 'Browns', 'AFC', '#311D00', '#FF3C00'),
  t('DAL', 'Dallas', 'Cowboys', 'NFC', '#003594', '#869397'),
  t('DEN', 'Denver', 'Broncos', 'AFC', '#FB4F14', '#002244'),
  t('DET', 'Detroit', 'Lions', 'NFC', '#0076B6', '#B0B7BC'),
  t('GB', 'Green Bay', 'Packers', 'NFC', '#203731', '#FFB612'),
  t('HOU', 'Houston', 'Texans', 'AFC', '#03202F', '#A71930'),
  t('IND', 'Indianapolis', 'Colts', 'AFC', '#002C5F', '#A2AAAD'),
  t('JAX', 'Jacksonville', 'Jaguars', 'AFC', '#006778', '#D7A22A'),
  t('KC', 'Kansas City', 'Chiefs', 'AFC', '#E31837', '#FFB81C'),
  t('LV', 'Las Vegas', 'Raiders', 'AFC', '#000000', '#A5ACAF'),
  t('LAC', 'Los Angeles', 'Chargers', 'AFC', '#0080C6', '#FFC20E'),
  t('LAR', 'Los Angeles', 'Rams', 'NFC', '#003594', '#FFD100'),
  t('MIA', 'Miami', 'Dolphins', 'AFC', '#008E97', '#FC4C02'),
  t('MIN', 'Minnesota', 'Vikings', 'NFC', '#4F2683', '#FFC62F'),
  t('NE', 'New England', 'Patriots', 'AFC', '#002244', '#C60C30'),
  t('NO', 'New Orleans', 'Saints', 'NFC', '#101820', '#D3BC8D'),
  t('NYG', 'New York', 'Giants', 'NFC', '#0B2265', '#A71930'),
  t('NYJ', 'New York', 'Jets', 'AFC', '#125740', '#FFFFFF'),
  t('PHI', 'Philadelphia', 'Eagles', 'NFC', '#004C54', '#A5ACAF'),
  t('PIT', 'Pittsburgh', 'Steelers', 'AFC', '#101820', '#FFB612'),
  t('SF', 'San Francisco', '49ers', 'NFC', '#AA0000', '#B3995D'),
  t('SEA', 'Seattle', 'Seahawks', 'NFC', '#002244', '#69BE28'),
  t('TB', 'Tampa Bay', 'Buccaneers', 'NFC', '#D50A0A', '#B1BABF'),
  t('TEN', 'Tennessee', 'Titans', 'AFC', '#0C2340', '#4B92DB'),
  t('WSH', 'Washington', 'Commanders', 'NFC', '#5A1414', '#FFB612'),
];

const BY_ID = new Map(NFL_TEAMS.map((x) => [x.id, x]));

const UNKNOWN: NflTeam = {
  id: 'unknown',
  city: 'Unknown',
  name: 'Team',
  abbr: '???',
  espnAbbr: 'nfl',
  conference: 'AFC',
  primaryColor: '#44506B',
  secondaryColor: '#FFFFFF',
};

export function nflTeam(id: string): NflTeam {
  return BY_ID.get(id) ?? UNKNOWN;
}

export function isNflTeamId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}

export function logoUrl(team: NflTeam): string {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${team.espnAbbr}.png`;
}

export function fullName(team: NflTeam): string {
  return `${team.city} ${team.name}`;
}

function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Text colour for the logo-fallback badge: secondary colour or white, whichever reads better. */
export function fallbackTextColor(team: NflTeam): string {
  return contrastRatio(team.primaryColor, team.secondaryColor) >= contrastRatio(team.primaryColor, '#FFFFFF')
    ? team.secondaryColor
    : '#FFFFFF';
}

/** Readable text colour (white or near-black) on top of an arbitrary background. */
export function readableOn(bg: string): string {
  return contrastRatio(bg, '#FFFFFF') >= contrastRatio(bg, '#0B1A33') ? '#FFFFFF' : '#0B1A33';
}
