// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const features = vi.hoisted(() => ({
  collaboration: true,
  travelAndWeather: true,
  eventChat: true,
}));

const snapshot = {
  eventId: 'e-1',
  eventType: 'entrainement',
  title: 'Entraînement test',
  date: '20/09/2026',
  time: '18:00',
  durationMinutes: 90,
  location: 'Terrain A',
  planningStatus: 'draft',
  event: { id: 'e-1', type: 'entrainement', date: '20/09/2026', time: '18:00', lieu: 'Terrain A', encadrants: [] },
  extras: null,
  assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
  canManage: false,
};

const apiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/api', () => ({
  apiGet,
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/hooks/useAppSettings', () => ({
  useAppSettings: () => ({
    isLoading: false,
    settings: {
      clubAbbreviation: 'AFP',
      features: {
        assignmentValidation: true,
        publicationReadiness: true,
        autoAssignment: true,
        automaticReminders: true,
        assignmentSwaps: true,
        attendanceTracking: true,
        recurringEvents: true,
        publicSharing: true,
        scraperSync: true,
        calendarExport: true,
        adminPublicationApproval: false,
        requireArbitreForPublication: true,
        requireEncadrantForPublication: true,
        requireAccompagnateurForPublication: true,
        ...features,
      },
    },
  }),
}));
vi.mock('@/app/components/chat/EventChatPanel', () => ({ EventChatPanel: () => <div>event-chat</div> }));
vi.mock('@/app/components/events/EventDetailsEditor', () => ({ EventDetailsEditor: () => null }));
vi.mock('@/app/components/events/EventAssignmentsEditor', () => ({ EventAssignmentsEditor: () => null }));
vi.mock('@/app/components/matches/TeamMatchup', () => ({ TeamMatchup: () => <span>match</span> }));

import { EventWorkspaceView } from './EventWorkspaceView';

function renderWorkspace() {
  return render(
    <EventWorkspaceView eventType="entrainement" eventId="e-1" backHref="/club" backLabel="Retour" />,
  );
}

describe('EventWorkspaceView feature flags (issue #149)', () => {
  beforeEach(() => {
    apiGet.mockReset();
    Object.assign(features, { collaboration: true, travelAndWeather: true, eventChat: true });
  });

  afterEach(() => cleanup());

  it('masque les modules optionnels désactivés et n’appelle pas leurs routes', async () => {
    Object.assign(features, { collaboration: false, travelAndWeather: false, eventChat: false });
    apiGet.mockResolvedValue(snapshot);

    renderWorkspace();

    expect(await screen.findByText('Entraînement test')).toBeDefined();
    expect(screen.queryByText('Météo de l’événement')).toBeNull();
    expect(screen.queryByText('Commentaires')).toBeNull();
    expect(screen.queryByText('Documents')).toBeNull();
    expect(screen.queryByText('event-chat')).toBeNull();
    expect(apiGet.mock.calls.map(([url]) => url)).toEqual(['/api/planning/events/entrainement/e-1']);
  });

  it('garde le détail affiché quand un module optionnel échoue', async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/e-1')) return snapshot;
      if (url.includes('/collaboration')) throw new Error('Collaboration indisponible');
      if (url.includes('/reports')) return { reports: [], canSubmit: false };
      if (url.includes('/attachments')) return { attachments: [], canManage: false };
      return { available: false, provider: 'open-meteo' };
    });

    renderWorkspace();

    expect(await screen.findByText('Entraînement test')).toBeDefined();
    expect(screen.getByText('Commentaires')).toBeDefined();
    expect(screen.getByText('Aucun commentaire.')).toBeDefined();
  });
});
