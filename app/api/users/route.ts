import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { UserEntity } from '@/lib/db/schemas';
import { requireRole } from '@/lib/auth/require';
import { hashPassword } from '@/lib/auth/password';
import { isReadOnlyRole, isUserRole } from '@/lib/auth/roles';
import { resolvePersonLinkForRole } from '@/lib/planning/person-link';
import type { PersonType } from '@/types/match';

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isPersonType(value: unknown): value is PersonType {
  return value === 'officiel' || value === 'encadrant' || value === 'accompagnateur';
}

function serializeUser(user: UserEntity) {
  return {
    id: user.id,
    email: user.email,
    nom: user.nom,
    role: user.role,
    active: user.active,
    personNom: user.personNom,
    personType: user.personType,
    personId: user.personId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
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
    const { email, password, nom, role, personNom, personId, personType } = body;

    if (!email || typeof email !== 'string' || email.trim() === '') {
      return NextResponse.json({ error: 'L\'email est requis' }, { status: 400 });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 8 caractères' }, { status: 400 });
    }
    if (!nom || typeof nom !== 'string' || nom.trim() === '') {
      return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 });
    }
    if (!isUserRole(role)) {
      return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 });
    }

    const db = await getDb();
    const repo = db.getRepository<UserEntity>('User');
    const normalizedEmail = normalizeEmail(email);
    if (await repo.findOneBy({ email: normalizedEmail })) {
      return NextResponse.json({ error: 'Un utilisateur avec cet email existe déjà' }, { status: 400 });
    }

    const link = await resolvePersonLinkForRole(db, role, {
      personNom: typeof personNom === 'string' ? personNom : null,
      personId: typeof personId === 'number' ? personId : null,
      personType: isPersonType(personType) ? personType : null,
    });

    if (isReadOnlyRole(role) && !link) {
      return NextResponse.json(
        { error: 'Ce rôle doit être lié à une personne existante du planning' },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(password);
    await repo.save({
      email: normalizedEmail,
      passwordHash,
      nom: nom.trim(),
      role,
      active: true,
      personNom: link?.personNom ?? null,
      personType: link?.personType ?? null,
      personId: link?.personId ?? null,
      icalToken: randomBytes(24).toString('hex'),
    });

    const users = await repo.find({ order: { nom: 'ASC' } });
    return NextResponse.json({ success: true, data: { users: users.map(serializeUser) } });
  } catch (error) {
    console.error('Error creating user in DB:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
