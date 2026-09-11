/** Header interne : le proxy recopie `?clubId=` du manifeste pour le crawler WebAPK (sans cookie). */
export const PWA_CLUB_ID_HEADER = 'x-pwa-club-id';

export function normalizePwaClubId(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  return candidate && /^[A-Za-z0-9_-]{1,64}$/.test(candidate) ? candidate : null;
}

export function clubIdFromRequestHeaders(getHeader: (name: string) => string | null): string | undefined {
  return normalizePwaClubId(getHeader(PWA_CLUB_ID_HEADER)) ?? undefined;
}

export function buildPwaIconUrl(options: {
  clubId: string;
  size: 192 | 512;
  variant?: 'plain' | 'badge';
  version?: string;
}): string {
  const params = new URLSearchParams({
    clubId: options.clubId,
    size: String(options.size),
    variant: options.variant ?? 'plain',
  });
  if (options.version) params.set('v', options.version);
  return `/api/pwa/icon?${params.toString()}`;
}

export function buildPwaManifestIcons(clubId: string, version: string) {
  return [
    {
      src: buildPwaIconUrl({ clubId, size: 192, variant: 'plain', version }),
      sizes: '192x192',
      type: 'image/png' as const,
      purpose: 'any' as const,
    },
    {
      src: buildPwaIconUrl({ clubId, size: 192, variant: 'badge', version }),
      sizes: '192x192',
      type: 'image/png' as const,
      purpose: 'maskable' as const,
    },
    {
      src: buildPwaIconUrl({ clubId, size: 512, variant: 'plain', version }),
      sizes: '512x512',
      type: 'image/png' as const,
      purpose: 'any' as const,
    },
    {
      src: buildPwaIconUrl({ clubId, size: 512, variant: 'badge', version }),
      sizes: '512x512',
      type: 'image/png' as const,
      purpose: 'maskable' as const,
    },
  ];
}
