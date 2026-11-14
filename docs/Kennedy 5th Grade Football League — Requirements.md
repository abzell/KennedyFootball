# Kennedy 5th Grade Football League — Requirements

Nov 14, 2026 · @Adam

## 1. Overview

Build a web app that runs an NFL-themed classroom competition for Kennedy Elementary's 5th grade. Teachers award points to student teams during the school week. A public site shows matchups, standings, power rankings and the playoff bracket. The season runs roughly from after Thanksgiving through the end of January (about 7.5 weeks). An admin sets the dates each year.

Each classroom is a **division**. Teams play one head-to-head matchup per week inside their division. The team with more points that week wins. After the regular season, each division winner plus enough wildcards to make 4 teams enter a two-round playoff: semifinals, then the Super Bowl.

This document is the complete spec. Where it states a default or a rule, implement it as written. Do not ask the product owner for more input.

### Glossary

| Term | Meaning |
| --- | --- |
| League | One season of the competition. Only one league exists at a time. |
| Division | One classroom, e.g. "Mrs. Smith's Class". Holds an even number of teams. |
| Team | A group of \~5–6 students, assigned one NFL franchise. The app stores no student information. |
| Category | One of 4 scoring categories: Work Completion, Participation, Voice Level, Positivity. |
| Point award | One +1 tap by a teacher for a team in a category, with a timestamp. |
| Game week | Monday 00:00 to Friday 12:00 PM Central. The only window in which points can be awarded. |
| Matchup | Two teams paired for one game week. |
| Lock | Friday 12:00 PM Central. Scoring closes and results are calculated. |
| Reveal window | Friday 12:00 PM to Monday 00:00 Central. The public site still shows the previous results, but a "Reveal winners" button plays the new results as an animation. |
| Publish | Monday 00:00 Central. The public site switches to showing the newly finished week. |
| Skip week | A calendar week marked "no games" (e.g. winter break). |

## 2. Users, access and privacy

The app has two roles, and they are separated only by one shared PIN.

| Role | Who | How they get in | Can do |
| --- | --- | --- | --- |
| Public viewer | Students, parents, anyone with the URL | No sign-in | Read-only: matchups, standings, power rankings, bracket, reveal animation, projector mode |
| Teacher (also admin) | All 5th grade teachers | One shared PIN | Everything: award and undo points for any team in any division, set up the season, manage divisions, teams and schedule, change the PIN, reset the season |

### PIN rules

- One PIN for the whole app. It is not per-classroom. Any teacher can score any team.
- The PIN is 4–8 digits. On first deploy the app shows a one-time "Set PIN" screen. Before a PIN is set, the teacher area is unusable.
- Store only a salted hash (bcrypt or argon2). Never store or log the plain PIN.
- After a correct PIN, issue a long-lived session token in an HttpOnly, Secure, SameSite=Lax cookie that lasts 365 days. The installed app (section 10) relies on this so teachers never re-enter the PIN.
- Changing the PIN invalidates every existing session, e.g. by bumping a `pin_version` stored in the token.
- Rate limit: after 5 failed attempts from one IP, block that IP for 15 minutes.
- Every write endpoint checks the session server-side. Hiding buttons in the UI is not enough.

### Privacy

- **Store no student data of any kind**: no names, initials, photos, rosters or per-student points. Teams are the smallest unit.
- Do not add analytics, ads or third-party trackers.
- Public pages must not expose unrevealed scores, either in the HTML or in API responses. Hiding them in the browser is not enough (see section 9).

## 3. Tech stack and hosting

The app must run on free hosting tiers at $0/month. It also must not go to sleep or pause during a 2–3 week winter break.

**Required stack** (use these unless one is unavailable):

| Layer | Choice | Why |
| --- | --- | --- |
| Hosting | Cloudflare Pages + Pages Functions (Workers) | Free tier, global, no cold-start pausing |
| Database | Cloudflare D1 (SQLite) | Free tier, never pauses for inactivity |
| Frontend | React + TypeScript + Vite (or SvelteKit if preferred) | Any modern SPA framework is fine |
| Styling | Tailwind CSS | Fast to build a bold, sports-broadcast look |
| Animation | Framer Motion (or CSS animations) | For the reveal sequence |
| PWA | vite-plugin-pwa (Workbox) | Installable teacher app |

