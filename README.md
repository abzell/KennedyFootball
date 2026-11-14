# Kennedy 5th Grade Football League

An NFL-themed classroom competition for Kennedy Elementary's 5th grade. Teachers tap to award points to student teams during the school week; a public site shows matchups, standings, power rankings and the playoff bracket, with a "Reveal winners" animation every Friday.

- **Public site** (no sign-in): `/` scoreboard, `/standings`, `/power`, `/playoffs`, `/schedule`, `/tv` (projector mode)
- **Teacher app** (one shared PIN): `/teacher` — installable on phones, Chromebooks and laptops
- **No student data** is stored. Teams are the smallest unit.
- **Runs free** on Cloudflare Pages + D1 and never goes to sleep. There are no scheduled jobs: lock (Fri 12:00 PM Central), reveal and publish (Mon 12:00 AM Central) are worked out from the clock on every request.

The full specification is in [`docs/`](docs/).

---

## Put it online (step by step, no coding needed)

You need a free Cloudflare account and this repository on GitHub. Allow about 15 minutes. Cloudflare occasionally renames buttons; the names below may differ slightly.

### 1. Create the database

1. Sign in at <https://dash.cloudflare.com>.
2. In the left menu open **Storage & Databases → D1 SQL Database** and click **Create Database**.
3. Name it `kfl` and click **Create**.
4. Open the new database and go to its **Console** tab.
5. Open the file [`migrations/0001_init.sql`](migrations/0001_init.sql) in this repository, copy **everything**, paste it into the console and click **Execute**. This creates the empty tables.

### 2. Create the website

1. In the left menu open **Workers & Pages** and click **Create**.
2. Choose **Pages**, then **Connect to Git** (sometimes labelled "Import an existing Git repository").
3. Authorize GitHub if asked and pick this repository.
4. Fill in the build settings:
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. Click **Save and Deploy** and wait for the build to finish.

### 3. Connect the database to the website

1. Open the new Pages project and go to **Settings → Bindings**.
2. Click **Add → D1 database**.
3. **Variable name:** `DB` (exactly, in capitals). **D1 database:** `kfl`. Save.
4. Go to **Deployments**, open the **⋯** menu on the latest deployment and choose **Retry deployment**. The binding only takes effect on a new deployment.

### 4. Put it on your subdomain

1. In the Pages project open **Custom domains → Set up a custom domain**.
2. Type the subdomain you want, for example `football.yourschoolsite.org`, and continue.
3. - If your domain's DNS is already managed by Cloudflare, confirm and Cloudflare adds the DNS record for you.
   - If your DNS is hosted elsewhere, Cloudflare shows a **CNAME** record (your subdomain → `your-project.pages.dev`). Add that record at your DNS provider.
4. Wait until the domain shows **Active** (usually a few minutes).

### 5. Set the PIN — do this right away

Open `https://your-subdomain/teacher`. The first visitor sees a one-time **Set PIN** screen, so do this immediately after deploying, before sharing the address. Then open **Setup** and follow the four steps (Season, Divisions, Teams, Schedule).

### Updating later

Every push to the repository's main branch redeploys the site automatically. Your data is in D1 and is not touched by a redeploy.

### Each new school year

Teacher app → **Settings → Start new season**, type `RESET`, then run through **Setup** again. The PIN is kept.

### Troubleshooting

| Problem | Fix |
| --- | --- |
| "The database is not connected" | Step 3 was missed, or the site was not redeployed after adding the binding. The variable name must be `DB`. |
| "The database has not been set up yet" | Step 1.5 was missed. Paste `migrations/0001_init.sql` into the D1 console. |
| Forgot the PIN | In the D1 console run `UPDATE settings SET pin_hash = NULL, pin_version = pin_version + 1 WHERE id = 1;` then open `/teacher` and set a new PIN. Everyone is signed out. |
| "Too many wrong PINs" | Five wrong PINs from one network block that network for 15 minutes. A school usually shares one network address, so this can affect all teachers at once. To clear it now, run `DELETE FROM login_attempt;` in the D1 console. |
| Team logos show coloured circles | Logos load from ESPN's image server. If the school network blocks it, the app shows a circle with the team abbreviation instead. |

