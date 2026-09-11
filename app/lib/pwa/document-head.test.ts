/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { applyAppProductDocumentHead, applyBrowserTabIdentity, applyClubPwaDocumentHead } from './document-head';

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
    expect(document.title).toBe('us-biotoise Planning');
  });

  it('affiche le nom et le logo du club dans l’onglet', () => {
    applyBrowserTabIdentity({
      title: 'La Salesienne de Paris',
      iconHref: '/api/pwa/icon?clubId=salesienne&size=32&variant=plain',
      themeColor: '#008509',
    });

    expect(document.title).toBe('La Salesienne de Paris');
    const icons = [...document.head.querySelectorAll('link[rel="icon"]')];
    expect(icons.length).toBeGreaterThan(0);
    expect(icons.every((link) => link.getAttribute('href')?.includes('clubId=salesienne'))).toBe(true);
    expect(document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#008509');
  });

  it('applique le nom et le favicon Clubika pour les écrans produit', () => {
    applyAppProductDocumentHead();

    expect(document.title).toBe('Clubika');
    expect(
      [...document.head.querySelectorAll('link[rel="icon"]')].some((link) =>
        link.getAttribute('href')?.includes('/favicon.png'),
      ),
    ).toBe(true);
    expect(document.head.querySelector('meta[name="application-name"]')?.getAttribute('content')).toBe('Clubika');
  });
});
