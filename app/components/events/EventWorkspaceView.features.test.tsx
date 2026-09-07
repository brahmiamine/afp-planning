/** @vitest-environment jsdom */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventWorkspaceView } from './EventWorkspaceView';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/lib/utils/api', () => ({
  apiGet: mocks.apiGet,
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));
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
        eventChat: false,
        travelAndWeather: false,
        calendarExport: true,
        collaboration: false,
        adminPublicationApproval: false,
        requireArbitreForPublication: true,
        requireEncadrantForPublication: true,
        requireAccompagnateurForPublication: true,
      },
    },
  }),
}));
vi.mock('@/app/components/chat/EventChatPanel', () => ({ EventChatPanel: () => <div>event-chat</div> }));
vi.mock('@/app/components/events/EventDetailsEditor', () => ({ EventDetailsEditor: () => null }));
vi.mock('@/app/components/events/EventAssignmentsEditor', () => ({ EventAssignmentsEditor: () => null }));
vi.mock('@/app/components/matches/TeamMatchup', () => ({ TeamMatchup: () => <span>match</span> }));

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
  canManage: true,
};

describe('EventWorkspaceView feature flags (issue #149)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/api/planning/events/entrainement/e-1') return snapshot;
      throw new Error('Cette fonctionnalité est désactivée par l’administrateur.');
    });
  });

  it('charge toujours le détail de base sans appeler les modules désactivés', async () => {
    render(
      <EventWorkspaceView
        eventType="entrainement"
        eventId="e-1"
        backHref="/club"
        backLabel="Retour"
      />,
    );

    expect(await screen.findByText('Entraînement test')).toBeTruthy();
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Météo de l’événement')).toBeNull();
    expect(screen.queryByText('Commentaires')).toBeNull();
    expect(screen.queryByText('Documents')).toBeNull();
    expect(screen.queryByText('event-chat')).toBeNull();
  });
});