---

## For developers

Requires Node 22+.

```bash
npm install
npm run dev
```

`npm run dev` applies the database migrations to a local D1 database, then starts the API (Wrangler, port 8788) and the web app (Vite, <http://localhost:5173>).

| Command | What it does |
| --- | --- |
| `npm run dev` | One-command local development |
| `npm run seed:demo` | Fills the **local** database with 3 divisions × 4 teams, a 5-week season that started three Mondays ago and random awards for past weeks. Teacher PIN `1234`. Pass `-- --start=YYYY-MM-DD` (a Monday) to choose the first week. |
| `npm test` | Unit tests: time windows, calendar, round-robin, results, standings, tiebreakers, playoff seeding, power rankings, and "no unrevealed scores in public data" |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Build, then serve the production build with the API on <http://localhost:8788> (needed to test the installable app / service worker) |
| `npm run db:migrate` | Apply `migrations/` to the local D1 database |

### Testing the clock

Create a `.dev.vars` file (see `.dev.vars.example`) to freeze the server clock, then restart `npm run dev`:

```
NOW_OVERRIDE=2026-12-04T11:59:59-06:00
```

`NOW_OVERRIDE` is honoured only when the site is served from `localhost`; it is ignored in production even if the variable is set.

### Migrations

Schema changes go in a new numbered file in `migrations/`.

- Local: `npm run db:migrate`
- Production without the command line: paste the new file into the D1 console (as in step 1.5).
- Production with the command line: put the real `database_id` (D1 → your database → overview) in `wrangler.toml`, run `npx wrangler login`, then `npx wrangler d1 migrations apply DB --remote`.

`wrangler.toml` is only used locally and for that optional command; the dashboard deploy above ignores it.

### How it is put together

```
shared/      Pure logic used by both server and browser
  time.ts        America/Chicago clock math (DST-aware), stored as UTC
  calendar.ts    Season calendar + the "is scoring open?" decision
  schedule.ts    Round-robin (circle method) and matchup validation
  league.ts      Results, records, tiebreakers, playoff seeding, power rankings
  nflTeams.ts    The 32 franchises (names, colours, ESPN logo codes)
server/      API (Cloudflare Pages Functions)
  app.ts         Routes; every write checks the teacher session
  store.ts       D1 access; lazy week finalisation and playoff creation (no cron)
  views.ts       What each audience may see: public = published weeks only
  auth.ts        PIN hash + signed 365-day session cookie
functions/   Pages Functions entry point (/api/*)
migrations/  D1 schema
src/         React app (public pages, reveal animation, /tv, teacher PWA)
scripts/     Demo seeder
tests/       Vitest suites
```

Design notes:

- **Source of truth.** The only raw facts are `award` rows (one per +1 tap, a single `INSERT`) and `matchup` rows. When a week locks, the first request afterwards copies its totals into `week_score` and marks the week `finalized`; award inserts and deletes are refused for a finalized week inside the same SQL statement, so a late tap can never slip in. Standings, seeding and power rankings are always computed from these.
- **Secrecy.** Public endpoints are built only from weeks whose publish time has passed. The just-locked week is served solely by `GET /api/reveal`, which returns 404 outside Friday 12:00 PM → Monday 12:00 AM.
- **PIN storage.** The spec asks for bcrypt or argon2. Both exceed the CPU allowance of Cloudflare's free tier, so the PIN is stored as a salted PBKDF2-SHA256 hash via Web Crypto instead. Only the hash is stored; the PIN is never logged.
- **Tiebreak detail.** Head-to-head is evaluated once among the teams still tied on win % and points; teams that never played each other count as .500, so the stored coin flip separates them.