Do **not** use the Supabase free tier. It pauses projects after about a week with no activity, and a winter break would take the site down.

### Architecture rules

- **No scheduled jobs.** Lock, results and publish are derived from the current time compared with the season calendar (America/Chicago) every time data is read. Nothing depends on a cron firing. A late or missed cron must never leave the site in a wrong state.
- All time math uses the IANA zone `America/Chicago`, including DST. Store timestamps in UTC.
- Standings, records, seeding and power rankings are computed on the server from raw point awards and matchups. Results may be cached, but the raw awards are the source of truth.
- Provide a README with one-command local dev, the D1 migration steps, and step-by-step Cloudflare deploy instructions written for a non-developer.
- Include automated tests for the scoring, standings, tiebreaker, schedule generation, playoff seeding and time-window logic.

## 4. Season setup

A teacher sets up a season once a year in a guided Setup screen with four steps: Season, Divisions, Teams, Schedule. Only one season exists at a time.

### 4.1 Season and calendar

| Field | Type | Rules / default |
| --- | --- | --- |
| Season name | text | Default "Kennedy 5th Grade Football League 2026–27" (years from the start date) |
| First game week (Monday) | date | Must be a Monday. Default: the Monday after Thanksgiving. |
| Regular-season game weeks | integer | 1–12. Default 5. |
| Skip weeks | list of Monday dates | Weeks with no games (e.g. winter break). They do not count toward the regular-season total. |

The app builds the calendar from these fields. It takes consecutive Mondays from the first game week, drops skip weeks, and stops once it has the requested number of regular-season weeks. The next two non-skipped weeks become Playoff Semifinals and the Super Bowl. Show a live preview table: week label, Monday date, lock time (Friday 12:00 PM), publish time (next Monday 12:00 AM), and type (Regular / Skip / Semifinal / Super Bowl).

Example: start Nov 30 2026, 5 regular weeks, skip Dec 21 and Dec 28 gives Weeks 1–3 = Nov 30, Dec 7, Dec 14; Weeks 4–5 = Jan 4, 11; Semifinals = Jan 18; Super Bowl = Jan 25.

### 4.2 Divisions (classrooms)

- 1 to 4 divisions. The playoff field is always 4 teams (section 7), so more than 4 division winners cannot fit.
- Fields: division name (e.g. "Room 12"), teacher display name (e.g. "Mrs. Johnson"), display order.

### 4.3 Teams

- Each team belongs to exactly one division and is assigned one NFL franchise from the 32 (section 11). A franchise can be used only once in the league.
- The team's display name is the franchise name, e.g. "Kansas City Chiefs". There is no student roster.
- **Validation, which blocks the season from starting:** every division needs an even number of teams, at least 2. The league needs at least 4 teams in total. If a division has an odd count, show an inline error naming that division.

### 4.4 Schedule

The app generates the regular-season schedule automatically (section 6.1). Teachers can edit any matchup in a week that has not started yet. Each week offers "Regenerate remaining weeks".

### 4.5 Editing after the season starts

| Change | Allowed when |
| --- | --- |
| Add, remove or move divisions or teams | Only before Week 1 starts. Locked after that. |
| Swap a team's NFL franchise | Any time. It only changes display. |
| Rename a division or teacher | Any time |
| Add or remove skip weeks, change the regular-week count | Only for weeks that have not started. The calendar and schedule recompute from there. |
| Edit matchups | Only for weeks that have not started |

### 4.6 New season (reset)

The "Start new season" button deletes all divisions, teams, matchups and point awards. It keeps the PIN. Before deleting, require the teacher to type `RESET` in a confirmation dialog. Past seasons are **not** archived.

## 5. Scoring and the weekly clock

A team's weekly score is the number of +1 taps it received during that game week, summed across all four categories. All categories are weighted equally.

### 5.1 Categories

