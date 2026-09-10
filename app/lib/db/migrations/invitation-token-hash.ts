import type { DataSource } from 'typeorm';

/**
 * Migration 0013 (issue #271) — les jetons d'invitation ne sont plus stockés en
 * clair : `invitations.id` porte désormais l'empreinte SHA-256 du jeton plutôt
 * que le jeton brut, comme les jetons de réinitialisation de mot de passe. Une
 * fuite de la base ne livre ainsi plus de jetons d'invitation directement
 * utilisables.
 *
 * Sur une base neuve, `invitations` (table portée par une entité TypeORM)
 * n'existe pas encore à ce stade — elle est créée par `synchronize`, exécuté
 * après le runner — il n'y a alors rien à rehacher.
 *
 * Rejouable sans casse : un id déjà haché fait toujours 64 caractères
 * hexadécimaux, jamais les 48 du jeton brut d'origine
 * (`randomBytes(24).toString('hex')`), donc la clause WHERE ne le retouche pas
 * une seconde fois. Réhacher une valeur déjà en base ne casse aucun lien déjà
 * envoyé : le lien contient toujours le jeton brut d'origine, dont l'empreinte
 * devient précisément la nouvelle valeur stockée.
 */
export async function hashExistingInvitationTokens(db: DataSource): Promise<number> {
  const rows = await db.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'invitations' LIMIT 1`,
  ) as unknown[];
  if (rows.length === 0) return 0;

  const result = await db.query(
    'UPDATE invitations SET id = SHA2(id, 256) WHERE LENGTH(id) <> 64',
  ) as { affectedRows?: number } | Array<{ affectedRows?: number }>;
  const head = Array.isArray(result) ? result[0] : result;
  return Number(head?.affectedRows ?? 0);
}
