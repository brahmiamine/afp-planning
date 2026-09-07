import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  call: 0,
  snapshot: {
    eventId: 'e-1',
    eventType: 'entrainement',
    title: 'Entraînement test',
    date: '20/09/2026',
    time: '18:00',
    durationMinutes: 90,
    location: 'Terrain A',
    planningStatus: 'draft',
    event: {
      id: 'e-1',
      type: 'entrainement',
      date: '20/09/2026',
      time: '18:00',
      lieu: 'Terrain A',
      encadrants: [],
    },
    extras: null,
    assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
    canManage: true,
  },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useCallback: <T extends (...args: never[]) => unknown>(fn: T) => fn,
    useEffect: () => undefined,
    useState: <T,>(initial: T) => {
      state.call += 1;
      const value = state.call === 1
        ? state.snapshot
        : state.call === 13
          ? false
          : initial;
      return [value, vi.fn()] as const;
    },
  };
});

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/lib/utils/api', () => ({
  apiGet: vi.fn(),
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

import { EventWorkspaceView } from './EventWorkspaceView';

describe('EventWorkspaceView feature flags (issue #149)', () => {
  beforeEach(() => {
    state.call = 0;
  });

  it('garde le détail et masque les modules optionnels désactivés', () => {
    const html = renderToStaticMarkup(
      <EventWorkspaceView
        eventType="entrainement"
        eventId="e-1"
        backHref="/club"
        backLabel="Retour"
      />,
    );

    expect(html).toContain('Entraînement test');
    expect(html).not.toContain('Météo de l’événement');
    expect(html).not.toContain('Commentaires');
    expect(html).not.toContain('Documents');
    expect(html).not.toContain('event-chat');
  });
});
