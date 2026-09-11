import { describe, expect, it } from 'vitest';
import { usesAppProductDocumentHead, usesTokenClubDocumentHead } from './document-routes';

describe('usesAppProductDocumentHead', () => {
  it('identifie la landing et les écrans hors club', () => {
    expect(usesAppProductDocumentHead('/')).toBe(true);
    expect(usesAppProductDocumentHead('/login')).toBe(true);
    expect(usesAppProductDocumentHead('/plateforme/login')).toBe(true);
    expect(usesAppProductDocumentHead('/mot-de-passe-oublie')).toBe(true);
    expect(usesAppProductDocumentHead('/club')).toBe(false);
    expect(usesAppProductDocumentHead('/partage/abc')).toBe(false);
  });
});

describe('usesTokenClubDocumentHead', () => {
  it('identifie le planning public et l’inscription', () => {
    expect(usesTokenClubDocumentHead('/partage/abc')).toBe(true);
    expect(usesTokenClubDocumentHead('/inscription/xyz')).toBe(true);
    expect(usesTokenClubDocumentHead('/')).toBe(false);
  });
});
