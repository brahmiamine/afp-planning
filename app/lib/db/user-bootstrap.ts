import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserEntity } from './schemas';
import { hashPassword } from '@/lib/auth/password';

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
    roles: ['superadmin'],
    active: true,
    personLinks: [],
    icalToken: randomBytes(24).toString('hex'),
  });

  console.warn(
    '[bootstrap] Superadministrateur initial créé depuis BOOTSTRAP_SUPERADMIN_EMAIL. Pensez à retirer ces variables une fois la première connexion effectuée.',
  );
}
