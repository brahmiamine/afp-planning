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

describe('DashboardShell — tiroir mobile', () => {
  it('permet de faire défiler la navigation tout en gardant le pied de menu visible', () => {
    const manySections = Array.from({ length: 6 }, (_, index) => ({
      title: `Section ${index + 1}`,
      items: [{ href: `/club/section-${index}`, label: `Lien ${index}`, icon: LayoutDashboard }],
    }));

    const html = renderToStaticMarkup(
      <DashboardShell
        brandName="Club Test"
        brandHref="/club"
        sections={manySections}
        userLabel="admin@test.com"
        onLogout={() => {}}
      >
        <div>contenu</div>
      </DashboardShell>,
    );

    expect(html).toContain('min-h-0 flex-1');
    expect(html).toContain('overscroll-y-contain');
    expect(html).toContain('shrink-0 space-y-2 border-t');
    expect(html).toContain('Déconnexion');
  });
});
