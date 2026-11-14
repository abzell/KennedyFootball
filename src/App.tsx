import { lazy, Suspense } from 'react';
import { Link, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { InstallButton } from './components/Install';
import { TestBanner } from './components/TestBanner';
import { Wordmark } from './components/ui';
import { PlayoffsPage, PowerPage, SchedulePage, ScoreboardPage, StandingsPage } from './pages/Public';
import { TVPage } from './pages/TV';

const TeacherApp = lazy(() => import('./teacher/Teacher'));

const NAV = [
  { to: '/', label: 'Scoreboard' },
  { to: '/standings', label: 'Standings' },
  { to: '/power', label: 'Power' },
  { to: '/playoffs', label: 'Playoffs' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/tv', label: 'TV' },
];

function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <TestBanner />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-navy">
        Skip to content
      </a>
      <header className="border-b border-line bg-navy/90">
        <div className="mx-auto max-w-6xl px-3 pt-3">
          <Link to="/" aria-label="Kennedy Football League home">
            <Wordmark />
          </Link>
          <nav className="-mx-3 mt-2 flex gap-1 overflow-x-auto px-3" aria-label="Main">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  `display whitespace-nowrap border-b-4 px-3 py-2 text-base font-medium ${isActive ? 'border-gold text-gold' : 'border-transparent text-mute hover:text-white'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-3 py-5">
        <Outlet />
      </main>
      <footer className="border-t border-line px-3 py-4 text-center text-xs text-mute">
        Kennedy Elementary · 5th Grade Football League ·{' '}
        <a href="/teacher" className="underline">
          Teachers
        </a>
        <div className="mt-3">
          <InstallButton app="public" className="text-sm" />
        </div>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/tv" element={<TVPage />} />
      <Route
        path="/teacher/*"
        element={
          <Suspense fallback={<div className="p-6 text-mute">Loading…</div>}>
            <TeacherApp />
          </Suspense>
        }
      />
      <Route element={<PublicLayout />}>
        <Route path="/" element={<ScoreboardPage />} />
        <Route path="/standings" element={<StandingsPage />} />
        <Route path="/power" element={<PowerPage />} />
        <Route path="/playoffs" element={<PlayoffsPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="*" element={<ScoreboardPage />} />
      </Route>
    </Routes>
  );
}
