import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Entrainement } from '@/types/match';
import { EventCard } from './EventCard';

vi.mock('@/hooks/useMatchExtras', () => ({
  useMatchExtras: () => ({ extras: null }),
}));

const training: Entrainement = {
  id: 'training-1',
  type: 'entrainement',
  date: '20/09/2026',
  time: '10:00',
  lieu: 'Terrain A',
  encadrants: [],
};

describe('EventCard read-only mode (issue #144)', () => {
  it('hides the delete action in consultation mode', () => {
    const html = renderToStaticMarkup(<EventCard event={training} readOnly />);

    expect(html).not.toContain('title="Supprimer"');
  });

  it('keeps the delete action in planning preparation mode', () => {
    const html = renderToStaticMarkup(<EventCard event={training} />);

    expect(html).toContain('title="Supprimer"');
  });
});
