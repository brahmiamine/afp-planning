import { describe, expect, it } from 'vitest';
import { canOfferPwaInstall } from './install-prompt';

describe('canOfferPwaInstall', () => {
  it('refuse l’installation sans session', () => {
    expect(canOfferPwaInstall('/club', null)).toBe(false);
    expect(canOfferPwaInstall('/mon-planning', undefined)).toBe(false);
  });

  it('refuse l’installation sur les pages publiques', () => {
    expect(canOfferPwaInstall('/', 'admin')).toBe(false);
    expect(canOfferPwaInstall('/login', 'admin')).toBe(false);
    expect(canOfferPwaInstall('/partage/token', 'dirigeant')).toBe(false);
    expect(canOfferPwaInstall('/mot-de-passe-oublie', 'admin')).toBe(false);
    expect(canOfferPwaInstall('/inscription/abc', 'dirigeant')).toBe(false);
  });

  it('refuse l’installation sur l’espace plateforme', () => {
    expect(canOfferPwaInstall('/plateforme', 'admin')).toBe(false);
    expect(canOfferPwaInstall('/plateforme/login', 'admin')).toBe(false);
  });

  it('autorise l’installation après connexion dans /club ou /mon-planning', () => {
    expect(canOfferPwaInstall('/club', 'admin')).toBe(true);
    expect(canOfferPwaInstall('/club/planning', 'admin')).toBe(true);
    expect(canOfferPwaInstall('/mon-planning', 'dirigeant')).toBe(true);
    expect(canOfferPwaInstall('/mon-planning/profil', 'dirigeant')).toBe(true);
  });
});
