// Direct static <img> usage (zero runtime dependencies or CDN calls)
<img
  src={`/helmets/png/${team.abbr.toUpperCase()}.png`}
  alt={`${team.name} helmet`}
  width={64}
  height={64}
  style={{ objectFit: 'contain' }}
/>