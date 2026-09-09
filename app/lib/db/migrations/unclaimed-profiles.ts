import type { DataSource } from 'typeorm';
import { PLACEHOLDER_EMAIL_DOMAIN } from '@/lib/auth/placeholder-account';

/**
 * Migration 0012 (issue #204) — profils de dirigeants sans accès.
 *
 * Avant cette migration, les référentiels de fonctions créaient des comptes
 * « actifs » dotés d'un mot de passe aléatoire inconnu et d'une adresse technique
 * `@sans-acces.local`, indistinguables des comptes réellement activés.
 *
 * La colonne `claimedAt` distingue désormais les deux cas :
 * - `NULL`  → profil sans accès (non réclamé), en attente d'une invitation ciblée ;
 * - renseigné → compte activé, dont le titulaire dispose d'identifiants.
 *
 * La reprise marque comme activés tous les comptes existants dont l'email n'est
 * pas une adresse technique ; les profils `@sans-acces.local` restent non réclamés
 * et pourront être activés par une invitation ciblant leur `personId`, ce qui
 * rattache les identifiants au profil existant sans créer de doublon ni perdre les
 * affectations (la clé `users.id` ne change pas).
 *
 * Rejouable : seules les lignes encore `NULL` avec un email réel sont réécrites.
 */
export async function backfillUnclaimedProfiles(db: DataSource): Promise<number> {
  const rows = await db.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'users' LIMIT 1`,
  ) as unknown[];
  if (rows.length === 0) return 0;

  const result = await db.query(
    'UPDATE users SET claimedAt = COALESCE(createdAt, NOW()) '
    + 'WHERE claimedAt IS NULL AND LOWER(email) NOT LIKE ?',
    [`%@${PLACEHOLDER_EMAIL_DOMAIN}`],
  ) as { affectedRows?: number } | Array<{ affectedRows?: number }>;
  const head = Array.isArray(result) ? result[0] : result;
  return Number(head?.affectedRows ?? 0);
}
