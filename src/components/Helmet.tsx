import { useId, useState } from 'react';
import { fallbackTextColor, logoUrl, nflTeam, type NflTeam } from '../../shared/nflTeams';

// Tracks logo URLs that failed so every helmet for that team falls back immediately.
const failed = new Set<string>();

function useLogo(team: NflTeam) {
  const url = logoUrl(team);
  const [bad, setBad] = useState(() => failed.has(url));
  return {
    url,
    bad: bad || failed.has(url),
    onError: () => {
      failed.add(url);
      setBad(true);
    },
  };
}

/** Team logo with the required fallback: a circle in the primary colour with the abbreviation. */
export function TeamLogo({ nfl, size = 32 }: { nfl: string; size?: number }) {
  const team = nflTeam(nfl);
  const logo = useLogo(team);
  if (logo.bad) {
    return (
      <span
        role="img"
        aria-label={`${team.name} logo`}
        className="inline-flex shrink-0 items-center justify-center rounded-full font-bold"
        style={{ width: size, height: size, background: team.primaryColor, color: fallbackTextColor(team), fontSize: size * 0.34, border: '1px solid rgba(255,255,255,.35)' }}
      >
        {team.abbr}
      </span>
    );
  }
  return <img src={logo.url} alt={`${team.name} logo`} width={size} height={size} className="shrink-0 object-contain" onError={logo.onError} loading="lazy" />;
}

const SHELL = 'M40 122C14 98 12 44 60 21C100 2 152 12 165 60L167 77C150 79 129 82 123 97C118 109 121 128 112 140C96 151 60 148 40 122Z';

/**
 * Original football-helmet drawing (side view): rounded shell with shading and a gloss highlight,
 * crest stripe, ear hole, chin strap and a barred facemask. Shell = primary colour; stripe and
 * facemask = secondary colour; the team logo sits on the side of the shell.
 */
export function Helmet({ nfl, size = 64, facing = 'right' }: { nfl: string; size?: number; facing?: 'left' | 'right' }) {
  const team = nflTeam(nfl);
  const logo = useLogo(team);
  const id = useId().replace(/:/g, '');
  const flip = facing === 'left';
  // Logo box in the un-flipped 200×170 drawing: about 40% of the helmet height.
  const logoSize = 68;
  const logoX = flip ? 200 - 54 - logoSize : 54;
  const logoY = 30;
  const cx = logoX + logoSize / 2;
  const cy = logoY + logoSize / 2;
  const mask = team.secondaryColor;
  return (
    <svg viewBox="0 0 200 170" width={(size * 200) / 170} height={size} role="img" aria-label={`${team.name} helmet`} className="shrink-0 overflow-visible">
      <defs>
        <clipPath id={`${id}c`}>
          <path d={SHELL} />
        </clipPath>
        <radialGradient id={`${id}g`} cx="42%" cy="24%" r="85%">
          <stop offset="0" stopColor="#fff" stopOpacity=".34" />
          <stop offset=".38" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".42" />
        </radialGradient>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".35" />
        </linearGradient>
      </defs>
      <g transform={flip ? 'translate(200 0) scale(-1 1)' : undefined}>
        {/* shell */}
        <path d={SHELL} fill={team.primaryColor} />
        <g clipPath={`url(#${id}c)`}>
          {/* crest stripe */}
          <path d="M20 86C22 40 70 6 118 12C140 15 156 28 166 50" fill="none" stroke={team.secondaryColor} strokeWidth="9" />
          <path d="M20 86C22 40 70 6 118 12C140 15 156 28 166 50" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="1.5" transform="translate(4 7)" />
          {/* shading + gloss */}
          <path d={SHELL} fill={`url(#${id}g)`} />
          <path d="M52 40C70 22 104 14 132 24" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="5" strokeLinecap="round" />
          {/* padding seen through the face opening edge */}
          <path d="M167 77C150 79 129 82 123 97C118 109 121 128 112 140" fill="none" stroke="rgba(0,0,0,.45)" strokeWidth="7" />
        </g>
        <path d={SHELL} fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2" />
        {/* ear hole + vents */}
        <circle cx="92" cy="112" r="7.5" fill="rgba(0,0,0,.55)" stroke="rgba(255,255,255,.25)" strokeWidth="1.5" />
        <rect x="58" y="126" width="16" height="4" rx="2" fill="rgba(0,0,0,.35)" transform="rotate(28 66 128)" />
        {/* chin strap */}
        <path d="M104 126C120 146 140 152 158 146" fill="none" stroke="#f4f4f4" strokeWidth="6" strokeLinecap="round" />
        <path d="M104 126C120 146 140 152 158 146" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="1" />
        <rect x="148" y="138" width="20" height="13" rx="6" fill="#f4f4f4" stroke="rgba(0,0,0,.3)" strokeWidth="1" />
        <circle cx="105" cy="126" r="3.5" fill="#d9d9d9" stroke="rgba(0,0,0,.4)" strokeWidth="1" />
        {/* facemask */}
        <g fill="none" stroke={mask} strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M163 68C184 74 196 92 195 116C194 134 184 143 168 143L122 136" />
          <path d="M124 104C148 99 176 101 194 110" />
          <path d="M120 121C146 119 172 121 194 126" />
          <path d="M174 82C179 102 179 124 174 142" />
        </g>
        <g fill="none" stroke={`url(#${id}m)`} strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M163 68C184 74 196 92 195 116C194 134 184 143 168 143L122 136" />
          <path d="M124 104C148 99 176 101 194 110" />
          <path d="M120 121C146 119 172 121 194 126" />
          <path d="M174 82C179 102 179 124 174 142" />
        </g>
        <g fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="1" strokeLinecap="round">
          <path d="M163 72C182 78 192 94 191 116C190 131 182 139 168 139L122 132" />
        </g>
        {/* facemask clips */}
        <rect x="158" y="62" width="10" height="12" rx="3" fill="#2b2b2b" stroke="rgba(255,255,255,.3)" strokeWidth="1" />
        <rect x="114" y="129" width="12" height="10" rx="3" fill="#2b2b2b" stroke="rgba(255,255,255,.3)" strokeWidth="1" />
      </g>
      {/* logo (never mirrored) */}
      {logo.bad ? (
        <g>
          <circle cx={cx} cy={cy} r={logoSize / 2 - 6} fill={team.primaryColor} stroke={fallbackTextColor(team)} strokeWidth="2.5" />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize="22" fontWeight="700" fontFamily="Inter, system-ui, sans-serif" fill={fallbackTextColor(team)}>
            {team.abbr}
          </text>
        </g>
      ) : (
        <image href={logo.url} x={logoX} y={logoY} width={logoSize} height={logoSize} preserveAspectRatio="xMidYMid meet" onError={logo.onError} />
      )}
    </svg>
  );
}
