import React from 'react';
import nflHelmets from './nflHelmets.json';

export function NflHelmet({ team, size = 64, format = 'png', className = '' }) {
  const normalized = String(team || '').toUpperCase();
  const entry = nflHelmets.find(
    (t) => t.abbr === normalized || t.espnAbbr.toUpperCase() === normalized
  );
  if (!entry) return null;

  const src = format === 'svg' ? entry.svgPath : entry.pngPath;
  return (
    <img
      src={src}
      alt={`${entry.name} helmet`}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={className}
      style={{ objectFit: 'contain' }}
    />
  );
}

export default NflHelmet;
