import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { resolvePwaBranding } from '@/lib/pwa/branding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function requestedSize(value: string | null): 192 | 512 {
  return value === '512' ? 512 : 192;
}

function clubInitials(name: string): string {
  const initials = name
    .replace(/\s+Planning$/i, '')
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join('')
    .replace(/[^A-Za-zÀ-ÿ]/g, '')
    .toUpperCase()
    .slice(0, 4);
  return initials || 'AFP';
}

function resolveLogoSrc(logo: string, request: NextRequest): string | null {
  if (!logo) return null;
  if (logo.startsWith('data:image/')) return logo;
  if (/^https?:\/\//i.test(logo)) return logo;
  if (logo.startsWith('/')) return new URL(logo, request.url).toString();
  return null;
}

export async function GET(request: NextRequest) {
  const size = requestedSize(request.nextUrl.searchParams.get('size'));
  const clubId = request.nextUrl.searchParams.get('clubId') ?? undefined;
  const branding = await resolvePwaBranding(clubId);
  const logo = resolveLogoSrc(branding.logo, request);
  const inset = Math.round(size * 0.17);
  const logoSize = size - inset * 2;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: branding.primaryColor,
          borderRadius: Math.round(size * 0.22),
        }}
      >
        <div
          style={{
            width: logoSize,
            height: logoSize,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            borderRadius: Math.round(size * 0.18),
            background: '#ffffff',
          }}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt=""
              width={logoSize}
              height={logoSize}
              style={{ width: '82%', height: '82%', objectFit: 'contain' }}
            />
          ) : (
            <span
              style={{
                display: 'flex',
                color: branding.primaryColor,
                fontSize: Math.round(size * 0.23),
                fontWeight: 800,
                letterSpacing: '-0.04em',
              }}
            >
              {clubInitials(branding.name)}
            </span>
          )}
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
  );
}
