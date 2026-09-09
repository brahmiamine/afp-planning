// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlanningEventSnapshot } from '@/lib/planning/event-store';
import { EventWorkspaceView } from './EventWorkspaceView';

const apiPostMock = vi.fn().mockResolvedValue({ success: true });

vi.mock('@/lib/utils/api', () => ({
  apiGet: vi.fn(async (url: string) => {
    if (url.includes('/collaboration')) return { comments: [], tasks: [], canManage: true };
    if (url.includes('/reports')) return { reports: [], canSubmit: false };
    if (url.includes('/attachments')) return { attachments: [], canManage: false };
    if (url.includes('/weather')) return { available: false, provider: 'open-meteo' };
    return snapshot;
  }),
  apiPost: (...args: unknown[]) => apiPostMock(...args),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/app/components/chat/EventChatPanel', () => ({ EventChatPanel: () => null }));
vi.mock('@/app/components/events/EventDetailsEditor', () => ({ EventDetailsEditor: () => null }));
vi.mock('@/app/components/events/EventAssignmentsEditor', () => ({ EventAssignmentsEditor: () => null }));

const snapshot: PlanningEventSnapshot & { canManage: boolean } = {
  eventId: 'training-1',
  eventType: 'entrainement',
  title: 'Entraînement U15',
  date: '2026-09-12',
  time: '18:00',
  durationMinutes: 90,
  location: 'Terrain A',
  planningStatus: 'published',
  event: { id: 'training-1', type: 'entrainement', date: '12/09/2026', time: '18:00', lieu: 'Terrain A', encadrants: [] },
  extras: null,
  assignments: {
    arbitre: [],
    encadrant: [{ nom: 'Jean Dupont', numero: '0600000000', personId: 42, status: 'accepted', attendanceStatus: 'unknown' }],
    accompagnateur: [],
  },
  canManage: true,
};

describe('EventWorkspaceView attendance (issue #156)', () => {
  afterEach(() => {
    cleanup();
    apiPostMock.mockClear();
  });

  it('lets an admin record attendance for an assigned person', async () => {
    render(
      <EventWorkspaceView
        eventType="entrainement"
        eventId="training-1"
        backHref="/club/planning"
        backLabel="Retour"
      />,
    );

    await waitFor(() => expect(screen.getByText('Jean Dupont')).toBeTruthy());

    const presentButton = await screen.findByRole('button', { name: 'Présent' });
    fireEvent.click(presentButton);

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/planning/attendance', {
      eventType: 'entrainement',
      eventId: 'training-1',
      role: 'encadrant',
      status: 'present',
      personId: 42,
    }));
  });
});