There are four fixed categories, in this order. Each has a short student-facing description shown on the public site.

| Category | Public description |
| --- | --- |
| Work Completion | Use class time wisely and complete assigned work. |
| Participation | Participate in lessons and discussions. |
| Voice Level | Follow classroom voice-level expectations. |
| Positivity | Be a positive teammate. Show sportsmanship and respect. |

### 5.2 Awarding points

- A teacher picks a team, then taps a category button. Each tap records one award row: team, category, +1, server timestamp, and game week.
- There is no limit on taps per team, category or week. Points cannot be negative, and there is no deduction button.
- **Undo:** after each tap, show a toast "+1 Participation → Chiefs · Undo" for 8 seconds. Undo deletes that award.
- **Weekly log:** the teacher view lists every award in the current week, newest first, each with a delete button. This is for correcting mistakes.
- The teacher view shows each team's running total for the current week, overall and per category. Only teachers see these numbers.
- When several teachers tap at the same time, every tap must count. Use one insert per tap, not read-modify-write.

### 5.3 When scoring is open

The server decides with its own clock in America/Chicago. The UI just mirrors that decision.

| Time (Central) | Scoring | Teacher UI shows |
| --- | --- | --- |
| Before Week 1's Monday 00:00 | Closed | "Season starts Mon, Nov 30" |
| Game week: Mon 00:00 → Fri 11:59:59 AM | **Open** for teams with a matchup that week | Score buttons; countdown "Locks Fri 12:00 PM" |
| Fri 12:00 PM → Mon 00:00 | Closed. Awards cannot be added or deleted. | "Week locked. Scoring reopens Monday." |
| Skip week (whole week) | Closed | "No games this week (Winter Break)" |
| After the Super Bowl locks | Closed | "Season complete" |

- During playoff weeks, only teams that are still alive and have a playoff game can receive points. Every other team's buttons are hidden.
- Once a week locks, its results are final. There is no post-lock correction. The server must reject any award or delete whose server time is at or after the lock, with HTTP 409.
- No offline queue. If the device is offline, show a banner and disable the buttons.

## 6. Matchups, standings and tiebreakers

Each regular-season week, every team plays exactly one other team in its own division. The higher weekly score wins.

### 6.1 Schedule generation

- Use the round-robin circle method for each division separately. Sort teams by creation order, then rotate.
- A division with *n* teams produces *n − 1* distinct rounds. If there are more regular-season weeks than rounds, repeat the cycle from round 1. With 2 teams, they play each other every week.
- Skip weeks get no matchups. The rounds continue in the next game week.
- A manual edit of a future week must still pair every team in the division exactly once. Reject an edit that leaves a team unpaired or pairs it twice.

### 6.2 Game result

- Higher weekly score wins. Equal scores, including 0–0, are a **tie**.
- A regular-season result counts in the standings only once its week is **published** (Monday 00:00). Before that it is hidden from public data. Teachers can see the computed result from the Friday lock onward.

### 6.3 Standings columns

| Column | Definition |
| --- | --- |
| W-L-T | Wins, losses, ties in published regular-season games |
| Win % | (W + 0.5 × T) ÷ games played, shown to 3 decimals (.667). Show .000 when no games have been played. |
| PF | Points for: total regular-season points |
| PA | Points against |
| Streak | e.g. W2, L1, T1 |
| Last week | Last published score, e.g. "W 34–28 vs Bears" |

Playoff games never change regular-season standings.

### 6.4 Ranking within a division (tiebreakers, applied in order)

1. Win % (higher first)
2. PF (higher first)
3. Head-to-head win % among the tied teams only
4. Coin flip. A seeded random value is generated once per team at season creation and stored, so the order never changes on reload.

### 6.5 League-wide table

The league table ranks all teams across divisions with the same tiebreakers. It is used for the "League" view and for picking wildcards.

## 7. Playoffs

Four teams make the playoffs. They play single-elimination semifinals (1 vs 4, 2 vs 3), and the winners meet in the Super Bowl the following week.

### 7.1 Who qualifies

