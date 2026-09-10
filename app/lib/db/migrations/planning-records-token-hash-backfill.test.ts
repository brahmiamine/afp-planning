import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { isDbAvailable } from '@/lib/db/test-utils';
import { getPlanningRecordByTokenHash } from '@/lib/planning/records';
import { hashShareToken, newShareToken } from '@/lib/planning/public-share';

const dbAvailable = await isDbAvailable();

/**
 * Vérifie la compatibilité du backfill de la migration 0015 (issue #277) : un
 * enregistrement `public-share` créé avant la migration (token_hash absent, mais déjà
 * présent dans `payload.tokenHash`) doit être rattrapable sans connaître un jeton brut
 * jamais stocké. Rejoue ici exactement le même UPDATE que la migration, plutôt que
 * d'attendre le prochain redémarrage applicatif — les migrations ne s'exécutent
 * qu'une fois, au bootstrap, avant que ce test n'ait pu insérer sa ligne « historique ».
 */
describe.skipIf(!dbAvailable)('migration 0015 — backfill token_hash (issue #277)', () => {
  it('rattrape un enregistrement public-share pré-migration à partir de son payload', async () => {
    const db = await getDb();
    const clubId = `test-club-${randomBytes(6).toString('hex')}`;
    const recordId = `public-share:${randomBytes(8).toString('hex')}`;
    const token = newShareToken();
    const tokenHash = hashShareToken(token);

    try {
      // Ligne « historique » : insérée directement en SQL, comme l'aurait fait le code
      // d'avant l'issue #277 — token_hash absent, seul le payload le porte.
      await db.query(
        `INSERT INTO planning_records (id, club_id, kind, payload)
         VALUES (?, ?, 'public-share', ?)`,
        [recordId, clubId, JSON.stringify({
          tokenHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          scope: { eventTypes: [], fromDate: null, toDate: null },
          createdByUserId: 0,
        })],
      );

      expect(await getPlanningRecordByTokenHash(db, tokenHash)).toBeNull();

      // Exactement l'instruction de la migration 0015 (schema-migrations.ts).
      await db.query(
        `UPDATE planning_records SET token_hash = JSON_UNQUOTE(JSON_EXTRACT(payload, '$.tokenHash'))
         WHERE kind = 'public-share' AND token_hash IS NULL`,
      );

      const backfilled = await getPlanningRecordByTokenHash(db, tokenHash);
      expect(backfilled).not.toBeNull();
      expect(backfilled?.id).toBe(recordId);
      expect(backfilled?.clubId).toBe(clubId);
    } finally {
      await db.query('DELETE FROM planning_records WHERE id = ?', [recordId]);
    }
  });
});
