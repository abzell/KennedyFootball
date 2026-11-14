import { useEffect, useState, type ReactNode } from 'react';
import { useInstall, type InstallHelp } from '../teacher/install';

export type AppKind = 'public' | 'teacher';

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

function InstallHelpModal({ help, app, onClose }: { help: InstallHelp; app: AppKind; onClose: () => void }) {
  const name = app === 'teacher' ? 'KFL Coach' : 'KFL';
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
              Tap <b>Add</b>. Open “{name}” from your home screen.
            </HelpStep>
          </ol>
          {app === 'teacher' && (
            <p className="mt-3 text-sm text-mute">
              You will enter the PIN one more time inside the installed app. iPhones and iPads keep a separate sign-in for home-screen apps. After that it opens straight to scoring.
            </p>
          )}
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
            Click <b>Add</b>. Open “{name}” from the Dock.
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

/**
 * Install button for one of the two apps. `teacher` installs “KFL Coach” (opens on scoring);
 * `public` installs “KFL” (opens on the scoreboard). Hidden when already running installed.
 */
export function InstallButton({ app, className = '' }: { app: AppKind; className?: string }) {
  const { installed, install } = useInstall();
  const [help, setHelp] = useState<InstallHelp | null>(null);
  if (installed) return null;
  return (
    <>
      <button type="button" className={`btn ${className}`} onClick={async () => setHelp(await install())}>
        ⬇ Install app
      </button>
      {help && <InstallHelpModal help={help} app={app} onClose={() => setHelp(null)} />}
    </>
  );
}
