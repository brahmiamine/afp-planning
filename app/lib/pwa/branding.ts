import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { getSessionUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { DEFAULT_APP_SETTINGS } from '@/lib/settings';
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

export async function resolvePwaBranding(clubIdOverride?: string): Promise<PwaBranding> {
  const requestedClubId = normalizeClubId(clubIdOverride);
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const sessionUser = await getSessionUser(sessionToken).catch(() => null);
  const clubId = requestedClubId || sessionUser?.clubId || process.env.APP_CLUB_ID || 'afp';

  let settings = DEFAULT_APP_SETTINGS;
  try {
    const db = await getDb();
    settings = await readAppSettings(db, clubId);
  } catch {
    // Le manifeste et les icônes doivent rester disponibles même si la DB est momentanément indisponible.
  }

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
