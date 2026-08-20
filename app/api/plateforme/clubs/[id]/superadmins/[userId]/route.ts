import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { UserEntity } from '@/lib/db/schemas';
import { requirePlatformAuth } from '@/lib/auth/platform-require';
import { revokeAllSessionsForUser } from '@/lib/auth/session';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> | { id: string; userId: string } },
) {
  const auth = await requirePlatformAuth(request);
  if ('error' in auth) return auth.error;

  try {
    const { id, userId } = params instanceof Promise ? await params : params;
    const parsedUserId = Number.parseInt(userId, 10);
    if (!Number.isFinite(parsedUserId)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const body = await request.json();
    const { active } = body;
    if (typeof active !== 'boolean') {
      return NextResponse.json({ error: 'Le statut actif doit être un booléen' }, { status: 400 });
    }

    const db = await getDb();
    const repo = db.getRepository<UserEntity>('User');
    const user = await repo.findOneBy({ id: parsedUserId });
    if (!user || user.clubId !== id) {
      return NextResponse.json({ error: 'Superadministrateur non trouvé' }, { status: 404 });
    }
    if (!Array.isArray(user.roles) || !user.roles.includes('superadmin')) {
      return NextResponse.json({ error: 'Cet utilisateur n\'est pas superadministrateur' }, { status: 400 });
    }

    user.active = active;
    await repo.save(user);

    if (!active) {
      await revokeAllSessionsForUser(user.id);
    }

    return NextResponse.json({
      success: true,
      superadmin: {
        id: user.id,
        email: user.email,
        nom: user.nom,
        active: user.active,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Error updating club superadmin:', error);
    return NextResponse.json({ error: 'Impossible de mettre à jour le superadministrateur' }, { status: 500 });
  }
}
