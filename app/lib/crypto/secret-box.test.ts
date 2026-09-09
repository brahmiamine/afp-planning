import { describe, it, expect } from 'vitest';
import { assertEncryptionConfiguredForProduction, decryptSecret, encryptSecret } from './secret-box';

describe('assertEncryptionConfiguredForProduction (issue #212)', () => {
  it('refuse le démarrage en production sans clé configurée', () => {
    expect(() => assertEncryptionConfiguredForProduction('production', false)).toThrow(
      /APP_ENCRYPTION_KEY est requis en production/,
    );
  });

  it('ne bloque pas la production quand la clé est configurée', () => {
    expect(() => assertEncryptionConfiguredForProduction('production', true)).not.toThrow();
  });

  it('tolère la dégradation en développement (comportement distinct de la production)', () => {
    expect(() => assertEncryptionConfiguredForProduction('development', false)).not.toThrow();
    expect(() => assertEncryptionConfiguredForProduction(undefined, false)).not.toThrow();
  });
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a value regardless of whether APP_ENCRYPTION_KEY is configured in this environment', () => {
    const plaintext = 'plain-value';
    const stored = encryptSecret(plaintext);
    expect(decryptSecret(stored)).toBe(plaintext);
  });
});
