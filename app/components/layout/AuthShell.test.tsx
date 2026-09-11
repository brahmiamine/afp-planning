import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuthShell } from './AuthShell';

describe('AuthShell', () => {
  it('affiche l’identité Clubika sans marque de club', () => {
    const html = renderToStaticMarkup(
      <AuthShell>
        <p>contenu</p>
      </AuthShell>,
    );

    expect(html).toContain('Clubika');
    expect(html).toContain('clubika-icon.png');
    expect(html).not.toContain('Salesienne');
  });

  it('affiche le logo et le nom du club invité', () => {
    const html = renderToStaticMarkup(
      <AuthShell brand={{ name: 'Salesienne de Paris', logo: 'https://cdn.example/blason.png' }}>
        <p>contenu</p>
      </AuthShell>,
    );

    expect(html).toContain('Salesienne de Paris');
    expect(html).toContain('https://cdn.example/blason.png');
    expect(html).not.toContain('clubika-icon.png');
  });
});
