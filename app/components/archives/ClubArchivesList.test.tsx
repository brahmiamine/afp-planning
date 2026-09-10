import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ClubArchivesList } from './ClubArchivesList';
import type { OfficialArchiveRow } from '@/lib/archives/official-matches';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/app/components/matches/TeamMatchup', () => ({
  TeamMatchup: ({ localTeam, awayTeam }: { localTeam?: string | null; awayTeam?: string | null }) => (
    <span>{localTeam} vs {awayTeam}</span>
  ),
}));

function row(overrides: Partial<OfficialArchiveRow> & Pick<OfficialArchiveRow, 'id' | 'badges'>): OfficialArchiveRow {
  return {
    date: '01/08/2026',
    time: '15:00',
    competition: 'Championnat',
    categorie: 'U15',
    localTeam: 'AFP',
    awayTeam: 'Visiteur',
    localTeamLogo: null,
    awayTeamLogo: null,
    venue: 'domicile',
    stadium: 'Stade municipal',
    planningStatus: null,
    sourceStatus: 'active',
    sourceLastSeenAt: '2026-08-01T12:00:00.000Z',
    sourceMissingSince: null,
    sourceMissingObservations: null,
    cancellationReason: null,
    workspaceHref: '/club/evenements/officiel/m1?from=dashboard',
    year: '2026',
    ...overrides,
  };
}

describe('ClubArchivesList (issue #319)', () => {
  it('affiche les badges Passé, Disparu de la source et Annulé', () => {
    const html = renderToStaticMarkup(
      <ClubArchivesList
        items={[
          row({ id: 'past', badges: ['past'], awayTeam: 'Ancien' }),
          row({ id: 'missing', badges: ['missing'], date: '20/10/2026', awayTeam: 'Fantôme' }),
          row({ id: 'cancelled', badges: ['cancelled'], awayTeam: 'Annulé FC' }),
        ]}
      />,
    );

    expect(html).toContain('Passé');
    expect(html).toContain('Disparu de la source');
    expect(html).toContain('Annulé');
    expect(html).toContain('AFP vs Ancien');
    expect(html).toContain('AFP vs Fantôme');
    expect(html).toContain('AFP vs Annulé FC');
    expect(html).toContain('/club/evenements/officiel/');
  });
});
