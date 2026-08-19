import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserEntity } from './schemas';
import { hashPassword } from '@/lib/auth/password';
import { isReadOnlyRole, isUserRole } from '@/lib/auth/roles';
import { resolvePersonLinkForRole } from '@/lib/planning/person-link';

export async function ensureSuperadminBootstrap(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository<UserEntity>('User');
  const count = await repo.count();
  if (count > 0) return;

  const email = process.env.BOOTSTRAP_SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_SUPERADMIN_PASSWORD;
  if (!email || !password) {
    console.warn(
      '[bootstrap] Aucun utilisateur en base et BOOTSTRAP_SUPERADMIN_EMAIL/BOOTSTRAP_SUPERADMIN_PASSWORD ne sont pas définis — personne ne peut se connecter.',
    );
    return;
  }

  const passwordHash = await hashPassword(password);
  await repo.save({
    email,
    passwordHash,
    nom: 'Superadmin',
    role: 'superadmin',
    active: true,
    personNom: null,
    personType: null,
    personId: null,
    icalToken: randomBytes(24).toString('hex'),
  });

  console.warn(
    '[bootstrap] Superadministrateur initial créé depuis BOOTSTRAP_SUPERADMIN_EMAIL. Pensez à retirer ces variables une fois la première connexion effectuée.',
  );
}

export async function ensureStablePersonLinks(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository<UserEntity>('User');
  const users = await repo.find();

  for (const user of users) {
    if (!isUserRole(user.role) || !isReadOnlyRole(user.role)) continue;
    if (user.personId !== null && user.personType) continue;
    if (!user.personNom) continue;

    const link = await resolvePersonLinkForRole(dataSource, user.role, { personNom: user.personNom });
    if (!link) continue;

    user.personId = link.personId;
    user.personType = link.personType;
    user.personNom = link.personNom;
    await repo.save(user);
  }
}
