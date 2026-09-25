import { useEffect, useLayoutEffect, useState } from 'react';

export const MOTION_STORAGE_KEY = 'c2c-motion';
export const MOTION_CHANGE_EVENT = 'c2c-motion-change';

export function useMotionPreference() {
  const [preference, setPreference] = useState(() => {
    try {
      const saved = localStorage.getItem(MOTION_STORAGE_KEY);
      if (saved === 'reduced') return 'medium';
      return ['full', 'medium', 'none'].includes(saved) ? saved : null;
    } catch { return null; }
  });
  const [systemReduced, setSystemReduced] = useState(() =>
    matchMedia('(prefers-reduced-motion: reduce)').matches);
  const mode = preference || (systemReduced ? 'none' : 'medium');

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(media.matches);
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.dataset.motion = mode;
    window.dispatchEvent(new Event(MOTION_CHANGE_EVENT));
  }, [mode]);

  function select(next) {
    if (!['full', 'medium', 'none'].includes(next)) return;
    setPreference(next);
    try { localStorage.setItem(MOTION_STORAGE_KEY, next); } catch { /* Keep the session preference when storage is unavailable. */ }
  }

  return { mode, select };
}
