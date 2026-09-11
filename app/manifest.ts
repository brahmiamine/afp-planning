import type { MetadataRoute } from 'next';
import { CLUBIKA_APP_ICON, CLUBIKA_APP_ICON_512, resolvePwaBranding } from '@/lib/pwa/branding';

export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await resolvePwaBranding();

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
        src: CLUBIKA_APP_ICON,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: CLUBIKA_APP_ICON,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: CLUBIKA_APP_ICON_512,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: CLUBIKA_APP_ICON_512,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
