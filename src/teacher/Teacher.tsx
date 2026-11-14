import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { CATEGORIES, CATEGORY_INFO, ZERO_CATS, catTotal, type Category } from '../../shared/league';
import { readableOn } from '../../shared/nflTeams';
import { TZ, formatDate } from '../../shared/time';
import type { AuthStatus, AwardRow, TeacherWeekData } from '../../shared/types';
import { Helmet } from '../components/Helmet';
import { TestBanner, useTestStatus } from '../components/TestBanner';
import { Notice } from '../components/ui';
import { ApiError, api, useApi, useLookup, useOnline } from '../lib';
import { useInstall, type InstallHelp } from './install';

const Setup = lazy(() => import('./Setup'));
const TestPanel = lazy(() => import('./TestPanel'));

// ------------------------------------------------------------------ session context

const TeacherCtx = createContext<{ call: typeof api; refreshAuth: () => void }>({ call: api, refreshAuth: () => {} });
export const useTeacher = () => useContext(TeacherCtx);

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="card max-h-full w-full max-w-md overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="display text-2xl font-bold">{title}</h2>
          <button type="button" className="btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ install

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 15V3M8 7l4-4 4 4M5 11v9h14v-9" />
  </svg>
);
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);
const DockIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <rect x="2" y="4" width="20" height="14" rx="2" />
    <path d="M6 15h12" />
  </svg>
);

function HelpStep({ n, icon, children }: { n: number; icon?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-line bg-navy p-3">
      <span className="display flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold text-lg font-bold text-navy">{n}</span>
      <span className="flex-1">{children}</span>
      {icon && <span className="text-gold">{icon}</span>}
    </li>
  );
}

function InstallHelpModal({ help, onClose }: { help: InstallHelp; onClose: () => void }) {
  return (
    <Modal title="Install the app" onClose={onClose}>
      {help === 'ios' && (
        <>
          <ol className="space-y-2">
            <HelpStep n={1} icon={<ShareIcon />}>
              Tap the <b>Share</b> button in Safari.
            </HelpStep>
            <HelpStep n={2} icon={<PlusIcon />}>
              Scroll down and tap <b>Add to Home Screen</b>.
            </HelpStep>
            <HelpStep n={3}>
              Tap <b>Add</b>. Open “KFL Coach” from your home screen.
            </HelpStep>
          </ol>
          <p className="mt-3 text-sm text-mute">
            You will enter the PIN one more time inside the installed app. iPhones and iPads keep a separate sign-in for home-screen apps. After that it opens straight to scoring.
          </p>
        </>
      )}
      {help === 'mac-safari' && (
        <ol className="space-y-2">
          <HelpStep n={1}>
            In the Safari menu bar, click <b>File</b>.
          </HelpStep>
          <HelpStep n={2} icon={<DockIcon />}>
            Choose <b>Add to Dock…</b>
          </HelpStep>
          <HelpStep n={3}>
            Click <b>Add</b>. Open “KFL Coach” from the Dock.
          </HelpStep>
        </ol>
      )}
      {help === 'chromium-menu' && (
        <ol className="space-y-2">
          <HelpStep n={1}>
            Open the browser menu (<b>⋮</b> or <b>…</b>) at the top right.
          </HelpStep>
          <HelpStep n={2} icon={<PlusIcon />}>
            Choose <b>Install app</b> (it may be under “Cast, save and share” or “Apps”).
          </HelpStep>
          <HelpStep n={3}>If you do not see it, the app may already be installed on this device.</HelpStep>
        </ol>
      )}
      {help === 'other' && <p>Open this page in Chrome or Edge to install.</p>}
    </Modal>
  );
}

export function InstallButton({ className = '' }: { className?: string }) {
  const { installed, install } = useInstall();
  const [help, setHelp] = useState<InstallHelp | null>(null);
  if (installed) return null;
  return (
    <>
      <button type="button" className={`btn ${className}`} onClick={async () => setHelp(await install())}>
        ⬇ Install app
      </button>
      {help && <InstallHelpModal help={help} onClose={() => setHelp(null)} />}
    </>
  );
}

