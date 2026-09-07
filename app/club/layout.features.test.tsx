/** @vitest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClubLayout from './layout';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/utils/api', () => ({ apiPost: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { email: 'admin@example.com' }, reload: vi.fn() }),
}));
vi.mock('@/hooks/useUnreadNotificationsCount', () => ({ useUnreadNotificationsCount: () => ({ unread: 0 }) }));
vi.mock('@/hooks/useAppSettings', () => ({
  useAppSettings: () => ({
    settings: {
      clubName: 'AFP',
      clubDescription: '',
      clubLogo: '',
      clubAbbreviation: 'AFP',
      features: {
        assignmentValidation: true,
        publicationReadiness: true,
        autoAssignment: true,
        automaticReminders: true,
        assignmentSwaps: false,
        attendanceTracking: true,
        recurringEvents: false,
        publicSharing: false,
        scraperSync: true,
        eventChat: true,
        travelAndWeather: true,
        calendarExport: true,
        collaboration: true,
        adminPublicationApproval: false,
        requireArbitreForPublication: true,
        requireEncadrantForPublication: true,
        requireAccompagnateurForPublication: true,
      },
    },
  }),
}));
vi.mock('@/app/components/layout/DashboardShell', () => ({
  DashboardShell: ({ sections, children }: { sections: Array<{ items: Array<{ href: string; label: string }> }>; children: React.ReactNode }) => (
    <div>
      {sections.flatMap((section) => section.items).map((item) => <span key={item.href}>{item.label}</span>)}
      {children}
    </div>
  ),
}));

describe('ClubLayout feature navigation (issue #149)', () => {
  it('masque les pages dont le flag est désactivé', () => {
    render(<ClubLayout><div>page</div></ClubLayout>);

    expect(screen.queryByText('Échanges')).toBeNull();
    expect(screen.queryByText('Planning récurrent')).toBeNull();
    expect(screen.queryByText('Partage public')).toBeNull();
    expect(screen.getByText('Préparation du planning')).toBeTruthy();
  });
});
