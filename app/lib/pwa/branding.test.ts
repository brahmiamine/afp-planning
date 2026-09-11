import { describe, expect, it } from 'vitest';
import {
  APP_PRODUCT_CLUB_ID,
  buildPwaMetadata,
  resolveAppProductBranding,
} from './branding';

describe('resolveAppProductBranding', () => {
  it('expose l’identité produit PlanningClub indépendante de tout club', () => {
    const branding = resolveAppProductBranding();

    expect(branding.clubId).toBe(APP_PRODUCT_CLUB_ID);
    expect(branding.name).toBe('PlanningClub');
    expect(branding.shortName).toBe('PlanningClub');
    expect(branding.logo).toBe('');
  });
});

describe('buildPwaMetadata', () => {
  it('pointe le favicon vers l’icône produit par défaut', () => {
    const branding = resolveAppProductBranding();
    const metadata = buildPwaMetadata(branding);

    expect(metadata.title).toBe('PlanningClub');
    expect(metadata.icons?.icon?.[0]?.url).toContain(`clubId=${APP_PRODUCT_CLUB_ID}`);
  });
});
