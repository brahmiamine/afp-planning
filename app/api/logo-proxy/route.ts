import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy d'images même-origine, utilisé pour la carte de partage d'un match : les
 * logos des clubs proviennent de serveurs distants sans en-têtes CORS, ce qui
 * empêche de les dessiner dans un `<canvas>` (`crossOrigin = "anonymous"` échoue).
 * Le proxy récupère l'image côté serveur et la renvoie depuis notre origine.
 *
 * Garde-fous SSRF : http/https uniquement, hôtes privés/loopback bloqués, type
 * `image/*` obligatoire, taille plafonnée, timeout court.
 */

const MAX_BYTES = 3 * 1024 * 1024;

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host === '::1' || host === '[::1]') {
    return true;
  }
  if (/^(10|127)\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(host) || host.startsWith('fe80:')) return true;
  return false;
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('url');
  if (!raw) return NextResponse.json({ error: 'Paramètre url manquant' }, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: 'URL invalide' }, { status: 400 });
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return NextResponse.json({ error: 'Protocole non autorisé' }, { status: 400 });
  }
  if (isBlockedHost(target.hostname)) {
    return NextResponse.json({ error: 'Hôte non autorisé' }, { status: 400 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      redirect: 'follow',
      headers: { Accept: 'image/*', 'User-Agent': 'PlanningClub/1.0 (+logo-proxy)' },
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: `Amont ${upstream.status}` }, { status: 502 });
    }
    const contentType = upstream.headers.get('content-type') ?? '';
    if (!/^image\//i.test(contentType)) {
      return NextResponse.json({ error: 'La ressource distante n’est pas une image' }, { status: 415 });
    }
    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Image trop volumineuse' }, { status: 413 });
    }
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('logo-proxy failed:', error);
    return NextResponse.json({ error: 'Récupération de l’image impossible' }, { status: 502 });
  }
}
