import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MobileTabBar } from './MobileTabBar';

vi.mock('next/navigation', () => ({ usePathname: () => '/club' }));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    user: { accessRole: 'admin', planningFunctions: ['encadrant'] },
    isLoading: false,
  }),
}));
vi.mock('@/hooks/useUnreadNotificationsCount', () => ({ useUnreadNotificationsCount: () => ({ unread: 2 }) }));
vi.mock('@/hooks/useUnreadChatCount', () => ({ useUnreadChatCount: () => ({ unread: 5 }) }));

describe('MobileTabBar — badges non lus (issue #343)', () => {
  it('affiche les badges chat et notifications sur les onglets correspondants', () => {
    const html = renderToStaticMarkup(<MobileTabBar />);

    expect(html).toContain('Chat');
    expect(html).toContain('Notifs');
    expect(html).toContain('>5<');
    expect(html).toContain('>2<');
  });
});