- Each division's #1 team (section 6.4) is a **division winner**. With D divisions there are D division winners.
- The remaining 4 − D spots are **wildcards**. These go to the best teams that are not division winners, ranked by PF, then win %, then coin flip. With 3 divisions there is 1 wildcard. With 4 divisions there are none.
- Qualification is computed from published regular-season results only.

### 7.2 Seeding

- Seeds 1 to D: division winners, ranked against each other by the section 6.4 tiebreakers.
- Seeds D+1 to 4: wildcards, in the order they qualified.
- Two teams from the same division may meet in the playoffs. That is allowed.

### 7.3 Playoff games

| Week | Games | Decided by |
| --- | --- | --- |
| Semifinals | #1 vs #4, #2 vs #3 | Raw weekly points. Each team's own teacher scores it as usual. |
| Super Bowl | Semifinal winners | Raw weekly points |

- Use the same clock as a regular week: open Monday, lock Friday noon, reveal window, publish Monday.
- **A tied playoff game goes to the higher seed.** Show this as "Advances on seed" in the result.
- A team that loses is eliminated. From then on, its teacher's score buttons are hidden for that team.
- When the Super Bowl publishes, the winner is the **Champion**. The site shows a champion banner (section 9) until the season is reset.

### 7.4 Playoff picture (during the regular season)

- After each published week, show "If the season ended today": the 4 projected seeds, labeled Division Winner or Wildcard, plus the next 2 teams under "In the hunt".
- Do not compute clinch or elimination markers. PF tiebreakers make them unreliable, and the league is small.
- Once the final regular-season week publishes, the projection becomes the official bracket.

## 8. Power rankings

Power rankings are one league-wide list, recomputed when each regular-season week publishes. They weight recent weeks more heavily than the standings do.

```latex
\text{Power} = 0.5 \cdot \text{WinPct} + 0.3 \cdot \text{Recent} + 0.2 \cdot \text{Season}
```

| Term | Definition (published regular-season weeks only) |
| --- | --- |
| WinPct | Win % from section 6.3, from 0 to 1 |
| Recent | The team's average score over its last 2 published weeks (or 1, if only 1 exists), divided by the highest such average in the league |
| Season | The team's PF per game, divided by the highest PF per game in the league |

- If a divisor is 0 (nobody has scored yet), that term is 0 for everyone.
- Ties in Power score fall back to the league-table order (section 6.5).
- **Movement:** compare with the previous published ranking and show ▲n (green), ▼n (red), or — for no change or the first week.
- Each row shows rank, movement, helmet/logo, team name, division, W-L-T, and PF.
- Before Week 1 publishes, show "Power rankings begin after Week 1."
- After the final regular-season week publishes, power rankings freeze. Playoff weeks do not change them.

## 9. Public site

The public site is read-only and needs no sign-in. Outside the reveal animation, it always shows data as of the last **publish** (Monday 00:00).

### 9.1 Pages

| Route | Content |
| --- | --- |
| `/` Scoreboard | Status banner (e.g. "Week 3 in progress · Locks Fri 12:00 PM"). The last published week's results by division: helmets, scores, W/L/T badge, and a per-category breakdown on tap. This week's pairings without scores. The Reveal button when in the reveal window. The Champion banner after the Super Bowl publishes. |
| `/standings` | One tab per division plus a "League" tab. Columns from section 6.3. Playoff-position badges: DIV, WC. |
| `/power` | Power rankings (section 8) |
| `/playoffs` | Before the bracket is set: the playoff picture (section 7.4). After: a bracket graphic with seeds, scores and the winner path, ending at the Super Bowl and Champion. |
| `/schedule` | Every calendar week: date range, type (Regular / Skip / Semifinal / Super Bowl), pairings, and published results |
| `/tv` | Projector mode (9.3) |
| `/teacher` | Teacher app (section 10). Linked only by a small "Teachers" link in the footer. |

The site is responsive at 360 px (phone), 1366 px (Chromebook), and 1920×1080 (projector). Each page re-fetches data every 60 seconds and when the tab regains focus. That way the Reveal button appears at Friday noon and the data flips at Monday 00:00 without a manual reload.