// ------------------------------------------------------------------ PIN

function PinPad({ title, hint, initialError = null, onSubmit }: { title: string; hint?: string; initialError?: string | null; onSubmit: (pin: string) => Promise<string | null> }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);
  const submit = useCallback(async () => {
    if (pin.length < 4 || busy) return;
    setBusy(true);
    const err = await onSubmit(pin);
    setBusy(false);
    setPin('');
    setError(err);
  }, [pin, busy, onSubmit]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < 8 ? p + e.key : p));
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter') submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submit]);
  const key = (label: string, onClick: () => void, extra = '') => (
    <button type="button" key={label} className={`btn display h-16 text-2xl ${extra}`} onClick={onClick} disabled={busy}>
      {label}
    </button>
  );
  return (
    <div className="mx-auto flex min-h-screen max-w-xs flex-col justify-center px-4 py-8">
      <div className="mb-6 text-center">
        <div className="display text-3xl font-bold">
          <span className="text-gold">KFL</span> Coach
        </div>
        <h1 className="mt-2 text-lg font-semibold">{title}</h1>
        {hint && <p className="mt-1 text-sm text-mute">{hint}</p>}
      </div>
      <div className="mb-2 flex h-12 items-center justify-center gap-2" aria-label={`${pin.length} digits entered`} role="status">
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={`h-4 w-4 rounded-full border-2 border-gold ${i < pin.length ? 'bg-gold' : ''}`} />
        ))}
      </div>
      <p className="mb-3 min-h-6 text-center text-sm text-loss" role="alert">
        {error}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, () => setPin((p) => (p.length < 8 ? p + d : p))))}
        {key('⌫', () => setPin((p) => p.slice(0, -1)))}
        {key('0', () => setPin((p) => (p.length < 8 ? p + '0' : p)))}
        <button type="button" className="btn btn-gold display h-16 text-xl" onClick={submit} disabled={busy || pin.length < 4}>
          Enter
        </button>
      </div>
      <div className="mt-6 flex flex-col items-center gap-3">
        <InstallButton />
        <Link to="/" className="text-sm text-mute underline">
          Back to the scoreboard
        </Link>
      </div>
    </div>
  );
}

function SetPin({ onDone }: { onDone: () => void }) {
  const [first, setFirst] = useState<string | null>(null);
  // Shown on the first keypad after a failed confirmation (the confirm keypad is replaced).
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const restart = (message: string) => {
    setProblem(message);
    setAttempt((n) => n + 1);
    setFirst(null);
    return message;
  };
  if (first === null) {
    return (
      <PinPad
        key={`first-${attempt}`}
        title="Set the teacher PIN"
        hint="Choose 4 to 8 digits. Every 5th grade teacher will share this PIN."
        initialError={problem}
        onSubmit={async (pin) => {
          setFirst(pin);
          return null;
        }}
      />
    );
  }
  return (
    <PinPad
      key="confirm"
      title="Enter the PIN again to confirm"
      onSubmit={async (pin) => {
        if (pin !== first) return restart('The PINs did not match. Start again.');
        try {
          await api('/api/auth/set-pin', { method: 'POST', body: { pin } });
          onDone();
          return null;
        } catch (e) {
          return restart((e as Error).message);
        }
      }}
    />
  );
}

// ------------------------------------------------------------------ score

const CT_TIME = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' });

