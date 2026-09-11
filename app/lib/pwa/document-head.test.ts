/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { applyClubPwaDocumentHead } from './document-head';

describe('applyClubPwaDocumentHead', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('met à jour l’icône et le titre Clubika sans supprimer les balises Next.js', () => {
    const leftover = document.createElement('link');
    leftover.rel = 'apple-touch-icon';
    leftover.sizes = '180x180';
    leftover.href = '/branding/clubika-icon.png';
    document.head.appendChild(leftover);

    const title = document.createElement('meta');
    title.name = 'apple-mobile-web-app-title';
    title.content = 'Clubika';
    document.head.appendChild(title);

    applyClubPwaDocumentHead({
      iconHref: '/api/pwa/icon?clubId=us-biotoise&size=192&variant=plain',
      manifestHref: '/manifest.webmanifest?clubId=us-biotoise&v=1',
      appName: 'us-biotoise Planning',
      shortName: 'us-biotoise Planning',
      themeColor: '#123456',
    });

    expect(leftover.isConnected).toBe(true);
    expect(leftover.getAttribute('href')).toContain('clubId=us-biotoise');

    const apples = [...document.head.querySelectorAll('link[rel="apple-touch-icon"]')];
    expect(apples.length).toBeGreaterThan(0);
    expect(apples.every((link) => link.getAttribute('href')?.includes('clubId=us-biotoise'))).toBe(true);
    expect(document.head.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content')).toBe(
      'us-biotoise Planning',
    );
    expect(document.head.querySelector('link[rel="manifest"]')?.getAttribute('href')).toContain(
      'clubId=us-biotoise',
    );
    expect(document.head.querySelector('meta[name="application-name"]')?.getAttribute('content')).toBe(
      'us-biotoise Planning',
    );
  });
});
