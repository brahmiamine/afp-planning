import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { AuthUserEntity } from '@/lib/db/auth-schema';
import { getSuperAdminSession } from '@/lib/auth/server';
import { hashPassword } from '@/lib/auth/password';
import { normalizeEmail, resolvePerson } from '@/lib/auth/users';
import { isPersonRole, type AuthUserSummary, type PersonOptionsByRole } from '@/types/auth';

function serializeUser(user: AuthUserEntity): AuthUserSummary {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    personId: user.personId,
    personName: user.personName,
    active: user.active,
    editable: user.role !== 'SUPER_ADMIN',
  };
}

async function getOptions(): Promise<PersonOptionsByRole> {
  const db = await getDb();
  const [officiels, encadrants, accompagnateurs] = await Promise.all([
    db.getRepository('Officiel').find({ order: { nom: 'ASC' } }),
    db.getRepository('Encadrant').find({ order: { nom: 'ASC' } }),
    db.getRepository('Accompagnateur').find({ order: { nom: 'ASC' } }),
  ]);

  return {
    ARBITRE: officiels.map((item) => ({ id: Number(item.id), nom: String(item.nom) })),
    ENCADRANT: encadrants.map((item) => ({ id: Number(item.id), nom: String(item.nom) })),
    ACCOMPAGNATEUR: accompagnateurs.map((item) => ({ id: Number(item.id), nom: String(item.nom) })),
  };
}

async function requireAdmin() {
  return getSuperAdminSession();
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const db = await getDb();
  const repo = db.getRepository<AuthUserEntity>('AuthUser');
  const [users, options] = await Promise.all([
    repo.find({ order: { role: 'ASC', email: 'ASC' } }),
    getOptions(),
  ]);

  return NextResponse.json({
    users: users.map(serializeUser),
    options,
  });
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const role = body?.role;
  const personId = Number(body?.personId);

  if (!email || !password || !isPersonRole(role) || !Number.isInteger(personId) || personId <= 0) {
    return NextResponse.json(
      { error: 'Email, mot de passe, rôle et personne sont requis' },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: 'Le mot de passe doit contenir au moins 8 caractères' },
      { status: 400 },
    );
  }

  const person = await resolvePerson(role, personId);
  if (!person) {
    return NextResponse.json({ error: 'Personne introuvable' }, { status: 400 });
  }

  const db = await getDb();
  const repo = db.getRepository<AuthUserEntity>('AuthUser');

  if (await repo.findOneBy({ email })) {
    return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 409 });
  }

  if (await repo.findOneBy({ role, personId })) {
    return NextResponse.json(
      { error: 'Cette personne possède déjà un compte pour ce rôle' },
      { status: 409 },
    );
  }

  const user = repo.create({
    email,
    passwordHash: await hashPassword(password),
    role,
    personId,
    personName: person.nom,
    active: true,
  });

  await repo.save(user);

  return NextResponse.json({ user: serializeUser(user) }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const id = Number(body?.id);

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
  }

  const db = await getDb();
  const repo = db.getRepository<AuthUserEntity>('AuthUser');
  const user = await repo.findOneBy({ id });

  if (!user) {
    return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 });
  }

  if (user.role === 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'Le compte Super Admin est géré par la configuration serveur' },
      { status: 403 },
    );
  }

  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : user.email;
  const role = body?.role ?? user.role;
  const personId = body?.personId === undefined ? user.personId : Number(body.personId);

  if (!email || !isPersonRole(role) || !Number.isInteger(personId) || Number(personId) <= 0) {
    return NextResponse.json({ error: 'Données de compte invalides' }, { status: 400 });
  }

  const numericPersonId = Number(personId);
  const person = await resolvePerson(role, numericPersonId);
  if (!person) {
    return NextResponse.json({ error: 'Personne introuvable' }, { status: 400 });
  }

  const emailConflict = await repo.findOneBy({ email });
  if (emailConflict && emailConflict.id !== user.id) {
    return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 409 });
  }

  const personConflict = await repo.findOneBy({ role, personId: numericPersonId });
  if (personConflict && personConflict.id !== user.id) {
    return NextResponse.json(
      { error: 'Cette personne possède déjà un compte pour ce rôle' },
      { status: 409 },
    );
  }

  user.email = email;
  user.role = role;
  user.personId = numericPersonId;
  user.personName = person.nom;

  if (typeof body?.active === 'boolean') {
    user.active = body.active;
  }

  if (typeof body?.password === 'string' && body.password.length > 0) {
    if (body.password.length < 8) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 8 caractères' },
        { status: 400 },
      );
    }
    user.passwordHash = await hashPassword(body.password);
  }

  await repo.save(user);

  return NextResponse.json({ user: serializeUser(user) });
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const id = Number(request.nextUrl.searchParams.get('id'));

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
  }

  const db = await getDb();
  const repo = db.getRepository<AuthUserEntity>('AuthUser');
  const user = await repo.findOneBy({ id });

  if (!user) {
    return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 });
  }

  if (user.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Le compte Super Admin ne peut pas être supprimé' }, { status: 403 });
  }

  await repo.remove(user);
  return NextResponse.json({ success: true });
}
