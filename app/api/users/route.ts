import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { UserEntity } from '@/lib/db/schemas';
import { requireRole } from '@/lib/auth/require';
import { hashPassword } from '@/lib/auth/password';
import { normalizeRoles, readOnlyRolesOf } from '@/lib/auth/roles';
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

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['superadmin']);
  if ('error' in auth) return auth.error;

  try {
    const db = await getDb();
    const repo = db.getRepository<UserEntity>('User');
    const users = await repo.find({ order: { nom: 'ASC' } });
    return NextResponse.json({ users: users.map(serializeUser) });
  } catch (error) {
    console.error('Error reading users from DB:', error);
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['superadmin']);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const { email, password, nom, personNomByRole } = body;
    const roles = normalizeRoles(body.roles);

    if (!email || typeof email !== 'string' || email.trim() === '') {
      return NextResponse.json({ error: 'L\'email est requis' }, { status: 400 });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 8 caractères' }, { status: 400 });
    }
    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 });
    }
    if (roles.length === 0) {
      return NextResponse.json({ error: 'Au moins un rôle est requis' }, { status: 400 });
    }

    const db = await getDb();
    const repo = db.getRepository<UserEntity>('User');
    const normalizedEmail = email.trim().toLowerCase();
    if (await repo.findOneBy({ email: normalizedEmail })) {
      return NextResponse.json({ error: 'Un utilisateur avec cet email existe déjà' }, { status: 400 });
    }

    const personLinks = await resolvePersonLinksForRoles(db, readOnlyRolesOf(roles), parsePersonNomByRole(personNomByRole));
    if (personLinks === null) {
      return NextResponse.json(
        { error: 'Chaque rôle terrain doit être lié à une personne existante du planning' },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(password);
    await repo.save({
      email: normalizedEmail,
      passwordHash,
      nom: nom.trim(),
      roles,
      active: true,
      personLinks,
      icalToken: randomBytes(24).toString('hex'),
    });

    const users = await repo.find({ order: { nom: 'ASC' } });
    return NextResponse.json({ success: true, data: { users: users.map(serializeUser) } });
  } catch (error) {
    console.error('Error creating user in DB:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
