// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
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
    render(
      // @ts-expect-error readOnly is the missing behavior covered by issue #144
      <EventCard event={training} readOnly />,
    );

    expect(screen.queryByTitle('Supprimer')).toBeNull();
  });

  it('keeps the delete action in planning preparation mode', () => {
    render(<EventCard event={training} />);

    expect(screen.getByTitle('Supprimer')).toBeTruthy();
  });
});
