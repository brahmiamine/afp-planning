import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { UserEntity } from '@/lib/db/schemas';
import { requireRole } from '@/lib/auth/require';
import { hashPassword } from '@/lib/auth/password';
import { normalizeRoles } from '@/lib/auth/roles';
import { revokeAllSessionsForUser } from '@/lib/auth/session';
import { setCurrentClubId } from '@/lib/auth/club-context';

function serializeUser(user: UserEntity) {
  return {
    id: user.id,
    email: user.email,
    nom: user.nom,
    roles: user.roles,
    active: user.active,
    telephone: user.telephone,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function countActiveAdmins(repo: ReturnType<typeof getRepo>, clubId: string): Promise<number> {
  const users = await repo.find({ where: { active: true, clubId } });
  return users.filter((user) => user.roles.includes('admin')).length;
}

function getRepo(db: Awaited<ReturnType<typeof getDb>>) {
  return db.getRepository<UserEntity>('User');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireRole(request, ['admin']);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const id = Number.parseInt(resolvedParams.id, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const db = await getDb();
    const repo = getRepo(db);
    const user = await repo.findOneBy({ id, clubId: auth.user.clubId });
    if (!user) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });

    const body = await request.json();
    const { nom, active, telephone, password } = body;
    const nextRoles = body.roles !== undefined ? normalizeRoles(body.roles) : normalizeRoles(user.roles);
    const nextActive = typeof active === 'boolean' ? active : user.active;

    if (nextRoles.length === 0) {
      return NextResponse.json({ error: 'Au moins un rôle est requis' }, { status: 400 });
    }

    const wasAdmin = user.roles.includes('admin');
    const staysAdmin = nextRoles.includes('admin');
    if (wasAdmin && (!staysAdmin || !nextActive)) {
      const activeAdmins = await countActiveAdmins(repo, auth.user.clubId);
      if (activeAdmins <= 1) {
        return NextResponse.json(
          { error: 'Impossible de désactiver ou rétrograder le dernier administrateur' },
          { status: 400 },
        );
      }
    }

    if (typeof nom === 'string' && nom.trim() !== '') user.nom = nom.trim();
    user.roles = nextRoles;
    user.active = nextActive;
    if (typeof telephone === 'string') user.telephone = telephone.trim() || null;

    if (typeof password === 'string' && password.length > 0) {
      if (password.length < 8) {
        return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 8 caractères' }, { status: 400 });
      }
      user.passwordHash = await hashPassword(password);
    }

    await repo.save(user);

    if (!user.active || (typeof password === 'string' && password.length > 0)) {
      await revokeAllSessionsForUser(user.id);
    }

    const users = await repo.find({ where: { clubId: auth.user.clubId }, order: { nom: 'ASC' } });
    return NextResponse.json({ success: true, data: { users: users.map(serializeUser) } });
  } catch (error) {
    console.error('Error updating user in DB:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireRole(request, ['admin']);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const id = Number.parseInt(resolvedParams.id, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const db = await getDb();
    const repo = getRepo(db);
    const user = await repo.findOneBy({ id, clubId: auth.user.clubId });
    if (!user) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });

    if (user.roles.includes('admin')) {
      const activeAdmins = await countActiveAdmins(repo, auth.user.clubId);
      if (activeAdmins <= 1) {
        return NextResponse.json(
          { error: 'Impossible de supprimer le dernier administrateur' },
          { status: 400 },
        );
      }
    }

    await revokeAllSessionsForUser(id);
    await repo.remove(user);

    const users = await repo.find({ where: { clubId: auth.user.clubId }, order: { nom: 'ASC' } });
    return NextResponse.json({ success: true, data: { users: users.map(serializeUser) } });
  } catch (error) {
    console.error('Error deleting user in DB:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
