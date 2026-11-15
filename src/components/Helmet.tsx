import { useState } from 'react';
import { fallbackTextColor, nflTeam } from '../../shared/nflTeams';

// Remembers images that failed so every helmet for that team falls back immediately.
const failed = new Set<string>();

/** Fallback when a helmet image is missing: a circle in the primary colour with the abbreviation. */
function TeamBadge({ nfl, size }: { nfl: string; size: number }) {
  const team = nflTeam(nfl);
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

/**
 * Team helmet image (public/helmets/<id>.png). Every helmet is shown as drawn, facing right:
 * mirroring would turn the lettering on several logos backwards.
 */
export function Helmet({ nfl, size = 64 }: { nfl: string; size?: number }) {
  const team = nflTeam(nfl);
  const src = `/helmets/${team.id}.png`;
  const [bad, setBad] = useState(() => failed.has(src));
  // The artwork has a little padding, so draw it slightly larger than the nominal size.
  const box = Math.round(size * 1.15);
  if (bad || failed.has(src) || team.id === 'unknown') return <TeamBadge nfl={nfl} size={size} />;
  return (
    <img
      src={src}
      alt={`${team.name} helmet`}
      width={box}
      height={box}
      decoding="async"
      className="shrink-0 object-contain"
      style={{
        width: box,
        height: box,
        // A faint light edge keeps dark helmets readable on the navy background.
        filter: 'drop-shadow(0 0 1px rgba(255,255,255,.6)) drop-shadow(0 2px 3px rgba(0,0,0,.45))',
      }}
      onError={() => {
        failed.add(src);
        setBad(true);
      }}
    />
  );
}
