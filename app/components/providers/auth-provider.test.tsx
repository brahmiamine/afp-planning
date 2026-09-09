import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './auth-provider';

let mockPathname = '/';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => mockPathname,
}));
vi.mock('@/lib/utils/api', () => ({ apiGet: vi.fn().mockRejectedValue(new Error('401')) }));

// `renderToStaticMarkup` does not run effects, so `isLoading` stays at its
// initial `true` value for the whole render — this is exactly what exercises
// the loading-spinner-vs-children branch that `isPublicPathname` guards.
describe('AuthProvider public paths', () => {
  it('renders the landing page children at "/" instead of the loading spinner', () => {
    mockPathname = '/';
    const html = renderToStaticMarkup(
      <AuthProvider>
        <div data-testid="landing">landing content</div>
      </AuthProvider>,
    );
    expect(html).toContain('landing content');
  });

  it('still shows the loading spinner (not children) on a protected route', () => {
    mockPathname = '/club';
    const html = renderToStaticMarkup(
      <AuthProvider>
        <div data-testid="club">club content</div>
      </AuthProvider>,
    );
    expect(html).not.toContain('club content');
  });

  it('does not treat an unrelated route as public just because it starts with "/"', () => {
    mockPathname = '/club/planning';
    const html = renderToStaticMarkup(
      <AuthProvider>
        <div>planning content</div>
      </AuthProvider>,
    );
    expect(html).not.toContain('planning content');
  });
});
