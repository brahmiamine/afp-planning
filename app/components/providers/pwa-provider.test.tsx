// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaProvider } from './pwa-provider';

const push = vi.fn();
const swListeners: Array<(event: MessageEvent) => void> = [];
const navigation = { pathname: '/club' };

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push }),
}));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    user: { clubId: 'us-biotoise', accessRole: 'admin' },
  }),
}));
vi.mock('@/hooks/useAppSettings', () => ({
  useAppSettings: () => ({
    settings: {
      clubName: 'us-biotoise',
      clubLogo: 'https://cdn.example/blason.png',
      primaryColor: '#123456',
    },
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

describe('PwaProvider — icône d’installation', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    });
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile',
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: vi.fn().mockResolvedValue({}),
        addEventListener: vi.fn((type: string, listener: (event: MessageEvent) => void) => {
          if (type === 'message') swListeners.push(listener);
        }),
        removeEventListener: vi.fn((type: string, listener: (event: MessageEvent) => void) => {
          if (type !== 'message') return;
          const index = swListeners.indexOf(listener);
          if (index >= 0) swListeners.splice(index, 1);
        }),
      },
    });
    swListeners.length = 0;
    push.mockClear();
    navigation.pathname = '/club';
  });

  afterEach(() => {
    cleanup();
    document.head.querySelectorAll(
      'link[rel="apple-touch-icon"], link[rel="manifest"], meta[name="apple-mobile-web-app-title"], meta[name="application-name"]',
    ).forEach((node) => node.remove());
  });

  it('affiche le logo du club et relie manifeste / apple-touch vers /api/pwa/icon', async () => {
    const { container } = render(
      <PwaProvider>
        <div>app</div>
      </PwaProvider>,
    );

    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/blason.png');
    expect(container.textContent).toContain('Installer us-biotoise Planning');

    await waitFor(() => {
      const apples = [...document.head.querySelectorAll('link[rel="apple-touch-icon"]')];
      const manifest = document.head.querySelector('link[rel="manifest"]');
      expect(apples.length).toBeGreaterThan(0);
      expect(apples.every((link) => link.getAttribute('href')?.includes('/api/pwa/icon'))).toBe(true);
      expect(apples.every((link) => link.getAttribute('href')?.includes('clubId=us-biotoise'))).toBe(true);
      expect(apples.some((link) => link.getAttribute('href')?.includes('/branding/icon.png'))).toBe(false);
      expect(manifest?.getAttribute('href')).toContain('/manifest.webmanifest?clubId=us-biotoise');
      expect(document.head.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content')).toBe(
        'us-biotoise Planning',
      );
      expect(document.head.querySelector('meta[name="application-name"]')?.getAttribute('content')).toBe(
        'us-biotoise Planning',
      );
    });
  });

  it('ouvre la destination d’une notification cliquée (chat, désignation, planning)', async () => {
    render(
      <PwaProvider>
        <div>app</div>
      </PwaProvider>,
    );

    await waitFor(() => expect(swListeners.length).toBeGreaterThan(0));

    act(() => {
      swListeners[0]?.({
        data: {
          type: 'notification-navigate',
          url: `${window.location.origin}/club/chat?roomId=room-9`,
        },
      } as MessageEvent);
    });

    expect(push).toHaveBeenCalledWith('/club/chat?roomId=room-9');
  });

  it('sur la landing, affiche Clubika même si une session club existe', async () => {
    navigation.pathname = '/';
    render(
      <PwaProvider>
        <div>app</div>
      </PwaProvider>,
    );

    await waitFor(() => {
      expect(document.title).toBe('Clubika');
      expect(
        [...document.head.querySelectorAll('link[rel="icon"]')].some((link) =>
          link.getAttribute('href')?.includes('/favicon.png'),
        ),
      ).toBe(true);
      expect(document.head.querySelector('meta[name="application-name"]')?.getAttribute('content')).toBe('Clubika');
    });
  });
});