### 9.2 Weekly reveal flow

1. **Mon 00:00 → Fri 12:00 PM:** current-week scores are secret. Public API responses must not include them.
2. **Fri 12:00 PM (lock):** the server computes the week's results. A "Reveal Week N Winners" button appears on `/` and `/tv` for **anyone**. Every other part of the site keeps showing the previous published data.
3. **Pressing Reveal** plays the animation in that browser only. It changes nothing on the server and nothing for other viewers. It can be replayed as often as wanted.
4. **Mon 00:00 (publish):** the button disappears. Every page now shows the new results, standings, power rankings and playoff picture, with no animation.

The animation runs as a full-screen overlay, one matchup at a time, grouped by division (about 6–8 seconds per matchup):

- The two helmets slide in from opposite sides with the team names.
- Both scores count up from 0 at the same time. The four category bars fill alongside.
- The winner's side flashes in its team colors with a "WIN" stamp. A tie shows "TIE" on both sides. A playoff tie shows "ADVANCES ON SEED".
- After the last matchup, show the updated division standings sorting into their new order. For the final regular-season week, show the playoff bracket filling in. For the Super Bowl, show a champion screen with confetti.
- Controls: Next (or Space/→) skips ahead, Skip to end, Close (Esc). Sound is off.

While the reveal window is open, the reveal data comes from its own endpoint (`GET /api/reveal`). It returns HTTP 404 outside the window.

### 9.3 Projector mode (`/tv`)

- Full-screen 16:9 layout for a 1920×1080 projector, with large type (team names at least 36 px).
- It auto-rotates through slides every 15 seconds: Last Week's Results → Standings (one slide per division) → Power Rankings → Playoff Picture or Bracket.
- Keys: ←/→ change slide, P pauses, F toggles fullscreen.
- During the reveal window, the first slide is a big "Reveal Week N Winners" button that starts the same animation.

## 10. Teacher app and install

The teacher app lives at `/teacher` in the same codebase. It is shipped as an installable PWA, so teachers launch it from a home-screen or desktop icon and go straight to scoring with no sign-in.

### 10.1 Screens

| Screen | Content |
| --- | --- |
| PIN | Numeric keypad, 4–8 digits. Shown only when there is no valid session. Also shows the Install button. |
| Score (default) | Division picker at top; the device remembers the last division in localStorage. A grid of team cards for that division. Each card shows the helmet, team name, this week's opponent and both teams' running totals, plus **four large category buttons** (at least 64 px tall). Each button shows its count this week. One tap adds +1. Android vibrates for 30 ms. Undo toast (section 5.2). |
| Log | This week's awards, newest first, with delete. Filter by division. |
| Setup | The four-step wizard from section 4 |
| Settings | Change PIN (requires the current PIN), Sign out this device, Start new season (section 4.6), Install app |

Teachers see current-week scores live; the public does not. Use a bottom tab bar: Score · Log · Setup · Settings.

### 10.2 Install ("Download as app")

There is no app-store build. The "Install app" button appears only on teacher screens and works like this on each platform:

| Platform / browser | Behavior when the button is pressed |
| --- | --- |
| Windows or ChromeOS, Chrome/Edge | Trigger the native install prompt (`beforeinstallprompt`) |
| Android, Chrome | Trigger the native install prompt |
| iPhone / iPad, Safari | Open a modal with illustrated steps: Share → Add to Home Screen. Explain that the PIN must be entered once inside the installed app, because iOS keeps a separate sign-in for home-screen apps. |
| Mac, Safari | Modal with steps: File → Add to Dock |
| Mac, Chrome | Native install prompt |
| Other (Firefox, etc.) | Modal: "Open this page in Chrome or Edge to install." |
| Already installed (`display-mode: standalone`) | Hide the button |

### 10.3 PWA manifest

- name "Kennedy Football League – Teacher", short\_name "KFL Coach", start\_url `/teacher`, scope `/`, display `standalone`.
- Icons at 192, 512 and a maskable 512 px: an original football graphic, not an NFL logo.
- The service worker caches the app shell for fast launch. Score API calls always go to the network (section 5.3: no offline queue).
- Because the session cookie lasts 365 days (section 2), opening the installed app goes straight to the Score screen.

