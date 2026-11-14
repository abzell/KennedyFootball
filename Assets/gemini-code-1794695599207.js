import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve('public/helmets/nflHelmets.json');
const outDir = path.resolve('public/helmets/vector');
fs.mkdirSync(outDir, { recursive: true });

const teams = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

for (const t of teams) {
  const uid = `h-${t.abbr.toLowerCase()}`;
  const stripe = t.stripeColors?.[0]
    ? `<path d="M20 26C35 11 58 7 86 14C94 17 101 23 104 30C85 18 55 15 24 30Z" fill="${t.stripeColors[0]}"/>`
    : '';

  const label = t.abbr === 'CLE' ? '' : `
    <circle cx="48" cy="44" r="18" fill="#FFFFFF" fill-opacity="0.18"/>
    <text x="48" y="49" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="13" fill="#FFFFFF" stroke="#000000" stroke-width="0.6">${t.abbr}</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 102" width="256" height="218" fill="none">
  <defs>
    <radialGradient id="${uid}-g" cx="38%" cy="28%" r="65%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.55"/>
      <stop offset="35%" stop-color="#FFFFFF" stop-opacity="0.12"/>
      <stop offset="75%" stop-color="#000000" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.55"/>
    </radialGradient>
    <clipPath id="${uid}-c">
      <path d="M12 54C12 24 35 8 64 8C89 8 104 23 106 44L84 48C80 50 76 56 76 64L83 82C68 88 45 90 28 82C16 76 12 65 12 54Z"/>
    </clipPath>
  </defs>
  <ellipse cx="64" cy="72" rx="22" ry="14" fill="#1E1E1E"/>
  <g clip-path="url(#${uid}-c)">
    <path d="M12 54C12 24 35 8 64 8C89 8 104 23 106 44L84 48C80 50 76 56 76 64L83 82C68 88 45 90 28 82C16 76 12 65 12 54Z" fill="${t.shellColor}"/>
    ${stripe}
    ${label}
    <path d="M12 54C12 24 35 8 64 8C89 8 104 23 106 44L84 48C80 50 76 56 76 64L83 82C68 88 45 90 28 82C16 76 12 65 12 54Z" fill="url(#${uid}-g)"/>
  </g>
  <path d="M12 54C12 24 35 8 64 8C89 8 104 23 106 44L84 48C80 50 76 56 76 64L83 82C68 88 45 90 28 82C16 76 12 65 12 54Z" stroke="#1A1A1A" stroke-width="2" stroke-opacity="0.45"/>
  <circle cx="54" cy="66" r="5.5" fill="#181818" stroke="#555555" stroke-width="1.2"/>
  <path d="M56 76L84 84" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round"/>
  <g stroke="${t.facemaskColor}" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M84 46L112 48L114 82L80 84"/>
    <path d="M78 58L113 60"/>
    <path d="M78 68L113 70"/>
    <path d="M82 76L113 77"/>
    <path d="M98 47L100 83"/>
  </g>
</svg>`;

  fs.writeFileSync(path.join(outDir, `${t.abbr}.svg`), svg, 'utf8');
}
console.log(`Generated ${teams.length} static vector helmets in ${outDir}`);