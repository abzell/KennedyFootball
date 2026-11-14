import { useEffect, useState } from 'react';
import { formatInstant } from '../../shared/time';
import type { TestStatus } from '../../shared/types';
import { api } from '../lib';

export const CLOCK_CHANGED = 'kfl-clock-changed';

/**
 * Asks once whether this deployment is a test site. On the real site that is the only request
 * it ever makes; on a test site it keeps the simulated time fresh.
 */
export function useTestStatus(): TestStatus | null {
  const [status, setStatus] = useState<TestStatus | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    const load = () =>
      api<TestStatus>('/api/test/status').then(
        (s) => {
          if (stopped) return;
          setStatus(s);
          if (s.enabled && !timer) timer = setInterval(load, 30000);
        },
        () => {},
      );
    load();
    window.addEventListener(CLOCK_CHANGED, load);
    window.addEventListener('focus', load);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      window.removeEventListener(CLOCK_CHANGED, load);
      window.removeEventListener('focus', load);
    };
  }, []);
  return status;
}

/** Unmissable strip shown on every page of a test site. Renders nothing on the real site. */
export function TestBanner({ floating = false }: { floating?: boolean }) {
  const status = useTestStatus();
  if (!status?.enabled) return null;
  return (
    <div
      role="status"
      className={`z-[60] bg-[#ffd166] px-3 py-1 text-center text-sm font-bold text-[#3b2a00] ${floating ? 'pointer-events-none fixed left-1/2 top-0 -translate-x-1/2 rounded-b-lg shadow-lg' : ''}`}
      style={{ backgroundImage: 'repeating-linear-gradient(135deg, rgba(0,0,0,.08) 0 12px, transparent 12px 24px)' }}
    >
      TEST SITE · simulated time: {formatInstant(status.now)} Central{status.offsetMs === 0 ? ' (real time)' : ''}
    </div>
  );
}
