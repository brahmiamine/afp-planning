import { getDb } from '@/lib/db';
import type { AuthUserEntity } from '@/lib/db/auth-schema';
import { hashPassword } from '@/lib/auth/password';
import type { PersonRole } from '@/types/auth';

const PERSON_REPOSITORIES: Record<PersonRole, string> = {
  ARBITRE: 'Officiel',
  ENCADRANT: 'Encadrant',
  ACCOMPAGNATEUR: 'Accompagnateur',
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function ensureBootstrapSuperAdmin(): Promise<void> {
  const db = await getDb();
  const repo = db.getRepository<AuthUserEntity>('AuthUser');
  const existing = await repo.findOneBy({ role: 'SUPER_ADMIN' });

  if (existing) {
    return;
  }

  const email = normalizeEmail(process.env.SUPERADMIN_EMAIL ?? '');
  const password = process.env.SUPERADMIN_PASSWORD ?? '';

  if (!email || !password) {
    throw new Error('SUPERADMIN_EMAIL et SUPERADMIN_PASSWORD doivent être configurés');
  }

  const existingEmail = await repo.findOneBy({ email });
  if (existingEmail) {
    throw new Error('SUPERADMIN_EMAIL est déjà utilisé par un autre compte');
  }

  const passwordHash = await hashPassword(password);
  await repo.save(
    repo.create({
      email,
      passwordHash,
      role: 'SUPER_ADMIN',
      personId: null,
      personName: null,
      active: true,
    }),
  );
}

export async function getAuthUserById(id: number): Promise<AuthUserEntity | null> {
  const db = await getDb();
  return db.getRepository<AuthUserEntity>('AuthUser').findOneBy({ id });
}

export async function getAuthUserByEmail(email: string): Promise<AuthUserEntity | null> {
  const db = await getDb();
  return db.getRepository<AuthUserEntity>('AuthUser').findOneBy({ email: normalizeEmail(email) });
}

export async function resolvePerson(
  role: PersonRole,
  personId: number,
): Promise<{ id: number; nom: string } | null> {
  const db = await getDb();
  const repo = db.getRepository(PERSON_REPOSITORIES[role]);
  const person = await repo.findOneBy({ id: personId });

  if (!person) {
    return null;
  }

  return {
    id: Number(person.id),
    nom: String(person.nom),
  };
}