## 11. Branding and NFL team data

Teams use real NFL franchise names, colors and logos. The logos load from ESPN's public image CDN; the app does not store them. The product owner has accepted the trademark risk of using real logos.

### 11.1 Team data file

Ship a static file `nflTeams.ts` with all 32 franchises. Each entry has: `id`, `city`, `name`, `abbr` (e.g. KC), `espnAbbr` (lowercase ESPN code, e.g. `kc`, `wsh`, `lar`), `conference`, `primaryColor`, `secondaryColor` (hex). The coding agent fills in the current official values and checks each logo URL loads.

- Logo URL: `https://a.espncdn.com/i/teamlogos/nfl/500/{espnAbbr}.png`
- If the image fails to load, show a circle in `primaryColor` with `abbr` in `secondaryColor` or white, whichever has better contrast.

### 11.2 Helmet graphic

The source doc asks for helmets. Draw an **original** SVG helmet silhouette (shell + facemask) as a React component `<Helmet team size facing>`:

- Shell fill = `primaryColor`, facemask and stripe = `secondaryColor`.
- The ESPN logo is overlaid on the side of the shell at about 40% of its height.
- `facing` is left or right, so the two helmets in a matchup face each other.
- Use it everywhere a team appears: scoreboard, standings rows (small, 32 px), the reveal (large), and the bracket.

### 11.3 Site look

