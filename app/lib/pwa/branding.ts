import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { getSessionUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import type { ClubTenantEntity } from '@/lib/db/schemas';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '@/lib/settings';
import { readAppSettings } from '@/lib/settings-store';

export interface PwaBranding {
  clubId: string;
  name: string;
  shortName: string;
  description: string;
  logo: string;
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
    primaryColor: settings.primaryColor,
    backgroundColor: '#ffffff',
    iconVersion: buildIconVersion(settings.clubLogo, settings.primaryColor),
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
