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
    expect(branding.logo).toBe('');
  });
});

describe('buildPwaMetadata', () => {
  it('pointe le favicon vers l’icône produit par défaut', () => {
    const branding = resolveAppProductBranding();
    const metadata = buildPwaMetadata(branding);

    expect(metadata.title).toBe('Clubika');
    expect(JSON.stringify(metadata.icons)).toContain(`clubId=${APP_PRODUCT_CLUB_ID}`);
  });
});
