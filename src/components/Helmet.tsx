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

/**
 * Original helmet silhouette (shell + facemask). Shell = primary colour, facemask and
 * stripe = secondary colour, with the team logo on the side of the shell.
 */
export function Helmet({ nfl, size = 64, facing = 'right' }: { nfl: string; size?: number; facing?: 'left' | 'right' }) {
  const team = nflTeam(nfl);
  const logo = useLogo(team);
  const clip = useId();
  const flip = facing === 'left';
  // Logo box (in the un-flipped 120×100 drawing): about 40% of the helmet height.
  const logoSize = 40;
  const logoX = flip ? 120 - 30 - logoSize : 30;
  const logoY = 24;
  const cx = logoX + logoSize / 2;
  const cy = logoY + logoSize / 2;
  return (
    <svg viewBox="0 0 120 100" width={size * 1.2} height={size} role="img" aria-label={`${team.name} helmet`} className="shrink-0 overflow-visible">
      <g transform={flip ? 'translate(120 0) scale(-1 1)' : undefined}>
        <defs>
          <clipPath id={clip}>
            <path d="M10 60C6 28 30 6 62 6c28 0 46 20 46 44v5l-22 2c-5 .5-8 4-8 9v10c0 6-4 10-10 10l-30 2C24 88 12 76 10 60Z" />
          </clipPath>
        </defs>
        {/* shell */}
        <path
          d="M10 60C6 28 30 6 62 6c28 0 46 20 46 44v5l-22 2c-5 .5-8 4-8 9v10c0 6-4 10-10 10l-30 2C24 88 12 76 10 60Z"
          fill={team.primaryColor}
          stroke="rgba(255,255,255,.45)"
          strokeWidth="1.5"
        />
        {/* crest stripe */}
        <g clipPath={`url(#${clip})`}>
          <path d="M4 44C14 14 40 2 66 4c20 1 36 12 44 30" fill="none" stroke={team.secondaryColor} strokeWidth="6" />
          <path d="M12 70c8 10 20 14 34 13" fill="none" stroke="rgba(0,0,0,.18)" strokeWidth="10" />
        </g>
        {/* ear hole */}
        <circle cx="70" cy="66" r="4.5" fill="rgba(0,0,0,.35)" />
        {/* facemask */}
        <g fill="none" stroke={team.secondaryColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M106 56l10 3v24c0 4-3 6-7 6l-33-3" />
          <path d="M82 72h34" />
          <path d="M100 58v30" />
        </g>
        <g fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M106 54l12 3.5V83c0 5-4 8-9 8" />
        </g>
      </g>
      {/* logo (never mirrored) */}
      {logo.bad ? (
        <g>
          <circle cx={cx} cy={cy} r={logoSize / 2 - 3} fill={team.primaryColor} stroke={fallbackTextColor(team)} strokeWidth="1.5" />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight="700" fontFamily="Inter, system-ui, sans-serif" fill={fallbackTextColor(team)}>
            {team.abbr}
          </text>
        </g>
      ) : (
        <image href={logo.url} x={logoX} y={logoY} width={logoSize} height={logoSize} preserveAspectRatio="xMidYMid meet" onError={logo.onError} />
      )}
    </svg>
  );
}
