import { useState } from 'react';
import { fallbackTextColor, nflTeam } from '../../shared/nflTeams';

/**
 * Helmets whose artwork contains lettering. Mirroring the image would show the letters backwards,
 * so these are never flipped. To make one of them face left properly, add a left-facing image at
 * public/helmets/left/<id>.png and list its id in LEFT_FACING_ART.
 */
const LETTERED = new Set(['chi', 'gb', 'kc', 'lv', 'nyg', 'nyj', 'pit', 'sf']);
const LEFT_FACING_ART = new Set<string>([]);

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
 * Team helmet image (public/helmets/<id>.png, drawn facing right).
 * `facing="left"` mirrors the image so the two helmets in a matchup face each other, except for
 * helmets with lettering, which stay as drawn unless a left-facing image has been supplied.
 */
export function Helmet({ nfl, size = 64, facing = 'right' }: { nfl: string; size?: number; facing?: 'left' | 'right' }) {
  const team = nflTeam(nfl);
  const left = facing === 'left';
  const ownLeftArt = left && LEFT_FACING_ART.has(team.id);
  const src = ownLeftArt ? `/helmets/left/${team.id}.png` : `/helmets/${team.id}.png`;
  const [bad, setBad] = useState(() => failed.has(src));
  // The artwork has a little padding, so draw it slightly larger than the nominal size.
  const box = Math.round(size * 1.15);
  if (bad || failed.has(src) || team.id === 'unknown') return <TeamBadge nfl={nfl} size={size} />;
  const mirror = left && !ownLeftArt && !LETTERED.has(team.id);
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
        transform: mirror ? 'scaleX(-1)' : undefined,
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
