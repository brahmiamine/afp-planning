import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ClubTenantEntity } from '@/lib/db/schemas';
import { requirePlatformAuth } from '@/lib/auth/platform-require';
import { readAppSettings } from '@/lib/settings-store';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const auth = await requirePlatformAuth(request);
  if ('error' in auth) return auth.error;

  try {
    const { id } = params instanceof Promise ? await params : params;
    const db = await getDb();
    const repo = db.getRepository<ClubTenantEntity>('ClubTenant');
    const club = await repo.findOneBy({ id });
    if (!club) {
      return NextResponse.json({ error: 'Club non trouvé' }, { status: 404 });
    }

    const settings = await readAppSettings(db, id);
    return NextResponse.json({
      club: {
        id: club.id,
        active: club.active,
        createdAt: club.createdAt,
        updatedAt: club.updatedAt,
        settings,
      },
    });
  } catch (error) {
    console.error('Error reading club tenant:', error);
    return NextResponse.json({ error: 'Impossible de charger le club' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const auth = await requirePlatformAuth(request);
  if ('error' in auth) return auth.error;

  try {
    const { id } = params instanceof Promise ? await params : params;
    const db = await getDb();
    const repo = db.getRepository<ClubTenantEntity>('ClubTenant');
    const club = await repo.findOneBy({ id });
    if (!club) {
      return NextResponse.json({ error: 'Club non trouvé' }, { status: 404 });
    }

    const body = await request.json();
    const { name, active } = body;

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return NextResponse.json({ error: 'Le nom du club est requis' }, { status: 400 });
      }
      club.name = name.trim();
    }
    if (active !== undefined) {
      if (typeof active !== 'boolean') {
        return NextResponse.json({ error: 'Le statut actif doit être un booléen' }, { status: 400 });
      }
      club.active = active;
    }

    await repo.save(club);

    return NextResponse.json({
      success: true,
      club: {
        id: club.id,
        name: club.name,
        active: club.active,
        createdAt: club.createdAt,
        updatedAt: club.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error updating club tenant:', error);
    return NextResponse.json({ error: 'Impossible de mettre à jour le club' }, { status: 500 });
  }
}
