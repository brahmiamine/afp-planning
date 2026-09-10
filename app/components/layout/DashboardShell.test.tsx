import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LayoutDashboard } from 'lucide-react';
import { DashboardShell } from './DashboardShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/club/planning',
}));

describe('DashboardShell branding (issue #318)', () => {
  it('rend le logo et le nom du club cliquables vers /club sur desktop, mobile et tiroir', () => {
    const html = renderToStaticMarkup(
      <DashboardShell
        brandName="AFP Paris"
        brandTag="AFP"
        brandLogo="/logo.png"
        brandHref="/club"
        sections={[{ items: [{ href: '/club', label: 'Événements', icon: LayoutDashboard, exact: true }] }]}
        onLogout={() => {}}
      >
        <div>contenu</div>
      </DashboardShell>,
    );

    expect(html).toContain('href="/club"');
    expect(html).toContain('aria-label="Accueil AFP Paris"');
    expect(html).toContain('AFP Paris');
    expect(html).toContain('src="/logo.png"');
    expect((html.match(/href="\/club"/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('laisse le branding non cliquable sans brandHref', () => {
    const html = renderToStaticMarkup(
      <DashboardShell
        brandName="Administration plateforme"
        sections={[{ items: [{ href: '/plateforme', label: 'Clubs', icon: LayoutDashboard, exact: true }] }]}
        onLogout={() => {}}
      >
        <div>contenu</div>
      </DashboardShell>,
    );

    expect(html).not.toContain('aria-label="Accueil Administration plateforme"');
    expect(html).not.toContain('href="/club"');
  });
});
