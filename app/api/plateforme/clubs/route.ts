import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ClubTenantEntity } from '@/lib/db/schemas';
import { requirePlatformAuth } from '@/lib/auth/platform-require';
import { DEFAULT_APP_SETTINGS } from '@/lib/settings';

const CLUB_ID_PATTERN = /^[a-z0-9-]{2,64}$/;

function serializeClub(club: ClubTenantEntity) {
  return {
    id: club.id,
    name: club.name,
    active: club.active,
    createdAt: club.createdAt,
    updatedAt: club.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requirePlatformAuth(request);
  if ('error' in auth) return auth.error;

  try {
    const db = await getDb();
    const repo = db.getRepository<ClubTenantEntity>('ClubTenant');
    const clubs = await repo.find({ order: { name: 'ASC' } });
    return NextResponse.json({ clubs: clubs.map(serializeClub) });
  } catch (error) {
    console.error('Error listing club tenants:', error);
    return NextResponse.json({ error: 'Impossible de charger les clubs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAuth(request);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const { id, name } = body;

    if (!id || typeof id !== 'string' || !CLUB_ID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: 'L\'identifiant du club doit contenir entre 2 et 64 caractères (lettres minuscules, chiffres, tirets)' },
        { status: 400 },
      );
    }
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'Le nom du club est requis' }, { status: 400 });
    }

    const db = await getDb();
    const repo = db.getRepository<ClubTenantEntity>('ClubTenant');
    const existing = await repo.findOneBy({ id });
    if (existing) {
      return NextResponse.json({ error: 'Un club avec cet identifiant existe déjà' }, { status: 409 });
    }

    const club = repo.create({
      id,
      name: name.trim(),
      description: DEFAULT_APP_SETTINGS.clubDescription,
      logo: DEFAULT_APP_SETTINGS.clubLogo,
      themeMode: DEFAULT_APP_SETTINGS.themeMode,
      primaryColor: DEFAULT_APP_SETTINGS.primaryColor,
      secondaryColor: DEFAULT_APP_SETTINGS.accentColor,
      timeZone: DEFAULT_APP_SETTINGS.timeZone,
      matchesUrlKey: '',
      scraperClubName: '',
      featuresJson: JSON.stringify(DEFAULT_APP_SETTINGS.features),
      smtpHost: null,
      smtpPort: null,
      smtpSecure: false,
      smtpUser: null,
      smtpPasswordEncrypted: null,
      smtpFromEmail: null,
      smtpFromName: null,
      active: true,
    });

    try {
      await repo.save(club);
    } catch {
      const concurrent = await repo.findOneBy({ id });
      if (concurrent) {
        return NextResponse.json({ error: 'Un club avec cet identifiant existe déjà' }, { status: 409 });
      }
      throw new Error('Impossible de créer le club');
    }

    return NextResponse.json({ success: true, club: serializeClub(club) });
  } catch (error) {
    console.error('Error creating club tenant:', error);
    return NextResponse.json({ error: 'Impossible de créer le club' }, { status: 500 });
  }
}
