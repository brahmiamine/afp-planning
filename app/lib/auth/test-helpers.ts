import { randomBytes } from 'node:crypto';
import { getDb } from '@/lib/db';
import { UserEntity } from '@/lib/db/schemas';
import { hashPassword } from './password';
import { createSession } from './session';
import type { UserRole } from './roles';

export async function createTestUserAndSession(role: UserRole, overrides?: Partial<UserEntity>) {
  const db = await getDb();
  const userRepo = db.getRepository<UserEntity>('User');

  const user = await userRepo.save({
    email: `test-${role}-${Date.now()}-${randomBytes(4).toString('hex')}@example.com`,
    passwordHash: await hashPassword('test-password-123'),
    nom: `Test ${role}`,
    roles: [role],
    active: true,
    personLinks: [],
    icalToken: randomBytes(12).toString('hex'),
    ...overrides,
  });

  const { token } = await createSession(user.id);

  return {
    user,
    token,
    cleanup: async () => {
      await db.getRepository('UserSession').createQueryBuilder().delete().where('userId = :userId', { userId: user.id }).execute();
      await userRepo.delete({ id: user.id });
    },
  };
}
