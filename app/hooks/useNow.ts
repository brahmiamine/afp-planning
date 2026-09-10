'use client';

import { useEffect, useState } from 'react';

/**
 * Instantané de l'horloge, rafraîchi hors rendu (issue #286) : `Date.now()` ne
 * doit pas être lu pendant le render d'un composant client (règle de pureté React).
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
