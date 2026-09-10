import type { NextRequest } from 'next/server';

/**
 * Nombre de reverse proxies de confiance en amont de l'application (issue #274) :
 * chacun ajoute sa propre entrée à `X-Forwarded-For`, donc l'adresse cliente réelle
 * est la Nième en partant de la DROITE de cette liste, jamais la première — un
 * client malveillant peut préfixer l'en-tête avec n'importe quelle valeur. Par
 * défaut 1 (un unique reverse proxy — nginx/Caddy/load balancer — devant Node) ;
 * ajuster via TRUSTED_PROXY_COUNT si la topologie de déploiement diffère.
 */
function trustedProxyCount(): number {
  const raw = Number(process.env.TRUSTED_PROXY_COUNT);
  return Number.isInteger(raw) && raw >= 0 ? raw : 1;
}

/**
 * Adresse IP cliente pour la limitation de débit à la connexion (issue #274).
 * Ne doit jamais lever : retombe sur 'unknown' plutôt que de bloquer une requête
 * légitime faute d'en-tête exploitable — un compteur partagé sous 'unknown'
 * dégrade la précision de la limite sans jamais l'empêcher de s'appliquer.
 */
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const hops = forwardedFor.split(',').map((hop) => hop.trim()).filter(Boolean);
    const trusted = trustedProxyCount();
    const clientIndex = hops.length - trusted;
    const candidate = hops[clientIndex >= 0 ? clientIndex : 0];
    if (candidate) return candidate;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp?.trim()) return realIp.trim();
  return 'unknown';
}
