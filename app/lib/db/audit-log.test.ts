import { describe, it, expect, afterEach } from 'vitest';
import { isDbAvailable } from './test-utils';
import { getDb } from './index';
import { logAuditEntry } from './audit-log';
import { MatchAuditLogEntity } from './schemas';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('logAuditEntry (integration)', () => {
  const entityId = `test-match-${Date.now()}`;

  afterEach(async () => {
    const db = await getDb();
    await db.getRepository('MatchAuditLog').delete({ entityId });
  });

  it('writes a row with the expected fields', async () => {
    const db = await getDb();

    await logAuditEntry(db, {
      user: {
        id: 1,
        email: 'admin@example.com',
        nom: 'Admin',
        roles: ['admin'],
        personLinks: [],
        active: true,
        icalToken: 'x',
      },
      entityType: 'MatchExtra',
      entityId,
      action: 'update',
      before: { confirmed: false },
      after: { confirmed: true },
    });

    const repo = db.getRepository<MatchAuditLogEntity>('MatchAuditLog');
    const rows = await repo.find({ where: { entityId } });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('update');
    expect(rows[0]?.userEmail).toBe('admin@example.com');
    expect(rows[0]?.after).toEqual({ confirmed: true });
  });

  it('does not throw when user is null', async () => {
    const db = await getDb();
    await expect(
      logAuditEntry(db, {
        user: null,
        entityType: 'Entrainement',
        entityId,
        action: 'create',
        before: null,
        after: { date: '20/01/2026' },
      }),
    ).resolves.not.toThrow();
  });
});
