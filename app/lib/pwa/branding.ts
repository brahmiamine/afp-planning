import { createHash } from 'node:crypto';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { getSessionUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import type { ClubTenantEntity } from '@/lib/db/schemas';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '@/lib/settings';
import { readAppSettings } from '@/lib/settings-store';

/** Identifiant réservé pour l'icône et les métadonnées produit (hors club). */
export const APP_PRODUCT_CLUB_ID = 'clubika';

export interface PwaBranding {
  clubId: string;
  name: string;
  shortName: string;
  description: string;
  logo: string;
  /** Version monochrome (silhouette blanche) utilisée pour l'icône de la barre de statut Android/iOS. */
  badgeLogo: string;
  primaryColor: string;
  backgroundColor: string;
  iconVersion: string;
}

function buildShortName(clubName: string): string {
  const fullName = `${clubName} Planning`;
  if (fullName.length <= 22) return fullName;

  const initials = clubName
    .split(/\s+/)
    .map((word) => word.trim().charAt(0))
    .join('')
    .replace(/[^A-Za-zÀ-ÿ]/g, '')
    .toUpperCase()
    .slice(0, 6);

  return `${initials || 'Club'} Planning`;
}

function buildIconVersion(logo: string, primaryColor: string): string {
  return createHash('sha1')
    .update(`${logo}|${primaryColor}`)
    .digest('hex')
    .slice(0, 10);
}

function normalizeClubId(value: string | undefined): string | null {
  const candidate = value?.trim();
  return candidate && /^[A-Za-z0-9_-]{1,64}$/.test(candidate) ? candidate : null;
}

function toBranding(clubId: string, settings: Pick<AppSettings, 'clubName' | 'clubDescription' | 'clubLogo' | 'primaryColor'>): PwaBranding {
  return {
    clubId,
    name: `${settings.clubName} Planning`,
    shortName: buildShortName(settings.clubName),
    description: settings.clubDescription,
    logo: settings.clubLogo,
    // Les logos de club (blasons) n'ont pas de fond transparent fiable : Android/iOS
    // affichent le badge de la barre de statut à partir du seul canal alpha, donc un
    // logo opaque devient un carré blanc plein. On utilise toujours la silhouette
    // monochrome générique de l'app pour ce badge.
    badgeLogo: '/branding/icon.png',
    primaryColor: settings.primaryColor,
    backgroundColor: '#ffffff',
    iconVersion: buildIconVersion(settings.clubLogo, settings.primaryColor),
  };
}

/**
 * Identité visuelle propre à l'application Clubika, indépendante de tout club.
 * Utilisée sur `/login` et les autres écrans hors session.
 */
export function resolveAppProductBranding(): PwaBranding {
  const primaryColor = DEFAULT_APP_SETTINGS.primaryColor;

  return {
    clubId: APP_PRODUCT_CLUB_ID,
    name: 'Clubika',
    shortName: 'Clubika',
    description:
      'Planning et communication pour les clubs de football amateurs : matchs, entraînements, affectations et notifications.',
    logo: '/branding/clubika-icon.png',
    badgeLogo: '/branding/icon.png',
    primaryColor,
    backgroundColor: '#ffffff',
    iconVersion: buildIconVersion(APP_PRODUCT_CLUB_ID, primaryColor),
  };
}

export function buildPwaMetadata(branding: PwaBranding): Metadata {
  const iconUrl = `/api/pwa/icon?clubId=${encodeURIComponent(branding.clubId)}&size=192&variant=plain&v=${branding.iconVersion}`;
  const iconUrl512 = `/api/pwa/icon?clubId=${encodeURIComponent(branding.clubId)}&size=512&variant=plain&v=${branding.iconVersion}`;

  return {
    title: branding.name,
    description: branding.description,
    applicationName: branding.shortName,
    icons: {
      icon: [
        { url: iconUrl, sizes: '192x192', type: 'image/png' },
        { url: iconUrl512, sizes: '512x512', type: 'image/png' },
      ],
      apple: [{ url: iconUrl, sizes: '192x192', type: 'image/png' }],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: branding.shortName,
    },
  };
}

async function readExistingTenantBranding(clubId: string): Promise<PwaBranding | null> {
  try {
    const db = await getDb();
    const tenant = await db.getRepository<ClubTenantEntity>('ClubTenant').findOneBy({ id: clubId, active: true });
    if (!tenant) return null;

    return toBranding(clubId, {
      clubName: tenant.name,
      clubDescription: tenant.description,
      clubLogo: tenant.logo,
      primaryColor: tenant.primaryColor,
    });
  } catch {
    return null;
  }
}

export async function resolvePwaBranding(clubIdOverride?: string): Promise<PwaBranding> {
  const requestedClubId = normalizeClubId(clubIdOverride);
  if (requestedClubId) {
    if (requestedClubId === APP_PRODUCT_CLUB_ID) {
      return resolveAppProductBranding();
    }

    const existing = await readExistingTenantBranding(requestedClubId);
    return existing ?? toBranding(requestedClubId, DEFAULT_APP_SETTINGS);
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const sessionUser = await getSessionUser(sessionToken).catch(() => null);
  const clubId = sessionUser?.clubId || process.env.APP_CLUB_ID || 'afp';

  try {
    const db = await getDb();
    const settings = await readAppSettings(db, clubId);
    return toBranding(clubId, settings);
  } catch {
    // Le manifeste doit rester disponible même si la DB est momentanément indisponible.
    return toBranding(clubId, DEFAULT_APP_SETTINGS);
  }
}
