import { describe, expect, it } from 'vitest';
import {
  APP_PRODUCT_CLUB_ID,
  buildPwaMetadata,
  resolveAppProductBranding,
} from './branding';

describe('resolveAppProductBranding', () => {
  it('expose l’identité produit Clubika indépendante de tout club', () => {
    const branding = resolveAppProductBranding();

    expect(branding.clubId).toBe(APP_PRODUCT_CLUB_ID);
    expect(branding.name).toBe('Clubika');
    expect(branding.shortName).toBe('Clubika');
    expect(branding.logo).toBe('/branding/clubika-icon.png');
    expect(branding.badgeLogo).toBe('/branding/icon.png');
  });
});

describe('buildPwaMetadata', () => {
  it('pointe le favicon et l’icône d’installation vers le générateur de logo, pas icon.png Clubika', () => {
    const branding = resolveAppProductBranding();
    const metadata = buildPwaMetadata(branding);
    const icons = JSON.stringify(metadata.icons);

    expect(metadata.title).toBe('Clubika');
    expect(icons).toContain('/api/pwa/icon?');
    expect(icons).toContain(`clubId=${APP_PRODUCT_CLUB_ID}`);
    expect(icons).not.toContain('/branding/icon.png');
    expect(icons).not.toContain('/branding/icon-512.png');
  });

  it('utilise le clubId du tenant pour l’icône d’installation', () => {
    const metadata = buildPwaMetadata({
      clubId: 'us-biotoise',
      name: 'us-biotoise Planning',
      shortName: 'us-biotoise Planning',
      description: 'Planning du club',
      logo: 'https://cdn.example/blason.png',
      badgeLogo: '/branding/icon.png',
      primaryColor: '#c8102e',
      backgroundColor: '#ffffff',
      iconVersion: 'deadbeef12',
    });
    const icons = JSON.stringify(metadata.icons);

    expect(icons).toContain('clubId=us-biotoise');
    expect(icons).toContain('variant=plain');
    expect(icons).not.toContain('/branding/icon.png');
  });
});
