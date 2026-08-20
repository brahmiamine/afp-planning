import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { UserEntity } from '@/lib/db/schemas';
import { requireRole } from '@/lib/auth/require';
import { hashPassword } from '@/lib/auth/password';
import { normalizeRoles, readOnlyRolesOf } from '@/lib/auth/roles';
import { revokeAllSessionsForUser } from '@/lib/auth/session';
import { resolvePersonLinksForRoles } from '@/lib/planning/person-link';
import type { UserRole } from '@/lib/auth/roles';

function serializeUser(user: UserEntity) {
  return {
    id: user.id,
    email: user.email,
    nom: user.nom,
    roles: user.roles,
    active: user.active,
    personLinks: user.personLinks,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function parsePersonNomByRole(value: unknown): Partial<Record<UserRole, string | null>> {
  if (!value || typeof value !== 'object') return {};
  return value as Partial<Record<UserRole, string | null>>;
}

async function countActiveSuperadmins(repo: ReturnType<typeof getRepo>): Promise<number> {
  const users = await repo.find({ where: { active: true } });
  return users.filter((user) => user.roles.includes('superadmin')).length;
}

function getRepo(db: Awaited<ReturnType<typeof getDb>>) {
  return db.getRepository<UserEntity>('User');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireRole(request, ['superadmin']);
  if ('error' in auth) return auth.error;

  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const id = Number.parseInt(resolvedParams.id, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const db = await getDb();
    const repo = getRepo(db);
    const user = await repo.findOneBy({ id });
    if (!user) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });

    const body = await request.json();
    const { nom, active, personNomByRole, password } = body;
    const nextRoles = body.roles !== undefined ? normalizeRoles(body.roles) : normalizeRoles(user.roles);
    const nextActive = typeof active === 'boolean' ? active : user.active;

    if (nextRoles.length === 0) {
      return NextResponse.json({ error: 'Au moins un rôle est requis' }, { status: 400 });
    }

    const wasSuperadmin = user.roles.includes('superadmin');
    const staysSuperadmin = nextRoles.includes('superadmin');
    if (wasSuperadmin && (!staysSuperadmin || !nextActive)) {
      const activeSuperadmins = await countActiveSuperadmins(repo);
      if (activeSuperadmins <= 1) {
        return NextResponse.json(
          { error: 'Impossible de désactiver ou rétrograder le dernier superadministrateur' },
          { status: 400 },
        );
      }
    }

    const personLinks = await resolvePersonLinksForRoles(
      db,
      readOnlyRolesOf(nextRoles),
      parsePersonNomByRole(personNomByRole),
    );
    if (personLinks === null) {
      return NextResponse.json(
        { error: 'Chaque rôle terrain doit être lié à une personne existante du planning' },
        { status: 400 },
      );
    }

    if (typeof nom === 'string' && nom.trim() !== '') user.nom = nom.trim();
    user.roles = nextRoles;
    user.active = nextActive;
    user.personLinks = personLinks;

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

    const users = await repo.find({ order: { nom: 'ASC' } });
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
  const auth = await requireRole(request, ['superadmin']);
  if ('error' in auth) return auth.error;

  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const id = Number.parseInt(resolvedParams.id, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    const db = await getDb();
    const repo = getRepo(db);
    const user = await repo.findOneBy({ id });
    if (!user) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });

    if (user.roles.includes('superadmin')) {
      const activeSuperadmins = await countActiveSuperadmins(repo);
      if (activeSuperadmins <= 1) {
        return NextResponse.json(
          { error: 'Impossible de supprimer le dernier superadministrateur' },
          { status: 400 },
        );
      }
    }

    await revokeAllSessionsForUser(id);
    await repo.remove(user);

    const users = await repo.find({ order: { nom: 'ASC' } });
    return NextResponse.json({ success: true, data: { users: users.map(serializeUser) } });
  } catch (error) {
    console.error('Error deleting user in DB:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
