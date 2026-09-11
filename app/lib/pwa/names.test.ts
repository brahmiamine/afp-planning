import { describe, expect, it } from 'vitest';
import { buildPwaAppName, buildPwaShortName } from './names';

describe('buildPwaAppName', () => {
  it('suffixe le nom du club avec Planning', () => {
    expect(buildPwaAppName('us-biotoise')).toBe('us-biotoise Planning');
    expect(buildPwaAppName('  AFP  ')).toBe('AFP Planning');
  });
});

describe('buildPwaShortName', () => {
  it('garde le nom complet quand il tient sur l’icône', () => {
    expect(buildPwaShortName('us-biotoise')).toBe('us-biotoise Planning');
  });

  it('passe aux initiales pour un nom trop long (iOS / short_name)', () => {
    expect(buildPwaShortName('Academie Football Paris 18')).toBe('AFP Planning');
  });
});
