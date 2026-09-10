import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getClientIp } from './client-ip';

function requestWithHeaders(headers: Record<string, string>) {
  return new NextRequest('http://localhost/api/auth/login', { headers });
}

describe('getClientIp (issue #274)', () => {
  const originalTrustedProxyCount = process.env.TRUSTED_PROXY_COUNT;

  afterEach(() => {
    if (originalTrustedProxyCount === undefined) delete process.env.TRUSTED_PROXY_COUNT;
    else process.env.TRUSTED_PROXY_COUNT = originalTrustedProxyCount;
  });

  it('retient la seule entrée présente quand aucun proxy de confiance n\'est déclaré au-delà', () => {
    delete process.env.TRUSTED_PROXY_COUNT;
    // Défaut = 1 proxy de confiance : un en-tête à une seule entrée correspond au
    // client réel passé par ce proxy.
    const ip = getClientIp(requestWithHeaders({ 'x-forwarded-for': '203.0.113.7' }));
    expect(ip).toBe('203.0.113.7');
  });

  it('retient la Nième entrée en partant de la droite avec plusieurs proxies de confiance', () => {
    process.env.TRUSTED_PROXY_COUNT = '2';
    // Chaque proxy de confiance ajoute l'adresse qu'il a lui-même observée, pas la
    // sienne : avec 2 proxies de confiance en chaîne, l'IP cliente réelle est
    // l'avant-dernière entrée (ajoutée par le premier proxy), pas la première (que
    // le client a pu falsifier) ni la dernière (l'adresse du premier proxy vue par
    // le second, pas celle du client).
    const ip = getClientIp(requestWithHeaders({ 'x-forwarded-for': 'falsifie-par-le-client, 198.51.100.9, 10.0.0.5' }));
    expect(ip).toBe('198.51.100.9');
  });

  it('ignore un préfixe falsifié par le client quand le nombre de proxies de confiance est correctement configuré', () => {
    process.env.TRUSTED_PROXY_COUNT = '1';
    // Un client malveillant peut préfixer l'en-tête de fausses valeurs ; seule la
    // dernière entrée (ajoutée par le proxy de confiance) fait foi.
    const ip = getClientIp(requestWithHeaders({ 'x-forwarded-for': '6.6.6.6, 203.0.113.42' }));
    expect(ip).toBe('203.0.113.42');
  });

  it('retombe sur x-real-ip quand x-forwarded-for est absent', () => {
    const ip = getClientIp(requestWithHeaders({ 'x-real-ip': '203.0.113.99' }));
    expect(ip).toBe('203.0.113.99');
  });

  it('retombe sur "unknown" sans lever quand aucun en-tête exploitable n\'est présent', () => {
    const ip = getClientIp(requestWithHeaders({}));
    expect(ip).toBe('unknown');
  });

  it('ne lève jamais avec TRUSTED_PROXY_COUNT invalide (retombe sur le défaut)', () => {
    process.env.TRUSTED_PROXY_COUNT = 'pas-un-nombre';
    expect(() => getClientIp(requestWithHeaders({ 'x-forwarded-for': '203.0.113.7' }))).not.toThrow();
  });
});
