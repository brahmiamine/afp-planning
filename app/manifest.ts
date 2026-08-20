import type { MetadataRoute } from 'next';
import { resolvePwaBranding } from '@/lib/pwa/branding';

export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await resolvePwaBranding();
  const iconBase = `/api/pwa/icon?clubId=${encodeURIComponent(branding.clubId)}&v=${branding.iconVersion}`;

  return {
    id: '/',
    name: branding.name,
    short_name: branding.shortName,
    description: branding.description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: branding.backgroundColor,
    theme_color: branding.primaryColor,
    categories: ['sports', 'productivity'],
    icons: [
      {
        src: `${iconBase}&size=192`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${iconBase}&size=192`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: `${iconBase}&size=512`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${iconBase}&size=512`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