function countdown(ms: number): string {
  if (ms <= 0) return 'now';
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${Math.max(1, m)}m`;
}

function scoringMessage(d: TeacherWeekData, remaining: number): { text: string; open: boolean } {
  if (d.scoring.open) return { text: `${d.week?.label} · Locks Fri 12:00 PM (in ${countdown(remaining)})`, open: true };
  switch (d.scoring.reason) {
    case 'no_season':
      return { text: 'No season yet. Open Setup to create one.', open: false };
    case 'preseason':
      return { text: d.firstWeek ? `Season starts ${formatDate(d.firstWeek.mondayDate)}` : 'Season has not started', open: false };
    case 'locked':
      return { text: 'Week locked. Scoring reopens Monday.', open: false };
    case 'skip':
      return { text: `No games this week (${d.week?.label ?? 'Break'})`, open: false };
    case 'complete':
      return { text: 'Season complete', open: false };
    default:
      return { text: 'No matchups this week. Check Setup.', open: false };
  }
}

interface Toast {
  id: number;
  text: string;
  undo?: () => void;
  error?: boolean;
}

function Score() {
  const { call } = useTeacher();
  const { data, error, reload, setData } = useApi<TeacherWeekData>('/api/teacher/week', 20000);
  const l = useLookup(data);
  const online = useOnline();
  const [divId, setDivId] = useState<number | null>(() => Number(localStorage.getItem('kfl.division')) || null);
  const [delta, setDelta] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fetchedAt = useRef(Date.now());
  const [, tick] = useState(0);
  useEffect(() => {
    fetchedAt.current = Date.now();
  }, [data]);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);
  const { refreshAuth } = useTeacher();
  useEffect(() => {
    if (error?.status === 401) refreshAuth();
  }, [error, refreshAuth]);

  const showToast = useCallback((t: Omit<Toast, 'id'>) => {
    clearTimeout(toastTimer.current);
    const id = Date.now();
    setToast({ ...t, id });
    toastTimer.current = setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), 8000);
  }, []);

  const bump = (teamId: number, cat: Category, n: number) =>
    setData((d) => (d ? { ...d, totals: { ...d.totals, [teamId]: { ...(d.totals[teamId] ?? ZERO_CATS), [cat]: Math.max(0, (d.totals[teamId]?.[cat] ?? 0) + n) } } } : d));

  const tap = (teamId: number, cat: Category) => {
    const key = `${teamId}:${cat}`;
    navigator.vibrate?.(30);
    setDelta((d) => ({ ...d, [key]: (d[key] ?? 0) + 1 })); // optimistic
    const done = () => setDelta((d) => ({ ...d, [key]: (d[key] ?? 0) - 1 }));
    const award = call<AwardRow>('/api/awards', { method: 'POST', body: { teamId, category: cat } }).then(
      (row) => {
        done();
        bump(teamId, cat, 1);
        return row;
      },
      (e: ApiError) => {
        done();
        showToast({ text: e.message, error: true });
        if (e.status === 409) reload();
        return null;
      },
    );
    showToast({
      text: `+1 ${CATEGORY_INFO[cat].label} → ${l.team(teamId).nfl.name}`,
      undo: async () => {
        setToast(null);
        const row = await award;
        if (!row) return;
        try {
          await call(`/api/awards/${row.id}`, { method: 'DELETE' });
          bump(teamId, cat, -1);
        } catch (e) {
          showToast({ text: (e as Error).message, error: true });
        }
      },
    });
  };

  if (!data) return <Notice>{error?.message ?? 'Loading…'}</Notice>;

  const division = data.divisions.find((d) => d.id === divId) ?? data.divisions[0];
  const remaining = (data.week?.lockAt ?? 0) - (data.now + Date.now() - fetchedAt.current);
  const msg = scoringMessage(data, remaining);
  const eligible = new Set(data.eligibleTeamIds);
  const canScore = msg.open && online && remaining > 0;
  const total = (id: number) => catTotal(data.totals[id]) + CATEGORIES.reduce((s, c) => s + (delta[`${id}:${c}`] ?? 0), 0);
  const cards = division
    ? data.pairings.flatMap((p) => [
        { teamId: p.aId, oppId: p.bId },
        { teamId: p.bId, oppId: p.aId },
      ]).filter((c) => l.team(c.teamId).info?.divisionId === division.id)
    : [];

  return (
    <div>
      {!online && (
        <div className="mb-3 rounded-lg border border-loss bg-red-950 px-3 py-2 font-semibold text-loss" role="alert">
          You are offline. Scoring is disabled until the connection returns.
        </div>
      )}
      <div className={`card mb-3 px-3 py-2 font-semibold ${msg.open ? 'border-win text-win' : 'text-gold'}`} role="status">
        {msg.text}
      </div>
      {data.divisions.length > 1 && (
        <div className="mb-3 flex gap-2 overflow-x-auto" role="tablist" aria-label="Division">
          {data.divisions.map((d) => (
            <button
              key={d.id}
              type="button"
              role="tab"
              aria-selected={division?.id === d.id}
              className={`btn whitespace-nowrap ${division?.id === d.id ? 'btn-gold' : ''}`}
              onClick={() => {
                setDivId(d.id);
                localStorage.setItem('kfl.division', String(d.id));
              }}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}
      {cards.length === 0 && data.week && data.week.type !== 'skip' && <Notice>{data.pairings.length ? 'No teams from this division are playing this week.' : 'No matchups this week.'}</Notice>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ teamId, oppId }) => {
          const t = l.team(teamId).nfl;
          const opp = l.team(oppId).nfl;
          const fg = readableOn(t.primaryColor);
          return (
            <div key={teamId} className="card overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2" style={{ background: t.primaryColor, color: fg }}>
                <Helmet nfl={t.id} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="display truncate text-2xl font-bold leading-tight">{t.name}</div>
                  <div className="truncate text-sm opacity-90">vs {opp.name}</div>
                </div>
                <div className="display text-right text-3xl font-bold tabular-nums" aria-label={`${t.name} ${total(teamId)}, ${opp.name} ${total(oppId)}`}>
                  {total(teamId)}
                  <span className="mx-1 text-xl opacity-80">–</span>
                  <span className="text-xl opacity-80">{total(oppId)}</span>
                </div>
              </div>
              {(msg.open ? eligible.has(teamId) : true) && (
                <div className="grid grid-cols-2 gap-2 p-2">
                  {CATEGORIES.map((c) => {
                    const count = (data.totals[teamId]?.[c] ?? 0) + (delta[`${teamId}:${c}`] ?? 0);
                    return msg.open ? (
                      <button
                        key={c}
                        type="button"
                        disabled={!canScore}
                        onClick={() => tap(teamId, c)}
                        className="flex min-h-[72px] items-center justify-between gap-2 rounded-xl border border-line bg-navy-3 px-3 text-left font-semibold active:scale-95 active:bg-gold active:text-navy disabled:opacity-50"
                        aria-label={`Add 1 ${CATEGORY_INFO[c].label} to ${t.name}. Currently ${count}.`}
                      >
                        <span className="leading-tight">{CATEGORY_INFO[c].label}</span>
                        <span className="display text-3xl font-bold tabular-nums text-gold">{count}</span>
                      </button>
                    ) : (
                      <div key={c} className="flex min-h-[48px] items-center justify-between rounded-xl border border-line px-3 text-mute">
                        <span>{CATEGORY_INFO[c].label}</span>
                        <span className="display text-2xl font-bold tabular-nums text-white">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {toast && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-3" role="status" aria-live="polite">
          <div className={`flex max-w-md items-center gap-3 rounded-xl border px-4 py-3 shadow-xl ${toast.error ? 'border-loss bg-red-950 text-loss' : 'border-gold bg-navy-3'}`}>
            <span className="font-semibold">{toast.text}</span>
            {toast.undo && (
              <button type="button" className="btn btn-gold" onClick={toast.undo}>
                Undo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ log

function Log() {
  const { call } = useTeacher();
  const week = useApi<TeacherWeekData>('/api/teacher/week', 30000);
  const weekId = week.data?.week && week.data.week.type !== 'skip' ? week.data.week.id : null;
  const awards = useApi<AwardRow[]>(weekId ? `/api/teacher/awards?weekId=${weekId}` : null, 30000);
  const l = useLookup(week.data);
  const [divId, setDivId] = useState<number | 'all'>('all');
  const [err, setErr] = useState<string | null>(null);
  if (!week.data) return <Notice>{week.error?.message ?? 'Loading…'}</Notice>;
  if (!weekId) return <Notice>No games this week, so there is nothing to log.</Notice>;
  const open = week.data.scoring.open;
  const rows = (awards.data ?? []).filter((a) => divId === 'all' || l.team(a.teamId).info?.divisionId === divId);
  const remove = async (id: number) => {
    setErr(null);
    try {
      await call(`/api/awards/${id}`, { method: 'DELETE' });
      awards.setData((list) => (list ? list.filter((a) => a.id !== id) : list));
    } catch (e) {
      setErr((e as Error).message);
      week.reload();
    }
  };
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="display flex-1 text-2xl font-bold">{week.data.week?.label} log</h1>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-mute">Division</span>
          <select className="input w-auto" value={divId} onChange={(e) => setDivId(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">All</option>
            {week.data.divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!open && <p className="mb-3 text-sm text-gold">This week is locked. Awards can no longer be changed.</p>}
      {err && (
        <p className="mb-3 text-sm text-loss" role="alert">
          {err}
        </p>
      )}
      {rows.length === 0 ? (
        <Notice>{awards.data ? 'No points awarded yet this week.' : 'Loading…'}</Notice>
      ) : (
        <ul className="card divide-y divide-line/60">
          {rows.map((a) => {
            const t = l.team(a.teamId).nfl;
            return (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                <Helmet nfl={t.id} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    +1 {CATEGORY_INFO[a.category].label} → {t.name}
                  </div>
                  <div className="text-xs text-mute">{CT_TIME.format(a.createdAt)}</div>
                </div>
                <button type="button" className="btn btn-danger" disabled={!open} onClick={() => remove(a.id)} aria-label={`Delete ${CATEGORY_INFO[a.category].label} point for ${t.name}`}>
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-mute">{rows.length} award{rows.length === 1 ? '' : 's'} shown, newest first.</p>
    </div>
  );
}

// ------------------------------------------------------------------ settings

function Settings() {
  const { call, refreshAuth } = useTeacher();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [resetErr, setResetErr] = useState<string | null>(null);

  const changePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await call('/api/auth/change-pin', { method: 'POST', body: { currentPin, newPin } });
      setCurrentPin('');
      setNewPin('');
      setMsg({ ok: true, text: 'PIN changed. Every other device has been signed out.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="display text-2xl font-bold">Settings</h1>

      <form className="card space-y-3 p-4" onSubmit={changePin}>
        <h2 className="display text-xl font-bold">Change PIN</h2>
        <div>
          <label className="label" htmlFor="cur-pin">
            Current PIN
          </label>
          <input id="cur-pin" className="input" type="password" inputMode="numeric" autoComplete="off" pattern="\d{4,8}" maxLength={8} required value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div>
          <label className="label" htmlFor="new-pin">
            New PIN (4–8 digits)
          </label>
          <input id="new-pin" className="input" type="password" inputMode="numeric" autoComplete="off" pattern="\d{4,8}" maxLength={8} required value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} />
        </div>
        {msg && (
          <p className={`text-sm ${msg.ok ? 'text-win' : 'text-loss'}`} role="alert">
            {msg.text}
          </p>
        )}
        <button className="btn btn-gold" type="submit">
          Change PIN
        </button>
        <p className="text-xs text-mute">Changing the PIN signs out every other device. Teachers will need the new PIN.</p>
      </form>

      <div className="card space-y-3 p-4">
        <h2 className="display text-xl font-bold">This device</h2>
        <div className="flex flex-wrap gap-3">
          <InstallButton />
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await call('/api/auth/logout', { method: 'POST', body: {} }).catch(() => {});
              refreshAuth();
            }}
          >
            Sign out this device
          </button>
        </div>
      </div>

      <div className="card space-y-3 border-red-800 p-4">
        <h2 className="display text-xl font-bold">Start new season</h2>
        <p className="text-sm text-mute">Deletes all divisions, teams, matchups and points. The PIN is kept. Past seasons are not saved anywhere.</p>
        <button type="button" className="btn btn-danger" onClick={() => setResetOpen(true)}>
          Start new season…
        </button>
      </div>

      {resetOpen && (
        <Modal title="Delete this season?" onClose={() => setResetOpen(false)}>
          <p className="mb-3 text-sm">
            This permanently deletes every division, team, matchup and point. It cannot be undone. Type <b>RESET</b> to confirm.
          </p>
          <label className="label" htmlFor="reset-confirm">
            Type RESET
          </label>
          <input id="reset-confirm" className="input mb-3" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoCapitalize="characters" />
          {resetErr && (
            <p className="mb-3 text-sm text-loss" role="alert">
              {resetErr}
            </p>
          )}
          <button
            type="button"
            className="btn btn-danger w-full"
            disabled={confirm !== 'RESET'}
            onClick={async () => {
              try {
                await call('/api/season/reset', { method: 'POST', body: { confirm } });
                setResetOpen(false);
                setConfirm('');
                window.location.assign('/teacher/setup');
              } catch (e) {
                setResetErr((e as Error).message);
              }
            }}
          >
            Delete everything and start over
          </button>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ shell

const TABS = [
  { to: '/teacher', label: 'Score', icon: '🏈', end: true },
  { to: '/teacher/log', label: 'Log', icon: '📋', end: false },
  { to: '/teacher/setup', label: 'Setup', icon: '🛠', end: false },
  { to: '/teacher/settings', label: 'Settings', icon: '⚙', end: false },
];

function Shell() {
  // The Test tab exists only on a deployment that was explicitly set up as a test site.
  const testSite = useTestStatus()?.enabled === true;
  const tabs = testSite ? [...TABS, { to: '/teacher/test', label: 'Test', icon: '⏱', end: false }] : TABS;
  return (
    <div className="flex min-h-screen flex-col">
      <TestBanner />
      <header className="flex items-center justify-between border-b border-line px-3 py-2">
        <div className="display text-xl font-bold">
          <span className="text-gold">KFL</span> Coach
        </div>
        <Link to="/" className="text-sm text-mute underline">
          Public site
        </Link>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 pb-28 pt-3">
        <Suspense fallback={<Notice>Loading…</Notice>}>
          <Routes>
            <Route index element={<Score />} />
            <Route path="log" element={<Log />} />
            <Route path="setup" element={<Setup />} />
            <Route path="settings" element={<Settings />} />
            {testSite && <Route path="test" element={<TestPanel />} />}
            <Route path="*" element={<Score />} />
          </Routes>
        </Suspense>
      </main>
      <nav className={`fixed inset-x-0 bottom-0 z-30 grid ${testSite ? 'grid-cols-5' : 'grid-cols-4'} border-t border-line bg-navy-2 pb-[env(safe-area-inset-bottom)]`} aria-label="Teacher">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `flex min-h-[60px] flex-col items-center justify-center text-sm font-semibold ${isActive ? 'text-gold' : 'text-mute'}`}>
            <span aria-hidden="true" className="text-xl leading-none">
              {t.icon}
            </span>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function TeacherApp() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshAuth = useCallback(() => {
    api<AuthStatus>('/api/auth/status').then(
      (s) => {
        setStatus(s);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, []);
  useEffect(refreshAuth, [refreshAuth]);

  const ctx = useMemo(
    () => ({
      refreshAuth,
      // Any 401 means the session ended (for example the PIN was changed): go back to the PIN screen.
      call: (async (path: string, init?: { method?: string; body?: unknown }) => {
        try {
          return await api(path, init);
        } catch (e) {
          if (e instanceof ApiError && e.status === 401 && !path.startsWith('/api/auth/')) refreshAuth();
          throw e;
        }
      }) as typeof api,
    }),
    [refreshAuth],
  );

  if (!status) {
    return (
      <div className="p-6">
        <Notice>{error ?? 'Loading…'}</Notice>
        {error && (
          <button type="button" className="btn mt-3" onClick={refreshAuth}>
            Try again
          </button>
        )}
      </div>
    );
  }
  if (!status.pinSet) return <SetPin onDone={refreshAuth} />;
  if (!status.authed) {
    return (
      <PinPad
        title="Enter the teacher PIN"
        onSubmit={async (pin) => {
          try {
            await api('/api/auth/pin', { method: 'POST', body: { pin } });
            refreshAuth();
            return null;
          } catch (e) {
            return (e as Error).message;
          }
        }}
      />
    );
  }
  return (
    <TeacherCtx.Provider value={ctx}>
      <Shell />
    </TeacherCtx.Provider>
  );
}