- Sports-broadcast style: dark navy background (#0B1A33) with white text and a gold accent (#F2B705) for winners and the champion. Team colors appear on cards.
- Headings use Oswald or Bebas Neue, self-hosted (no Google Fonts CDN call). Body text uses Inter or the system UI font.
- League mark: an original text wordmark "KFL · Kennedy Football League". Do not use the NFL shield.
- Meet WCAG AA contrast for all text. Do not rely on team colors alone for meaning; always show W/L/T as text too.

## 12. Data model and API

The tables below are a starting schema for D1. The only raw facts are point awards and matchups. Everything else is computed.

| Table | Columns | Notes |
| --- | --- | --- |
| `settings` | `id`=1, `pin_hash`, `pin_version`, `updated_at` | Single row |
| `season` | `id`, `name`, `first_monday` (date), `regular_weeks`, `created_at` | At most one row |
| `skip_week` | `monday_date` (PK), `label` (e.g. "Winter Break") |  |
| `division` | `id`, `name`, `teacher_name`, `sort_order` | 1–4 rows |
| `team` | `id`, `division_id`, `nfl_team_id` (unique), `created_order`, `tiebreak_seed` (random float) |  |
| `week` | `id`, `seq`, `type` (regular / skip / semifinal / superbowl), `monday_date`, `lock_at` (UTC), `publish_at` (UTC), `label` | Regenerated from season + skip weeks for weeks not yet started |
| `matchup` | `id`, `week_id`, `team_a_id`, `team_b_id`, `bracket_slot` (null / semi1 / semi2 / final), `seed_a`, `seed_b` | Playoff rows are created when the final regular week locks (semis) and when the semis lock (final) |
| `award` | `id`, `team_id`, `week_id`, `category` (work / participation / voice / positivity), `created_at` (UTC) | Index (`week_id`, `team_id`) |
| `login_attempt` | `ip`, `fail_count`, `window_start` | For rate limiting |

Playoff matchups are created lazily on the first read after the relevant lock. This is idempotent: if rows exist, do not create them again. That keeps the "no cron" rule.

### 12.1 Endpoints

| Method + path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/public/state` | none | Season phase, current week, lock/publish times, whether the reveal is available, champion |
| `GET /api/public/scoreboard` | none | Last published week's results; current week's pairings without scores |
| `GET /api/public/standings` | none | Division and league tables (published data only) |
| `GET /api/public/power` | none | Power rankings with movement |
| `GET /api/public/playoffs` | none | Playoff picture or bracket |
| `GET /api/public/schedule` | none | All weeks, pairings, published results |
| `GET /api/reveal` | none | Just-locked week's results and post-week standings. 404 outside the reveal window. |
| `POST /api/auth/pin` | none | Check the PIN and set the session cookie. Rate-limited. |
| `POST /api/auth/logout` | teacher | Clear this device's cookie |
| `POST /api/auth/change-pin` | teacher | Requires the current PIN; bumps `pin_version` |
| `GET /api/teacher/week` | teacher | Current week, matchups and live totals per team and category |
| `POST /api/awards` | teacher | `{teamId, category}` adds +1. 409 when scoring is closed or the team has no game. |
| `DELETE /api/awards/:id` | teacher | 409 after lock |
| `GET /api/teacher/awards?weekId=` | teacher | Weekly log |
| CRUD `/api/setup/*` | teacher | Season, skip weeks, divisions, teams, matchups, with the rules from section 4.5 |
| `POST /api/season/reset` | teacher | Body `{confirm:"RESET"}` |

## 13. Non-functional requirements, acceptance and scope

### 13.1 Non-functional

- **Performance:** a public page loads in under 2 s on a school Chromebook. A score tap gets feedback within 150 ms (optimistic UI) and confirms within 1 s.
- **Browsers:** current Chrome, Edge, Safari (macOS/iOS) and Firefox. Chromebooks are the main classroom device.
- **Testing the clock:** in development only, support a `NOW_OVERRIDE` environment variable (ISO timestamp) so every phase can be tested. It must be ignored in production.
- **Demo data:** a `npm run seed:demo` script that creates 3 divisions × 4 teams, a 5-week season, and random awards for past weeks.
- **Accessibility:** keyboard reachable, visible focus, alt text on logos ("Chiefs logo"), honors `prefers-reduced-motion`. With reduced motion, the reveal shows results without count-ups.

### 13.2 Acceptance criteria

- [ ] Setup blocks the season from starting while any division has an odd team count, or the league has fewer than 4 teams.
- [ ] The calendar preview matches the section 4.1 example (Nov 30 start, 5 weeks, 2 skip weeks → Super Bowl Jan 25).
- [ ] Round-robin gives every team exactly one game per regular week, and no repeat opponent until the cycle completes.
- [ ] A tap at Fri 11:59:59 AM CT is accepted; a tap at Fri 12:00:00 PM CT gets a 409. The same holds for deletes.
- [ ] Between Mon 00:00 and Fri 12:00, no public endpoint or page HTML contains current-week scores.
- [ ] From Fri 12:00 to Mon 00:00, the Reveal button is visible to an anonymous visitor and plays the full animation, while standings still show the previous week.
- [ ] At Mon 00:00, without a manual reload, the public pages show the new results and the Reveal button is gone.
- [ ] Equal weekly scores record a tie, and win % counts it as 0.5.
- [ ] Tiebreakers apply in this order: win %, PF, head-to-head, stored coin flip. The order is stable across reloads.
- [ ] With 3 divisions: 3 division winners + 1 wildcard (highest PF among the rest). Semis are 1v4 and 2v3. A tied playoff game advances the higher seed.
- [ ] Eliminated teams cannot receive points in later playoff weeks.
- [ ] Power rankings match the section 8 formula on the demo data, show movement arrows, and freeze after the regular season.
- [ ] Changing the PIN signs out every other device.
- [ ] "Install app" triggers the native prompt on Chrome/Edge (Windows, Android) and shows the instruction modal on iOS Safari. The installed app opens directly to Score.
- [ ] Skip weeks show "No games this week" and disable scoring.
- [ ] The reset requires typing RESET and leaves no divisions, teams, matchups or awards behind.
- [ ] A search of the database schema and UI finds no field for student names.

### 13.3 Out of scope

- Student accounts, names or individual points
- Archiving past seasons
- Per-classroom PINs or per-teacher accounts
- Point deductions or weighted categories
- Native app-store builds (iOS App Store, Google Play, Microsoft Store)
- Push notifications, email or SMS
- Clinch/elimination math
- Offline scoring
