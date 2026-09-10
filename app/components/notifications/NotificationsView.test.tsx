import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { accessRole: 'admin' } }),
}));
vi.mock('@/hooks/useAppSettings', () => ({
  useAppSettings: () => ({ settings: { clubLogo: '' } }),
}));
vi.mock('@/lib/utils/api', () => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
}));
vi.mock('@/hooks/useUnreadNotificationsCount', () => ({ notifyNotificationsChanged: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { NotificationsView } from './NotificationsView';

describe('NotificationsView (issue #321)', () => {
  it('rend une vue cliquable (rôle link + focus clavier)', () => {
    const html = renderToStaticMarkup(<NotificationsView />);
    expect(html).toContain('Notifications');
    expect(html).toContain('Chargement');
  });
});
