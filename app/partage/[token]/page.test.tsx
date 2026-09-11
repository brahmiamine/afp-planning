import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useParams: () => ({ token: 'test-token' }),
}));

vi.mock('@/lib/utils/api', () => ({
  apiGet: vi.fn().mockResolvedValue({
    expiresAt: new Date('2026-12-31').toISOString(),
    club: { name: 'Club Test', logo: null },
    items: [
      {
        eventType: 'officiel',
        title: 'Match test',
        date: '12/09/2026',
        time: '10:00',
        endTime: '11:30',
        durationMinutes: 90,
        location: 'Stade A',
        category: 'U15',
        meetingTime: '09:30',
        competition: 'Championnat',
        homeTeam: 'Club Test',
        awayTeam: 'Visiteur FC',
        homeTeamLogo: null,
        awayTeamLogo: null,
        venue: 'domicile',
        stadium: 'Stade A',
        address: '1 rue du stade, Paris',
        referee: 'Dupont',
        assistants: ['Martin'],
        officials: [{ role: 'arbitre', nom: 'Dupont' }],
      },
    ],
  }),
}));

// Import après les mocks pour que la page utilise les dépendances simulées.
import PublicPlanningSharePage from './page';

describe('PublicPlanningSharePage — responsive mobile', () => {
  it('utilise une coque et un en-tête adaptés aux petits écrans', () => {
    const html = renderToStaticMarkup(<PublicPlanningSharePage />);

    expect(html).toContain('px-3 py-6');
    expect(html).toContain('text-xl font-bold text-pretty sm:text-2xl');
    expect(html).toContain('items-start gap-3 sm:items-center');
  });
});
