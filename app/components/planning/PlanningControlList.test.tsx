import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PlanningControlList } from './PlanningControlList';
import type { AlertItem } from '@/hooks/useDashboardData';

vi.mock('@/app/components/matches/TeamMatchup', () => ({
  TeamMatchup: () => <span>Match</span>,
}));

const alert: AlertItem = {
  eventType: 'officiel',
  eventId: '1',
  title: 'Match test',
  localTeam: 'Equipe A',
  awayTeam: 'Equipe B',
  date: '12/09/2026',
  time: '07:30',
  missingRoles: ['encadrant'],
  replacementRoles: [],
  pending: 0,
  declined: 1,
  remindersDue: 0,
  planningStatus: 'published',
};

describe('PlanningControlList — responsive mobile', () => {
  it('empile date/statut et étend les actions sur mobile', () => {
    const html = renderToStaticMarkup(
      <PlanningControlList alerts={[alert]} />,
    );

    expect(html).toContain('grid-cols-2');
    expect(html).toContain('sm:contents');
    expect(html).toContain('w-full shrink-0 sm:w-auto');
    expect(html).toContain('flex-col items-start gap-1 sm:flex-row');
  });
});
