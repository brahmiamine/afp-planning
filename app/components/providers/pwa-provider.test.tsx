// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaProvider } from './pwa-provider';

const push = vi.fn();
const swListeners: Array<(event: MessageEvent) => void> = [];

vi.mock('next/navigation', () => ({
  usePathname: () => '/club',
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
  });

  afterEach(() => {
    cleanup();
    document.head.querySelectorAll('link[rel="apple-touch-icon"], link[rel="manifest"]').forEach((node) => node.remove());
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
      const apple = document.head.querySelector('link[rel="apple-touch-icon"]');
      const manifest = document.head.querySelector('link[rel="manifest"]');
      expect(apple?.getAttribute('href')).toContain('/api/pwa/icon');
      expect(apple?.getAttribute('href')).toContain('clubId=us-biotoise');
      expect(apple?.getAttribute('href')).not.toContain('/branding/icon.png');
      expect(manifest?.getAttribute('href')).toContain('/manifest.webmanifest?clubId=us-biotoise');
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
});
