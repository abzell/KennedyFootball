// "Install app" support. There is no app-store build: Chrome/Edge show the native install
// prompt; Safari gets step-by-step instructions.
import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
  notify();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  notify();
});

export type InstallHelp = 'ios' | 'mac-safari' | 'chromium-menu' | 'other';

export function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function platformHelp(): InstallHelp {
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (iOS) return 'ios';
  const chromium = /Chrome|Chromium|Edg\//.test(ua);
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !chromium) return 'mac-safari';
  if (chromium) return 'chromium-menu';
  return 'other';
}

export function useInstall() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    const mq = matchMedia('(display-mode: standalone)');
    mq.addEventListener('change', fn);
    return () => {
      listeners.delete(fn);
      mq.removeEventListener('change', fn);
    };
  }, []);
  return {
    /** Hide the button entirely when already running as an installed app. */
    installed: isStandalone(),
    /** Returns null when the native prompt was shown, otherwise which instructions to display. */
    install: async (): Promise<InstallHelp | null> => {
      if (deferred) {
        const ev = deferred;
        await ev.prompt();
        const choice = await ev.userChoice.catch(() => null);
        if (choice?.outcome === 'accepted') deferred = null;
        notify();
        return null;
      }
      return platformHelp();
    },
  };
}
