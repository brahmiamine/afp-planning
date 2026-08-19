import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { UserEntity } from '@/lib/db/schemas';
import { requireRole } from '@/lib/auth/require';
import { hashPassword } from '@/lib/auth/password';
import { isUserRole } from '@/lib/auth/roles';

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function serializeUser(user: UserEntity) {
  return {
    id: user.id,
    email: user.email,
    nom: user.nom,
    role: user.role,
    active: user.active,
    personNom: user.personNom,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['superadmin']);
  if ('error' in auth) {
    return auth.error;
  }

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
  if ('error' in auth) {
    return auth.error;
  }

  try {
    const body = await request.json();
    const { email, password, nom, role, personNom } = body;

    if (!email || typeof email !== 'string' || email.trim() === '') {
      return NextResponse.json({ error: 'L\'email est requis' }, { status: 400 });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 8 caractères' },
        { status: 400 },
      );
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
    const existing = await repo.findOneBy({ email: normalizedEmail });
    if (existing) {
      return NextResponse.json(
        { error: 'Un utilisateur avec cet email existe déjà' },
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
      personNom: typeof personNom === 'string' && personNom.trim() !== '' ? personNom.trim() : null,
      icalToken: randomBytes(24).toString('hex'),
    });

    const users = await repo.find({ order: { nom: 'ASC' } });
    return NextResponse.json({ success: true, data: { users: users.map(serializeUser) } });
  } catch (error) {
    console.error('Error creating user in DB:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
