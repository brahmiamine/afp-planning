import { getDb } from '@/lib/db';
import { isClubTenantActive } from '@/lib/db/club-tenants';
import { getPlanningRecordByTokenHash } from '@/lib/planning/records';
import { hashShareToken } from '@/lib/planning/public-share';
import { buildPwaMetadata, resolvePwaBranding, type PwaBranding } from '@/lib/pwa/branding';
import { readAppSettings } from '@/lib/settings-store';
import type { Metadata } from 'next';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,100}$/;

export interface PublicShareClubIdentity {
  clubId: string;
  name: string;
  branding: PwaBranding;
}

export async function resolvePublicShareClubIdentity(token: string): Promise<PublicShareClubIdentity | null> {
  if (!TOKEN_PATTERN.test(token)) return null;

  try {
    const db = await getDb();
    const share = await getPlanningRecordByTokenHash<{ expiresAt?: string }>(db, hashShareToken(token));
    if (!share || share.kind !== 'public-share') return null;
    if (share.payload.expiresAt && Date.parse(share.payload.expiresAt) <= Date.now()) return null;
    if (!(await isClubTenantActive(db, share.clubId))) return null;

    const [branding, settings] = await Promise.all([
      resolvePwaBranding(share.clubId),
      readAppSettings(db, share.clubId).catch(() => null),
    ]);
    const name = settings?.clubName?.trim() || branding.name.replace(/\s+Planning$/i, '').trim();
    if (!name) return null;

    return { clubId: share.clubId, name, branding };
  } catch {
    return null;
  }
}

export async function buildPublicShareMetadata(token: string): Promise<Metadata> {
  const identity = await resolvePublicShareClubIdentity(token);
  if (!identity) {
    return { title: 'Planning partagé' };
  }

  return {
    ...buildPwaMetadata(identity.branding),
    title: identity.name,
    applicationName: identity.name,
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: identity.name,
    },
  };
}
