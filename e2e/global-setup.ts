import { randomBytes } from 'node:crypto';
import { getDb } from '../app/lib/db';
import { hashPassword } from '../app/lib/auth/password';
import type { UserEntity } from '../app/lib/db/schemas';

export const E2E_CLUB_A = 'e2e-club-a';
export const E2E_CLUB_B = 'e2e-club-b';
export const E2E_PASSWORD = 'e2e-password-123';
export const E2E_ADMIN_EMAIL = 'e2e-admin-a@example.com';
export const E2E_LEADER_EMAIL = 'e2e-leader-a@example.com';
export const E2E_OTHER_CLUB_EMAIL = 'e2e-admin-b@example.com';

async function cleanClub(clubId: string) {
  const db = await getDb();
  const users = await db.getRepository<UserEntity>('User').findBy({ clubId });
  const userIds = users.map((user) => user.id);
  if (userIds.length) {
    await db.getRepository('UserSession').createQueryBuilder().delete().where('userId IN (:...ids)', { ids: userIds }).execute();
    await db.getRepository('Notification').createQueryBuilder().delete().where('userId IN (:...ids)', { ids: userIds }).execute();
  }
  await db.query('DELETE FROM planning_records WHERE club_id = ?', [clubId]);
  for (const repository of ['Invitation', 'MatchAuditLog', 'MatchExtra', 'MatchOfficial', 'MatchAmical', 'Entrainement', 'Plateau']) {
    await db.getRepository(repository).delete({ clubId });
  }
  await db.getRepository('User').delete({ clubId });
  await db.getRepository('ClubTenant').delete({ id: clubId });
}

export default async function globalSetup() {
  const db = await getDb();
  await cleanClub(E2E_CLUB_A);
  await cleanClub(E2E_CLUB_B);
  const tenants = db.getRepository('ClubTenant');
  await tenants.save([
    { id: E2E_CLUB_A, name: 'E2E Club A', abbreviation: 'E2EA', active: true },
    { id: E2E_CLUB_B, name: 'E2E Club B', abbreviation: 'E2EB', active: true },
  ]);
  const passwordHash = await hashPassword(E2E_PASSWORD);
  const users = db.getRepository('User');
  await users.save([
    { clubId: E2E_CLUB_A, email: E2E_ADMIN_EMAIL, passwordHash, nom: 'Admin E2E A', accessRole: 'admin', planningFunctions: [], active: true, claimedAt: new Date(), icalToken: randomBytes(16).toString('hex') },
    { clubId: E2E_CLUB_A, email: E2E_LEADER_EMAIL, passwordHash, nom: 'Dirigeant E2E Multi', accessRole: 'dirigeant', planningFunctions: ['arbitre_club', 'encadrant'], active: true, claimedAt: new Date(), icalToken: randomBytes(16).toString('hex') },
    { clubId: E2E_CLUB_A, email: 'unclaimed-e2e@example.invalid', passwordHash: '', nom: 'Profil E2E à inviter', accessRole: 'dirigeant', planningFunctions: ['encadrant'], active: true, claimedAt: null, icalToken: randomBytes(16).toString('hex') },
    { clubId: E2E_CLUB_B, email: E2E_OTHER_CLUB_EMAIL, passwordHash, nom: 'Admin E2E B', accessRole: 'admin', planningFunctions: [], active: true, claimedAt: new Date(), icalToken: randomBytes(16).toString('hex') },
  ]);

  return async () => {
    await cleanClub(E2E_CLUB_A);
    await cleanClub(E2E_CLUB_B);
  };
}
