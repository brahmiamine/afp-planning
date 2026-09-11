import { describe, expect, it } from 'vitest';
import {
  PWA_CLUB_ID_HEADER,
  buildNotificationIconPath,
  buildPwaIconUrl,
  buildPwaManifestIcons,
  clubIdFromRequestHeaders,
  normalizePwaClubId,
} from './icons';

describe('normalizePwaClubId', () => {
  it('accepte un identifiant de club et refuse le reste', () => {
    expect(normalizePwaClubId('us-biotoise')).toBe('us-biotoise');
    expect(normalizePwaClubId('  afp  ')).toBe('afp');
    expect(normalizePwaClubId('../etc/passwd')).toBeNull();
    expect(normalizePwaClubId('')).toBeNull();
  });
});

describe('clubIdFromRequestHeaders', () => {
  it('lit le header recopié par le proxy', () => {
    expect(clubIdFromRequestHeaders((name) => (name === PWA_CLUB_ID_HEADER ? 'us-biotoise' : null))).toBe(
      'us-biotoise',
    );
    expect(clubIdFromRequestHeaders(() => null)).toBeUndefined();
  });
});

describe('buildPwaIconUrl', () => {
  it('pointe vers le générateur d’icône du club, pas vers icon.png Clubika', () => {
    const url = buildPwaIconUrl({ clubId: 'us-biotoise', size: 192, variant: 'plain', version: 'abc123' });

    expect(url).toContain('/api/pwa/icon?');
    expect(url).toContain('clubId=us-biotoise');
    expect(url).toContain('size=192');
    expect(url).toContain('variant=plain');
    expect(url).not.toContain('/branding/icon.png');
  });
});

describe('buildPwaManifestIcons', () => {
  it('fournit 192 et 512 en logo club brut, sans plaque colorée', () => {
    const icons = buildPwaManifestIcons('us-biotoise', 'v1');

    expect(icons).toHaveLength(4);
    expect(icons.map((icon) => icon.purpose)).toEqual(['any', 'maskable', 'any', 'maskable']);
    expect(icons.every((icon) => icon.src.includes('clubId=us-biotoise'))).toBe(true);
    expect(icons.every((icon) => icon.src.includes('variant=plain'))).toBe(true);
    expect(icons.some((icon) => icon.src.includes('variant=badge'))).toBe(false);
  });
});

describe('buildNotificationIconPath', () => {
  it('utilise l’icône PWA statique, pas le blason du club', () => {
    expect(buildNotificationIconPath()).toBe('/pwa/icon-192.png');
  });
});
